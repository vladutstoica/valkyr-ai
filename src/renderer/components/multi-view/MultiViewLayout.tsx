import React, { useState, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useMultiViewStore } from '../../hooks/useMultiViewStore';
import { MultiViewPane } from './MultiViewPane';
import { MultiViewSessionPicker } from './MultiViewSessionPicker';
import { Button } from '../ui/button';
import type { Project, Task } from '../../types/app';
import type { Agent } from '../../types';

interface MultiViewLayoutProps {
  allProjects: Project[];
  setShowTaskModal: (show: boolean) => void;
  setSelectedProject: (project: Project) => void;
}

export const MultiViewLayout: React.FC<MultiViewLayoutProps> = ({
  allProjects,
  setShowTaskModal,
  setSelectedProject,
}) => {
  const { columns, removeColumn, moveColumn } = useMultiViewStore();
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
          return { ...col, task: entry.task, project: entry.project };
        })
        .filter(Boolean) as Array<{
        taskId: string;
        projectId: string;
        task: Task;
        project: Project;
      }>,
    [columns, taskMap]
  );

  const handleOpenPicker = useCallback(() => setPickerOpen(true), []);
  const handleClosePicker = useCallback(() => setPickerOpen(false), []);

  // Empty state
  if (resolvedColumns.length === 0) {
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
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-3">
        {resolvedColumns.map((col, idx) => (
          <MultiViewPane
            key={col.taskId}
            task={col.task}
            project={col.project}
            canMoveLeft={idx > 0}
            canMoveRight={idx < resolvedColumns.length - 1}
            onMoveLeft={() => moveColumn(col.taskId, 'left')}
            onMoveRight={() => moveColumn(col.taskId, 'right')}
            onRemove={() => removeColumn(col.taskId)}
          />
        ))}

        {/* Add pane button — wide enough to allow resizing the last pane */}
        <div className="flex min-w-[300px] flex-shrink-0 items-center justify-center">
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
