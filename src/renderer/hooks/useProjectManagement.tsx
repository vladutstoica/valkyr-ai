import { useCallback, useEffect, useMemo, useState } from 'react';
import { pickDefaultBranch } from '../components/BranchSelect';
import { saveActiveIds } from '../constants/layout';
import {
  computeBaseRef,
  getProjectRepoKey,
  normalizePathForComparison,
  withRepoKey,
} from '../lib/projectUtils';
import type { Project, ProjectGroup, Task, Workspace } from '../types/app';

interface UseProjectManagementOptions {
  platform: string;
  isAuthenticated: boolean;
  ghInstalled: boolean;
  toast: (opts: any) => void;
  handleGithubConnect: () => void;
  setShowNewProjectModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCloneModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTaskModal: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveTask: React.Dispatch<React.SetStateAction<Task | null>>;
  saveProjectOrder: (list: Project[]) => void;
  ToastAction: React.ComponentType<any>;
  storedActiveIds: { projectId: string | null; taskId: string | null };
}

export const useProjectManagement = (options: UseProjectManagementOptions) => {
  const {
    platform,
    isAuthenticated,
    ghInstalled,
    toast,
    handleGithubConnect,
    setShowNewProjectModal,
    setShowCloneModal,
    setShowTaskModal,
    setActiveTask,
    saveProjectOrder,
    ToastAction,
    storedActiveIds,
  } = options;

  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => {
    return localStorage.getItem('valkyr:activeWorkspaceId') || null;
  });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const hasPendingRestore = storedActiveIds.projectId !== null;
  // Start with showHomeView=false if we have a pending restore to prevent flash
  const [showHomeView, setShowHomeView] = useState<boolean>(!hasPendingRestore);
  const [showSkillsView, setShowSkillsView] = useState(false);
  const [projectBranchOptions, setProjectBranchOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [projectDefaultBranch, setProjectDefaultBranch] = useState<string>('main');
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  // Persist activeWorkspaceId to localStorage + DB
  useEffect(() => {
    if (activeWorkspaceId) {
      localStorage.setItem('valkyr:activeWorkspaceId', activeWorkspaceId);
    } else {
      localStorage.removeItem('valkyr:activeWorkspaceId');
    }
    try {
      window.electronAPI?.updateAppState({ activeWorkspaceId });
    } catch {}
  }, [activeWorkspaceId]);

  // Auto-select the default workspace when workspaces load and no workspace is active
  useEffect(() => {
    if (!activeWorkspaceId && workspaces.length > 0) {
      const defaultWs = workspaces.find((ws) => ws.isDefault) ?? workspaces[0];
      if (defaultWs) {
        setActiveWorkspaceId(defaultWs.id);
      }
    }
  }, [activeWorkspaceId, workspaces]);

  // Filter projects by active workspace
  const filteredProjects = useMemo(() => {
    if (!activeWorkspaceId) return projects;
    // Find the default workspace
    const defaultWs = workspaces.find((ws) => ws.isDefault);
    const isActiveDefault = defaultWs?.id === activeWorkspaceId;

    return projects.filter((p) => {
      if (p.workspaceId === activeWorkspaceId) return true;
      // Projects with no workspace assigned go into the default workspace
      if (isActiveDefault && !p.workspaceId) return true;
      return false;
    });
  }, [projects, activeWorkspaceId, workspaces]);

  const activateProjectView = useCallback((project: Project) => {
    void (async () => {
      const { captureTelemetry } = await import('../lib/telemetryClient');
      captureTelemetry('project_view_opened');
    })();
    setSelectedProject(project);
    setShowHomeView(false);
    setShowSkillsView(false);
    setActiveTask(null);
    saveActiveIds(project.id, null);

    // Start creating a reserve worktree in the background for instant task creation
    if (project.gitInfo?.isGitRepo) {
      const baseRef = project.gitInfo?.baseRef || 'HEAD';
      window.electronAPI
        .worktreeEnsureReserve({
          projectId: project.id,
          projectPath: project.path,
          baseRef,
        })
        .catch(() => {
          // Silently ignore - reserves are optional optimization
        });
    }

    // Re-scan for nested git repos (catches added/removed repos)
    // Runs for all projects — git-root gets a "(root)" entry, non-git-root uses sub-repos as-is

    window.electronAPI
      .detectSubRepos(project.path)
      .then(async (result) => {
        if (!result.success) return;
        const isGitRoot = project.gitInfo?.isGitRepo;
        let newSubRepos: Project['subRepos'];

        if (result.subRepos.length > 0) {
          if (isGitRoot) {
            const projectName = project.path.split(/[/\\]/).filter(Boolean).pop() || project.name;
            newSubRepos = [
              {
                path: project.path,
                name: projectName + ' (root)',
                relativePath: '.',
                gitInfo: {
                  isGitRepo: true,
                  remote: project.gitInfo?.remote,
                  branch: project.gitInfo?.branch,
                  baseRef: project.gitInfo?.baseRef,
                },
              },
              ...result.subRepos,
            ];
          } else {
            newSubRepos = result.subRepos;
          }
        } else {
          newSubRepos = undefined;
        }

        // Use functional updater to avoid overwriting concurrent state changes

        setSelectedProject((prev) => {
          if (!prev || prev.id !== project.id) return prev;
          const oldPaths = (prev.subRepos || [])
            .map((r) => r.relativePath)
            .sort()
            .join(',');
          const newPaths = (newSubRepos || [])
            .map((r) => r.relativePath)
            .sort()
            .join(',');
          if (oldPaths === newPaths) return prev;
          return { ...prev, subRepos: newSubRepos };
        });
        setProjects((prev) => {
          const target = prev.find((p) => p.id === project.id);
          if (!target) return prev;
          const oldPaths = (target.subRepos || [])
            .map((r) => r.relativePath)
            .sort()
            .join(',');
          const newPaths = (newSubRepos || [])
            .map((r) => r.relativePath)
            .sort()
            .join(',');
          if (oldPaths === newPaths) return prev;
          return prev.map((p) => (p.id === project.id ? { ...p, subRepos: newSubRepos } : p));
        });
        // Persist to DB
        await window.electronAPI.saveProject({ ...project, subRepos: newSubRepos });
      })
      .catch(() => {
        // Non-fatal: proceed without nested repo detection
      });
  }, []);

  const handleGoHome = () => {
    setSelectedProject(null);
    setShowHomeView(true);
    setShowSkillsView(false);
    setActiveTask(null);
    saveActiveIds(null, null);
  };

  const handleGoToSkills = () => {
    setSelectedProject(null);
    setShowHomeView(false);
    setShowSkillsView(true);
    setActiveTask(null);
    saveActiveIds(null, null);
  };

  const handleSelectProject = (project: Project) => {
    activateProjectView(project);
  };

  const handleOpenProject = async () => {
    const { captureTelemetry } = await import('../lib/telemetryClient');
    captureTelemetry('project_add_clicked');
    try {
      const result = await window.electronAPI.openProject();
      if (result.success && result.path) {
        try {
          const gitInfo = await window.electronAPI.getGitInfo(result.path);
          const selectedPath = gitInfo.path || result.path;
          const repoCanonicalPath = gitInfo.rootPath || selectedPath;
          const repoKey = normalizePathForComparison(repoCanonicalPath, platform);
          const existingProject = projects.find(
            (project) => getProjectRepoKey(project, platform) === repoKey
          );

          if (existingProject) {
            activateProjectView(existingProject);
            toast({
              title: 'Project already open',
              description: `"${existingProject.name}" is already in the sidebar.`,
            });
            return;
          }

          if (!gitInfo.isGitRepo) {
            // Check for sub-repos (multi-repo project)
            const subReposResult = await window.electronAPI.detectSubRepos(selectedPath);
            if (subReposResult.success && subReposResult.subRepos.length > 0) {
              // This is a multi-repo project
              const projectName =
                selectedPath.split(/[/\\]/).filter(Boolean).pop() || 'Unknown Project';

              const multiRepoProject: Project = {
                id: Date.now().toString(),
                name: projectName,
                path: selectedPath,
                repoKey,
                workspaceId: activeWorkspaceId,
                subRepos: subReposResult.subRepos,
                gitInfo: {
                  isGitRepo: false, // Root folder is not a git repo
                },
                tasks: [],
              };

              const saveResult = await window.electronAPI.saveProject(multiRepoProject);
              if (saveResult.success) {
                const { captureTelemetry } = await import('../lib/telemetryClient');
                captureTelemetry('project_added_success', { source: 'multi-repo' });
                setProjects((prev) => [...prev, multiRepoProject]);
                activateProjectView(multiRepoProject);
                toast({
                  title: 'Multi-repo project added',
                  description: `Found ${subReposResult.subRepos.length} repositories: ${subReposResult.subRepos.map((r) => r.name).join(', ')}`,
                });
              } else {
                toast({
                  title: 'Failed to Add Project',
                  description: 'Could not save multi-repo project to database.',
                  variant: 'destructive',
                });
              }
              return;
            }

            // No sub-repos found - not a valid project
            toast({
              title: 'Project Opened',
              description: `This directory is not a Git repository. Path: ${result.path}`,
              variant: 'destructive',
            });
            return;
          }

          const remoteUrl = gitInfo.remote || '';
          const isGithubRemote = /github\.com[:/]/i.test(remoteUrl);
          const projectName =
            selectedPath.split(/[/\\]/).filter(Boolean).pop() || 'Unknown Project';

          const baseProject: Project = {
            id: Date.now().toString(),
            name: projectName,
            path: selectedPath,
            repoKey,
            workspaceId: activeWorkspaceId,
            gitInfo: {
              isGitRepo: true,
              remote: gitInfo.remote || undefined,
              branch: gitInfo.branch || undefined,
              baseRef: computeBaseRef(gitInfo.baseRef, gitInfo.remote, gitInfo.branch),
            },
            tasks: [],
          };

          // Check for nested git repos inside this git-root project
          try {
            const subReposResult = await window.electronAPI.detectSubRepos(selectedPath);
            if (subReposResult.success && subReposResult.subRepos.length > 0) {
              baseProject.subRepos = [
                {
                  path: selectedPath,
                  name: projectName + ' (root)',
                  relativePath: '.',
                  gitInfo: {
                    isGitRepo: true,
                    remote: gitInfo.remote || undefined,
                    branch: gitInfo.branch || undefined,
                    baseRef: computeBaseRef(gitInfo.baseRef, gitInfo.remote, gitInfo.branch),
                  },
                },
                ...subReposResult.subRepos,
              ];
            }
          } catch {
            // Non-fatal: proceed without nested repo detection
          }

          if (isAuthenticated && isGithubRemote) {
            const githubInfo = await window.electronAPI.connectToGitHub(selectedPath);
            if (githubInfo.success) {
              const projectWithGithub = withRepoKey(
                {
                  ...baseProject,
                  githubInfo: {
                    repository: githubInfo.repository || '',
                    connected: true,
                  },
                },
                platform
              );

              const saveResult = await window.electronAPI.saveProject(projectWithGithub);
              if (saveResult.success) {
                const { captureTelemetry } = await import('../lib/telemetryClient');
                captureTelemetry('project_added_success', { source: 'github' });
                setProjects((prev) => [...prev, projectWithGithub]);
                activateProjectView(projectWithGithub);
              } else {
                const { log } = await import('../lib/logger');
                log.error('Failed to save project:', saveResult.error);
                toast({
                  title: 'Failed to Add Project',
                  description:
                    'Project opened but could not be saved to database. Please check console for details.',
                  variant: 'destructive',
                });
              }
            } else {
              const updateHint =
                platform === 'darwin'
                  ? 'Tip: Update GitHub CLI with: brew upgrade gh — then restart Valkyr.'
                  : platform === 'win32'
                    ? 'Tip: Update GitHub CLI with: winget upgrade GitHub.cli — then restart Valkyr.'
                    : 'Tip: Update GitHub CLI via your package manager (e.g., apt/dnf) and restart Valkyr.';
              toast({
                title: 'GitHub Connection Failed',
                description: `Git repository detected but couldn't connect to GitHub: ${githubInfo.error}\n\n${updateHint}`,
                variant: 'destructive',
              });
            }
          } else {
            const projectWithoutGithub = withRepoKey(
              {
                ...baseProject,
                githubInfo: {
                  repository: isGithubRemote ? '' : '',
                  connected: false,
                },
              },
              platform
            );

            const saveResult = await window.electronAPI.saveProject(projectWithoutGithub);
            if (saveResult.success) {
              const { captureTelemetry } = await import('../lib/telemetryClient');
              captureTelemetry('project_added_success', { source: 'local' });
              setProjects((prev) => [...prev, projectWithoutGithub]);
              activateProjectView(projectWithoutGithub);
            } else {
              const { log } = await import('../lib/logger');
              log.error('Failed to save project:', saveResult.error);
              toast({
                title: 'Failed to Add Project',
                description:
                  'Project opened but could not be saved to database. Please check console for details.',
                variant: 'destructive',
              });
            }
          }
        } catch (error) {
          const { log } = await import('../lib/logger');
          log.error('Git detection error:', error as any);
          toast({
            title: 'Project Opened',
            description: `Could not detect Git information. Path: ${result.path}`,
            variant: 'destructive',
          });
        }
      } else if (result.error) {
        if (result.error === 'No directory selected') return;
        toast({
          title: 'Failed to Open Project',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      const { log } = await import('../lib/logger');
      log.error('Open project error:', error as any);
      toast({
        title: 'Failed to Open Project',
        description: 'Please check the console for details.',
        variant: 'destructive',
      });
    }
  };

  const handleNewProjectClick = async () => {
    const { captureTelemetry } = await import('../lib/telemetryClient');
    captureTelemetry('project_create_clicked');

    if (!isAuthenticated || !ghInstalled) {
      toast({
        title: 'GitHub authentication required',
        variant: 'destructive',
        action: (
          <ToastAction altText="Connect GitHub" onClick={handleGithubConnect}>
            Connect GitHub
          </ToastAction>
        ),
      });
      return;
    }

    setShowNewProjectModal(true);
  };

  const handleCloneProjectClick = async () => {
    const { captureTelemetry } = await import('../lib/telemetryClient');
    captureTelemetry('project_clone_clicked');

    if (!isAuthenticated || !ghInstalled) {
      toast({
        title: 'GitHub authentication required',
        variant: 'destructive',
        action: (
          <ToastAction altText="Connect GitHub" onClick={handleGithubConnect}>
            Connect GitHub
          </ToastAction>
        ),
      });
      return;
    }

    setShowCloneModal(true);
  };

  const handleCloneSuccess = useCallback(
    async (projectPath: string) => {
      const { captureTelemetry } = await import('../lib/telemetryClient');
      captureTelemetry('project_cloned');
      try {
        const gitInfo = await window.electronAPI.getGitInfo(projectPath);
        const selectedPath = gitInfo.path || projectPath;
        const repoCanonicalPath = gitInfo.rootPath || selectedPath;
        const repoKey = normalizePathForComparison(repoCanonicalPath, platform);
        const existingProject = projects.find(
          (project) => getProjectRepoKey(project, platform) === repoKey
        );

        if (existingProject) {
          activateProjectView(existingProject);
          return;
        }

        const remoteUrl = gitInfo.remote || '';
        const isGithubRemote = /github\.com[:/]/i.test(remoteUrl);
        const projectName = selectedPath.split(/[/\\]/).filter(Boolean).pop() || 'Unknown Project';

        const baseProject: Project = {
          id: Date.now().toString(),
          name: projectName,
          path: selectedPath,
          repoKey,
          workspaceId: activeWorkspaceId,
          gitInfo: {
            isGitRepo: true,
            remote: gitInfo.remote || undefined,
            branch: gitInfo.branch || undefined,
            baseRef: computeBaseRef(gitInfo.baseRef, gitInfo.remote, gitInfo.branch),
          },
          tasks: [],
        };

        if (isAuthenticated && isGithubRemote) {
          const githubInfo = await window.electronAPI.connectToGitHub(selectedPath);
          if (githubInfo.success) {
            const projectWithGithub = withRepoKey(
              {
                ...baseProject,
                githubInfo: {
                  repository: githubInfo.repository || '',
                  connected: true,
                },
              },
              platform
            );

            const saveResult = await window.electronAPI.saveProject(projectWithGithub);
            if (saveResult.success) {
              captureTelemetry('project_clone_success');
              captureTelemetry('project_added_success', { source: 'clone' });
              setProjects((prev) => [...prev, projectWithGithub]);
              activateProjectView(projectWithGithub);
            } else {
              const { log } = await import('../lib/logger');
              log.error('Failed to save project:', saveResult.error);
              toast({
                title: 'Project Cloned',
                description: 'Repository cloned but failed to save to database.',
                variant: 'destructive',
              });
            }
          } else {
            const projectWithoutGithub = withRepoKey(
              {
                ...baseProject,
                githubInfo: {
                  repository: '',
                  connected: false,
                },
              },
              platform
            );

            const saveResult = await window.electronAPI.saveProject(projectWithoutGithub);
            if (saveResult.success) {
              captureTelemetry('project_clone_success');
              captureTelemetry('project_added_success', { source: 'clone' });
              setProjects((prev) => [...prev, projectWithoutGithub]);
              activateProjectView(projectWithoutGithub);
            }
          }
        } else {
          const projectWithoutGithub = withRepoKey(
            {
              ...baseProject,
              githubInfo: {
                repository: '',
                connected: false,
              },
            },
            platform
          );

          const saveResult = await window.electronAPI.saveProject(projectWithoutGithub);
          if (saveResult.success) {
            captureTelemetry('project_clone_success');
            captureTelemetry('project_added_success', { source: 'clone' });
            setProjects((prev) => [...prev, projectWithoutGithub]);
            activateProjectView(projectWithoutGithub);
          }
        }
      } catch (error) {
        const { log } = await import('../lib/logger');
        log.error('Failed to load cloned project:', error);
        toast({
          title: 'Project Cloned',
          description: 'Repository cloned but failed to load. Please try opening it manually.',
          variant: 'destructive',
        });
      }
    },
    [projects, isAuthenticated, activateProjectView, platform, toast, activeWorkspaceId]
  );

  const handleNewProjectSuccess = useCallback(
    async (projectPath: string) => {
      const { captureTelemetry } = await import('../lib/telemetryClient');
      captureTelemetry('new_project_created');
      try {
        const gitInfo = await window.electronAPI.getGitInfo(projectPath);
        const selectedPath = gitInfo.path || projectPath;
        const repoCanonicalPath = gitInfo.rootPath || selectedPath;
        const repoKey = normalizePathForComparison(repoCanonicalPath, platform);
        const existingProject = projects.find(
          (project) => getProjectRepoKey(project, platform) === repoKey
        );

        if (existingProject) {
          activateProjectView(existingProject);
          return;
        }

        const remoteUrl = gitInfo.remote || '';
        const isGithubRemote = /github\.com[:/]/i.test(remoteUrl);
        const projectName = selectedPath.split(/[/\\]/).filter(Boolean).pop() || 'Unknown Project';

        const baseProject: Project = {
          id: Date.now().toString(),
          name: projectName,
          path: selectedPath,
          repoKey,
          workspaceId: activeWorkspaceId,
          gitInfo: {
            isGitRepo: true,
            remote: gitInfo.remote || undefined,
            branch: gitInfo.branch || undefined,
            baseRef: computeBaseRef(gitInfo.baseRef, gitInfo.remote, gitInfo.branch),
          },
          tasks: [],
        };

        if (isAuthenticated && isGithubRemote) {
          const githubInfo = await window.electronAPI.connectToGitHub(selectedPath);
          if (githubInfo.success) {
            const projectWithGithub = withRepoKey(
              {
                ...baseProject,
                githubInfo: {
                  repository: githubInfo.repository || '',
                  connected: true,
                },
              },
              platform
            );

            const saveResult = await window.electronAPI.saveProject(projectWithGithub);
            if (saveResult.success) {
              captureTelemetry('project_create_success');
              captureTelemetry('project_added_success', { source: 'new_project' });
              toast({
                title: 'Project created successfully!',
                description: `${projectWithGithub.name} has been added to your projects.`,
              });
              // Add to beginning of list
              setProjects((prev) => {
                const updated = [projectWithGithub, ...prev];
                saveProjectOrder(updated);
                return updated;
              });
              activateProjectView(projectWithGithub);
            } else {
              const { log } = await import('../lib/logger');
              log.error('Failed to save project:', saveResult.error);
              toast({
                title: 'Project Created',
                description: 'Repository created but failed to save to database.',
                variant: 'destructive',
              });
            }
          } else {
            const projectWithoutGithub = withRepoKey(
              {
                ...baseProject,
                githubInfo: {
                  repository: '',
                  connected: false,
                },
              },
              platform
            );

            const saveResult = await window.electronAPI.saveProject(projectWithoutGithub);
            if (saveResult.success) {
              captureTelemetry('project_create_success');
              captureTelemetry('project_added_success', { source: 'new_project' });
              toast({
                title: 'Project created successfully!',
                description: `${projectWithoutGithub.name} has been added to your projects.`,
              });
              // Add to beginning of list
              setProjects((prev) => {
                const updated = [projectWithoutGithub, ...prev];
                saveProjectOrder(updated);
                return updated;
              });
              activateProjectView(projectWithoutGithub);
            }
          }
        } else {
          const projectWithoutGithub = withRepoKey(
            {
              ...baseProject,
              githubInfo: {
                repository: '',
                connected: false,
              },
            },
            platform
          );

          const saveResult = await window.electronAPI.saveProject(projectWithoutGithub);
          if (saveResult.success) {
            captureTelemetry('project_create_success');
            captureTelemetry('project_added_success', { source: 'new_project' });
            toast({
              title: 'Project created successfully!',
              description: `${projectWithoutGithub.name} has been added to your projects.`,
            });
            // Add to beginning of list
            setProjects((prev) => {
              const updated = [projectWithoutGithub, ...prev];
              saveProjectOrder(updated);
              return updated;
            });
            activateProjectView(projectWithoutGithub);
            setShowTaskModal(true);
          }
        }
      } catch (error) {
        const { log } = await import('../lib/logger');
        log.error('Failed to load new project:', error);
        toast({
          title: 'Project Created',
          description: 'Repository created but failed to load. Please try opening it manually.',
          variant: 'destructive',
        });
      }
    },
    [
      projects,
      isAuthenticated,
      activateProjectView,
      platform,
      toast,
      saveProjectOrder,
      setShowTaskModal,
      activeWorkspaceId,
    ]
  );

  const handleReorderProjects = (sourceId: string, targetId: string) => {
    setProjects((prev) => {
      const list = [...prev];
      const fromIdx = list.findIndex((p) => p.id === sourceId);
      const toIdx = list.findIndex((p) => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      saveProjectOrder(list);
      return list;
    });
  };

  const handleReorderProjectsFull = (newOrder: Project[]) => {
    setProjects((prev) => {
      // Replace only the reordered projects, keep projects from other workspaces intact
      const reorderedIds = new Set(newOrder.map((p) => p.id));
      const untouched = prev.filter((p) => !reorderedIds.has(p.id));
      const list = [...newOrder, ...untouched];
      saveProjectOrder(list);
      return list;
    });
  };

  const handleRenameProject = async (project: Project, newName: string) => {
    try {
      const trimmed = newName.trim();
      if (!trimmed) {
        toast({
          title: 'Invalid name',
          description: 'Project name cannot be empty.',
          variant: 'destructive',
        });
        return;
      }

      const res = await window.electronAPI.renameProject({
        projectId: project.id,
        newName: trimmed,
      });

      if (!res?.success) throw new Error(res?.error || 'Failed to rename project');

      // Update local state
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, name: trimmed } : p)));

      // Update selectedProject if it's the one being renamed
      if (selectedProject?.id === project.id) {
        setSelectedProject((prev) => (prev ? { ...prev, name: trimmed } : prev));
      }

      toast({ title: 'Project renamed', description: `Renamed to "${trimmed}".` });
    } catch (err) {
      const { log } = await import('../lib/logger');
      log.error('Rename project failed:', err as any);
      toast({
        title: 'Error',
        description:
          err instanceof Error ? err.message : 'Could not rename project. See console for details.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteProject = async (project: Project) => {
    try {
      // Clean up reserve worktree before deleting project
      await window.electronAPI.worktreeRemoveReserve({ projectId: project.id }).catch(() => {});

      // Kill all ACP sessions for this project's tasks before deleting
      try {
        const tasks = await window.electronAPI.getTasks(project.id);
        for (const task of tasks || []) {
          const convResult = await window.electronAPI.getConversations(task.id);
          if (convResult.success && convResult.conversations) {
            for (const conv of convResult.conversations) {
              const provider = conv.provider || 'claude-code';
              const acpKey = `${provider}-acp-${conv.id}`;
              window.electronAPI.acpKill({ sessionKey: acpKey }).catch(() => {});
            }
          }
        }
      } catch {}

      const res = await window.electronAPI.deleteProject(project.id);
      if (!res?.success) throw new Error(res?.error || 'Failed to delete project');

      const { captureTelemetry } = await import('../lib/telemetryClient');
      captureTelemetry('project_deleted');
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      if (selectedProject?.id === project.id) {
        setSelectedProject(null);
        setActiveTask(null);
        setShowHomeView(true);
        saveActiveIds(null, null);
      }
      toast({ title: 'Project deleted', description: `"${project.name}" was removed.` });
    } catch (err) {
      const { log } = await import('../lib/logger');
      log.error('Delete project failed:', err as any);
      toast({
        title: 'Error',
        description:
          err instanceof Error ? err.message : 'Could not delete project. See console for details.',
        variant: 'destructive',
      });
    }
  };

  // --- Project Group Handlers ---

  const handleCreateGroup = async (name: string) => {
    try {
      const res = await window.electronAPI.createProjectGroup(name);
      if (res.success && res.group) {
        setGroups((prev) => [...prev, res.group!]);
      }
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  };

  const handleRenameGroup = async (groupId: string, name: string) => {
    try {
      const res = await window.electronAPI.renameProjectGroup({ id: groupId, name });
      if (res.success) {
        setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
      }
    } catch (err) {
      console.error('Failed to rename group:', err);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const res = await window.electronAPI.deleteProjectGroup(groupId);
      if (res.success) {
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
        // Unset groupId on projects that were in this group
        setProjects((prev) =>
          prev.map((p) => (p.groupId === groupId ? { ...p, groupId: null } : p))
        );
      }
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const handleReorderGroups = async (groupIds: string[]) => {
    try {
      // Optimistic update
      setGroups((prev) => {
        const byId = new Map(prev.map((g) => [g.id, g]));
        return groupIds.map((id, i) => ({ ...byId.get(id)!, displayOrder: i }));
      });
      await window.electronAPI.updateProjectGroupOrder(groupIds);
    } catch (err) {
      console.error('Failed to reorder groups:', err);
    }
  };

  const handleMoveProjectToGroup = async (projectId: string, groupId: string | null) => {
    try {
      const res = await window.electronAPI.setProjectGroup({ projectId, groupId });
      if (res.success) {
        setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, groupId } : p)));
      }
    } catch (err) {
      console.error('Failed to move project to group:', err);
    }
  };

  const handleToggleGroupCollapsed = async (groupId: string, isCollapsed: boolean) => {
    try {
      // Optimistic update
      setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, isCollapsed } : g)));
      await window.electronAPI.toggleProjectGroupCollapsed({ id: groupId, isCollapsed });
    } catch (err) {
      console.error('Failed to toggle group collapsed:', err);
    }
  };

  // --- Workspace Handlers ---

  const handleCreateWorkspace = async (name: string, color: string = 'blue') => {
    try {
      const res = await window.electronAPI.createWorkspace({ name, color });
      if (res.success && res.workspace) {
        setWorkspaces((prev) => [...prev, res.workspace!]);
      }
    } catch (err) {
      console.error('Failed to create workspace:', err);
    }
  };

  const handleRenameWorkspace = async (workspaceId: string, name: string) => {
    try {
      const res = await window.electronAPI.renameWorkspace({ id: workspaceId, name });
      if (res.success) {
        setWorkspaces((prev) => prev.map((ws) => (ws.id === workspaceId ? { ...ws, name } : ws)));
      }
    } catch (err) {
      console.error('Failed to rename workspace:', err);
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    try {
      const res = await window.electronAPI.deleteWorkspace(workspaceId);
      if (res.success) {
        setWorkspaces((prev) => prev.filter((ws) => ws.id !== workspaceId));
        // Move orphaned projects to default workspace in local state
        const defaultWs = workspaces.find((ws) => ws.isDefault);
        if (defaultWs) {
          setProjects((prev) =>
            prev.map((p) =>
              p.workspaceId === workspaceId ? { ...p, workspaceId: defaultWs.id } : p
            )
          );
          // Switch to default if we're deleting the active workspace
          if (activeWorkspaceId === workspaceId) {
            setActiveWorkspaceId(defaultWs.id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  };

  const handleUpdateWorkspaceColor = async (workspaceId: string, color: string) => {
    try {
      const res = await window.electronAPI.updateWorkspaceColor({ id: workspaceId, color });
      if (res.success) {
        setWorkspaces((prev) => prev.map((ws) => (ws.id === workspaceId ? { ...ws, color } : ws)));
      }
    } catch (err) {
      console.error('Failed to update workspace color:', err);
    }
  };

  const handleUpdateWorkspaceEmoji = async (workspaceId: string, emoji: string | null) => {
    try {
      const res = await window.electronAPI.updateWorkspaceEmoji({ id: workspaceId, emoji });
      if (res.success) {
        setWorkspaces((prev) => prev.map((ws) => (ws.id === workspaceId ? { ...ws, emoji } : ws)));
      }
    } catch (err) {
      console.error('Failed to update workspace emoji:', err);
    }
  };

  const handleReorderWorkspaces = async (workspaceIds: string[]) => {
    try {
      setWorkspaces((prev) => {
        const byId = new Map(prev.map((ws) => [ws.id, ws]));
        return workspaceIds.map((id, i) => ({ ...byId.get(id)!, displayOrder: i }));
      });
      await window.electronAPI.updateWorkspaceOrder(workspaceIds);
    } catch (err) {
      console.error('Failed to reorder workspaces:', err);
    }
  };

  const handleMoveProjectToWorkspace = async (projectId: string, workspaceId: string | null) => {
    try {
      const res = await window.electronAPI.setProjectWorkspace({ projectId, workspaceId });
      if (res.success) {
        setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, workspaceId } : p)));
      }
    } catch (err) {
      console.error('Failed to move project to workspace:', err);
    }
  };

  const handleSwitchWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);

    // If the currently selected project doesn't belong to the new workspace,
    // auto-select the first project from the new workspace and restore its last task
    if (selectedProject) {
      const defaultWs = workspaces.find((ws) => ws.isDefault);
      const isNewDefault = defaultWs?.id === workspaceId;
      const projectBelongs =
        selectedProject.workspaceId === workspaceId ||
        (isNewDefault && !selectedProject.workspaceId);
      if (!projectBelongs) {
        const wsProjects = projects.filter(
          (p) => p.workspaceId === workspaceId || (isNewDefault && !p.workspaceId)
        );
        const firstProject = wsProjects[0];
        if (firstProject) {
          // Pick the most recent task instead of showing the project view
          const lastTask =
            firstProject.tasks
              ?.slice()
              .sort((a, b) =>
                (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? '')
              )[0] ?? null;
          setSelectedProject(firstProject);
          setShowHomeView(false);
          setShowSkillsView(false);
          setActiveTask(lastTask);
          saveActiveIds(firstProject.id, lastTask?.id ?? null);
        } else {
          setSelectedProject(null);
          setShowHomeView(true);
          setShowSkillsView(false);
          setActiveTask(null);
          saveActiveIds(null, null);
        }
      }
    }
  };

  // Load branch options when project is selected
  useEffect(() => {
    if (!selectedProject) {
      setProjectBranchOptions([]);
      setProjectDefaultBranch('main');
      return;
    }

    // Show current baseRef immediately while loading full list, or reset to defaults
    const currentRef = selectedProject.gitInfo?.baseRef;
    const initialBranch = currentRef || 'main';
    setProjectBranchOptions([{ value: initialBranch, label: initialBranch }]);
    setProjectDefaultBranch(initialBranch);

    let cancelled = false;
    const loadBranches = async () => {
      setIsLoadingBranches(true);
      try {
        const res = await window.electronAPI.listRemoteBranches({
          projectPath: selectedProject.path,
        });
        if (cancelled) return;
        if (res.success && res.branches) {
          const options = res.branches.map((b) => ({
            value: b.ref,
            label: b.remote ? b.label : `${b.branch} (local)`,
          }));
          setProjectBranchOptions(options);
          const defaultBranch = pickDefaultBranch(options, currentRef);
          setProjectDefaultBranch(defaultBranch ?? currentRef ?? 'main');
        }
      } catch (error) {
        console.error('Failed to load branches:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingBranches(false);
        }
      }
    };

    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [selectedProject]);

  return {
    projects,
    setProjects,
    groups,
    setGroups,
    selectedProject,
    setSelectedProject,
    showHomeView,
    setShowHomeView,
    showSkillsView,
    setShowSkillsView,
    handleGoToSkills,
    projectBranchOptions,
    projectDefaultBranch,
    setProjectDefaultBranch,
    isLoadingBranches,
    activateProjectView,
    handleGoHome,
    handleSelectProject,
    handleOpenProject,
    handleNewProjectClick,
    handleCloneProjectClick,
    handleCloneSuccess,
    handleNewProjectSuccess,
    handleReorderProjects,
    handleReorderProjectsFull,
    handleDeleteProject,
    handleRenameProject,
    handleCreateGroup,
    handleRenameGroup,
    handleDeleteGroup,
    handleReorderGroups,
    handleMoveProjectToGroup,
    handleToggleGroupCollapsed,
    // Workspace management
    workspaces,
    setWorkspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    filteredProjects,
    handleCreateWorkspace,
    handleRenameWorkspace,
    handleDeleteWorkspace,
    handleUpdateWorkspaceColor,
    handleUpdateWorkspaceEmoji,
    handleReorderWorkspaces,
    handleMoveProjectToWorkspace,
    handleSwitchWorkspace,
  };
};
