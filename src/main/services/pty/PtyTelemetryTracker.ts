import { BrowserWindow, Notification } from 'electron';
import { log } from '../../lib/logger';
import { getAppSettings } from '../../settings';
import * as telemetry from '../../telemetry';
import { PROVIDER_IDS, getProvider, type ProviderId } from '../../../shared/providers/registry';

/** Tracks start times keyed by `${providerId}:${ptyId|taskId}` */
const providerPtyTimers = new Map<string, number>();

/** Maps PTY IDs to provider IDs for multi-agent tracking */
const ptyProviderMap = new Map<string, ProviderId>();

/** Prevents duplicate finish handling when cleanup and onExit race for the same PTY */
const finalizedPtys = new Set<string>();

type FinishCause = 'process_exit' | 'app_quit' | 'owner_destroyed' | 'manual_kill';

/**
 * Parse a PTY ID to extract provider and task identifiers.
 *
 * Chat terminals can be:
 * - `${provider}-main-${taskId}` for main task terminals
 * - `${provider}-chat-${conversationId}` for chat-specific terminals
 */
export function parseProviderPty(id: string): {
  providerId: ProviderId;
  taskId: string;
} | null {
  const mainMatch = /^([a-z0-9_-]+)-main-(.+)$/.exec(id);
  const chatMatch = /^([a-z0-9_-]+)-chat-(.+)$/.exec(id);

  const match = mainMatch || chatMatch;
  if (!match) return null;

  const providerId = match[1] as ProviderId;
  if (!PROVIDER_IDS.includes(providerId)) return null;

  const taskId = match[2];
  return { providerId, taskId };
}

function providerRunKey(providerId: ProviderId, taskId: string) {
  return `${providerId}:${taskId}`;
}

/**
 * Record that a provider agent has started running in the given PTY.
 */
export function markStart(id: string, providerId?: ProviderId): void {
  finalizedPtys.delete(id);

  // First check if we have a direct provider ID (for multi-agent mode)
  if (providerId && PROVIDER_IDS.includes(providerId)) {
    ptyProviderMap.set(id, providerId);
    const key = `${providerId}:${id}`;
    if (providerPtyTimers.has(key)) return;
    providerPtyTimers.set(key, Date.now());
    telemetry.capture('agent_run_start', { provider: providerId });
    return;
  }

  // Check if we have a stored mapping (for subsequent calls)
  const storedProvider = ptyProviderMap.get(id);
  if (storedProvider) {
    const key = `${storedProvider}:${id}`;
    if (providerPtyTimers.has(key)) return;
    providerPtyTimers.set(key, Date.now());
    telemetry.capture('agent_run_start', { provider: storedProvider });
    return;
  }

  // Fall back to parsing the ID (single-agent mode)
  const parsed = parseProviderPty(id);
  if (!parsed) return;
  const key = providerRunKey(parsed.providerId, parsed.taskId);
  if (providerPtyTimers.has(key)) return;
  providerPtyTimers.set(key, Date.now());
  telemetry.capture('agent_run_start', { provider: parsed.providerId });
}

/**
 * Record that a provider agent has finished running in the given PTY.
 * Sends a desktop notification when appropriate.
 */
export function markFinish(
  id: string,
  exitCode: number | null | undefined,
  signal: number | undefined,
  cause: FinishCause
): void {
  if (finalizedPtys.has(id)) return;
  finalizedPtys.add(id);

  let providerId: ProviderId | undefined;
  let key: string;

  // First check if we have a stored mapping (multi-agent mode)
  const storedProvider = ptyProviderMap.get(id);
  if (storedProvider) {
    providerId = storedProvider;
    key = `${storedProvider}:${id}`;
  } else {
    // Fall back to parsing the ID (single-agent mode)
    const parsed = parseProviderPty(id);
    if (!parsed) return;
    providerId = parsed.providerId;
    key = providerRunKey(parsed.providerId, parsed.taskId);
  }

  const started = providerPtyTimers.get(key);
  providerPtyTimers.delete(key);

  // Clean up the provider mapping
  ptyProviderMap.delete(id);

  // No valid exit code means the process was killed during cleanup, not a real completion
  if (typeof exitCode !== 'number') return;

  const duration = started ? Math.max(0, Date.now() - started) : undefined;
  const wasSignaled = signal !== undefined && signal !== null;
  const outcome = exitCode !== 0 && !wasSignaled ? 'error' : 'ok';

  telemetry.capture('agent_run_finish', {
    provider: providerId,
    outcome,
    duration_ms: duration,
  });

  if (cause === 'process_exit' && exitCode === 0) {
    const providerName = getProvider(providerId)?.name ?? providerId;
    showCompletionNotification(providerName);
  }
}

/**
 * Look up the stored provider ID for a PTY (used for prompt tracking).
 */
export function getProviderForPty(id: string): ProviderId | undefined {
  return ptyProviderMap.get(id);
}

/**
 * Show a system notification for provider completion.
 * Only shows if: notifications are enabled, supported, and app is not focused.
 */
function showCompletionNotification(providerName: string) {
  try {
    const settings = getAppSettings();

    if (!settings.notifications?.enabled) return;
    if (!Notification.isSupported()) return;

    const windows = BrowserWindow.getAllWindows();
    const anyFocused = windows.some((w) => w.isFocused());
    if (anyFocused) return;

    const notification = new Notification({
      title: `${providerName} Task Complete`,
      body: 'Your agent has finished working',
      silent: !settings.notifications?.sound,
    });
    notification.show();
  } catch (error) {
    log.warn('Failed to show completion notification', { error });
  }
}
