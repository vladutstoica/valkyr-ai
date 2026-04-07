import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { electronStorage } from '../lib/electronStorage';

export interface MultiViewColumn {
  taskId: string;
  projectId: string;
}

interface MultiViewState {
  columns: MultiViewColumn[];
  addColumn: (taskId: string, projectId: string) => void;
  removeColumn: (taskId: string) => void;
  moveColumn: (taskId: string, direction: 'left' | 'right') => void;
  reorderColumns: (columns: MultiViewColumn[]) => void;
  clearColumns: () => void;
}

export const useMultiViewStore = create<MultiViewState>()(
  persist(
    (set) => ({
      columns: [],

      addColumn: (taskId, projectId) =>
        set((state) => {
          if (state.columns.some((c) => c.taskId === taskId)) return state;
          return { columns: [...state.columns, { taskId, projectId }] };
        }),

      removeColumn: (taskId) =>
        set((state) => ({
          columns: state.columns.filter((c) => c.taskId !== taskId),
        })),

      moveColumn: (taskId, direction) =>
        set((state) => {
          const idx = state.columns.findIndex((c) => c.taskId === taskId);
          if (idx === -1) return state;
          const newIdx = direction === 'left' ? idx - 1 : idx + 1;
          if (newIdx < 0 || newIdx >= state.columns.length) return state;
          const cols = [...state.columns];
          [cols[idx], cols[newIdx]] = [cols[newIdx], cols[idx]];
          return { columns: cols };
        }),

      reorderColumns: (columns) => set({ columns }),

      clearColumns: () => set({ columns: [] }),
    }),
    {
      name: 'multi-view-columns',
      storage: createJSONStorage(() => electronStorage),
    }
  )
);
