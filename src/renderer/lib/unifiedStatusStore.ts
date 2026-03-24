/**
 * Unified status store that aggregates status across multiple conversations
 * per task. Delegates to acpStatusStore (ACP sessions), hook-based status
 * (Claude Code lifecycle hooks), or activityStore (PTY regex fallback)
 * and applies "worst status wins" for the sidebar dot.
 *
 * Priority (highest urgency first):
 *   1. red pulsing   — any chat has pending approvals
 *   2. red solid     — any chat in error or needs input
 *   3. amber pulsing — any chat is streaming/working
 *   4. gray solid    — any chat initializing
 *   5. green solid   — all chats done/ready
 *
 * For PTY sessions, hook-based status takes priority over regex-based
 * detection when available (i.e., when a hook event has been received).
 */

import { activityStore } from './activityStore';
import { acpStatusStore, type DotColor, type DotStyle, type StatusDot } from './acpStatusStore';

export type { DotColor, DotStyle, StatusDot };

type TaskMode = 'pty' | 'acp';

type ConversationEntry = {
  mode: TaskMode;
  acpSessionKey?: string;
};

type Listener = (dot: StatusDot) => void;

type HookStatus = 'working' | 'needs-input' | 'done';

const DOT_PRIORITY: Record<string, number> = {
  'red-pulsing': 5,
  'red-solid': 4,
  'amber-pulsing': 3,
  'gray-solid': 2,
  'green-solid': 1,
};

function dotKey(dot: StatusDot): string {
  return `${dot.color}-${dot.style}`;
}

function higherPriority(a: StatusDot, b: StatusDot): StatusDot {
  return (DOT_PRIORITY[dotKey(a)] || 0) >= (DOT_PRIORITY[dotKey(b)] || 0) ? a : b;
}

const DEFAULT_DOT: StatusDot = { color: 'green', style: 'solid' };

function ptyToDot(busy: boolean, idle: boolean): StatusDot {
  if (busy) return { color: 'amber', style: 'pulsing' };
  if (idle) return { color: 'red', style: 'solid' };
  return DEFAULT_DOT;
}

function hookStatusToDot(status: HookStatus): StatusDot {
  switch (status) {
    case 'working':
      return { color: 'amber', style: 'pulsing' };
    case 'needs-input':
      return { color: 'red', style: 'pulsing' };
    case 'done':
      return { color: 'green', style: 'solid' };
  }
}

class UnifiedStatusStore {
  /** taskId → conversationId → entry */
  private tasks = new Map<string, Map<string, ConversationEntry>>();
  /** taskId → Set<Listener> */
  private listeners = new Map<string, Set<Listener>>();
  /** Cleanup functions for per-conversation subscriptions: `taskId:convId` → unsub */
  private subs = new Map<string, () => void>();
  /** Cached PTY dots so getDot can read synchronously: `taskId:convId` → StatusDot */
  private ptyDots = new Map<string, StatusDot>();

  /**
   * Hook-based status: taskId → StatusDot.
   * When present, takes priority over regex-based PTY status.
   */
  private hookDots = new Map<string, StatusDot>();
  /** Maps PTY sessionId → taskId for hook event routing */
  private hookSessionToTask = new Map<string, string>();
  /** Cleanup for the global hook listener */
  private hookListenerCleanup: (() => void) | null = null;
  /** Auto-reset timer: resets to green if no events after working status */
  private hookIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** How long to wait before resetting working→done (ms) */
  private static readonly HOOK_IDLE_TIMEOUT_MS = 5000;

  constructor() {
    this.initHookListener();
  }

  /**
   * Register a conversation's mode so the store knows which backend to consult.
   */
  setConversationMode(
    taskId: string,
    conversationId: string,
    mode: TaskMode,
    acpSessionKey?: string
  ): void {
    let convMap = this.tasks.get(taskId);
    if (!convMap) {
      convMap = new Map();
      this.tasks.set(taskId, convMap);
    }
    convMap.set(conversationId, { mode, acpSessionKey });

    // Set up per-conversation subscription to propagate changes
    this.ensureConversationSub(taskId, conversationId, mode, acpSessionKey);

    // Notify task listeners with new aggregate
    this.notifyTask(taskId);
  }

  /**
   * Convenience: register a task's primary mode without specifying a conversation.
   * Uses a synthetic conversation id so the store always has an entry.
   */
  setTaskMode(taskId: string, mode: TaskMode, acpSessionKey?: string): void {
    this.setConversationMode(taskId, '__primary__', mode, acpSessionKey);
  }

  /**
   * Register a hook session ID → task mapping.
   * Called when a PTY session starts with VALKYR_SESSION_ID env var.
   */
  registerHookSession(sessionId: string, taskId: string): void {
    this.hookSessionToTask.set(sessionId, taskId);
    // Ensure the task has a PTY conversation entry so getDot doesn't bail early
    this.setTaskMode(taskId, 'pty');
  }

  /**
   * Remove a hook session mapping (e.g., when PTY exits).
   */
  unregisterHookSession(sessionId: string): void {
    const taskId = this.hookSessionToTask.get(sessionId);
    this.hookSessionToTask.delete(sessionId);
    if (taskId) {
      this.hookDots.delete(taskId);
      const timer = this.hookIdleTimers.get(taskId);
      if (timer) {
        clearTimeout(timer);
        this.hookIdleTimers.delete(taskId);
      }
    }
  }

  removeConversation(taskId: string, conversationId: string): void {
    const convMap = this.tasks.get(taskId);
    const entry = convMap?.get(conversationId);
    if (convMap) {
      convMap.delete(conversationId);
      if (convMap.size === 0) this.tasks.delete(taskId);
    }

    const subKey = `${taskId}:${conversationId}`;
    const unsub = this.subs.get(subKey);
    if (unsub) {
      unsub();
      this.subs.delete(subKey);
    }
    this.ptyDots.delete(subKey);

    // Clean up acpStatusStore entry to prevent stale status lingering
    if (entry?.mode === 'acp' && entry.acpSessionKey) {
      acpStatusStore.remove(entry.acpSessionKey);
    }

    this.notifyTask(taskId);
  }

  removeTask(taskId: string): void {
    const convMap = this.tasks.get(taskId);
    if (convMap) {
      for (const [convId, entry] of convMap) {
        const subKey = `${taskId}:${convId}`;
        const unsub = this.subs.get(subKey);
        if (unsub) {
          unsub();
          this.subs.delete(subKey);
        }
        this.ptyDots.delete(subKey);
        // Clean up acpStatusStore entry
        if (entry.mode === 'acp' && entry.acpSessionKey) {
          acpStatusStore.remove(entry.acpSessionKey);
        }
      }
    }
    this.tasks.delete(taskId);
    this.listeners.delete(taskId);

    // Clean up hook session mappings for this task
    for (const [sessionId, tid] of this.hookSessionToTask) {
      if (tid === taskId) {
        this.hookSessionToTask.delete(sessionId);
        this.hookDots.delete(sessionId);
      }
    }
  }

  /**
   * Get the aggregated status dot for a task (worst-wins across all conversations).
   */
  getDot(taskId: string): StatusDot {
    const convMap = this.tasks.get(taskId);
    if (!convMap || convMap.size === 0) return DEFAULT_DOT;

    let worst: StatusDot = DEFAULT_DOT;
    for (const [convId, entry] of convMap) {
      const convKey = `${taskId}:${convId}`;
      const dot = this.getConversationDot(taskId, convKey, entry);
      worst = higherPriority(worst, dot);
    }
    return worst;
  }

  /**
   * Get per-conversation status dots for a task.
   * Returns array of dots (one per conversation).
   */
  getConversationDots(taskId: string): StatusDot[] {
    const convMap = this.tasks.get(taskId);
    if (!convMap || convMap.size === 0) return [DEFAULT_DOT];

    const dots: StatusDot[] = [];
    for (const [convId, entry] of convMap) {
      const convKey = `${taskId}:${convId}`;
      dots.push(this.getConversationDot(taskId, convKey, entry));
    }
    return dots;
  }

  /**
   * Subscribe to aggregated status dot changes for a task.
   * Returns unsubscribe function.
   */
  subscribe(taskId: string, listener: Listener): () => void {
    let set = this.listeners.get(taskId);
    if (!set) {
      set = new Set();
      this.listeners.set(taskId, set);
    }
    set.add(listener);

    // Immediately emit current state
    listener(this.getDot(taskId));

    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(taskId);
    };
  }

  private getConversationDot(taskId: string, convKey: string, entry: ConversationEntry): StatusDot {
    if (entry.mode === 'acp' && entry.acpSessionKey) {
      return acpStatusStore.getDot(entry.acpSessionKey);
    }

    // PTY mode: check hook-based status first (takes priority over regex)
    const hookDot = this.getHookDotForTask(taskId);
    if (hookDot) return hookDot;

    // Fallback: regex-based PTY detection
    return this.ptyDots.get(convKey) || DEFAULT_DOT;
  }

  /**
   * Find hook-based status dot for a task (if any hook session is mapped to it).
   */
  private getHookDotForTask(taskId: string): StatusDot | null {
    return this.hookDots.get(taskId) ?? null;
  }

  /**
   * Initialize the global IPC listener for hook status updates.
   * Called once on construction.
   */
  private initHookListener(): void {
    try {
      const api = window.electronAPI;
      if (!api) return;

      // Process a single hook status update
      const processUpdate = (data: { sessionId: string; event: string; status: string }) => {
        const { sessionId, status } = data;
        if (!status) return;
        if (this.hookSessionToTask.size === 0) return;

        // Route: exact session match first, then fallback to most recent task
        let taskId = sessionId ? this.hookSessionToTask.get(sessionId) : undefined;
        if (!taskId) {
          const entries = Array.from(this.hookSessionToTask.values());
          taskId = entries[entries.length - 1];
        }
        if (!taskId) return;

        const dot = hookStatusToDot(status as HookStatus);
        this.hookDots.set(taskId, dot);
        this.notifyTask(taskId);

        // Manage idle timeout: when working, start a timer to auto-reset
        // to green if no further events arrive (handles missing Stop events,
        // Esc/cancel, or any case where the agent stops without notification)
        const existingTimer = this.hookIdleTimers.get(taskId);
        if (existingTimer) clearTimeout(existingTimer);

        if (status === 'working') {
          const tid = taskId; // capture for closure
          this.hookIdleTimers.set(
            taskId,
            setTimeout(() => {
              this.hookIdleTimers.delete(tid);
              this.hookDots.set(tid, { color: 'green', style: 'solid' });
              this.notifyTask(tid);
            }, UnifiedStatusStore.HOOK_IDLE_TIMEOUT_MS)
          );
        } else {
          // done or needs-input: clear the timer
          this.hookIdleTimers.delete(taskId);
        }
      };

      // Push-based listener (webContents.send)
      if (api.onHookStatusUpdate) {
        this.hookListenerCleanup = api.onHookStatusUpdate(processUpdate);
      }

      // Poll-based fallback (ipcMain.handle) — 500ms interval
      if (api.pollHookStatus) {
        const pollInterval = setInterval(async () => {
          try {
            const updates = await api.pollHookStatus();
            if (Array.isArray(updates)) {
              for (const u of updates) processUpdate(u);
            }
          } catch {
            // ignore polling errors
          }
        }, 500);

        const origCleanup = this.hookListenerCleanup;
        this.hookListenerCleanup = () => {
          clearInterval(pollInterval);
          origCleanup?.();
        };
      }
    } catch {
      // electronAPI may not be available (e.g., in tests)
    }
  }

  private ensureConversationSub(
    taskId: string,
    conversationId: string,
    mode: TaskMode,
    acpSessionKey?: string
  ): void {
    const subKey = `${taskId}:${conversationId}`;

    // Tear down previous sub for this conversation if any
    const prev = this.subs.get(subKey);
    if (prev) prev();

    if (mode === 'acp' && acpSessionKey) {
      const unsub = acpStatusStore.subscribe(acpSessionKey, () => {
        this.notifyTask(taskId);
      });
      this.subs.set(subKey, unsub);
    } else {
      // PTY mode: subscribe to activityStore busy + idle, cache dot for sync reads
      const unsubBusy = activityStore.subscribe(taskId, (busy: boolean) => {
        const idle = false; // busy overrides idle
        this.ptyDots.set(subKey, ptyToDot(busy, idle));
        this.notifyTask(taskId);
      });
      const unsubIdle = activityStore.subscribeIdle(taskId, (idle: boolean) => {
        // When idle fires, the agent is not busy
        this.ptyDots.set(subKey, ptyToDot(false, idle));
        this.notifyTask(taskId);
      });
      this.subs.set(subKey, () => {
        unsubBusy();
        unsubIdle();
        this.ptyDots.delete(subKey);
      });
    }
  }

  private notifyTask(taskId: string): void {
    const set = this.listeners.get(taskId);
    if (!set || set.size === 0) return;
    const dot = this.getDot(taskId);
    for (const l of set) l(dot);
  }
}

export const unifiedStatusStore = new UnifiedStatusStore();
