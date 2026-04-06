import { ipcMain } from 'electron';
import { execFile } from 'child_process';
import { log } from '../lib/logger';

/**
 * Connection status for a single external service provider.
 */
export interface ProviderStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  lastChecked: number;
}

/**
 * Simple in-memory cache keyed by providerId.
 * Entries expire after CACHE_TTL_MS to avoid stale data.
 */
const statusCache = new Map<string, ProviderStatus & { fetchedAt: number }>();
const CACHE_TTL_MS = 30_000;

/**
 * Probe a single provider by running `<binary> --version` via execFile.
 * Returns { installed, path, version } for the given providerId.
 */
async function probeProvider(
  providerId: string
): Promise<{ installed: boolean; path: string | null; version: string | null }> {
  // Map well-known provider IDs to their CLI binary names
  const PROVIDER_BINARIES: Record<string, string> = {
    'claude-code': 'claude',
    claude: 'claude',
    codex: 'codex',
    'qwen-code': 'qwen',
    amp: 'amp',
    gemini: 'gemini',
  };

  const binary = PROVIDER_BINARIES[providerId] ?? providerId;

  return new Promise((resolve) => {
    // First resolve the binary path
    execFile('which', [binary], (whichErr: any, whichOut: string) => {
      if (whichErr) {
        resolve({ installed: false, path: null, version: null });
        return;
      }
      const binPath = whichOut.trim() || null;
      // Then get the version string
      execFile(binary, ['--version'], { timeout: 5000 }, (verErr: any, verOut: string) => {
        const version = verErr ? null : (verOut.trim().split('\n')[0] ?? null);
        resolve({ installed: true, path: binPath, version });
      });
    });
  });
}

export function registerConnectionsIpc(): void {
  // ---------------------------------------------------------------------------
  // connections:getProviderStatuses — Check which agent CLIs are installed
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    'connections:getProviderStatuses',
    async (_event, opts: { refresh?: boolean; providers?: string[]; providerId?: string } = {}) => {
      try {
        const { refresh = false, providers, providerId } = opts ?? {};

        // Build list of provider IDs to check
        let targetIds: string[] = [];
        if (providerId) {
          targetIds = [providerId];
        } else if (Array.isArray(providers) && providers.length > 0) {
          targetIds = providers;
        } else {
          // Default set of supported providers
          targetIds = ['claude-code', 'codex', 'qwen-code', 'amp', 'gemini'];
        }

        const statuses: Record<string, ProviderStatus> = {};
        const now = Date.now();

        await Promise.all(
          targetIds.map(async (id) => {
            const cached = statusCache.get(id);
            if (!refresh && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
              const { fetchedAt: _ts, ...entry } = cached;
              statuses[id] = entry;
              return;
            }

            try {
              const probe = await probeProvider(id);
              const entry: ProviderStatus = {
                ...probe,
                lastChecked: now,
              };
              statusCache.set(id, { ...entry, fetchedAt: now });
              statuses[id] = entry;
            } catch (err: any) {
              const entry: ProviderStatus = {
                installed: false,
                path: null,
                version: null,
                lastChecked: now,
              };
              statuses[id] = entry;
            }
          })
        );

        return { success: true, statuses };
      } catch (error: any) {
        log.error('connections:getProviderStatuses failed', error);
        return { success: false, error: error.message || 'Unknown error' };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // connections:clearCache — Bust the in-memory status cache (dev/debug utility)
  // ---------------------------------------------------------------------------
  ipcMain.handle('connections:clearCache', async () => {
    try {
      statusCache.clear();
      return { success: true };
    } catch (error: any) {
      log.error('connections:clearCache failed', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });
}
