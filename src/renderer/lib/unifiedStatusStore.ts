/**
 * Unified status store that delegates to acpStatusStore (ACP sessions)
 * or activityStore (PTY sessions). Provides a single API for TaskItem
 * and sidebar indicators to read agent status regardless of mode.
 */

import { activityStore } from './activityStore';
import { acpStatusStore, type DotColor, type DotStyle, type StatusDot } from './acpStatusStore';

export type { DotColor, DotStyle, StatusDot };

type TaskMode = 'pty' | 'acp';

type TaskModeEntry = {
  mode: TaskMode;
  acpSessionKey?: string;
};

type Listener = (dot: StatusDot) => void;

class UnifiedStatusStore {
  private taskModes = new Map<string, TaskModeEntry>();

  /**
   * Register a task's mode so the store knows which backend to consult.
   */
  setTaskMode(taskId: string, mode: TaskMode, acpSessionKey?: string): void {
    this.taskModes.set(taskId, { mode, acpSessionKey });
  }

  removeTask(taskId: string): void {
    this.taskModes.delete(taskId);
  }

  /**
   * Get the current status dot for a task.
   */
  getDot(taskId: string): StatusDot {
    const entry = this.taskModes.get(taskId);
    if (!entry) {
      // Default: check PTY activity store
      return ptyBusyToDot(taskId);
    }

    if (entry.mode === 'acp' && entry.acpSessionKey) {
      return acpStatusStore.getDot(entry.acpSessionKey);
    }

    return ptyBusyToDot(taskId);
  }

  /**
   * Subscribe to status dot changes for a task.
   * Returns unsubscribe function.
   */
  subscribe(taskId: string, listener: Listener): () => void {
    const entry = this.taskModes.get(taskId);

    if (entry?.mode === 'acp' && entry.acpSessionKey) {
      return acpStatusStore.subscribe(entry.acpSessionKey, listener);
    }

    // PTY mode: adapt activityStore's boolean busy → StatusDot
    return activityStore.subscribe(taskId, (busy: boolean) => {
      listener(busy ? { color: 'amber', style: 'pulsing' } : { color: 'green', style: 'solid' });
    });
  }
}

function ptyBusyToDot(taskId: string): StatusDot {
  // Can't synchronously read activityStore state easily,
  // so default to green/solid (idle) for initial reads.
  // Subscribers will get live updates.
  return { color: 'green', style: 'solid' };
}

export const unifiedStatusStore = new UnifiedStatusStore();
