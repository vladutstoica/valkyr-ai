import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTerminalPanel } from '../hooks/useTerminalPanel';
import ReorderList from './ReorderList';
import { Button } from './ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from './ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from './ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from './ui/context-menu';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  FolderOpen,
  Github,
  Archive,
  RotateCcw,
  Server,
  Pencil,
  MoreVertical,
  Copy,
  Star,
  Trash2,
  FolderClosed,
  GripVertical,
  Layers,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import SidebarEmptyState from './SidebarEmptyState';
import { TaskItem } from './TaskItem';
import { TaskDeleteButton } from './TaskDeleteButton';
import { RemoteProjectIndicator } from './ssh/RemoteProjectIndicator';
import { useRemoteProject } from '../hooks/useRemoteProject';
import type { Project, ProjectGroup, Workspace } from '../types/app';
import WorkspaceBar from './WorkspaceBar';
import type { Task } from '../types/chat';
import type { ConnectionState } from './ssh';

interface LeftSidebarProps {
  projects: Project[];
  groups?: ProjectGroup[];
  archivedTasksVersion?: number;
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onOpenProject?: () => void;
  onNewProject?: () => void;
  onCloneProject?: () => void;
  onAddRemoteProject?: () => void;
  onSelectTask?: (task: Task) => void;
  activeTask?: Task | null;
  onReorderProjects?: (sourceId: string, targetId: string) => void;
  onReorderProjectsFull?: (newOrder: Project[]) => void;
  onSidebarContextChange?: (state: {
    open: boolean;
    isMobile: boolean;
    setOpen: (next: boolean) => void;
  }) => void;
  onCreateTaskForProject?: (project: Project) => void;
  onDeleteTask?: (project: Project, task: Task) => void | Promise<void | boolean>;
  onRenameTask?: (project: Project, task: Task, newName: string) => void | Promise<void>;
  onArchiveTask?: (project: Project, task: Task) => void | Promise<void | boolean>;
  onRestoreTask?: (project: Project, task: Task) => void | Promise<void>;
  onDeleteProject?: (project: Project) => void | Promise<void>;
  onRenameProject?: (project: Project, newName: string) => void | Promise<void>;
  pinnedTaskIds?: Set<string>;
  onPinTask?: (task: Task) => void;
  // Group management
  onCreateGroup?: (name: string) => void | Promise<void>;
  onRenameGroup?: (groupId: string, name: string) => void | Promise<void>;
  onDeleteGroup?: (groupId: string) => void | Promise<void>;
  onReorderGroups?: (groupIds: string[]) => void | Promise<void>;
  onMoveProjectToGroup?: (projectId: string, groupId: string | null) => void | Promise<void>;
  onToggleGroupCollapsed?: (groupId: string, isCollapsed: boolean) => void | Promise<void>;
  // Workspace management
  workspaces?: Workspace[];
  activeWorkspaceId?: string | null;
  onSwitchWorkspace?: (workspaceId: string) => void;
  onCreateWorkspace?: (name: string, color: string) => void;
  onRenameWorkspace?: (workspaceId: string, name: string) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onUpdateWorkspaceColor?: (workspaceId: string, color: string) => void;
  onReorderWorkspaces?: (workspaceIds: string[]) => void;
  onMoveProjectToWorkspace?: (projectId: string, workspaceId: string | null) => void | Promise<void>;
}

// Helper to determine if a project is remote
const isRemoteProject = (project: Project): boolean => {
  return Boolean((project as any).isRemote || (project as any).sshConnectionId);
};

// Get connection ID from project
const getConnectionId = (project: Project): string | null => {
  return (project as any).sshConnectionId || null;
};

// Project header with remote indicator
const ProjectHeader: React.FC<{
  project: Project;
  isActive: boolean;
}> = ({ project, isActive }) => {
  const remote = useRemoteProject(project);
  const connectionId = getConnectionId(project);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {isRemoteProject(project) && connectionId && (
        <RemoteProjectIndicator
          host={remote.host || undefined}
          connectionState={remote.connectionState as ConnectionState}
          size="sm"
          onReconnect={remote.reconnect}
          disabled={remote.isLoading}
        />
      )}
      <span className="flex-1 truncate font-semibold">{project.name}</span>
    </div>
  );
};

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  projects,
  groups = [],
  archivedTasksVersion,
  selectedProject,
  onSelectProject,
  onOpenProject,
  onNewProject,
  onCloneProject,
  onAddRemoteProject,
  onSelectTask,
  activeTask,
  onReorderProjects,
  onReorderProjectsFull,
  onSidebarContextChange,
  onCreateTaskForProject,
  onDeleteTask,
  onRenameTask,
  onArchiveTask,
  onRestoreTask,
  onDeleteProject,
  onRenameProject,
  pinnedTaskIds,
  onPinTask,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onReorderGroups,
  onMoveProjectToGroup,
  onToggleGroupCollapsed,
  workspaces = [],
  activeWorkspaceId,
  onSwitchWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onUpdateWorkspaceColor,
  onReorderWorkspaces,
  onMoveProjectToWorkspace,
}) => {
  const { open, isMobile, setOpen } = useSidebar();
  const { isCollapsed: isTerminalCollapsed } = useTerminalPanel();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const swipeDeltaRef = useRef(0);
  const swipeCooldownRef = useRef(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [archivedTasksByProject, setArchivedTasksByProject] = useState<Record<string, Task[]>>({});
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const projectInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);
  const canBlurRef = useRef(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const groupInputRef = useRef<HTMLInputElement>(null);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  // Fetch archived tasks for all projects
  const fetchArchivedTasks = useCallback(async () => {
    const archived: Record<string, Task[]> = {};
    for (const project of projects) {
      try {
        const tasks = await window.electronAPI.getArchivedTasks(project.id);
        if (tasks && tasks.length > 0) {
          archived[project.id] = tasks;
        }
      } catch (err) {
        console.error(`Failed to fetch archived tasks for project ${project.id}:`, err);
      }
    }
    setArchivedTasksByProject(archived);
  }, [projects]);

  useEffect(() => {
    if (projects.length > 0) {
      fetchArchivedTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length, archivedTasksVersion]);

  const handleRestoreTask = useCallback(
    async (project: Project, task: Task) => {
      if (onRestoreTask) {
        await onRestoreTask(project, task);
        fetchArchivedTasks();
      }
    },
    [onRestoreTask, fetchArchivedTasks]
  );

  const handleArchiveTaskWithRefresh = useCallback(
    async (project: Project, task: Task) => {
      if (onArchiveTask) {
        await onArchiveTask(project, task);
        fetchArchivedTasks();
      }
    },
    [onArchiveTask, fetchArchivedTasks]
  );

  const handleConfirmDeleteProject = useCallback(
    async (project: Project) => {
      if (!onDeleteProject) return;
      setDeletingProjectId(project.id);
      try {
        await onDeleteProject(project);
      } finally {
        setDeletingProjectId((current) => (current === project.id ? null : current));
        setProjectToDelete(null);
      }
    },
    [onDeleteProject]
  );

  const handleStartProjectEdit = useCallback((project: Project) => {
    setEditProjectName(project.name);
    isSubmittingRef.current = false;
    canBlurRef.current = false;
    setEditingProjectId(project.id);
  }, []);

  const handleCancelProjectEdit = useCallback(() => {
    setEditingProjectId(null);
    setEditProjectName('');
  }, []);

  const handleConfirmProjectEdit = useCallback(
    async (project: Project) => {
      // Prevent double calls from Enter + blur
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;

      const trimmed = editProjectName.trim();
      if (!trimmed || trimmed === project.name) {
        setEditingProjectId(null);
        return;
      }
      setEditingProjectId(null);
      await onRenameProject?.(project, trimmed);
    },
    [editProjectName, onRenameProject]
  );

  // Focus project input when editing starts
  useEffect(() => {
    if (editingProjectId && projectInputRef.current) {
      // Delay to let dropdown fully close
      const timer = setTimeout(() => {
        projectInputRef.current?.focus();
        projectInputRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editingProjectId]);

  // Focus group input when editing starts
  useEffect(() => {
    if (editingGroupId && groupInputRef.current) {
      const timer = setTimeout(() => {
        groupInputRef.current?.focus();
        groupInputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [editingGroupId]);

  // Focus new group input
  useEffect(() => {
    if (showNewGroupInput && newGroupInputRef.current) {
      const timer = setTimeout(() => {
        newGroupInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showNewGroupInput]);

  const handleConfirmNewGroup = useCallback(() => {
    const trimmed = newGroupName.trim();
    if (trimmed && onCreateGroup) {
      onCreateGroup(trimmed);
    }
    setShowNewGroupInput(false);
    setNewGroupName('');
  }, [newGroupName, onCreateGroup]);

  const handleConfirmGroupRename = useCallback(
    (groupId: string) => {
      const trimmed = editGroupName.trim();
      if (trimmed && onRenameGroup) {
        onRenameGroup(groupId, trimmed);
      }
      setEditingGroupId(null);
      setEditGroupName('');
    },
    [editGroupName, onRenameGroup]
  );

  useEffect(() => {
    onSidebarContextChange?.({ open, isMobile, setOpen });
  }, [open, isMobile, setOpen, onSidebarContextChange]);

  // Two-finger horizontal swipe to switch workspaces
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el || !onSwitchWorkspace || workspaces.length < 2) return;

    const sortedWorkspaces = [...workspaces].sort((a, b) => a.displayOrder - b.displayOrder);

    const handleWheel = (e: WheelEvent) => {
      // Only handle horizontal-dominant gestures
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

      e.preventDefault();

      if (swipeCooldownRef.current) return;

      swipeDeltaRef.current += e.deltaX;

      const threshold = 50;
      if (Math.abs(swipeDeltaRef.current) < threshold) return;

      const currentIndex = sortedWorkspaces.findIndex((ws) => ws.id === activeWorkspaceId);
      if (currentIndex === -1) {
        swipeDeltaRef.current = 0;
        return;
      }

      let nextIndex: number;
      if (swipeDeltaRef.current > 0) {
        // Swipe left → next workspace
        nextIndex = currentIndex + 1;
      } else {
        // Swipe right → previous workspace
        nextIndex = currentIndex - 1;
      }

      swipeDeltaRef.current = 0;

      if (nextIndex < 0 || nextIndex >= sortedWorkspaces.length) return;

      swipeCooldownRef.current = true;
      onSwitchWorkspace(sortedWorkspaces[nextIndex].id);
      setTimeout(() => {
        swipeCooldownRef.current = false;
      }, 300);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [workspaces, activeWorkspaceId, onSwitchWorkspace]);

  return (
    <>
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This action cannot be undone
              and will remove all sessions associated with this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => projectToDelete && handleConfirmDeleteProject(projectToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div ref={sidebarRef} className="h-full w-full">
      <Sidebar className="h-full w-full !border-r-0">
        <SidebarContent className="h-full w-full flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 min-h-0 w-full">
          <div className="w-full">
            {projects.length === 0 && (
              <SidebarEmptyState
                title="No projects yet"
                description="Open a project to start creating worktrees and running coding agents."
                actionLabel={onOpenProject ? 'Open Project' : undefined}
                onAction={onOpenProject}
                secondaryActionLabel={onNewProject ? 'New Project' : undefined}
                onSecondaryAction={onNewProject}
              />
            )}

            <SidebarGroup>
              <SidebarGroupContent>
                {(() => {
                  // Group projects by groupId
                  const ungrouped = projects.filter((p) => !p.groupId);
                  const sortedGroups = [...groups].sort((a, b) => a.displayOrder - b.displayOrder);

                  const renderProjectCard = (typedProject: Project) => {
                    const isDeletingProject = deletingProjectId === typedProject.id;
                    const isProjectActive = selectedProject?.id === typedProject.id;
                    const taskCount = typedProject.tasks?.length || 0;
                    const isEditingThisProject = editingProjectId === typedProject.id;

                    // "Move to Group" submenu items for dropdown
                    const moveToGroupDropdownItems = onMoveProjectToGroup && groups.length > 0 ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="cursor-pointer">
                          <Layers className="mr-2 h-4 w-4" />
                          Move to Group
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {typedProject.groupId && (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => onMoveProjectToGroup(typedProject.id, null)}
                            >
                              No Group
                            </DropdownMenuItem>
                          )}
                          {groups.map((g) => (
                            <DropdownMenuItem
                              key={g.id}
                              className="cursor-pointer"
                              disabled={typedProject.groupId === g.id}
                              onClick={() => onMoveProjectToGroup(typedProject.id, g.id)}
                            >
                              {g.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ) : null;

                    // "Move to Group" submenu items for context menu
                    const moveToGroupContextItems = onMoveProjectToGroup && groups.length > 0 ? (
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="cursor-pointer">
                          <Layers className="mr-2 h-3.5 w-3.5" />
                          Move to Group
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          {typedProject.groupId && (
                            <ContextMenuItem
                              className="cursor-pointer"
                              onClick={() => onMoveProjectToGroup(typedProject.id, null)}
                            >
                              No Group
                            </ContextMenuItem>
                          )}
                          {groups.map((g) => (
                            <ContextMenuItem
                              key={g.id}
                              className="cursor-pointer"
                              disabled={typedProject.groupId === g.id}
                              onClick={() => onMoveProjectToGroup(typedProject.id, g.id)}
                            >
                              {g.name}
                            </ContextMenuItem>
                          ))}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    ) : null;

                    // "Move to Workspace" submenu items for dropdown
                    const moveToWorkspaceDropdownItems = onMoveProjectToWorkspace && workspaces.length > 1 ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="cursor-pointer">
                          <Layers className="mr-2 h-4 w-4" />
                          Move to Workspace
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {workspaces.map((ws) => (
                            <DropdownMenuItem
                              key={ws.id}
                              className="cursor-pointer"
                              disabled={typedProject.workspaceId === ws.id || (!typedProject.workspaceId && ws.isDefault)}
                              onClick={() => onMoveProjectToWorkspace(typedProject.id, ws.id)}
                            >
                              <span className={`inline-block w-2 h-2 rounded-full mr-2 bg-${ws.color}-500`} />
                              {ws.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ) : null;

                    // "Move to Workspace" submenu items for context menu
                    const moveToWorkspaceContextItems = onMoveProjectToWorkspace && workspaces.length > 1 ? (
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="cursor-pointer">
                          <Layers className="mr-2 h-3.5 w-3.5" />
                          Move to Workspace
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          {workspaces.map((ws) => (
                            <ContextMenuItem
                              key={ws.id}
                              className="cursor-pointer"
                              disabled={typedProject.workspaceId === ws.id || (!typedProject.workspaceId && ws.isDefault)}
                              onClick={() => onMoveProjectToWorkspace(typedProject.id, ws.id)}
                            >
                              <span className={`inline-block w-2 h-2 rounded-full mr-2 bg-${ws.color}-500`} />
                              {ws.name}
                            </ContextMenuItem>
                          ))}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    ) : null;

                    return (
                      <ContextMenu key={typedProject.id}>
                        <ContextMenuTrigger asChild>
                          <Card
                            className="w-full cursor-pointer transition-colors"
                            onClick={() => onSelectProject(typedProject)}
                          >
                            <Collapsible defaultOpen className="group/collapsible w-full">
                              <CardHeader className="w-full p-3">
                                <div className="flex w-full items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    {isEditingThisProject ? (
                                      <input
                                        ref={projectInputRef}
                                        type="text"
                                        value={editProjectName}
                                        onChange={(e) => setEditProjectName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleConfirmProjectEdit(typedProject);
                                          } else if (e.key === 'Escape') {
                                            e.preventDefault();
                                            handleCancelProjectEdit();
                                          }
                                        }}
                                        onFocus={() => {
                                          setTimeout(() => {
                                            canBlurRef.current = true;
                                          }, 150);
                                        }}
                                        onBlur={() => {
                                          if (canBlurRef.current) {
                                            handleConfirmProjectEdit(typedProject);
                                          } else {
                                            setTimeout(() => {
                                              projectInputRef.current?.focus();
                                            }, 0);
                                          }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full border border-border bg-background px-2 py-1 text-sm font-semibold text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                                      />
                                    ) : (
                                      <CardTitle className="text-sm">
                                        <ProjectHeader
                                          project={typedProject}
                                          isActive={isProjectActive}
                                        />
                                      </CardTitle>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <DropdownMenu
                                      open={openMenuProjectId === typedProject.id}
                                      onOpenChange={(open) => setOpenMenuProjectId(open ? typedProject.id : null)}
                                    >
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className={`h-7 w-7 cursor-pointer ${
                                            openMenuProjectId === typedProject.id ? '' : 'opacity-0 group-hover/collapsible:opacity-100'
                                          }`}
                                          onClick={(e) => e.stopPropagation()}
                                          disabled={isDeletingProject}
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                        {onRenameProject && (
                                          <DropdownMenuItem
                                            className="cursor-pointer"
                                            onClick={() => handleStartProjectEdit(typedProject)}
                                          >
                                            <Pencil className="mr-2 h-4 w-4" />
                                            Rename
                                          </DropdownMenuItem>
                                        )}
                                        {moveToGroupDropdownItems}
                                        {moveToWorkspaceDropdownItems}
                                        <DropdownMenuItem className="cursor-pointer" disabled>
                                          <Copy className="mr-2 h-4 w-4" />
                                          Make a copy
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" disabled>
                                          <Star className="mr-2 h-4 w-4" />
                                          Favorite
                                        </DropdownMenuItem>
                                        {onDeleteProject && (
                                          <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                              className="cursor-pointer text-destructive focus:text-destructive"
                                              onClick={() => setProjectToDelete(typedProject)}
                                            >
                                              <Trash2 className="mr-2 h-4 w-4" />
                                              Delete
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <CollapsibleTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 cursor-pointer"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                                      </Button>
                                    </CollapsibleTrigger>
                                  </div>
                                </div>
                                {taskCount > 0 && (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {taskCount} session{taskCount !== 1 ? 's' : ''}
                                  </p>
                                )}
                              </CardHeader>

                          <CollapsibleContent>
                            <CardContent className="w-full p-0">
                              <Separator />
                              <div className="w-full">
                                {typedProject.tasks
                                  ?.slice()
                                  .sort((a, b) => {
                                    const aPinned = pinnedTaskIds?.has(a.id) ? 1 : 0;
                                    const bPinned = pinnedTaskIds?.has(b.id) ? 1 : 0;
                                    return bPinned - aPinned;
                                  })
                                  .map((task) => {
                                    const isActive = activeTask?.id === task.id;
                                    return (
                                      <div
                                        key={task.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (selectedProject?.id !== typedProject.id) {
                                            onSelectProject(typedProject);
                                          }
                                          onSelectTask?.(task);
                                        }}
                                        className={`group/task w-full cursor-pointer px-3 py-1.5 transition-colors hover:bg-accent ${
                                          isActive ? 'bg-accent' : ''
                                        }`}
                                      >
                                        <TaskItem
                                          task={task}
                                          showDelete
                                          isPinned={pinnedTaskIds?.has(task.id)}
                                          onPin={onPinTask ? () => onPinTask(task) : undefined}
                                          onDelete={
                                            onDeleteTask
                                              ? () => onDeleteTask(typedProject, task)
                                              : undefined
                                          }
                                          onRename={
                                            onRenameTask && !task.metadata?.multiAgent?.enabled
                                              ? (newName) =>
                                                  onRenameTask(typedProject, task, newName)
                                              : undefined
                                          }
                                          onArchive={
                                            onArchiveTask
                                              ? () =>
                                                  handleArchiveTaskWithRefresh(typedProject, task)
                                              : undefined
                                          }
                                        />
                                      </div>
                                    );
                                  })}

                                {/* New Session button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start rounded-none px-3"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedProject?.id !== typedProject.id) {
                                      onSelectProject(typedProject);
                                    }
                                    onCreateTaskForProject?.(typedProject);
                                  }}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  New Session
                                </Button>

                                {/* Archived sessions section */}
                                {archivedTasksByProject[typedProject.id]?.length > 0 && (
                                  <Collapsible>
                                    <CollapsibleTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="group/archived w-full justify-start rounded-none px-3 text-muted-foreground"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Archive className="mr-2 h-4 w-4" />
                                        Archived ({archivedTasksByProject[typedProject.id].length})
                                        <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/archived:rotate-90" />
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="ml-4 mt-1 space-y-1 border-l pl-4">
                                        {archivedTasksByProject[typedProject.id].map(
                                          (archivedTask) => (
                                            <div
                                              key={archivedTask.id}
                                              className="group/archived-task flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <span className="truncate">{archivedTask.name}</span>
                                              <div className="flex items-center gap-1 opacity-0 group-hover/archived-task:opacity-100">
                                                <TooltipProvider>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() =>
                                                          handleRestoreTask(
                                                            typedProject,
                                                            archivedTask
                                                          )
                                                        }
                                                      >
                                                        <RotateCcw className="h-3 w-3" />
                                                      </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Restore</TooltipContent>
                                                  </Tooltip>
                                                </TooltipProvider>
                                                <TaskDeleteButton
                                                  taskName={archivedTask.name}
                                                  taskId={archivedTask.id}
                                                  taskPath={archivedTask.path}
                                                  useWorktree={archivedTask.useWorktree !== false}
                                                  className="h-6 w-6"
                                                  onConfirm={async () => {
                                                    if (onDeleteTask) {
                                                      await onDeleteTask(typedProject, archivedTask);
                                                      fetchArchivedTasks();
                                                    }
                                                  }}
                                                />
                                              </div>
                                            </div>
                                          )
                                        )}
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                )}
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                            </Collapsible>
                          </Card>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          {onRenameProject && (
                            <ContextMenuItem
                              className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartProjectEdit(typedProject);
                              }}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              Rename
                            </ContextMenuItem>
                          )}
                          {moveToGroupContextItems}
                          {moveToWorkspaceContextItems}
                          <ContextMenuItem className="cursor-pointer" disabled>
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            Make a copy
                          </ContextMenuItem>
                          <ContextMenuItem className="cursor-pointer" disabled>
                            <Star className="mr-2 h-3.5 w-3.5" />
                            Favorite
                          </ContextMenuItem>
                          {onDeleteProject && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setProjectToDelete(typedProject);
                                }}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Delete
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  };

                  return (
                    <div className="flex w-full flex-col gap-0 overflow-hidden">
                      {/* Ungrouped projects */}
                      <ReorderList
                        items={ungrouped}
                        onReorder={(newOrder) => {
                          const grouped = projects.filter((p) => p.groupId);
                          onReorderProjectsFull?.([...newOrder, ...grouped]);
                        }}
                        getKey={(p) => p.id}
                      >
                        {(project) => renderProjectCard(project)}
                      </ReorderList>

                      {/* Grouped projects */}
                      <ReorderList
                        items={sortedGroups}
                        onReorder={(newOrder) => {
                          onReorderGroups?.(newOrder.map((g) => g.id));
                        }}
                        getKey={(g) => g.id}
                      >
                        {(group) => {
                          const groupProjects = projects.filter(
                            (p) => p.groupId === group.id,
                          );
                          const isEditingThisGroup = editingGroupId === group.id;

                          return (
                            <Collapsible
                              open={!group.isCollapsed}
                              onOpenChange={(open) =>
                                onToggleGroupCollapsed?.(group.id, !open)
                              }
                            >
                              <div className="group/groupheader flex items-center gap-1 px-3 py-1.5">
                                <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground/0 group-hover/groupheader:text-muted-foreground/50" />
                                <CollapsibleTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 shrink-0 cursor-pointer"
                                  >
                                    {group.isCollapsed ? (
                                      <ChevronRight className="h-3 w-3" />
                                    ) : (
                                      <ChevronDown className="h-3 w-3" />
                                    )}
                                  </Button>
                                </CollapsibleTrigger>
                                {isEditingThisGroup ? (
                                  <input
                                    ref={groupInputRef}
                                    type="text"
                                    value={editGroupName}
                                    onChange={(e) => setEditGroupName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleConfirmGroupRename(group.id);
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setEditingGroupId(null);
                                      }
                                    }}
                                    onBlur={() => handleConfirmGroupRename(group.id)}
                                    className="min-w-0 flex-1 border border-border bg-background px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                                  />
                                ) : (
                                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {group.name}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground/60">
                                  {groupProjects.length}
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 shrink-0 cursor-pointer opacity-0 group-hover/groupheader:opacity-100"
                                    >
                                      <MoreVertical className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      className="cursor-pointer"
                                      onClick={() => {
                                        setEditGroupName(group.name);
                                        setEditingGroupId(group.id);
                                      }}
                                    >
                                      <Pencil className="mr-2 h-3.5 w-3.5" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="cursor-pointer text-destructive focus:text-destructive"
                                      onClick={() => onDeleteGroup?.(group.id)}
                                    >
                                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                                      Delete Group
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              <CollapsibleContent>
                                <ReorderList
                                  items={groupProjects}
                                  onReorder={(newOrder) => {
                                    const otherProjects = projects.filter(
                                      (p) => p.groupId !== group.id,
                                    );
                                    onReorderProjectsFull?.([
                                      ...otherProjects,
                                      ...newOrder,
                                    ]);
                                  }}
                                  getKey={(p) => p.id}
                                >
                                  {(project) => renderProjectCard(project)}
                                </ReorderList>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        }}
                      </ReorderList>

                      {/* New Group input */}
                      {showNewGroupInput && (
                        <div className="flex items-center gap-1 px-3 py-1.5">
                          <FolderClosed className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <input
                            ref={newGroupInputRef}
                            type="text"
                            placeholder="Group name..."
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConfirmNewGroup();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setShowNewGroupInput(false);
                                setNewGroupName('');
                              }
                            }}
                            onBlur={handleConfirmNewGroup}
                            className="min-w-0 flex-1 border border-border bg-background px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Add Project / Add Group buttons */}
                {projects.length > 0 && (
                  <div className="flex gap-1">
                    {onOpenProject && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="flex-1">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Project
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                          <DropdownMenuItem onClick={() => onOpenProject?.()}>
                            <FolderOpen className="mr-2 h-4 w-4" />
                            Open Folder
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onNewProject?.()}>
                            <Plus className="mr-2 h-4 w-4" />
                            Create New
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onCloneProject?.()}>
                            <Github className="mr-2 h-4 w-4" />
                            Clone from GitHub
                          </DropdownMenuItem>
                          {onAddRemoteProject && (
                            <DropdownMenuItem onClick={() => onAddRemoteProject?.()}>
                              <Server className="mr-2 h-4 w-4" />
                              Add Remote Project
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {onCreateGroup && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="shrink-0"
                              onClick={() => setShowNewGroupInput(true)}
                            >
                              <Layers className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Add Group</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        </ScrollArea>
        {onSwitchWorkspace && onCreateWorkspace && onRenameWorkspace && onDeleteWorkspace && onUpdateWorkspaceColor && (
          <>
          <WorkspaceBar
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId ?? null}
            onSwitchWorkspace={onSwitchWorkspace}
            onCreateWorkspace={onCreateWorkspace}
            onRenameWorkspace={onRenameWorkspace}
            onDeleteWorkspace={onDeleteWorkspace}
            onUpdateWorkspaceColor={onUpdateWorkspaceColor}
            onReorderWorkspaces={onReorderWorkspaces}
          />
          {/* Spacer to align workspace separator with terminal panel top border */}
          <div className={`shrink-0 transition-all duration-200 ${isTerminalCollapsed ? 'h-9' : 'h-64'}`} />
          </>
        )}
        </SidebarContent>
      </Sidebar>
    </div>
    </>
  );
};

export default LeftSidebar;
