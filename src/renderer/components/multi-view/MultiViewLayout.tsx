import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import { useMultiViewStore, type MultiViewColumn } from '../../hooks/useMultiViewStore';
import { MultiViewPane } from './MultiViewPane';
import { MultiViewSessionPicker } from './MultiViewSessionPicker';
import { Button } from '../ui/button';
import { unifiedStatusStore } from '../../lib/unifiedStatusStore';
import type { StatusDot } from '../../lib/acpStatusStore';
import type { Project, Task } from '../../types/app';

interface MultiViewLayoutProps {
  allProjects: Project[];
  setShowTaskModal: (show: boolean) => void;
  setSelectedProject: (project: Project) => void;
  onArchiveTask?: (project: Project, task: Task) => void;
  onDeleteTask?: (project: Project, task: Task) => void;
  onRenameTask?: (project: Project, task: Task, newName: string) => void;
}

interface ResolvedColumn extends MultiViewColumn {
  task: Task;
  project: Project;
}

interface AttentionIndicator {
  taskId: string;
  taskName: string;
  side: 'left' | 'right';
  color: 'red' | 'green';
}

/** Wrapper for each Reorder.Item that provides drag controls scoped to the toolbar.
 *  Uses layout={isDragging} so position animation only runs during active drag —
 *  prevents flickering when pane content changes (e.g. terminal panel opens). */
const DraggablePane: React.FC<{
  col: ResolvedColumn;
  idx: number;
  total: number;
  moveColumn: (taskId: string, dir: 'left' | 'right') => void;
  removeColumn: (taskId: string) => void;
  onArchiveTask?: (project: Project, task: Task) => void;
  onDeleteTask?: (project: Project, task: Task) => void;
  onRenameTask?: (project: Project, task: Task, newName: string) => void;
}> = ({ col, idx, total, moveColumn, removeColumn, onArchiveTask, onDeleteTask, onRenameTask }) => {
  const controls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);
  return (
    <Reorder.Item
      as="div"
      value={col}
      className="flex h-full min-w-0 flex-1"
      dragListener={false}
      dragControls={controls}
      id={`mv-pane-${col.taskId}`}
      data-mv-task={col.taskId}
      layout={isDragging ? 'position' : undefined}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <MultiViewPane
        task={col.task}
        project={col.project}
        canMoveLeft={idx > 0}
        canMoveRight={idx < total - 1}
        onMoveLeft={() => moveColumn(col.taskId, 'left')}
        onMoveRight={() => moveColumn(col.taskId, 'right')}
        onRemove={() => removeColumn(col.taskId)}
        dragTaskId={col.taskId}
        onDragStart={(e) => controls.start(e)}
        onArchive={onArchiveTask ? () => onArchiveTask(col.project, col.task) : undefined}
        onDelete={onDeleteTask ? () => onDeleteTask(col.project, col.task) : undefined}
        onRename={onRenameTask ? (newName) => onRenameTask(col.project, col.task, newName) : undefined}
      />
    </Reorder.Item>
  );
};

export const MultiViewLayout: React.FC<MultiViewLayoutProps> = ({
  allProjects,
  setShowTaskModal,
  setSelectedProject,
  onArchiveTask,
  onDeleteTask,
  onRenameTask,
}) => {
  const { columns, removeColumn, moveColumn, reorderColumns } = useMultiViewStore();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Build a lookup map: taskId → { task, project }
  const taskMap = useMemo(() => {
    const map = new Map<string, { task: Task; project: Project }>();
    for (const project of allProjects) {
      for (const task of project.tasks || []) {
        map.set(task.id, { task, project });
      }
    }
    return map;
  }, [allProjects]);

  // Resolved columns (filter out deleted tasks)
  const resolvedColumns = useMemo(
    () =>
      columns
        .map((col) => {
          const entry = taskMap.get(col.taskId);
          if (!entry) return null;
          return { ...col, task: entry.task, project: entry.project } as ResolvedColumn;
        })
        .filter(Boolean) as ResolvedColumn[],
    [columns, taskMap]
  );

  // Clean up stale column references (tasks that were deleted/archived).
  // Wait for both store hydration AND projects to load before cleaning,
  // otherwise hydrated columns get wiped before taskMap is populated.
  const [hydrated, setHydrated] = useState(useMultiViewStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    return useMultiViewStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || taskMap.size === 0) return;
    const staleColumns = columns.filter((col) => !taskMap.has(col.taskId));
    if (staleColumns.length > 0) {
      for (const col of staleColumns) {
        removeColumn(col.taskId);
      }
    }
  }, [hydrated, columns, taskMap, removeColumn]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleOpenPicker = useCallback(() => setPickerOpen(true), []);

  // Persist reorder to store
  const handleReorder = useCallback(
    (newOrder: ResolvedColumn[]) => {
      reorderColumns(newOrder.map(({ taskId, projectId }) => ({ taskId, projectId })));
    },
    [reorderColumns]
  );

  // Prevent keyboard-triggered scrolling on the multi-view scroll container.
  // Uses capture phase so preventDefault fires before native scroll behavior.
  const handleContainerKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
    const scrollKeys = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End']);
    if (!scrollKeys.has(e.key)) return;
    const target = e.target as HTMLElement;
    if (target.closest('.xterm, input, textarea, [contenteditable]')) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // --- Off-screen attention indicators ---
  const [visiblePanes, setVisiblePanes] = useState<Set<string>>(new Set());
  const [taskStatuses, setTaskStatuses] = useState<Map<string, StatusDot>>(new Map());
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // Track which panes are visible via IntersectionObserver
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePanes((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const taskId = entry.target.getAttribute('data-mv-task');
            if (!taskId) continue;
            if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
              next.add(taskId);
            } else {
              next.delete(taskId);
            }
          }
          return next;
        });
      },
      { root: container, threshold: 0.3 }
    );

    // Observe all pane elements
    const panes = container.querySelectorAll('[data-mv-task]');
    panes.forEach((pane) => observer.observe(pane));

    return () => observer.disconnect();
  }, [resolvedColumns.length]);

  // Subscribe to status changes for all tasks in multi-view
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const col of resolvedColumns) {
      const unsub = unifiedStatusStore.subscribe(col.taskId, (dot: StatusDot) => {
        setTaskStatuses((prev) => {
          const next = new Map(prev);
          next.set(col.taskId, dot);
          return next;
        });
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach((u) => u());
  }, [resolvedColumns]);

  // Auto-dismiss alerts after 5 seconds
  useEffect(() => {
    const attentionTasks = resolvedColumns.filter((col) => {
      const dot = taskStatuses.get(col.taskId);
      return dot && (dot.color === 'red' || dot.color === 'green') && !visiblePanes.has(col.taskId);
    });

    if (attentionTasks.length === 0) return;

    const timers = attentionTasks.map((col) => {
      const key = `${col.taskId}-${taskStatuses.get(col.taskId)?.color}`;
      return setTimeout(() => {
        setDismissedAlerts((prev) => new Set(prev).add(key));
      }, 5000);
    });

    return () => timers.forEach(clearTimeout);
  }, [resolvedColumns, taskStatuses, visiblePanes]);

  // Clear dismissed alerts when status changes
  useEffect(() => {
    setDismissedAlerts(new Set());
  }, [taskStatuses]);

  // Build attention indicators (uses ref, so must be in useEffect not useMemo)
  const [attentionIndicators, setAttentionIndicators] = useState<AttentionIndicator[]>([]);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) { setAttentionIndicators([]); return; }

    const indicators: AttentionIndicator[] = [];
    for (const col of resolvedColumns) {
      if (visiblePanes.has(col.taskId)) continue;
      const dot = taskStatuses.get(col.taskId);
      if (!dot || (dot.color !== 'red' && dot.color !== 'green')) continue;

      const key = `${col.taskId}-${dot.color}`;
      if (dismissedAlerts.has(key)) continue;

      const paneEl = container.querySelector(`[data-mv-task="${col.taskId}"]`) as HTMLElement | null;
      if (!paneEl) continue;
      const paneRect = paneEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const side = paneRect.left < containerRect.left ? 'left' : 'right';

      indicators.push({
        taskId: col.taskId,
        taskName: col.task.name,
        side,
        color: dot.color as 'red' | 'green',
      });
    }
    setAttentionIndicators(indicators);
  }, [resolvedColumns, visiblePanes, taskStatuses, dismissedAlerts]);

  const scrollToPane = useCallback((taskId: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const paneEl = container.querySelector(`[data-mv-task="${taskId}"]`) as HTMLElement | null;
    if (!paneEl) return;
    paneEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, []);

  const leftIndicators = attentionIndicators.filter((i) => i.side === 'left');
  const rightIndicators = attentionIndicators.filter((i) => i.side === 'right');

  // Empty state — only show when hydration is done so we don't flash
  // "Add sessions" while persisted columns are still loading from disk.
  if (resolvedColumns.length === 0 && hydrated) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground text-sm">Add sessions to view them side by side</p>
          <Button
            variant="outline"
            size="lg"
            className="cursor-pointer gap-2"
            onClick={handleOpenPicker}
          >
            <Plus className="h-4 w-4" />
            Add Session
          </Button>
        </div>
        <MultiViewSessionPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          allProjects={allProjects}
          setShowTaskModal={setShowTaskModal}
          setSelectedProject={setSelectedProject}
        />
      </>
    );
  }

  return (
    <>
      <div className="relative h-full min-h-0">
        {/* Left attention indicators */}
        {leftIndicators.length > 0 && (
          <div className="absolute top-1/2 left-1 z-20 flex -translate-y-1/2 flex-col gap-1">
            {leftIndicators.map((ind) => (
              <button
                key={ind.taskId}
                type="button"
                onClick={() => scrollToPane(ind.taskId)}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium shadow-lg backdrop-blur-sm transition-all hover:scale-105 ${
                  ind.color === 'red'
                    ? 'bg-red-500/90 text-white'
                    : 'bg-green-500/90 text-white'
                }`}
                title={`Scroll to ${ind.taskName}`}
              >
                <ChevronLeft className="h-3 w-3" />
                <span className="max-w-[80px] truncate">{ind.taskName}</span>
              </button>
            ))}
          </div>
        )}

        {/* Right attention indicators */}
        {rightIndicators.length > 0 && (
          <div className="absolute top-1/2 right-1 z-20 flex -translate-y-1/2 flex-col gap-1">
            {rightIndicators.map((ind) => (
              <button
                key={ind.taskId}
                type="button"
                onClick={() => scrollToPane(ind.taskId)}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium shadow-lg backdrop-blur-sm transition-all hover:scale-105 ${
                  ind.color === 'red'
                    ? 'bg-red-500/90 text-white'
                    : 'bg-green-500/90 text-white'
                }`}
                title={`Scroll to ${ind.taskName}`}
              >
                <span className="max-w-[80px] truncate">{ind.taskName}</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        <div
          ref={scrollContainerRef}
          tabIndex={-1}
          className="flex h-full min-h-0 overflow-x-auto p-3 outline-none"
          onKeyDownCapture={handleContainerKeyDownCapture}
        >
          <Reorder.Group
            as="div"
            axis="x"
            values={resolvedColumns}
            onReorder={handleReorder}
            className="flex h-full min-h-0 flex-1 gap-3"
            layoutScroll
          >
            {resolvedColumns.map((col, idx) => (
              <DraggablePane
                key={col.taskId}
                col={col}
                idx={idx}
                total={resolvedColumns.length}
                moveColumn={moveColumn}
                removeColumn={removeColumn}
                onArchiveTask={onArchiveTask}
                onDeleteTask={onDeleteTask}
                onRenameTask={onRenameTask}
              />
            ))}
          </Reorder.Group>

          {/* Add pane button */}
          <div className="flex min-w-[60px] flex-shrink-0 items-center justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground h-10 w-10 cursor-pointer rounded-full"
              onClick={handleOpenPicker}
              title="Add session"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <MultiViewSessionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allProjects={allProjects}
        setShowTaskModal={setShowTaskModal}
        setSelectedProject={setSelectedProject}
      />
    </>
  );
};
