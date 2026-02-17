import type { Task as ChatTask } from './chat';
export type Task = ChatTask & { agentId?: string };

/** Git information for a sub-repository in a multi-repo project */
export interface SubRepoGitInfo {
  isGitRepo: boolean;
  remote?: string;
  branch?: string;
  baseRef?: string;
}

/** A sub-repository within a multi-repo project */
export interface SubRepo {
  path: string; // Absolute path to the sub-repo
  name: string; // Folder name (e.g., "frontend")
  relativePath: string; // Relative from project root (e.g., "frontend")
  gitInfo: SubRepoGitInfo;
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  emoji: string | null;
  displayOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectGroup {
  id: string;
  name: string;
  displayOrder: number;
  isCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  isRemote?: boolean;
  sshConnectionId?: string | null;
  remotePath?: string | null;
  repoKey?: string;
  subRepos?: SubRepo[] | null;
  groupId?: string | null;
  workspaceId?: string | null;
  gitInfo: {
    isGitRepo: boolean;
    remote?: string;
    branch?: string;
    baseRef?: string;
  };
  githubInfo?: {
    repository: string;
    connected: boolean;
  };
  tasks?: Task[];
}

// Lightweight shapes for palette/list UIs, if needed later
export type ProjectSummary = Pick<Project, 'id' | 'name'> & {
  tasks?: Pick<Task, 'id' | 'name'>[];
};
export type TaskSummary = Pick<Task, 'id' | 'name'>;
