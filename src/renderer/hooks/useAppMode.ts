import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppMode = 'vibe' | 'ide' | 'multi';

interface AppModeState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

export const useAppMode = create<AppModeState>()(
  persist(
    (set) => ({
      mode: 'vibe',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'app-mode',
    }
  )
);
