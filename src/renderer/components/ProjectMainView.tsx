import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { GitBranch, Plus, Loader2, Folder, AlertCircle, Archive } from 'lucide-react';
import { motion } from 'motion/react';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import TaskDeleteButton from './project/TaskDeleteButton';
import ProjectDeleteButton from './project/ProjectDeleteButton';
import BaseBranchControls from './git/BaseBranchControls';
import { pickDefaultBranch, type BranchOption } from './git/BranchSelect';
const ConfigEditorModal = React.lazy(() =>
  import('./project/ConfigEditorModal').then((m) => ({ default: m.ConfigEditorModal }))
);
import { useToast } from '../hooks/use-toast';
import { TaskRow } from './project/TaskRow';
import { BulkDeleteDialog } from './project/BulkDeleteDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { isActivePr, PrInfo } from '../lib/prStatus';
import { refreshPrStatus } from '../lib/prStatusStore';
import type { Project, Task } from '../types/app';
const UpdateProjectModal = React.lazy(() => import('./project/UpdateProjectModal'));
import { BranchSwitcher } from './git/BranchSwitcher';
import { RefreshCw } from 'lucide-react';
import { getGitStatus, getGitInfo } from '../services/gitService';

const normalizeBaseRef = (ref?: string | null): string | undefined => {
  if (!ref) return undefined;
  const trimmed = ref.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

interface ProjectMainViewProps {
  project: Project;
  onCreateTask: () => void;
  activeTask: Task | null;
  onSelectTask: (task: Task) => void;
  onDeleteTask: (
    project: Project,
    task: Task,
    options?: { silent?: boolean }
  ) => void | Promise<void | boolean>;
  onArchiveTask?: (
    project: Project,
    task: Task,
    options?: { silent?: boolean }
  ) => void | Promise<void | boolean>;
  onDeleteProject?: (project: Project) => void | Promise<void>;
  branchOptions: BranchOption[];
  isLoadingBranches: boolean;
  onBaseBranchChange?: (branch: string) => void;
}

const ProjectMainView: React.FC<ProjectMainViewProps> = ({
  project,
  onCreateTask,
  activeTask,
  onSelectTask,
  onDeleteTask,
  onArchiveTask,
  onDeleteProject,
  branchOptions,
  isLoadingBranches,
  onBaseBranchChange: onBaseBranchChangeCallback,
}) => {
  const { toast } = useToast();

  const [baseBranch, setBaseBranch] = useState<string | undefined>(() =>
    normalizeBaseRef(project.gitInfo.baseRef)
  );
  const [isSavingBaseBranch, setIsSavingBaseBranch] = useState(false);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [acknowledgeDirtyDelete, setAcknowledgeDirtyDelete] = useState(false);
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const hasPreloadedConfigRef = useRef(false);
  const currentProjectPathRef = useRef(project.path);

  const tasksInProject = project.tasks ?? [];
  const selectedCount = selectedIds.size;
  const selectedTasks = useMemo(
    () => tasksInProject.filter((ws) => selectedIds.has(ws.id)),
    [selectedIds, tasksInProject]
  );
  const [deleteStatus, setDeleteStatus] = useState<
    Record<
      string,
      {
        staged: number;
        unstaged: number;
        untracked: number;
        ahead: number;
        behind: number;
        error?: string;
        pr?: PrInfo | null;
      }
    >
  >({});
  const [deleteStatusLoading, setDeleteStatusLoading] = useState(false);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    const toDelete = tasksInProject.filter((ws) => selectedIds.has(ws.id));
    if (toDelete.length === 0) return;

    setIsDeleting(true);
    setShowDeleteDialog(false);

    const deletedNames: string[] = [];
    for (const ws of toDelete) {
      try {
        const result = await onDeleteTask(project, ws, { silent: true });
        if (result !== false) {
          deletedNames.push(ws.name);
        }
      } catch {
        // Continue deleting remaining tasks
      }
    }

    setIsDeleting(false);
    exitSelectMode();

    if (deletedNames.length > 0) {
      const maxNames = 3;
      const displayNames = deletedNames.slice(0, maxNames).join(', ');
      const remaining = deletedNames.length - maxNames;

      toast({
        title: deletedNames.length === 1 ? 'Task deleted' : 'Tasks deleted',
        description: remaining > 0 ? `${displayNames} and ${remaining} more` : displayNames,
      });
    }
  };

  const handleBulkArchive = async () => {
    if (!onArchiveTask) return;
    const toArchive = tasksInProject.filter((ws) => selectedIds.has(ws.id));
    if (toArchive.length === 0) return;

    setIsArchiving(true);

    const archivedNames: string[] = [];
    for (const ws of toArchive) {
      try {
        const result = await onArchiveTask(project, ws, { silent: true });
        // Only count as archived if returned true (or void for backwards compat)
        if (result !== false) {
          archivedNames.push(ws.name);
        }
      } catch {
        // Continue archiving remaining tasks
      }
    }

    setIsArchiving(false);
    exitSelectMode();

    if (archivedNames.length > 0) {
      const maxNames = 3;
      const displayNames = archivedNames.slice(0, maxNames).join(', ');
      const remaining = archivedNames.length - maxNames;

      toast({
        title: archivedNames.length === 1 ? 'Task archived' : 'Tasks archived',
        description: remaining > 0 ? `${displayNames} and ${remaining} more` : displayNames,
      });
    }
  };

  // Reset select mode when project changes
  useEffect(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }, [project.id]);

  // Reset config preload guard when switching projects.
  useEffect(() => {
    currentProjectPathRef.current = project.path;
    hasPreloadedConfigRef.current = false;
  }, [project.path]);

  useEffect(() => {
    setBaseBranch(normalizeBaseRef(project.gitInfo.baseRef));
  }, [project.id, project.gitInfo.baseRef]);

  useEffect(() => {
    if (!showDeleteDialog) {
      setDeleteStatus({});
      setAcknowledgeDirtyDelete(false);
      return;
    }

    let cancelled = false;
    const loadStatus = async () => {
      setDeleteStatusLoading(true);
      const next: typeof deleteStatus = {};

      for (const ws of selectedTasks) {
        try {
          const [statusRes, infoRes, rawPr] = await Promise.allSettled([
            getGitStatus(ws.path),
            getGitInfo(ws.path),
            refreshPrStatus(ws.path),
          ]);

          let staged = 0;
          let unstaged = 0;
          let untracked = 0;
          if (
            statusRes.status === 'fulfilled' &&
            statusRes.value?.success &&
            statusRes.value.changes
          ) {
            for (const change of statusRes.value.changes) {
              if (change.status === 'untracked') {
                untracked += 1;
              } else if (change.isStaged) {
                staged += 1;
              } else {
                unstaged += 1;
              }
            }
          }

          const ahead =
            infoRes.status === 'fulfilled' && typeof infoRes.value?.aheadCount === 'number'
              ? infoRes.value.aheadCount
              : 0;
          const behind =
            infoRes.status === 'fulfilled' && typeof infoRes.value?.behindCount === 'number'
              ? infoRes.value.behindCount
              : 0;
          const prValue = rawPr.status === 'fulfilled' ? rawPr.value : null;
          const pr = isActivePr(prValue) ? prValue : null;

          next[ws.id] = {
            staged,
            unstaged,
            untracked,
            ahead,
            behind,
            error:
              statusRes.status === 'fulfilled'
                ? statusRes.value?.error
                : statusRes.reason?.message || String(statusRes.reason || ''),
            pr,
          };
        } catch (error: unknown) {
          next[ws.id] = {
            staged: 0,
            unstaged: 0,
            untracked: 0,
            ahead: 0,
            behind: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      if (!cancelled) {
        setDeleteStatus(next);
        setDeleteStatusLoading(false);
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [showDeleteDialog, selectedTasks]);

  // Sync baseBranch when branchOptions change
  useEffect(() => {
    if (branchOptions.length === 0) return;
    const current = baseBranch ?? normalizeBaseRef(project.gitInfo.baseRef);
    const validDefault = pickDefaultBranch(branchOptions, current);
    if (validDefault && validDefault !== baseBranch) {
      setBaseBranch(validDefault);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchOptions]);

  const handleBaseBranchChange = useCallback(
    async (nextValue: string) => {
      const trimmed = normalizeBaseRef(nextValue);
      if (!trimmed || trimmed === baseBranch) return;
      const previous = baseBranch;
      setBaseBranch(trimmed);
      setIsSavingBaseBranch(true);
      try {
        const res = await window.electronAPI.updateProjectSettings({
          projectId: project.id,
          baseRef: trimmed,
        });
        if (!res?.success) {
          throw new Error(res?.error || 'Failed to update base branch');
        }
        if (project.gitInfo) {
          project.gitInfo.baseRef = trimmed;
        }
        onBaseBranchChangeCallback?.(trimmed);
      } catch (error) {
        setBaseBranch(previous);
        toast({
          variant: 'destructive',
          title: 'Failed to update base branch',
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsSavingBaseBranch(false);
      }
    },
    [baseBranch, project.id, project.gitInfo, onBaseBranchChangeCallback, toast]
  );

  const preloadProjectConfig = useCallback(() => {
    if (hasPreloadedConfigRef.current) return;
    hasPreloadedConfigRef.current = true;
    const requestedProjectPath = project.path;
    void window.electronAPI.getProjectConfig(requestedProjectPath).catch(() => {
      // Allow retry on next user intent if preload fails.
      if (currentProjectPathRef.current === requestedProjectPath) {
        hasPreloadedConfigRef.current = false;
      }
    });
  }, [project.path]);

  return (
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-6xl p-6">
          <div className="mx-auto w-full max-w-6xl space-y-4">
            <div className="space-y-4">
              <header className="space-y-3">
                <div className="space-y-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
                    <div className="flex items-center gap-2 sm:self-start">
                      {/* Update Project button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowUpdateModal(true)}
                        className="h-8 gap-1.5"
                        aria-label="Update project repositories"
                      >
                        <RefreshCw className="size-3.5" />
                        Update
                      </Button>
                      {onDeleteProject ? (
                        <ProjectDeleteButton
                          projectName={project.name}
                          tasks={project.tasks}
                          onConfirm={() => onDeleteProject?.(project)}
                          aria-label={`Delete project ${project.name}`}
                        />
                      ) : null}
                    </div>
                  </div>
                  <p className="text-muted-foreground font-mono text-xs break-all sm:text-sm">
                    {project.path}
                  </p>
                </div>
                {/* Branch controls - show BranchSwitcher for all projects */}
                <div className="flex items-center gap-3">
                  <BranchSwitcher
                    projectId={project.id}
                    projectPath={project.path}
                    currentBranch={project.gitInfo?.branch || 'main'}
                    onBranchChange={(branch) => {
                      // Refresh project data when branch changes
                      handleBaseBranchChange(branch);
                    }}
                  />
                  <button
                    onClick={() => {
                      preloadProjectConfig();
                      setShowConfigEditor(true);
                    }}
                    onMouseEnter={preloadProjectConfig}
                    className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                  >
                    Edit config
                  </button>
                </div>
                {/* Show sub-repos info for multi-repo projects */}
                {project.subRepos && project.subRepos.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Folder className="h-4 w-4" />
                      <span>Multi-repo project with {project.subRepos.length} repositories</span>
                    </div>
                    <div className="border-border bg-muted/30 space-y-1 rounded-md border p-3">
                      {project.subRepos.map((repo) => (
                        <div
                          key={repo.relativePath}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="font-mono text-xs">{repo.name}</span>
                          <div className="text-muted-foreground flex items-center gap-2 text-xs">
                            <GitBranch className="h-3 w-3" />
                            <span>{repo.gitInfo.branch || 'main'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </header>
              <Separator className="my-2" />
            </div>

            {(() => {
              // Find tasks running directly on the main branch (without worktrees)
              // Check both useWorktree === false and tasks where path equals project path
              const directTasks = tasksInProject.filter(
                (task) => task.useWorktree === false || task.path === project.path
              );
              if (directTasks.length === 0) return null;

              return (
                <Alert className="border-border bg-muted/50">
                  <AlertCircle className="text-muted-foreground h-3.5 w-3.5" />
                  <AlertTitle className="text-foreground text-sm font-medium">
                    Direct branch mode
                  </AlertTitle>
                  <AlertDescription className="text-muted-foreground text-xs">
                    {directTasks.length === 1 ? (
                      <>
                        <span className="text-foreground font-medium">{directTasks[0].name}</span>{' '}
                        is running directly on your current branch.
                      </>
                    ) : (
                      <>
                        <span className="text-foreground font-medium">
                          {directTasks.map((t) => t.name).join(', ')}
                        </span>{' '}
                        are running directly on your current branch.
                      </>
                    )}{' '}
                    Changes will affect your working directory.
                  </AlertDescription>
                </Alert>
              );
            })()}

            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Tasks</h2>
                  <p className="text-muted-foreground text-xs">
                    Spin up a fresh, isolated task for this project.
                  </p>
                </div>
                {!isSelectMode && (
                  <div className="flex gap-2">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.1, ease: 'easeInOut' }}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-semibold shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
                      onClick={onCreateTask}
                    >
                      <Plus className="mr-2 size-4" />
                      New Session
                    </motion.button>
                  </div>
                )}
              </div>
              {tasksInProject.length > 0 ? (
                <>
                  <div className="flex justify-end gap-2">
                    {isSelectMode && selectedCount > 0 && (
                      <>
                        {onArchiveTask && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 px-3 text-xs font-medium"
                            onClick={handleBulkArchive}
                            disabled={isArchiving || isDeleting}
                          >
                            {isArchiving ? (
                              <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Archiving…
                              </>
                            ) : (
                              'Archive'
                            )}
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 px-3 text-xs font-medium"
                          onClick={() => setShowDeleteDialog(true)}
                          disabled={isDeleting || isArchiving}
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="mr-2 size-4 animate-spin" />
                              Deleting…
                            </>
                          ) : (
                            'Delete'
                          )}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => (isSelectMode ? exitSelectMode() : setIsSelectMode(true))}
                      className="h-8 px-3 text-xs font-medium"
                    >
                      {isSelectMode ? 'Cancel' : 'Select'}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {tasksInProject.map((ws) => (
                      <TaskRow
                        key={ws.id}
                        ws={ws}
                        isSelectMode={isSelectMode}
                        isSelected={selectedIds.has(ws.id)}
                        onToggleSelect={() => toggleSelect(ws.id)}
                        active={activeTask?.id === ws.id}
                        onClick={() => onSelectTask(ws)}
                        onDelete={() => onDeleteTask(project, ws)}
                        onArchive={onArchiveTask ? () => onArchiveTask(project, ws) : undefined}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <Alert>
                  <AlertTitle>What's a task?</AlertTitle>
                  <AlertDescription>
                    Each task is an isolated copy and branch of your repo (Git-tracked files only).
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </div>
      </div>

      <BulkDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        selectedTasks={selectedTasks}
        deleteStatus={deleteStatus}
        deleteStatusLoading={deleteStatusLoading}
        acknowledgeDirtyDelete={acknowledgeDirtyDelete}
        onAcknowledgeChange={setAcknowledgeDirtyDelete}
        onConfirmDelete={handleBulkDelete}
        isDeleting={isDeleting}
      />

      {showConfigEditor && (
        <Suspense fallback={null}>
          <ConfigEditorModal
            isOpen={showConfigEditor}
            onClose={() => setShowConfigEditor(false)}
            projectPath={project.path}
          />
        </Suspense>
      )}

      {showUpdateModal && (
        <Suspense fallback={null}>
          <UpdateProjectModal
            isOpen={showUpdateModal}
            onClose={() => setShowUpdateModal(false)}
            projectId={project.id}
            projectPath={project.path}
            subRepos={project.subRepos?.map((r) => r.relativePath)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ProjectMainView;
