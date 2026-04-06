import { useSyncExternalStore } from 'react';

export type TerminalType = 'task' | 'global' | string;

export interface TerminalPanelState {
  /** Height of the terminal panel as a percentage (default: 30) */
  height: number;
  /** Currently active terminal type: 'task', 'global', or a script name */
  activeTerminal: TerminalType;
  /** Status indicator: 'idle' | 'working' */
  status: 'idle' | 'working';
  /** Per-session collapsed state (keyed by task/session ID) */
  collapsedMap: Record<string, boolean>;
}

const STORAGE_KEY = 'valkyr:terminal-panel:v2';
const DEFAULT_HEIGHT = 30;
const MIN_HEIGHT = 15;
const MAX_HEIGHT = 70;

/**
 * Clamp height to valid range
 */
function clampHeight(height: number): number {
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height));
}

/**
 * Check if localStorage is available
 */
const storageAvailable = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const key = '__valkyr_terminal_panel_test__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
})();

/**
 * Load state from localStorage
 */
function loadFromStorage(): Partial<TerminalPanelState> | null {
  if (!storageAvailable) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      height:
        typeof parsed.height === 'number' && Number.isFinite(parsed.height)
          ? clampHeight(parsed.height)
          : undefined,
      activeTerminal: typeof parsed.activeTerminal === 'string' ? parsed.activeTerminal : undefined,
      collapsedMap:
        parsed.collapsedMap && typeof parsed.collapsedMap === 'object'
          ? parsed.collapsedMap
          : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Save state to localStorage
 */
function saveToStorage(state: TerminalPanelState): void {
  if (!storageAvailable) return;
  try {
    const payload = JSON.stringify({
      height: state.height,
      activeTerminal: state.activeTerminal,
      collapsedMap: state.collapsedMap,
    });
    window.localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // ignore storage errors
  }
}

/**
 * Terminal panel store singleton
 */
class TerminalPanelStore {
  private state: TerminalPanelState;
  private listeners = new Set<() => void>();

  constructor() {
    const stored = loadFromStorage();
    this.state = {
      height: stored?.height ?? DEFAULT_HEIGHT,
      activeTerminal: stored?.activeTerminal ?? 'session',
      status: 'idle',
      collapsedMap: stored?.collapsedMap ?? {},
    };
  }

  getSnapshot = (): TerminalPanelState => {
    return this.state;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // ignore listener errors
      }
    }
  }

  private update(partial: Partial<TerminalPanelState>): void {
    this.state = { ...this.state, ...partial };
    saveToStorage(this.state);
    this.emit();
  }

  /** Check if a specific session's terminal is collapsed (defaults to true) */
  isCollapsedFor = (sessionKey: string): boolean => {
    return this.state.collapsedMap[sessionKey] ?? true;
  };

  /** Toggle collapsed state for a specific session */
  toggleCollapsedFor = (sessionKey: string): void => {
    const current = this.state.collapsedMap[sessionKey] ?? true;
    this.update({
      collapsedMap: { ...this.state.collapsedMap, [sessionKey]: !current },
    });
  };

  /** Set collapsed state for a specific session */
  setCollapsedFor = (sessionKey: string, collapsed: boolean): void => {
    this.update({
      collapsedMap: { ...this.state.collapsedMap, [sessionKey]: collapsed },
    });
  };

  setHeight = (height: number): void => {
    this.update({ height: clampHeight(height) });
  };

  setActiveTerminal = (terminal: TerminalType): void => {
    this.update({ activeTerminal: terminal });
  };

  setStatus = (status: 'idle' | 'working'): void => {
    // Status is not persisted, only update in memory
    this.state = { ...this.state, status };
    this.emit();
  };
}

// Singleton instance
const terminalPanelStore = new TerminalPanelStore();

/**
 * Hook to access terminal panel state and actions, scoped to a session key.
 * Each session gets its own collapsed state (defaults to collapsed).
 */
export function useTerminalPanel(sessionKey?: string) {
  const state = useSyncExternalStore(
    terminalPanelStore.subscribe,
    terminalPanelStore.getSnapshot,
    terminalPanelStore.getSnapshot
  );

  const key = sessionKey ?? '__global__';
  const isCollapsed = state.collapsedMap[key] ?? true;

  return {
    // State
    isCollapsed,
    height: state.height,
    activeTerminal: state.activeTerminal,
    status: state.status,

    // Actions
    toggleCollapsed: () => terminalPanelStore.toggleCollapsedFor(key),
    setCollapsed: (collapsed: boolean) => terminalPanelStore.setCollapsedFor(key, collapsed),
    setHeight: terminalPanelStore.setHeight,
    setActiveTerminal: terminalPanelStore.setActiveTerminal,
    setStatus: terminalPanelStore.setStatus,
  };
}

/**
 * Hook to access only the collapsed state for a session (useful for keyboard shortcut)
 */
export function useTerminalPanelCollapsed(sessionKey?: string) {
  const state = useSyncExternalStore(
    terminalPanelStore.subscribe,
    terminalPanelStore.getSnapshot,
    terminalPanelStore.getSnapshot
  );

  const key = sessionKey ?? '__global__';
  const isCollapsed = state.collapsedMap[key] ?? true;

  return {
    isCollapsed,
    toggleCollapsed: () => terminalPanelStore.toggleCollapsedFor(key),
  };
}

export { DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT, clampHeight };
