import type { ProviderId } from '@shared/providers/registry';
import { type LinearIssueSummary } from './linear';
import { type GitHubIssueSummary } from './github';
import { type JiraIssueSummary } from './jira';

/** Per-agent run configuration for task creation */
export interface AgentRun {
  agent: ProviderId;
  runs: number;
}

export interface GitHubIssueLink {
  number: number;
  taskId: string;
  taskName: string;
}

/** Mapping of a sub-repo to its worktree or symlink in a multi-repo task */
export interface MultiRepoMapping {
  relativePath: string; // Relative path from project root (e.g., "frontend")
  originalPath: string; // Absolute path to original repo
  targetPath: string; // Path in composite worktree folder
  isWorktree: boolean; // true = git worktree, false = symlink
  branch?: string; // Branch name for worktrees
}

export interface TaskMetadata {
  linearIssue?: LinearIssueSummary | null;
  githubIssue?: GitHubIssueSummary | null;
  jiraIssue?: JiraIssueSummary | null;
  initialPrompt?: string | null;
  autoApprove?: boolean | null;
  /** Set to true after the initial injection (prompt/issue) has been sent to the agent */
  initialInjectionSent?: boolean | null;
  // When present, this task is a multi-agent task orchestrating multiple worktrees
  multiAgent?: {
    enabled: boolean;
    // Max panes allowed when the task was created (UI hint)
    maxAgents?: number;
    // Per-agent run configuration
    agentRuns?: AgentRun[];
    // Legacy list of agent ids before agentRuns existed (for backward compatibility)
    agents?: ProviderId[];
    variants: Array<{
      id: string;
      agent: ProviderId;
      name: string; // worktree display name, e.g. taskName-agentSlug
      branch: string;
      path: string; // filesystem path of the worktree
      worktreeId: string; // WorktreeService id (stable hash of path)
    }>;
    selectedAgent?: ProviderId | null;
  } | null;
  // When present, this task is for a multi-repo project with composite worktree
  multiRepo?: {
    enabled: boolean;
    // Path to the composite worktree folder containing all repos
    compositeWorktreePath: string;
    // Mapping of each sub-repo to its worktree or symlink
    repoMappings: MultiRepoMapping[];
  } | null;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
  metadata?: TaskMetadata | null;
  useWorktree?: boolean;
  createdAt?: string;
  updatedAt?: string;
  agentId?: string;
}
