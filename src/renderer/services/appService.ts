// Thin service layer over app-level IPC calls.

export function getAppVersion() {
  return window.electronAPI.getAppVersion();
}

export function getPlatform() {
  return window.electronAPI.getPlatform();
}

export function updateAppState(state: {
  activeProjectId?: string | null;
  activeTaskId?: string | null;
  activeWorkspaceId?: string | null;
  prMode?: string | null;
  prDraft?: boolean;
}) {
  return window.electronAPI.updateAppState(state);
}

export function setTaskPinned(args: { taskId: string; pinned: boolean }) {
  return window.electronAPI.setTaskPinned(args);
}

export function setKanbanStatus(args: { taskId: string; status: string }) {
  return window.electronAPI.setKanbanStatus(args);
}

export function getProjectGroups() {
  return window.electronAPI.getProjectGroups();
}

export function getWorkspaces() {
  return window.electronAPI.getWorkspaces();
}

export function getTelemetryStatus() {
  return window.electronAPI.getTelemetryStatus?.();
}

export function setTelemetryEnabled(enabled: boolean) {
  return window.electronAPI.setTelemetryEnabled(enabled);
}
