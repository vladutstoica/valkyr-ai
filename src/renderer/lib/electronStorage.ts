import type { StateStorage } from 'zustand/middleware';

/**
 * Zustand-compatible storage adapter backed by Electron IPC.
 * Persists to ui-state.json in userData instead of localStorage,
 * avoiding the origin-scoped localStorage issue in production
 * where a random port causes data loss between restarts.
 */
export const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const result = await window.electronAPI.uiStateGetItem(name);
      return result.success ? (result.data ?? null) : null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await window.electronAPI.uiStateSetItem(name, value);
    } catch {
      // swallow — fire-and-forget persistence
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await window.electronAPI.uiStateRemoveItem(name);
    } catch {
      // swallow
    }
  },
};
