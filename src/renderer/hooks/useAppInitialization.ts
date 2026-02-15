import { useEffect, useMemo, useState } from 'react';
import type { Agent } from '../types';
import type { Project, ProjectGroup, Task } from '../types/app';
import { getStoredActiveIds, saveActiveIds } from '../constants/layout';
import { getAgentForTask } from '../lib/getAgentForTask';
import { withRepoKey } from '../lib/projectUtils';

interface UseAppInitializationOptions {
  checkGithubStatus: () => void;
  onProjectsLoaded: (projects: Project[]) => void;
  onGroupsLoaded: (groups: ProjectGroup[]) => void;
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
        const [_appVersion, appPlatform, projects, groupsResult] = await Promise.all([
          window.electronAPI.getAppVersion(),
          window.electronAPI.getPlatform(),
          window.electronAPI.getProjects(),
          window.electronAPI.getProjectGroups(),
        ]);

        setPlatform(appPlatform);

        // Load groups
        if (groupsResult?.success && groupsResult.groups) {
          onGroupsLoaded(groupsResult.groups);
        }

        // Projects come pre-sorted by displayOrder from the database
        // Migrate legacy localStorage order if present (one-time)
        const migratedProjects = await migrateLegacyOrder(projects);
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
