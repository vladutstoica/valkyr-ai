import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { electronStorage } from '../lib/electronStorage';

export type AppMode = 'vibe' | 'ide' | 'multi';

interface AppModeState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

export const useAppMode = create<AppModeState>()(
  persist(
    (set) => ({
      mode: 'multi',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'app-mode',
      storage: createJSONStorage(() => electronStorage),
    }
  )
);
