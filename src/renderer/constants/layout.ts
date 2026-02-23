export const TITLEBAR_HEIGHT = '36px';
export const PANEL_LAYOUT_STORAGE_KEY = 'valkyr.layout.left-main-right.v2';
export const DEFAULT_PANEL_LAYOUT: [number, number, number] = [0, 80, 20];
export const FIRST_LAUNCH_KEY = 'valkyr:first-launch:v1';
export const RIGHT_SIDEBAR_MIN_SIZE = 16;
export const RIGHT_SIDEBAR_MAX_SIZE = 50;
export const ACTIVE_PROJECT_KEY = 'valkyr:activeProjectId';
export const ACTIVE_TASK_KEY = 'valkyr:activeTaskId';
export const MAIN_PANEL_MIN_SIZE = 30;

export const getStoredActiveIds = (): { projectId: string | null; taskId: string | null } => {
  try {
    return {
      projectId: localStorage.getItem(ACTIVE_PROJECT_KEY),
      taskId: localStorage.getItem(ACTIVE_TASK_KEY),
    };
  } catch {
    return { projectId: null, taskId: null };
  }
};

export const saveActiveIds = (projectId: string | null, taskId: string | null): void => {
  try {
    if (projectId) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
    if (taskId) {
      localStorage.setItem(ACTIVE_TASK_KEY, taskId);
    } else {
      localStorage.removeItem(ACTIVE_TASK_KEY);
    }
  } catch {}
  // Persist to DB (fire-and-forget)
  try {
    window.electronAPI?.updateAppState({ activeProjectId: projectId, activeTaskId: taskId });
  } catch {}
};

const PROJECT_LAST_TASK_KEY = 'valkyr:projectLastTaskId';

/** Get the map of projectId -> last active taskId from localStorage */
const getLastTaskMap = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(PROJECT_LAST_TASK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/** Save the last active taskId for a specific project */
export const saveProjectLastTaskId = (projectId: string, taskId: string | null): void => {
  try {
    const map = getLastTaskMap();
    if (taskId) {
      map[projectId] = taskId;
    } else {
      delete map[projectId];
    }
    localStorage.setItem(PROJECT_LAST_TASK_KEY, JSON.stringify(map));
  } catch {}
};

/** Get the last active taskId for a specific project */
export const getProjectLastTaskId = (projectId: string): string | null => {
  try {
    return getLastTaskMap()[projectId] ?? null;
  } catch {
    return null;
  }
};

export const clampRightSidebarSize = (value: number) =>
  Math.min(
    Math.max(Number.isFinite(value) ? value : DEFAULT_PANEL_LAYOUT[2], RIGHT_SIDEBAR_MIN_SIZE),
    RIGHT_SIDEBAR_MAX_SIZE
  );
