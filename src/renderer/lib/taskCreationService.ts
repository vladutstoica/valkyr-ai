import { type Agent } from '../types';
import type { Project, Task } from '../types/app';
import type { AgentRun, TaskMetadata } from '../types/chat';
import { saveActiveIds, saveProjectLastTaskId } from '../constants/layout';
import { getAgentForTask } from './getAgentForTask';

export interface CreateTaskParams {
  taskName: string;
  initialPrompt?: string;
  agentRuns: AgentRun[];
  autoApprove?: boolean;
  useWorktree: boolean;
  baseRef?: string;
  selectedSubRepos?: string[];
}

export interface CreateTaskCallbacks {
  selectedProject: Project;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setSelectedProject: React.Dispatch<React.SetStateAction<Project | null>>;
  setActiveTask: React.Dispatch<React.SetStateAction<Task | null>>;
  setActiveTaskAgent: React.Dispatch<React.SetStateAction<Agent | null>>;
  toast: (opts: any) => void;
}

async function runSetupOnCreate(
  taskId: string,
  taskPath: string,
  projectPath: string,
  taskName: string
): Promise<void> {
  try {
    const result = await window.electronAPI.lifecycleSetup({
      taskId,
      taskPath,
      projectPath,
    });
    if (!result?.success && !result?.skipped) {
      const { log } = await import('./logger');
      log.warn(`Setup script failed for task "${taskName}"`, result?.error);
    }
  } catch (error) {
    const { log } = await import('./logger');
    log.warn(`Setup script error for task "${taskName}"`, error as any);
  }
}

export async function createTask(params: CreateTaskParams, callbacks: CreateTaskCallbacks) {
  const {
    taskName,
    initialPrompt,
    agentRuns,
    autoApprove,
    useWorktree,
    baseRef,
    selectedSubRepos,
  } = params;
  const {
    selectedProject,
    setProjects,
    setSelectedProject,
    setActiveTask,
    setActiveTaskAgent,
    toast,
  } = callbacks;

  try {
    const preparedPrompt = initialPrompt?.trim() || undefined;
    const taskMetadata: TaskMetadata | null =
      preparedPrompt || autoApprove
        ? {
            initialPrompt: preparedPrompt ?? null,
            autoApprove: autoApprove ?? null,
          }
        : null;

    // Calculate total runs and determine if multi-agent
    const totalRuns = agentRuns.reduce((sum, ar) => sum + ar.runs, 0);
    const isMultiAgent = totalRuns > 1;
    const primaryAgent = agentRuns[0]?.agent || 'claude';

    let newTask: Task;
    if (isMultiAgent) {
      // Multi-agent task: show UI immediately with loading state, create worktrees in background
      const groupId = `ws-${taskName}-${Date.now()}`;

      // Create optimistic task with empty variants - triggers loading state in MultiAgentTask
      const optimisticMeta: TaskMetadata = {
        ...(taskMetadata || {}),
        multiAgent: {
          enabled: true,
          maxAgents: 4,
          agentRuns,
          variants: [], // Empty initially - shows loading spinner
          selectedAgent: null,
        },
      };

      newTask = {
        id: groupId,
        projectId: selectedProject.id,
        name: taskName,
        branch: selectedProject.gitInfo.branch || 'main',
        path: selectedProject.path,
        status: 'idle',
        agentId: primaryAgent,
        metadata: optimisticMeta,
        useWorktree,
      };

      // Helper to remove optimistic task on failure
      const removeOptimisticTask = () => {
        setProjects((prev) =>
          prev.map((project) =>
            project.id === selectedProject.id
              ? { ...project, tasks: project.tasks?.filter((t) => t.id !== groupId) }
              : project
          )
        );
        setSelectedProject((prev) =>
          prev ? { ...prev, tasks: prev.tasks?.filter((t) => t.id !== groupId) } : null
        );
        setActiveTask((current) => (current?.id === groupId ? null : current));
      };

      // Update UI immediately - shows MultiAgentTask with loading spinner
      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedProject.id
            ? { ...project, tasks: [newTask, ...(project.tasks || [])] }
            : project
        )
      );
      setSelectedProject((prev) =>
        prev ? { ...prev, tasks: [newTask, ...(prev.tasks || [])] } : null
      );
      setActiveTask(newTask);
      setActiveTaskAgent(null);
      saveActiveIds(newTask.projectId, newTask.id);
      saveProjectLastTaskId(newTask.projectId, newTask.id);

      // Create worktrees in background, then update task with real variants
      (async () => {
        const variants: Array<{
          id: string;
          agent: Agent;
          name: string;
          branch: string;
          path: string;
          worktreeId: string;
        }> = [];

        try {
          for (const { agent, runs } of agentRuns) {
            for (let instanceIdx = 1; instanceIdx <= runs; instanceIdx++) {
              const instanceSuffix = runs > 1 ? `-${instanceIdx}` : '';
              const variantName = `${taskName}-${agent.toLowerCase()}${instanceSuffix}`;

              let branch: string;
              let path: string;
              let worktreeId: string;

              if (useWorktree) {
                const worktreeResult = await window.electronAPI.worktreeCreate({
                  projectPath: selectedProject.path,
                  taskName: variantName,
                  projectId: selectedProject.id,
                  baseRef,
                });
                if (!worktreeResult?.success || !worktreeResult.worktree) {
                  throw new Error(
                    worktreeResult?.error ||
                      `Failed to create worktree for ${agent}${instanceSuffix}`
                  );
                }
                const worktree = worktreeResult.worktree;
                branch = worktree.branch;
                path = worktree.path;
                worktreeId = worktree.id;
              } else {
                // Direct branch mode - use current project path and branch
                branch = selectedProject.gitInfo.branch || 'main';
                path = selectedProject.path;
                worktreeId = `direct-${taskName}-${agent.toLowerCase()}${instanceSuffix}`;
              }

              variants.push({
                id: `${taskName}-${agent.toLowerCase()}${instanceSuffix}`,
                agent: agent,
                name: variantName,
                branch,
                path,
                worktreeId,
              });
            }
          }

          // Build final metadata with real variants
          const finalMeta: TaskMetadata = {
            ...(taskMetadata || {}),
            multiAgent: {
              enabled: true,
              maxAgents: 4,
              agentRuns,
              variants,
              selectedAgent: null,
            },
          };

          const finalTask: Task = {
            ...newTask,
            branch: variants[0]?.branch || selectedProject.gitInfo.branch || 'main',
            path: variants[0]?.path || selectedProject.path,
            metadata: finalMeta,
          };

          // Save to DB
          const saveResult = await window.electronAPI.saveTask({
            ...finalTask,
            agentId: primaryAgent,
            metadata: finalMeta,
            useWorktree,
          });

          if (!saveResult?.success) {
            const { log } = await import('./logger');
            log.error('Failed to save multi-agent task:', saveResult?.error);
            // Clean up worktrees that were created before the save failed
            for (const variant of variants) {
              if (variant.worktreeId && !variant.worktreeId.startsWith('direct-')) {
                window.electronAPI
                  .worktreeRemove({
                    projectPath: selectedProject.path,
                    worktreeId: variant.worktreeId,
                  })
                  .catch(() => {});
              }
            }
            toast({
              title: 'Error',
              description: 'Failed to save multi-agent task.',
              variant: 'destructive',
            });
            removeOptimisticTask();
            return;
          }

          // Update UI with final task containing real variants
          setProjects((prev) =>
            prev.map((project) =>
              project.id === selectedProject.id
                ? {
                    ...project,
                    tasks: project.tasks?.map((t) => (t.id === groupId ? finalTask : t)),
                  }
                : project
            )
          );
          setSelectedProject((prev) =>
            prev
              ? { ...prev, tasks: prev.tasks?.map((t) => (t.id === groupId ? finalTask : t)) }
              : null
          );
          setActiveTask((current) => (current?.id === groupId ? finalTask : current));

          // Run setup once per created variant worktree.
          for (const variant of variants) {
            void runSetupOnCreate(
              variant.worktreeId,
              variant.path,
              selectedProject.path,
              variant.name
            );
          }
        } catch (error) {
          const { log } = await import('./logger');
          log.error('Failed to create multi-agent worktrees:', error as Error);
          // Clean up any worktrees that were created before the failure
          for (const variant of variants) {
            if (variant.worktreeId && !variant.worktreeId.startsWith('direct-')) {
              window.electronAPI
                .worktreeRemove({
                  projectPath: selectedProject.path,
                  worktreeId: variant.worktreeId,
                })
                .catch(() => {});
            }
          }
          toast({
            title: 'Error',
            description:
              error instanceof Error ? error.message : 'Failed to create multi-agent workspaces.',
            variant: 'destructive',
          });
          removeOptimisticTask();
        }
      })();

      // Telemetry
      import('./telemetryClient').then(({ captureTelemetry }) => {
        captureTelemetry('task_created', {
          provider: 'multi',
          has_initial_prompt: !!taskMetadata?.initialPrompt,
        });
      });
    } else {
      let branch: string;
      let path: string;
      let taskId: string;
      let multiRepoMeta: TaskMetadata['multiRepo'] = undefined;

      // Check if this is a multi-repo project with selected sub-repos
      const isMultiRepoTask =
        selectedSubRepos &&
        selectedSubRepos.length > 0 &&
        selectedProject.subRepos &&
        selectedProject.subRepos.length > 0;

      if (useWorktree && isMultiRepoTask) {
        // Multi-repo: create composite worktree with sub-repo worktrees
        const multiRepoResult = await window.electronAPI.worktreeCreateMultiRepo({
          projectPath: selectedProject.path,
          projectId: selectedProject.id,
          taskName,
          subRepos: selectedProject.subRepos!,
          selectedRepos: selectedSubRepos!,
          baseRef,
        });

        if (!multiRepoResult.success || !multiRepoResult.compositeWorktreePath) {
          throw new Error(multiRepoResult.error || 'Failed to create multi-repo worktree');
        }

        path = multiRepoResult.compositeWorktreePath;
        // Use the first worktree branch as the task branch, or fallback
        const firstWorktreeMapping = multiRepoResult.repoMappings?.find(
          (m: { isWorktree: boolean }) => m.isWorktree
        );
        branch = firstWorktreeMapping?.branch || selectedProject.gitInfo.branch || 'main';
        taskId = `multi-${taskName}-${Date.now()}`;

        multiRepoMeta = {
          enabled: true,
          compositeWorktreePath: path,
          repoMappings: (multiRepoResult.repoMappings || []).map(
            (m: {
              relativePath: string;
              originalPath: string;
              targetPath: string;
              isWorktree: boolean;
              branch?: string;
            }) => ({
              relativePath: m.relativePath,
              originalPath: m.originalPath,
              targetPath: m.targetPath,
              isWorktree: m.isWorktree,
              branch: m.branch,
            })
          ),
        };
      } else if (useWorktree) {
        // Try to claim a pre-created reserve worktree (instant)
        const claimResult = await window.electronAPI.worktreeClaimReserve({
          projectId: selectedProject.id,
          projectPath: selectedProject.path,
          taskName,
          baseRef,
        });

        if (claimResult.success && claimResult.worktree) {
          const worktree = claimResult.worktree;
          branch = worktree.branch;
          path = worktree.path;
          taskId = worktree.id;

          // Warn if base ref switch failed
          if (claimResult.needsBaseRefSwitch) {
            toast({
              title: 'Warning',
              description: `Could not switch to ${baseRef}. Task created on default branch.`,
            });
          }
        } else {
          // Fallback (or forced): Create worktree
          const worktreeResult = await window.electronAPI.worktreeCreate({
            projectPath: selectedProject.path,
            taskName,
            projectId: selectedProject.id,
            baseRef,
          });

          if (!worktreeResult.success) {
            throw new Error(worktreeResult.error || 'Failed to create worktree');
          }

          const worktree = worktreeResult.worktree;
          branch = worktree.branch;
          path = worktree.path;
          taskId = worktree.id;
        }
      } else {
        // Direct branch mode - use current project path and branch
        branch = selectedProject.gitInfo.branch || 'main';
        path = selectedProject.path;
        taskId = `direct-${taskName}-${Date.now()}`;

        // For multi-repo projects in direct mode, set multiRepo metadata
        // pointing at the original sub-repo paths (no composite worktree needed)
        if (isMultiRepoTask) {
          multiRepoMeta = {
            enabled: true,
            compositeWorktreePath: selectedProject.path,
            repoMappings: selectedProject.subRepos!.map((sub) => ({
              relativePath: sub.relativePath,
              originalPath: sub.path,
              targetPath: sub.path,
              isWorktree: false,
            })),
          };
        }
      }

      // Merge multiRepo metadata into task metadata
      const finalMetadata: TaskMetadata | null = multiRepoMeta
        ? { ...(taskMetadata || {}), multiRepo: multiRepoMeta }
        : taskMetadata;

      newTask = {
        id: taskId,
        projectId: selectedProject.id,
        name: taskName,
        branch,
        path,
        status: 'idle',
        agentId: primaryAgent,
        metadata: finalMetadata,
        useWorktree,
      };

      // Optimistic UI update - show task immediately, save in background
      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedProject.id
            ? {
                ...project,
                tasks: [newTask, ...(project.tasks || [])],
              }
            : project
        )
      );

      setSelectedProject((prev) =>
        prev
          ? {
              ...prev,
              tasks: [newTask, ...(prev.tasks || [])],
            }
          : null
      );

      // Set the active task and its agent immediately
      setActiveTask(newTask);
      setActiveTaskAgent(getAgentForTask(newTask) ?? primaryAgent ?? 'codex');
      saveActiveIds(newTask.projectId, newTask.id);
      saveProjectLastTaskId(newTask.projectId, newTask.id);

      // Run setup after task creation (non-blocking).
      void runSetupOnCreate(newTask.id, newTask.path, selectedProject.path, newTask.name);

      // Background: save to database (non-blocking)
      window.electronAPI
        .saveTask({
          ...newTask,
          agentId: primaryAgent,
          metadata: finalMetadata,
          useWorktree,
        })
        .then((saveResult) => {
          if (!saveResult?.success) {
            import('./logger').then(({ log }) => {
              log.error('Failed to save task:', saveResult?.error);
            });
            // Warn user that task may not persist across restarts
            toast({
              title: 'Warning',
              description:
                'Task created but may not persist after restart. Try again if it disappears.',
              variant: 'destructive',
            });
          }
        });

      // Background: telemetry (non-blocking)
      import('./telemetryClient').then(({ captureTelemetry }) => {
        const isMultiAgentTask = (newTask.metadata as any)?.multiAgent?.enabled;
        captureTelemetry('task_created', {
          provider: isMultiAgentTask ? 'multi' : (newTask.agentId as string) || 'codex',
          has_initial_prompt: !!taskMetadata?.initialPrompt,
        });
      });

    }
  } catch (error) {
    const { log } = await import('./logger');
    log.error('Failed to create task:', error as any);
    callbacks.toast({
      title: 'Error',
      description:
        (error as Error)?.message || 'Failed to create task. Please check the console for details.',
    });
  }
}
