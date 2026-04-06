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
import { toast } from '../hooks/use-toast';

export type { DotColor, DotStyle, StatusDot };

/** Callback type for navigation requests from notification clicks */
type NavigateCallback = (taskId: string) => void;

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

type UnreadListener = (unread: boolean) => void;

class UnifiedStatusStore {
  /** taskId → conversationId → entry */
  private tasks = new Map<string, Map<string, ConversationEntry>>();
  /** taskId → Set<Listener> */
  private listeners = new Map<string, Set<Listener>>();
  /** Cleanup functions for per-conversation subscriptions: `taskId:convId` → unsub */
  private subs = new Map<string, () => void>();
  /** Cached PTY dots so getDot can read synchronously: `taskId:convId` → StatusDot */
  private ptyDots = new Map<string, StatusDot>();

  /** Tasks with unread status changes (done/needs-input while not viewed) */
  private unreadTasks = new Set<string>();
  /** taskId → Set<UnreadListener> */
  private unreadListeners = new Map<string, Set<UnreadListener>>();

  /**
   * Hook-based status: conversationKey (sessionId) → StatusDot.
   * Per-conversation status so each pill section shows independently.
   */
  private hookDots = new Map<string, StatusDot>();
  /** Maps PTY sessionId → taskId for hook event routing */
  private hookSessionToTask = new Map<string, string>();
  /** Ordered list of conversation keys per task, matching UI tab order */
  private hookConvOrder = new Map<string, string[]>();
  /** Cleanup for the global hook listener */
  private hookListenerCleanup: (() => void) | null = null;
  /** Auto-reset timer: resets to green if no events after working status */
  private hookIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** How long to wait before resetting working→done (ms) */
  private static readonly HOOK_IDLE_TIMEOUT_MS = 5000;
  /** Currently active session in the renderer (for toast suppression) */
  private activeViewSessionId: string | null = null;
  /** Navigation callback for notification deep-linking */
  private navigateCallback: NavigateCallback | null = null;
  /** Cleanup for the navigation IPC listener */
  private navigateListenerCleanup: (() => void) | null = null;
  /** Track active toasts to enforce max 3 stacked */
  private activeToastCount = 0;
  private static readonly MAX_TOASTS = 3;

  constructor() {
    this.initHookListener();
    this.initNavigateListener();
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
  /**
   * Register hook sessions in UI tab order.
   * Call with ALL conversation session IDs in their display order.
   */
  registerHookSessions(sessionIds: string[], taskId: string): void {
    console.debug('[hook-routing] registerHookSessions', { sessionIds, taskId });
    // Clear old mappings for this task (preserve hookDots values)
    for (const [sid, tid] of this.hookSessionToTask) {
      if (tid === taskId) this.hookSessionToTask.delete(sid);
    }

    // Rebuild conversation entries in new order
    let convMap = this.tasks.get(taskId);
    if (!convMap) {
      convMap = new Map();
      this.tasks.set(taskId, convMap);
    }
    // Remove old conv entries (keep __primary__ if it exists)
    for (const key of Array.from(convMap.keys())) {
      if (key !== '__primary__') convMap.delete(key);
    }

    // Register in new order — hookDots stay intact, just order changes
    this.hookConvOrder.set(taskId, [...sessionIds]);
    for (const sid of sessionIds) {
      this.hookSessionToTask.set(sid, taskId);
      convMap.set(sid, { mode: 'pty' });
    }

    // Single notification after all entries are set
    this.notifyTask(taskId);
  }

  /** @deprecated Use registerHookSessions for ordered registration */
  registerHookSession(sessionId: string, taskId: string): void {
    this.hookSessionToTask.set(sessionId, taskId);
    this.setConversationMode(taskId, sessionId, 'pty');
    // Append to order if not present
    const order = this.hookConvOrder.get(taskId) || [];
    if (!order.includes(sessionId)) {
      order.push(sessionId);
      this.hookConvOrder.set(taskId, order);
    }
  }

  /**
   * Remove a hook session mapping (e.g., when PTY exits).
   */
  unregisterHookSession(sessionId: string): void {
    const taskId = this.hookSessionToTask.get(sessionId);
    this.hookSessionToTask.delete(sessionId);
    if (taskId) {
      this.removeConversation(taskId, sessionId);
      this.hookDots.delete(sessionId);
      // Remove from ordered list
      const order = this.hookConvOrder.get(taskId);
      if (order) {
        const idx = order.indexOf(sessionId);
        if (idx >= 0) order.splice(idx, 1);
        if (order.length === 0) this.hookConvOrder.delete(taskId);
      }
      // Clear idle timer for this conversation
      const timerKey = `${taskId}:${sessionId}`;
      const timer = this.hookIdleTimers.get(timerKey);
      if (timer) {
        clearTimeout(timer);
        this.hookIdleTimers.delete(timerKey);
      }
      this.notifyTask(taskId);
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
    this.unreadTasks.delete(taskId);
    this.unreadListeners.delete(taskId);

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
    const order = this.hookConvOrder.get(taskId);
    const convMap = this.tasks.get(taskId);

    // Use ordered list if available (matches UI tab order)
    if (order && order.length > 0) {
      return order.map((sid) => {
        const entry = convMap?.get(sid);
        if (entry) {
          return this.getConversationDot(taskId, sid, entry);
        }
        return this.hookDots.get(sid) || DEFAULT_DOT;
      });
    }

    // Fallback: iterate convMap
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

    // PTY mode: check per-conversation hook dot (convKey = sessionId)
    const hookDot = this.hookDots.get(convKey);
    if (hookDot) return hookDot;

    // Fallback: regex-based PTY detection
    return this.ptyDots.get(convKey) || DEFAULT_DOT;
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

        // Find which conversation this event belongs to
        const convKey = sessionId;
        let taskId = sessionId ? this.hookSessionToTask.get(sessionId) : undefined;

        // Parse taskId from sessionId if not in the registration map.
        // PTY IDs follow `{agent}-main-{taskId}` or `{agent}-chat-{convId}`.
        // Use `-main-` / `-chat-` as literal delimiters (safe for hyphenated agent names like `qwen-code`).
        if (!taskId && sessionId) {
          const mainIdx = sessionId.indexOf('-main-');
          const chatIdx = sessionId.indexOf('-chat-');
          if (mainIdx !== -1) {
            taskId = sessionId.slice(mainIdx + 6); // length of '-main-' = 6
            // Auto-register so subsequent events are fast-pathed
            this.hookSessionToTask.set(sessionId, taskId);
            // Ensure task has a conversation entry so getDot works
            if (!this.tasks.has(taskId)) {
              const convMap = new Map<string, ConversationEntry>();
              convMap.set(sessionId, { mode: 'pty' });
              this.tasks.set(taskId, convMap);
            }
            if (!this.hookConvOrder.has(taskId)) {
              this.hookConvOrder.set(taskId, [sessionId]);
            }
          } else if (chatIdx !== -1) {
            // Chat conversation: convId = sessionId after `-chat-`.
            // Look up which task owns this conversation by scanning registered tasks.
            const convId = sessionId.slice(chatIdx + 6); // length of '-chat-' = 6
            for (const [tid, convMap] of this.tasks) {
              if (convMap.has(sessionId) || convMap.has(convId)) {
                taskId = tid;
                this.hookSessionToTask.set(sessionId, taskId);
                break;
              }
            }
          }
        }

        // If still unresolved, drop the event rather than misrouting it
        // to a random task (which corrupts status dots in multi-task scenarios).
        if (!taskId) {
          console.debug('[hook-routing] dropped event: no task found for sessionId', sessionId);
          return;
        }

        // Update ONLY this conversation's dot (not all conversations)
        const dot = hookStatusToDot(status as HookStatus);
        this.hookDots.set(convKey, dot);
        this.notifyTask(taskId);

        // Show in-app toast if user is not viewing this conversation
        this.maybeShowInAppToast(convKey, status as HookStatus);

        // Idle timeout per conversation
        const timerKey = `${taskId}:${convKey}`;
        const existingTimer = this.hookIdleTimers.get(timerKey);
        if (existingTimer) clearTimeout(existingTimer);

        if (status === 'working') {
          const capturedTaskId = taskId;
          const capturedConvKey = convKey;
          this.hookIdleTimers.set(
            timerKey,
            setTimeout(() => {
              this.hookIdleTimers.delete(timerKey);
              this.hookDots.set(capturedConvKey, { color: 'green', style: 'solid' });
              this.notifyTask(capturedTaskId);
            }, UnifiedStatusStore.HOOK_IDLE_TIMEOUT_MS)
          );
        } else {
          this.hookIdleTimers.delete(timerKey);
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

  /**
   * Set the currently active session (for toast suppression).
   * Called from ChatInterface when the user switches conversations.
   */
  setActiveView(sessionId: string | null): void {
    this.activeViewSessionId = sessionId;
  }

  /**
   * Mark a task as having unread status changes.
   */
  markUnread(taskId: string): void {
    if (this.unreadTasks.has(taskId)) return;
    this.unreadTasks.add(taskId);
    this.notifyUnread(taskId);
  }

  /**
   * Mark a task as read (user has viewed it).
   */
  markRead(taskId: string): void {
    if (!this.unreadTasks.has(taskId)) return;
    this.unreadTasks.delete(taskId);
    this.notifyUnread(taskId);
  }

  /**
   * Check if a task has unread status changes.
   */
  isUnread(taskId: string): boolean {
    return this.unreadTasks.has(taskId);
  }

  /**
   * Subscribe to unread state changes for a task.
   */
  subscribeUnread(taskId: string, listener: UnreadListener): () => void {
    let set = this.unreadListeners.get(taskId);
    if (!set) {
      set = new Set();
      this.unreadListeners.set(taskId, set);
    }
    set.add(listener);
    // Emit current state immediately
    listener(this.isUnread(taskId));
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.unreadListeners.delete(taskId);
    };
  }

  private notifyUnread(taskId: string): void {
    const set = this.unreadListeners.get(taskId);
    if (!set || set.size === 0) return;
    const unread = this.isUnread(taskId);
    for (const l of set) l(unread);
  }

  /**
   * Register a callback for notification-triggered navigation.
   * The callback receives a taskId and should select that task in the UI.
   */
  onNavigate(callback: NavigateCallback): () => void {
    this.navigateCallback = callback;
    return () => {
      if (this.navigateCallback === callback) {
        this.navigateCallback = null;
      }
    };
  }

  /**
   * Look up the taskId for a given sessionId.
   * Used by the navigation handler to find which task to select.
   */
  getTaskIdForSession(sessionId: string): string | undefined {
    return this.hookSessionToTask.get(sessionId);
  }

  /**
   * Initialize the IPC listener for deep-navigation from notification clicks.
   */
  private initNavigateListener(): void {
    try {
      const api = window.electronAPI;
      if (!api?.onHookNavigate) return;

      this.navigateListenerCleanup = api.onHookNavigate((data: { sessionId: string }) => {
        const taskId = this.hookSessionToTask.get(data.sessionId);
        if (taskId && this.navigateCallback) {
          this.navigateCallback(taskId);
        }
      });
    } catch {
      // electronAPI may not be available (e.g., in tests)
    }
  }

  /**
   * Show an in-app toast for a status change on a conversation the user is NOT viewing.
   */
  private maybeShowInAppToast(sessionId: string, status: HookStatus): void {
    // Don't show toast if the user is viewing this exact conversation
    if (this.activeViewSessionId === sessionId) return;
    // Only show for actionable states
    if (status === 'working') return;

    // Mark the task as unread since user isn't viewing it
    const taskId = this.hookSessionToTask.get(sessionId);
    if (taskId) this.markUnread(taskId);
    // Enforce max toast count
    if (this.activeToastCount >= UnifiedStatusStore.MAX_TOASTS) return;

    const taskLabel = taskId ? `Task` : 'Agent';

    const title =
      status === 'needs-input' ? `${taskLabel} — Waiting for you` : `${taskLabel} — Agent finished`;

    this.activeToastCount += 1;

    const { dismiss } = toast({
      title,
      description:
        status === 'needs-input'
          ? 'Agent is waiting for your approval.'
          : 'Agent completed its work.',
    });

    // Auto-dismiss done toasts after 4s, persist needs-input toasts
    if (status === 'done') {
      setTimeout(() => {
        dismiss();
        this.activeToastCount = Math.max(0, this.activeToastCount - 1);
      }, 4000);
    } else {
      // For needs-input, still track cleanup (will be dismissed by user)
      // Use a long timeout as a safety fallback
      setTimeout(() => {
        this.activeToastCount = Math.max(0, this.activeToastCount - 1);
      }, 30000);
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
      const unsub = acpStatusStore.subscribe(acpSessionKey, (dot) => {
        // Mark unread if task finished/needs-input and user isn't viewing it
        if (
          (dot.color === 'green' || dot.color === 'red') &&
          this.activeViewSessionId !== conversationId
        ) {
          this.markUnread(taskId);
        }
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
