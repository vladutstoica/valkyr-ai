/**
 * Unified status store that aggregates status across multiple conversations
 * per task. Delegates to acpStatusStore (ACP sessions) or activityStore
 * (PTY sessions) and applies "worst status wins" for the sidebar dot.
 *
 * Priority (highest urgency first):
 *   1. red pulsing   — any chat has pending approvals
 *   2. red solid     — any chat in error or needs input
 *   3. amber pulsing — any chat is streaming/working
 *   4. gray solid    — any chat initializing
 *   5. green solid   — all chats done/ready
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

  removeConversation(taskId: string, conversationId: string): void {
    const convMap = this.tasks.get(taskId);
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

    this.notifyTask(taskId);
  }

  removeTask(taskId: string): void {
    const convMap = this.tasks.get(taskId);
    if (convMap) {
      for (const convId of convMap.keys()) {
        const subKey = `${taskId}:${convId}`;
        const unsub = this.subs.get(subKey);
        if (unsub) {
          unsub();
          this.subs.delete(subKey);
        }
        this.ptyDots.delete(subKey);
      }
    }
    this.tasks.delete(taskId);
    this.listeners.delete(taskId);
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
      const dot = this.getConversationDot(convKey, entry);
      worst = higherPriority(worst, dot);
    }
    return worst;
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

  private getConversationDot(convKey: string, entry: ConversationEntry): StatusDot {
    if (entry.mode === 'acp' && entry.acpSessionKey) {
      return acpStatusStore.getDot(entry.acpSessionKey);
    }
    // PTY: read cached dot (updated via subscription callbacks)
    return this.ptyDots.get(convKey) || DEFAULT_DOT;
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
