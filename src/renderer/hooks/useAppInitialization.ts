import { useEffect, useMemo, useState } from 'react';
import type { Agent } from '../types';
import type { Project, ProjectGroup, Task, Workspace } from '../types/app';
import { getStoredActiveIds, saveActiveIds } from '../constants/layout';
import { getAgentForTask } from '../lib/getAgentForTask';
import { withRepoKey } from '../lib/projectUtils';

interface UseAppInitializationOptions {
  checkGithubStatus: () => void;
  onProjectsLoaded: (projects: Project[]) => void;
  onGroupsLoaded: (groups: ProjectGroup[]) => void;
  onWorkspacesLoaded: (workspaces: Workspace[]) => void;
  onProjectSelected: (project: Project) => void;
  onShowHomeView: (show: boolean) => void;
  onTaskSelected: (task: Task) => void;
  onTaskAgentSelected: (agent: Agent | null) => void;
  onInitialLoadComplete: () => void;
}

interface UseAppInitializationReturn {
  platform: string;
  isInitialLoadComplete: boolean;
  storedActiveIds: { projectId: string | null; taskId: string | null };
  saveProjectOrder: (list: Project[]) => void;
}

const LEGACY_ORDER_KEY = 'sidebarProjectOrder';
const LS_TO_DB_MIGRATED_KEY = 'valkyr:ls-to-db-migrated:v1';

/** One-time migration: copy localStorage state → SQLite DB. */
const migrateLocalStorageToDB = async (): Promise<void> => {
  try {
    if (localStorage.getItem(LS_TO_DB_MIGRATED_KEY) === '1') return;

    // App-level state
    const activeProjectId = localStorage.getItem('valkyr:activeProjectId');
    const activeTaskId = localStorage.getItem('valkyr:activeTaskId');
    const activeWorkspaceId = localStorage.getItem('valkyr:activeWorkspaceId');
    const prMode = localStorage.getItem('valkyr:prMode');
    const prDraftRaw = localStorage.getItem('valkyr:createPrAsDraft');
    const prDraft = prDraftRaw === 'true' ? true : undefined;

    await window.electronAPI.updateAppState({
      ...(activeProjectId != null && { activeProjectId }),
      ...(activeTaskId != null && { activeTaskId }),
      ...(activeWorkspaceId != null && { activeWorkspaceId }),
      ...(prMode != null && { prMode }),
      ...(prDraft != null && { prDraft }),
    });

    // Pinned tasks
    try {
      const pinnedRaw = localStorage.getItem('valkyr-pinned-tasks');
      if (pinnedRaw) {
        const ids: string[] = JSON.parse(pinnedRaw);
        await Promise.all(
          ids.map((id) => window.electronAPI.setTaskPinned({ taskId: id, pinned: true }))
        );
      }
    } catch {}

    // Kanban statuses
    try {
      const kanbanRaw = localStorage.getItem('valkyr:kanban:statusByTask');
      if (kanbanRaw) {
        const map: Record<string, string> = JSON.parse(kanbanRaw);
        await Promise.all(
          Object.entries(map).map(([taskId, status]) =>
            window.electronAPI.setKanbanStatus({ taskId, status })
          )
        );
      }
    } catch {}

    localStorage.setItem(LS_TO_DB_MIGRATED_KEY, '1');
  } catch {
    // Non-critical — localStorage stays as fallback
  }
};

// Save project order to database
const saveProjectOrder = (list: Project[]) => {
  const ids = list.map((p) => p.id);
  window.electronAPI.updateProjectOrder(ids).catch((error) => {
    console.error('Failed to save project order:', error);
  });
};

// Migrate legacy localStorage order to database (one-time)
const migrateLegacyOrder = async (projects: Project[]): Promise<Project[]> => {
  try {
    const raw = localStorage.getItem(LEGACY_ORDER_KEY);
    if (!raw) return projects;

    const order: string[] = JSON.parse(raw);
    const indexOf = (id: string) => {
      const idx = order.indexOf(id);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    const sorted = [...projects].sort((a, b) => indexOf(a.id) - indexOf(b.id));

    // Save the migrated order to database
    await window.electronAPI.updateProjectOrder(sorted.map((p) => p.id));

    // Remove the legacy localStorage key
    localStorage.removeItem(LEGACY_ORDER_KEY);

    return sorted;
  } catch {
    return projects;
  }
};

export function useAppInitialization(
  options: UseAppInitializationOptions
): UseAppInitializationReturn {
  const {
    checkGithubStatus,
    onProjectsLoaded,
    onGroupsLoaded,
    onWorkspacesLoaded,
    onProjectSelected,
    onShowHomeView,
    onTaskSelected,
    onTaskAgentSelected,
    onInitialLoadComplete,
  } = options;

  const [platform, setPlatform] = useState<string>('');
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  const storedActiveIds = useMemo(() => getStoredActiveIds(), []);

  useEffect(() => {
    const loadAppData = async () => {
      try {
        const [_appVersion, appPlatform, projects, groupsResult, workspacesResult] =
          await Promise.all([
            window.electronAPI.getAppVersion(),
            window.electronAPI.getPlatform(),
            window.electronAPI.getProjects(),
            window.electronAPI.getProjectGroups(),
            window.electronAPI.getWorkspaces(),
          ]);

        setPlatform(appPlatform);

        // Load groups
        if (groupsResult?.success && groupsResult.groups) {
          onGroupsLoaded(groupsResult.groups);
        }

        // Load workspaces
        if (workspacesResult?.success && workspacesResult.workspaces) {
          onWorkspacesLoaded(workspacesResult.workspaces);
        }

        // Projects come pre-sorted by displayOrder from the database
        // Migrate legacy localStorage order if present (one-time)
        const migratedProjects = await migrateLegacyOrder(projects);

        // Migrate localStorage state to DB (one-time)
        await migrateLocalStorageToDB();
        const initialProjects = migratedProjects.map((p) => withRepoKey(p, appPlatform));
        onProjectsLoaded(initialProjects);

        checkGithubStatus();

        const projectsWithTasks = await Promise.all(
          initialProjects.map(async (project) => {
            const tasks = await window.electronAPI.getTasks(project.id);
            return withRepoKey({ ...project, tasks }, appPlatform);
          })
        );
        onProjectsLoaded(projectsWithTasks);

        const { projectId: storedProjectId, taskId: storedTaskId } = storedActiveIds;
        if (storedProjectId) {
          const project = projectsWithTasks.find((p) => p.id === storedProjectId);
          if (project) {
            onProjectSelected(project);
            onShowHomeView(false);
            if (storedTaskId) {
              const task = project.tasks?.find((t) => t.id === storedTaskId);
              if (task) {
                onTaskSelected(task);
                onTaskAgentSelected(getAgentForTask(task));
              } else {
                saveActiveIds(storedProjectId, null);
              }
            }
          } else {
            onShowHomeView(true);
            saveActiveIds(null, null);
          }
        }
        setIsInitialLoadComplete(true);
        onInitialLoadComplete();
      } catch (error) {
        const { log } = await import('../lib/logger');
        log.error('Failed to load app data:', error as any);
        onShowHomeView(true);
        setIsInitialLoadComplete(true);
        onInitialLoadComplete();
      }
    };

    loadAppData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    platform,
    isInitialLoadComplete,
    storedActiveIds,
    saveProjectOrder,
  };
}
