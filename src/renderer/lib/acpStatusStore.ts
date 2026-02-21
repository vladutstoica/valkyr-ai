import type { AcpSessionStatus } from '../types/electron-api';

/**
 * Dot color mapping:
 *   streaming / submitted + no pending → amber pulsing
 *   ready + no pending                → green solid
 *   error                             → red solid
 *   any + pending approvals           → red pulsing
 *   initializing                      → gray
 */

export type DotColor = 'green' | 'amber' | 'red' | 'gray';
export type DotStyle = 'solid' | 'pulsing';

export type StatusDot = {
  color: DotColor;
  style: DotStyle;
};

type StatusEntry = {
  status: AcpSessionStatus;
  hasPendingApprovals: boolean;
};

type Listener = (dot: StatusDot) => void;

class AcpStatusStore {
  private entries = new Map<string, StatusEntry>();
  private listeners = new Map<string, Set<Listener>>();

  setStatus(sessionKey: string, status: AcpSessionStatus, hasPendingApprovals: boolean): void {
    this.entries.set(sessionKey, { status, hasPendingApprovals });
    this.notify(sessionKey);
  }

  remove(sessionKey: string): void {
    this.entries.delete(sessionKey);
    this.listeners.delete(sessionKey);
  }

  getDot(sessionKey: string): StatusDot {
    const entry = this.entries.get(sessionKey);
    if (!entry) return { color: 'gray', style: 'solid' };
    return computeDot(entry);
  }

  subscribe(sessionKey: string, listener: Listener): () => void {
    let set = this.listeners.get(sessionKey);
    if (!set) {
      set = new Set();
      this.listeners.set(sessionKey, set);
    }
    set.add(listener);

    // Immediately notify with current state
    listener(this.getDot(sessionKey));

    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(sessionKey);
    };
  }

  private notify(sessionKey: string): void {
    const set = this.listeners.get(sessionKey);
    if (!set) return;
    const dot = this.getDot(sessionKey);
    for (const l of set) l(dot);
  }
}

function computeDot(entry: StatusEntry): StatusDot {
  const { status, hasPendingApprovals } = entry;

  if (hasPendingApprovals) {
    return { color: 'red', style: 'pulsing' };
  }

  switch (status) {
    case 'streaming':
    case 'submitted':
      return { color: 'amber', style: 'pulsing' };
    case 'ready':
      return { color: 'green', style: 'solid' };
    case 'error':
      return { color: 'red', style: 'solid' };
    case 'initializing':
    default:
      return { color: 'gray', style: 'solid' };
  }
}

export const acpStatusStore = new AcpStatusStore();
