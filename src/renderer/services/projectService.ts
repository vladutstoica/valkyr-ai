/**
 * Service abstraction for project/task CRUD IPC calls.
 */

import type { Project, Task } from '../types/app';

export async function getProjects(): Promise<Project[]> {
  const result = await window.electronAPI.getProjects();
  if (result?.success) return (result.data as Project[]) ?? [];
  return [];
}

export function saveProject(project: Project) {
  return window.electronAPI.saveProject(project);
}

export function deleteProject(projectId: string) {
  return window.electronAPI.deleteProject(projectId);
}

export function updateProjectOrder(projectIds: string[]) {
  return window.electronAPI.updateProjectOrder(projectIds);
}

export function updateProjectRepos(args: {
  projectId: string;
  subRepos: { relativePath: string; name: string }[];
}) {
  return window.electronAPI.updateProjectRepos(args);
}

export function openProject() {
  return window.electronAPI.openProject();
}

export async function getTasks(projectId?: string): Promise<Task[]> {
  const result = await window.electronAPI.getTasks(projectId);
  if (result?.success) return (result.data as Task[]) ?? [];
  return [];
}

export function saveTask(task: Task) {
  return window.electronAPI.saveTask(task);
}
