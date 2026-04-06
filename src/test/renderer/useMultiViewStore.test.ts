import { describe, it, expect, beforeEach, vi } from 'vitest';

// Replace the persist middleware with a transparent pass-through so the store
// behaves as plain Zustand in the Node test environment (no localStorage calls,
// no "Unable to update item" warnings).
vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  return {
    ...actual,
    persist: (config: unknown) => config,
  };
});

import { useMultiViewStore } from '../../renderer/hooks/useMultiViewStore';

beforeEach(() => {
  useMultiViewStore.setState({ columns: [] });
});

describe('useMultiViewStore', () => {
  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------
  describe('initial state', () => {
    it('starts with an empty columns array', () => {
      expect(useMultiViewStore.getState().columns).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // addColumn
  // ---------------------------------------------------------------------------
  describe('addColumn', () => {
    it('adds a new column to the store', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');

      const { columns } = useMultiViewStore.getState();
      expect(columns).toHaveLength(1);
      expect(columns[0]).toEqual({ taskId: 'task-1', projectId: 'project-a' });
    });

    it('appends columns in insertion order', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');
      useMultiViewStore.getState().addColumn('task-2', 'project-b');
      useMultiViewStore.getState().addColumn('task-3', 'project-c');

      const { columns } = useMultiViewStore.getState();
      expect(columns).toHaveLength(3);
      expect(columns.map((c) => c.taskId)).toEqual(['task-1', 'task-2', 'task-3']);
    });

    it('does not add a duplicate taskId', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');
      useMultiViewStore.getState().addColumn('task-1', 'project-b');

      const { columns } = useMultiViewStore.getState();
      expect(columns).toHaveLength(1);
      expect(columns[0].projectId).toBe('project-a');
    });

    it('allows the same projectId with different taskIds', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');
      useMultiViewStore.getState().addColumn('task-2', 'project-a');

      expect(useMultiViewStore.getState().columns).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // removeColumn
  // ---------------------------------------------------------------------------
  describe('removeColumn', () => {
    it('removes the column matching the given taskId', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');
      useMultiViewStore.getState().addColumn('task-2', 'project-b');

      useMultiViewStore.getState().removeColumn('task-1');

      const { columns } = useMultiViewStore.getState();
      expect(columns).toHaveLength(1);
      expect(columns[0].taskId).toBe('task-2');
    });

    it('is a no-op when taskId does not exist', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');

      useMultiViewStore.getState().removeColumn('non-existent');

      expect(useMultiViewStore.getState().columns).toHaveLength(1);
    });

    it('is a no-op on an empty store', () => {
      useMultiViewStore.getState().removeColumn('task-1');

      expect(useMultiViewStore.getState().columns).toEqual([]);
    });

    it('leaves remaining columns in their original order', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');
      useMultiViewStore.getState().addColumn('task-2', 'project-b');
      useMultiViewStore.getState().addColumn('task-3', 'project-c');

      useMultiViewStore.getState().removeColumn('task-2');

      expect(useMultiViewStore.getState().columns.map((c) => c.taskId)).toEqual([
        'task-1',
        'task-3',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // moveColumn
  // ---------------------------------------------------------------------------
  describe('moveColumn', () => {
    beforeEach(() => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');
      useMultiViewStore.getState().addColumn('task-2', 'project-b');
      useMultiViewStore.getState().addColumn('task-3', 'project-c');
    });

    it('moves a column left by swapping with its left neighbour', () => {
      useMultiViewStore.getState().moveColumn('task-2', 'left');

      expect(useMultiViewStore.getState().columns.map((c) => c.taskId)).toEqual([
        'task-2',
        'task-1',
        'task-3',
      ]);
    });

    it('moves a column right by swapping with its right neighbour', () => {
      useMultiViewStore.getState().moveColumn('task-2', 'right');

      expect(useMultiViewStore.getState().columns.map((c) => c.taskId)).toEqual([
        'task-1',
        'task-3',
        'task-2',
      ]);
    });

    it('is a no-op when moving the first column left', () => {
      useMultiViewStore.getState().moveColumn('task-1', 'left');

      expect(useMultiViewStore.getState().columns.map((c) => c.taskId)).toEqual([
        'task-1',
        'task-2',
        'task-3',
      ]);
    });

    it('is a no-op when moving the last column right', () => {
      useMultiViewStore.getState().moveColumn('task-3', 'right');

      expect(useMultiViewStore.getState().columns.map((c) => c.taskId)).toEqual([
        'task-1',
        'task-2',
        'task-3',
      ]);
    });

    it('is a no-op when taskId does not exist', () => {
      useMultiViewStore.getState().moveColumn('non-existent', 'left');

      expect(useMultiViewStore.getState().columns.map((c) => c.taskId)).toEqual([
        'task-1',
        'task-2',
        'task-3',
      ]);
    });

    it('preserves column data (taskId + projectId) after a swap', () => {
      useMultiViewStore.getState().moveColumn('task-3', 'left');

      const { columns } = useMultiViewStore.getState();
      expect(columns[1]).toEqual({ taskId: 'task-3', projectId: 'project-c' });
      expect(columns[2]).toEqual({ taskId: 'task-2', projectId: 'project-b' });
    });
  });

  // ---------------------------------------------------------------------------
  // clearColumns
  // ---------------------------------------------------------------------------
  describe('clearColumns', () => {
    it('empties the columns array', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');
      useMultiViewStore.getState().addColumn('task-2', 'project-b');

      useMultiViewStore.getState().clearColumns();

      expect(useMultiViewStore.getState().columns).toEqual([]);
    });

    it('is a no-op when already empty', () => {
      useMultiViewStore.getState().clearColumns();

      expect(useMultiViewStore.getState().columns).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple operations in sequence
  // ---------------------------------------------------------------------------
  describe('multiple operations in sequence', () => {
    it('handles add → move → remove → clear without corruption', () => {
      const { addColumn, moveColumn, removeColumn, clearColumns } = useMultiViewStore.getState();

      addColumn('task-1', 'project-a');
      addColumn('task-2', 'project-b');
      addColumn('task-3', 'project-c');

      // move task-3 to position 1 (left twice)
      moveColumn('task-3', 'left');
      moveColumn('task-3', 'left');
      expect(useMultiViewStore.getState().columns.map((c) => c.taskId)).toEqual([
        'task-3',
        'task-1',
        'task-2',
      ]);

      // remove middle item
      removeColumn('task-1');
      expect(useMultiViewStore.getState().columns.map((c) => c.taskId)).toEqual([
        'task-3',
        'task-2',
      ]);

      // duplicate add attempt is still blocked
      addColumn('task-2', 'project-x');
      expect(useMultiViewStore.getState().columns).toHaveLength(2);

      // clear everything
      clearColumns();
      expect(useMultiViewStore.getState().columns).toEqual([]);
    });

    it('allows re-adding a column after it has been removed', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');
      useMultiViewStore.getState().removeColumn('task-1');
      useMultiViewStore.getState().addColumn('task-1', 'project-b');

      const { columns } = useMultiViewStore.getState();
      expect(columns).toHaveLength(1);
      expect(columns[0]).toEqual({ taskId: 'task-1', projectId: 'project-b' });
    });

    it('allows re-adding columns after clearColumns', () => {
      useMultiViewStore.getState().addColumn('task-1', 'project-a');
      useMultiViewStore.getState().clearColumns();
      useMultiViewStore.getState().addColumn('task-2', 'project-b');

      const { columns } = useMultiViewStore.getState();
      expect(columns).toHaveLength(1);
      expect(columns[0].taskId).toBe('task-2');
    });
  });
});
