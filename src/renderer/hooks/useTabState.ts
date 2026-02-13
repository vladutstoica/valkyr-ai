import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TabId = 'agents' | 'editor' | 'git' | 'preview';

interface TabState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  // Badge data
  gitChangesCount: number;
  isAgentWorking: boolean;
  setGitChangesCount: (count: number) => void;
  setAgentWorking: (working: boolean) => void;
}

export const useTabState = create<TabState>()(
  persist(
    (set) => ({
      activeTab: 'agents',
      setActiveTab: (tab) => set({ activeTab: tab }),
      gitChangesCount: 0,
      isAgentWorking: false,
      setGitChangesCount: (count) => set({ gitChangesCount: count }),
      setAgentWorking: (working) => set({ isAgentWorking: working }),
    }),
    {
      name: 'tab-state',
      partialize: (state) => ({ activeTab: state.activeTab }),
    }
  )
);
