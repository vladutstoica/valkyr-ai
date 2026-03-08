// Thin service layer over workspace & project-group IPC calls.

export function createProjectGroup(name: string) {
  return window.electronAPI.createProjectGroup(name);
}

export function renameProjectGroup(args: { id: string; name: string }) {
  return window.electronAPI.renameProjectGroup(args);
}

export function deleteProjectGroup(groupId: string) {
  return window.electronAPI.deleteProjectGroup(groupId);
}

export function updateProjectGroupOrder(groupIds: string[]) {
  return window.electronAPI.updateProjectGroupOrder(groupIds);
}

export function setProjectGroup(args: { projectId: string; groupId: string | null }) {
  return window.electronAPI.setProjectGroup(args);
}

export function toggleProjectGroupCollapsed(args: { id: string; isCollapsed: boolean }) {
  return window.electronAPI.toggleProjectGroupCollapsed(args);
}

export function createWorkspace(args: { name: string; color: string }) {
  return window.electronAPI.createWorkspace(args);
}

export function renameWorkspace(args: { id: string; name: string }) {
  return window.electronAPI.renameWorkspace(args);
}

export function deleteWorkspace(workspaceId: string) {
  return window.electronAPI.deleteWorkspace(workspaceId);
}

export function updateWorkspaceColor(args: { id: string; color: string }) {
  return window.electronAPI.updateWorkspaceColor(args);
}

export function updateWorkspaceEmoji(args: { id: string; emoji: string | null }) {
  return window.electronAPI.updateWorkspaceEmoji(args);
}

export function updateWorkspaceOrder(workspaceIds: string[]) {
  return window.electronAPI.updateWorkspaceOrder(workspaceIds);
}

export function setProjectWorkspace(args: { projectId: string; workspaceId: string | null }) {
  return window.electronAPI.setProjectWorkspace(args);
}
