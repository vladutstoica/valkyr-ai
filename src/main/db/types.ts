/**
 * Domain types for the main process database layer.
 * Extracted from DatabaseService to share across repositories and IPC handlers.
 */

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

export interface ProjectGroup {
  id: string;
  name: string;
  displayOrder: number;
  isCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface Project {
  id: string;
  name: string;
  path: string;
  // Remote project fields (optional for backward compatibility)
  isRemote?: boolean;
  sshConnectionId?: string | null;
  remotePath?: string | null;
  // Multi-repo project fields (optional)
  subRepos?: SubRepo[] | null;
  // Group assignment
  groupId?: string | null;
  // Workspace assignment
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
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
  agentId?: string | null;
  metadata?: any;
  useWorktree?: boolean;
  archivedAt?: string | null;
  isPinned?: boolean;
  lastAgent?: string | null;
  lockedAgent?: string | null;
  initialPromptSent?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  taskId: string;
  title: string;
  provider?: string | null;
  mode?: 'pty' | 'acp' | null;
  acpSessionId?: string | null;
  isActive?: boolean;
  isMain?: boolean;
  displayOrder?: number;
  metadata?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  sender: 'user' | 'agent';
  parts?: string | null; // JSON-serialized structured message parts
  timestamp: string;
  metadata?: string; // JSON string for additional data
}

export interface MigrationSummary {
  appliedCount: number;
  totalMigrations: number;
  recovered: boolean;
}

export interface AppState {
  activeProjectId: string | null;
  activeTaskId: string | null;
  activeWorkspaceId: string | null;
  prMode: string | null;
  prDraft: boolean;
}

export interface TerminalSession {
  id: string;
  taskKey: string;
  terminalId: string;
  title: string;
  cwd: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
}
