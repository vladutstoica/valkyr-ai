import React, { useState, useMemo, useCallback } from 'react';
import { Search, Plus, Check, ChevronRight } from 'lucide-react';
import { useMultiViewStore } from '../../hooks/useMultiViewStore';
import { useConversationDots } from '../../hooks/useUnifiedStatus';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import type { Project, Task } from '../../types/app';

interface MultiViewSessionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allProjects: Project[];
  setShowTaskModal: (show: boolean) => void;
  setSelectedProject: (project: Project) => void;
}

export const MultiViewSessionPicker: React.FC<MultiViewSessionPickerProps> = ({
  open,
  onOpenChange,
  allProjects,
  setShowTaskModal,
  setSelectedProject,
}) => {
  const { columns, addColumn } = useMultiViewStore();
  const [search, setSearch] = useState('');

  const columnTaskIds = useMemo(() => new Set(columns.map((c) => c.taskId)), [columns]);

  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allProjects;
    return allProjects
      .map((p) => {
        const tasks = (p.tasks || []).filter(
          (t) => t.name.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
        );
        if (tasks.length === 0 && !p.name.toLowerCase().includes(q)) return null;
        return { ...p, tasks };
      })
      .filter(Boolean) as Project[];
  }, [allProjects, search]);

  const handleSelect = useCallback(
    (task: Task, projectId: string) => {
      addColumn(task.id, projectId);
      onOpenChange(false);
      setSearch('');
    },
    [addColumn, onOpenChange]
  );

  const handleCreateNew = useCallback(
    (project: Project) => {
      setSelectedProject(project);
      onOpenChange(false);
      setSearch('');
      setShowTaskModal(true);
    },
    [onOpenChange, setShowTaskModal, setSelectedProject]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[70vh] max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Session</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-border bg-background text-foreground placeholder:text-muted-foreground w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* Project/Task list */}
        <div className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto">
          {filteredProjects.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-sm">No projects found</p>
          )}

          {filteredProjects.map((project) => (
            <ProjectSection
              key={project.id}
              project={project}
              columnTaskIds={columnTaskIds}
              onSelect={handleSelect}
              onCreateNew={handleCreateNew}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// --- Project section with collapsible task list ---

interface ProjectSectionProps {
  project: Project;
  columnTaskIds: Set<string>;
  onSelect: (task: Task, projectId: string) => void;
  onCreateNew: (project: Project) => void;
}

const ProjectSection: React.FC<ProjectSectionProps> = ({
  project,
  columnTaskIds,
  onSelect,
  onCreateNew,
}) => {
  const tasks = project.tasks || [];

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="group hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium">
        <ChevronRight className="text-muted-foreground h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
        <span className="text-foreground">{project.name}</span>
        <span className="text-muted-foreground text-xs">({tasks.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 space-y-0.5 py-1">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              projectId={project.id}
              isInMultiView={columnTaskIds.has(task.id)}
              onSelect={onSelect}
            />
          ))}
          <button
            type="button"
            onClick={() => onCreateNew(project)}
            className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
          >
            <Plus className="h-3 w-3" />
            New session...
          </button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// --- Task row with status dot ---

interface TaskRowProps {
  task: Task;
  projectId: string;
  isInMultiView: boolean;
  onSelect: (task: Task, projectId: string) => void;
}

const TaskRow: React.FC<TaskRowProps> = ({ task, projectId, isInMultiView, onSelect }) => {
  const dots = useConversationDots(task.id);
  const dot = dots[0] || { color: 'green', style: 'solid' };
  const colorMap: Record<string, string> = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400',
  };

  return (
    <button
      type="button"
      disabled={isInMultiView}
      onClick={() => onSelect(task, projectId)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
        isInMultiView
          ? 'text-muted-foreground cursor-default opacity-50'
          : 'text-foreground hover:bg-accent cursor-pointer'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${colorMap[dot.color] || 'bg-green-500'} ${dot.style === 'pulsing' ? 'animate-pulse' : ''}`}
      />
      <span className="truncate">{task.name}</span>
      {task.agentId && (
        <span className="text-muted-foreground ml-auto text-[10px]">{task.agentId}</span>
      )}
      {isInMultiView && <Check className="text-muted-foreground ml-auto h-3 w-3" />}
    </button>
  );
};
