/**
 * Service abstraction for project/task CRUD IPC calls.
 */

import type { Project, Task } from '../types/app';

export function getProjects(): Promise<Project[]> {
  return window.electronAPI.getProjects();
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

export function getTasks(projectId?: string): Promise<Task[]> {
  return window.electronAPI.getTasks(projectId);
}

export function saveTask(task: Task) {
  return window.electronAPI.saveTask(task);
}
