import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkspaceSwipe } from '../hooks/useWorkspaceSwipe';
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
  Archive,
  RotateCcw,
  Pencil,
  MoreVertical,
  Copy,
  Star,
  Trash2,
  FolderClosed,
  GripVertical,
  Layers,
  Settings,
  Search,
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
import { AddProjectMenu } from './sidebar/AddProjectMenu';
import { TaskItem } from './project/TaskItem';
import { TaskDeleteButton } from './project/TaskDeleteButton';
import { MoveToGroupMenu, MoveToWorkspaceMenu } from './sidebar/MoveToMenuItems';
import { RemoteProjectIndicator } from './ssh/RemoteProjectIndicator';
import { useRemoteProject } from '../hooks/useRemoteProject';
import type { Project, ProjectGroup, Workspace } from '../types/app';
import WorkspaceBar from './WorkspaceBar';
import type { Task } from '../types/chat';
import type { ConnectionState } from './ssh';

export type SidebarViewMode = 'workspace' | 'all';

interface LeftSidebarProps {
  projects: Project[];
  allProjects?: Project[];
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
  onMoveProjectToWorkspace?: (
    projectId: string,
    workspaceId: string | null
  ) => void | Promise<void>;
  onOpenSettings?: () => void;
}

// Helper to determine if a project is remote
const isRemoteProject = (project: Project): boolean => {
  return Boolean(project.isRemote || project.sshConnectionId);
};

// Get connection ID from project
const getConnectionId = (project: Project): string | null => {
  return project.sshConnectionId || null;
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

/** Focus (and optionally select) an input when a condition becomes truthy. */
function useFocusOnCondition(
  ref: React.RefObject<HTMLInputElement | null>,
  condition: unknown,
  { delay = 50, select = false }: { delay?: number; select?: boolean } = {}
) {
  useEffect(() => {
    if (condition && ref.current) {
      const timer = setTimeout(() => {
        ref.current?.focus();
        if (select) ref.current?.select();
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [condition, ref, delay, select]);
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  projects,
  allProjects,
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
  onOpenSettings,
}) => {
  const { open, isMobile, setOpen } = useSidebar();
  const sidebarRef = useWorkspaceSwipe(workspaces, activeWorkspaceId, onSwitchWorkspace);
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
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<SidebarViewMode>('workspace');

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

  useFocusOnCondition(projectInputRef, editingProjectId, { delay: 100, select: true });
  useFocusOnCondition(groupInputRef, editingGroupId, { select: true });
  useFocusOnCondition(newGroupInputRef, showNewGroupInput);

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

  return (
    <>
      <AlertDialog
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This action cannot be
              undone and will remove all sessions associated with this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={() => projectToDelete && handleConfirmDeleteProject(projectToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div ref={sidebarRef} className="h-full w-full">
        <Sidebar className="h-full w-full !border-r-0">
          <SidebarContent className="flex h-full w-full flex-col overflow-hidden !pb-0">
            {/* Header: VALKYR AI + Settings */}
            <div className="shrink-0 pb-0">
              <Card className="w-full">
                <CardContent className="flex items-center justify-between px-3 py-2">
                  <span className="text-foreground text-xs font-semibold tracking-wider uppercase">
                    Valkyr AI
                  </span>
                  {onOpenSettings && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
                      onClick={onOpenSettings}
                      title="Settings"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <div className="shrink-0 py-2">
              <div className="border-border bg-background flex items-center gap-2 rounded-md border px-2 py-1.5">
                <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-xs outline-none"
                />
              </div>
            </div>

            <ScrollArea className="min-h-0 w-full flex-1">
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
                      // Use all projects when in "all" view mode
                      const sourceProjects =
                        viewMode === 'all' && allProjects ? allProjects : projects;

                      // Filter projects by search query (matches project name or task names)
                      const query = searchQuery.trim().toLowerCase();
                      const filteredProjects = query
                        ? sourceProjects.filter((p) => {
                            if (p.name.toLowerCase().includes(query)) return true;
                            return p.tasks?.some((t) => t.name.toLowerCase().includes(query));
                          })
                        : sourceProjects;

                      // Group projects by groupId
                      const ungrouped = filteredProjects.filter((p) => !p.groupId);
                      const sortedGroups = [...groups].sort(
                        (a, b) => a.displayOrder - b.displayOrder
                      );

                      const renderProjectCard = (typedProject: Project) => {
                        const isDeletingProject = deletingProjectId === typedProject.id;
                        const isProjectActive = selectedProject?.id === typedProject.id;
                        const taskCount = typedProject.tasks?.length || 0;
                        const isEditingThisProject = editingProjectId === typedProject.id;

                        // "Move to Group" and "Move to Workspace" submenu items
                        const moveToGroupDropdownItems = onMoveProjectToGroup ? (
                          <MoveToGroupMenu
                            variant="dropdown"
                            projectId={typedProject.id}
                            currentGroupId={typedProject.groupId}
                            groups={groups}
                            onMoveProjectToGroup={onMoveProjectToGroup}
                          />
                        ) : null;
                        const moveToGroupContextItems = onMoveProjectToGroup ? (
                          <MoveToGroupMenu
                            variant="context"
                            projectId={typedProject.id}
                            currentGroupId={typedProject.groupId}
                            groups={groups}
                            onMoveProjectToGroup={onMoveProjectToGroup}
                          />
                        ) : null;
                        const moveToWorkspaceDropdownItems = onMoveProjectToWorkspace ? (
                          <MoveToWorkspaceMenu
                            variant="dropdown"
                            projectId={typedProject.id}
                            currentWorkspaceId={typedProject.workspaceId}
                            workspaces={workspaces}
                            onMoveProjectToWorkspace={onMoveProjectToWorkspace}
                          />
                        ) : null;
                        const moveToWorkspaceContextItems = onMoveProjectToWorkspace ? (
                          <MoveToWorkspaceMenu
                            variant="context"
                            projectId={typedProject.id}
                            currentWorkspaceId={typedProject.workspaceId}
                            workspaces={workspaces}
                            onMoveProjectToWorkspace={onMoveProjectToWorkspace}
                          />
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
                                            className="border-border bg-background text-foreground focus:border-ring focus:ring-ring w-full border px-2 py-1 text-sm font-semibold outline-none focus:ring-1"
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
                                          onOpenChange={(open) =>
                                            setOpenMenuProjectId(open ? typedProject.id : null)
                                          }
                                        >
                                          <DropdownMenuTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className={`h-7 w-7 cursor-pointer ${
                                                openMenuProjectId === typedProject.id
                                                  ? ''
                                                  : 'opacity-0 group-hover/collapsible:opacity-100'
                                              }`}
                                              onClick={(e) => e.stopPropagation()}
                                              disabled={isDeletingProject}
                                            >
                                              <MoreVertical className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent
                                            align="end"
                                            onClick={(e) => e.stopPropagation()}
                                          >
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
                                                  className="text-destructive focus:text-destructive cursor-pointer"
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
                                      <p className="text-muted-foreground mt-2 text-xs">
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
                                                className={`group/task hover:bg-accent w-full cursor-pointer px-3 py-1.5 transition-colors ${
                                                  isActive ? 'bg-accent' : ''
                                                }`}
                                              >
                                                <TaskItem
                                                  task={task}
                                                  showDelete
                                                  isPinned={pinnedTaskIds?.has(task.id)}
                                                  onPin={
                                                    onPinTask ? () => onPinTask(task) : undefined
                                                  }
                                                  onDelete={
                                                    onDeleteTask
                                                      ? () => onDeleteTask(typedProject, task)
                                                      : undefined
                                                  }
                                                  onRename={
                                                    onRenameTask &&
                                                    !task.metadata?.multiAgent?.enabled
                                                      ? (newName) =>
                                                          onRenameTask(typedProject, task, newName)
                                                      : undefined
                                                  }
                                                  onArchive={
                                                    onArchiveTask
                                                      ? () =>
                                                          handleArchiveTaskWithRefresh(
                                                            typedProject,
                                                            task
                                                          )
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
                                                className="group/archived text-muted-foreground w-full justify-start rounded-none px-3"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <Archive className="mr-2 h-4 w-4" />
                                                Archived (
                                                {archivedTasksByProject[typedProject.id].length})
                                                <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/archived:rotate-90" />
                                              </Button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                              <div className="mt-1 ml-4 space-y-1 border-l pl-4">
                                                {archivedTasksByProject[typedProject.id].map(
                                                  (archivedTask) => (
                                                    <div
                                                      key={archivedTask.id}
                                                      className="group/archived-task text-muted-foreground hover:bg-accent flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      <span className="truncate">
                                                        {archivedTask.name}
                                                      </span>
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
                                                          useWorktree={
                                                            archivedTask.useWorktree !== false
                                                          }
                                                          className="h-6 w-6"
                                                          onConfirm={async () => {
                                                            if (onDeleteTask) {
                                                              await onDeleteTask(
                                                                typedProject,
                                                                archivedTask
                                                              );
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
                                    className="text-destructive focus:text-destructive cursor-pointer"
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

                      // "All workspaces" view: group by workspace
                      if (viewMode === 'all' && workspaces.length > 0) {
                        const defaultWs = workspaces.find((ws) => ws.isDefault);
                        return (
                          <div className="flex w-full flex-col gap-0 overflow-hidden">
                            {workspaces.map((ws) => {
                              const isDefault = ws.isDefault;
                              const wsProjects = filteredProjects.filter((p) => {
                                if (p.workspaceId === ws.id) return true;
                                if (isDefault && !p.workspaceId) return true;
                                return false;
                              });
                              if (wsProjects.length === 0) return null;
                              return (
                                <div key={ws.id} className="mt-3 first:mt-0">
                                  <div className="border-border text-muted-foreground flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5">
                                    <div className="bg-muted-foreground/60 h-2 w-2 rounded-sm" />
                                    <span className="text-[11px] font-semibold tracking-wider uppercase">
                                      {ws.name}
                                    </span>
                                  </div>
                                  {wsProjects.map((p) => renderProjectCard(p))}
                                </div>
                              );
                            })}
                          </div>
                        );
                      }

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
                              const groupProjects = filteredProjects.filter(
                                (p) => p.groupId === group.id
                              );
                              const isEditingThisGroup = editingGroupId === group.id;

                              return (
                                <Collapsible
                                  open={!group.isCollapsed}
                                  onOpenChange={(open) => onToggleGroupCollapsed?.(group.id, !open)}
                                >
                                  <div className="group/groupheader flex items-center gap-1 px-3 py-1.5">
                                    <GripVertical className="text-muted-foreground/0 group-hover/groupheader:text-muted-foreground/50 h-3 w-3 shrink-0 cursor-grab" />
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
                                        className="border-border bg-background text-foreground focus:border-ring focus:ring-ring min-w-0 flex-1 border px-1 py-0.5 text-[11px] font-semibold tracking-wider uppercase outline-none focus:ring-1"
                                      />
                                    ) : (
                                      <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wider uppercase">
                                        {group.name}
                                      </span>
                                    )}
                                    <span className="text-muted-foreground/60 text-[10px]">
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
                                          className="text-destructive focus:text-destructive cursor-pointer"
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
                                          (p) => p.groupId !== group.id
                                        );
                                        onReorderProjectsFull?.([...otherProjects, ...newOrder]);
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
                              <FolderClosed className="text-muted-foreground h-3 w-3 shrink-0" />
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
                                className="border-border bg-background text-foreground focus:border-ring focus:ring-ring min-w-0 flex-1 border px-1 py-0.5 text-[11px] font-semibold tracking-wider uppercase outline-none focus:ring-1"
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
                          <AddProjectMenu
                            onOpenProject={onOpenProject}
                            onNewProject={onNewProject}
                            onCloneProject={onCloneProject}
                            onAddRemoteProject={onAddRemoteProject}
                          />
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
            {onSwitchWorkspace &&
              onCreateWorkspace &&
              onRenameWorkspace &&
              onDeleteWorkspace &&
              onUpdateWorkspaceColor && (
                <div className="mt-auto shrink-0">
                  <WorkspaceBar
                    workspaces={workspaces}
                    activeWorkspaceId={activeWorkspaceId ?? null}
                    onSwitchWorkspace={onSwitchWorkspace}
                    onCreateWorkspace={onCreateWorkspace}
                    onRenameWorkspace={onRenameWorkspace}
                    onDeleteWorkspace={onDeleteWorkspace}
                    onUpdateWorkspaceColor={onUpdateWorkspaceColor}
                    onReorderWorkspaces={onReorderWorkspaces}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                  />
                </div>
              )}
          </SidebarContent>
        </Sidebar>
      </div>
    </>
  );
};

export default LeftSidebar;
