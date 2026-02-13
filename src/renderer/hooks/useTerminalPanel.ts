import { useSyncExternalStore } from 'react';

export type TerminalType = 'task' | 'global' | string;

export interface TerminalPanelState {
  /** Whether the terminal panel is collapsed */
  isCollapsed: boolean;
  /** Height of the terminal panel as a percentage (default: 30) */
  height: number;
  /** Currently active terminal type: 'task', 'global', or a script name */
  activeTerminal: TerminalType;
  /** Status indicator: 'idle' | 'working' */
  status: 'idle' | 'working';
}

const STORAGE_KEY = 'valkyr:terminal-panel:v1';
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
      isCollapsed: typeof parsed.isCollapsed === 'boolean' ? parsed.isCollapsed : undefined,
      height:
        typeof parsed.height === 'number' && Number.isFinite(parsed.height)
          ? clampHeight(parsed.height)
          : undefined,
      activeTerminal:
        typeof parsed.activeTerminal === 'string' ? parsed.activeTerminal : undefined,
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
      isCollapsed: state.isCollapsed,
      height: state.height,
      activeTerminal: state.activeTerminal,
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
      isCollapsed: stored?.isCollapsed ?? false,
      height: stored?.height ?? DEFAULT_HEIGHT,
      activeTerminal: stored?.activeTerminal ?? 'session',
      status: 'idle', // Status is not persisted
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

  toggleCollapsed = (): void => {
    this.update({ isCollapsed: !this.state.isCollapsed });
  };

  setCollapsed = (collapsed: boolean): void => {
    this.update({ isCollapsed: collapsed });
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
 * Hook to access terminal panel state and actions
 */
export function useTerminalPanel() {
  const state = useSyncExternalStore(
    terminalPanelStore.subscribe,
    terminalPanelStore.getSnapshot,
    terminalPanelStore.getSnapshot
  );

  return {
    // State
    isCollapsed: state.isCollapsed,
    height: state.height,
    activeTerminal: state.activeTerminal,
    status: state.status,

    // Actions
    toggleCollapsed: terminalPanelStore.toggleCollapsed,
    setCollapsed: terminalPanelStore.setCollapsed,
    setHeight: terminalPanelStore.setHeight,
    setActiveTerminal: terminalPanelStore.setActiveTerminal,
    setStatus: terminalPanelStore.setStatus,
  };
}

/**
 * Hook to access only the collapsed state (useful for keyboard shortcut)
 */
export function useTerminalPanelCollapsed() {
  const state = useSyncExternalStore(
    terminalPanelStore.subscribe,
    terminalPanelStore.getSnapshot,
    terminalPanelStore.getSnapshot
  );

  return {
    isCollapsed: state.isCollapsed,
    toggleCollapsed: terminalPanelStore.toggleCollapsed,
  };
}

export { DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT, clampHeight };
