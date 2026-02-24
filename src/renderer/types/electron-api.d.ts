// Updated for Codex integration

// MCP Registry types
export interface McpRegistryPackage {
  registryType: string;
  identifier: string;
  version?: string;
  runtimeHint?: string;
  transport?: { type: string };
  packageArguments?: Array<{
    name: string;
    description?: string;
    type: string;
    format?: string;
    isRequired: boolean;
    default?: string;
  }>;
  environmentVariables?: Array<{
    name: string;
    description?: string;
    format?: string;
    isRequired: boolean;
    default?: string;
  }>;
}

export interface McpRegistryRemote {
  type: string;
  url: string;
}

export interface McpRegistryServer {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: { url: string; source?: string };
  packages?: McpRegistryPackage[];
  remotes?: McpRegistryRemote[];
}

export interface AgentMcpDiscovery {
  agent: string;
  scope: 'global' | 'project';
  configPath: string;
  servers: import('@shared/mcp/types').McpServerConfig[];
}

// Model metadata types
export type ModelMetadataResult = {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  maxCompletionTokens: number;
  pricing: {
    input: number;
    output: number;
  };
  modality: string;
};

export type UptimeDayData = {
  date: string;
  status: 'operational' | 'degraded' | 'outage';
  incidentCount: number;
};

export type ProviderStatusResult = {
  status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
  components: { name: string; status: string }[];
  activeIncidents: { name: string; impact: string; startedAt: string }[];
};

// Claude usage limits types
export type ClaudeUsageBucket = {
  utilization: number;
  resets_at: string | null;
};

export type ClaudeExtraUsage = {
  is_enabled: boolean;
  monthly_limit: number;
  used_credits: number;
  utilization: number;
};

export type ClaudeUsageLimits = {
  fiveHour: ClaudeUsageBucket | null;
  sevenDay: ClaudeUsageBucket | null;
  sevenDayOpus: ClaudeUsageBucket | null;
  sevenDaySonnet: ClaudeUsageBucket | null;
  extraUsage: ClaudeExtraUsage | null;
};

// ACP (Agent Communication Protocol) types
export type AcpSessionStatus = 'initializing' | 'ready' | 'submitted' | 'streaming' | 'error';

export type AcpSessionMode = {
  id: string;
  name: string;
  description?: string;
};

export type AcpSessionModel = {
  id: string;
  name: string;
  description?: string;
};

export type AcpSessionModes = {
  availableModes: AcpSessionMode[];
  currentModeId: string;
} | null;

export type AcpSessionModels = {
  availableModels: AcpSessionModel[];
  currentModelId: string;
} | null;

export type AcpUpdateEvent =
  | {
      type: 'session_update';
      data: any; // ACP SessionNotification
    }
  | {
      type: 'permission_request';
      data: any; // ACP RequestPermissionRequest
      toolCallId: string;
    }
  | {
      type: 'status_change';
      status: AcpSessionStatus;
    }
  | {
      type: 'session_error';
      error: string;
    }
  | {
      type: 'prompt_error';
      error: string;
    }
  | {
      type: 'prompt_complete';
      stopReason: string;
    };

type ProjectSettingsPayload = {
  projectId: string;
  name: string;
  path: string;
  gitRemote?: string;
  gitBranch?: string;
  baseRef?: string;
};

// Update Project feature types
export type RepoStatus = {
  path: string;
  name: string;
  isMainRepo: boolean;
  currentBranch: string;
  trackingBranch?: string;
  ahead: number;
  behind: number;
  isDirty: boolean;
  dirtyFiles?: number;
};

export type BranchInfo = {
  name: string;
  tracking?: string;
  ahead?: number;
  behind?: number;
};

export type RepoUpdateResult = {
  path: string;
  success: boolean;
  error?: string;
  stashed?: boolean;
};

export type RepoBranchesResult = {
  current: string;
  local: BranchInfo[];
  remote: Array<{ name: string; lastCommit?: string }>;
  recent: string[];
};

export type GetRepoStatusArgs = {
  projectId: string;
};

export type GetRepoStatusResult = {
  success: boolean;
  data?: {
    repos: RepoStatus[];
  };
  error?: string;
};

export type UpdateReposArgs = {
  projectId: string;
  repoPaths?: string[];
  stashIfDirty?: boolean;
};

export type UpdateReposResult = {
  success: boolean;
  data?: RepoUpdateResult[];
  error?: string;
};

export type GetBranchesArgs = {
  repoPath: string;
};

export type GetBranchesResult = {
  success: boolean;
  data?: RepoBranchesResult;
  error?: string;
};

export type SwitchBranchArgs = {
  repoPath: string;
  branch: string;
  stashIfDirty?: boolean;
};

export type SwitchBranchResult = {
  success: boolean;
  stashed?: boolean;
  error?: string;
};

export type LineComment = {
  id: string;
  taskId: string;
  filePath: string;
  lineNumber: number;
  lineContent?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
};

export {};

declare global {
  interface Window {
    electronAPI: {
      // App info
      getAppVersion: () => Promise<string>;
      getElectronVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      listInstalledFonts: (args?: {
        refresh?: boolean;
      }) => Promise<{ success: boolean; fonts?: string[]; cached?: boolean; error?: string }>;
      // Updater
      checkForUpdates: () => Promise<{ success: boolean; result?: any; error?: string }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      quitAndInstallUpdate: () => Promise<{ success: boolean; error?: string }>;
      openLatestDownload: () => Promise<{ success: boolean; error?: string }>;
      onUpdateEvent: (listener: (data: { type: string; payload?: any }) => void) => () => void;
      // Enhanced update methods
      getUpdateState: () => Promise<{ success: boolean; data?: any; error?: string }>;
      getUpdateSettings: () => Promise<{ success: boolean; data?: any; error?: string }>;
      updateUpdateSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
      getReleaseNotes: () => Promise<{ success: boolean; data?: string | null; error?: string }>;
      checkForUpdatesNow: () => Promise<{ success: boolean; data?: any; error?: string }>;

      // App settings
      getSettings: () => Promise<{
        success: boolean;
        settings?: {
          repository: { branchPrefix: string; pushOnCreate: boolean };
          projectPrep?: { autoInstallOnOpenInEditor: boolean };
          browserPreview?: { enabled: boolean; engine: 'chromium' };
          notifications?: { enabled: boolean; sound: boolean };
          mcp?: {
            context7?: {
              enabled: boolean;
              installHintsDismissed?: Record<string, boolean>;
            };
          };
          defaultProvider?: string;
          tasks?: {
            autoGenerateName: boolean;
            autoApproveByDefault: boolean;
          };
          projects?: {
            defaultDirectory: string;
          };
          keyboard?: {
            commandPalette?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            settings?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleLeftSidebar?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleRightSidebar?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleTheme?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleKanban?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleEditor?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            nextProject?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            prevProject?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            newTask?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            nextAgent?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            prevAgent?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
          };
          interface?: {
            autoRightSidebarBehavior?: boolean;
            theme?: 'light' | 'dark' | 'dark-black' | 'system';
          };
          terminal?: {
            fontFamily: string;
          };
          defaultOpenInApp?: string;
          voiceInput?: { enabled: boolean };
        };
        error?: string;
      }>;
      updateSettings: (
        settings: Partial<{
          repository: { branchPrefix?: string; pushOnCreate?: boolean };
          projectPrep: { autoInstallOnOpenInEditor?: boolean };
          browserPreview: { enabled?: boolean; engine?: 'chromium' };
          notifications: { enabled?: boolean; sound?: boolean };
          mcp: {
            context7?: {
              enabled?: boolean;
              installHintsDismissed?: Record<string, boolean>;
            };
          };
          defaultProvider?: string;
          tasks?: {
            autoGenerateName?: boolean;
            autoApproveByDefault?: boolean;
          };
          projects?: {
            defaultDirectory?: string;
          };
          keyboard?: {
            commandPalette?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            settings?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleLeftSidebar?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleRightSidebar?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleTheme?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleKanban?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleEditor?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            nextProject?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            prevProject?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            newTask?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            nextAgent?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            prevAgent?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
          };
          interface?: {
            autoRightSidebarBehavior?: boolean;
            theme?: 'light' | 'dark' | 'dark-black' | 'system';
          };
          terminal?: {
            fontFamily?: string;
          };
          defaultOpenInApp?: string;
          voiceInput?: { enabled?: boolean };
        }>
      ) => Promise<{
        success: boolean;
        settings?: {
          repository: { branchPrefix: string; pushOnCreate: boolean };
          projectPrep?: { autoInstallOnOpenInEditor: boolean };
          browserPreview?: { enabled: boolean; engine: 'chromium' };
          notifications?: { enabled: boolean; sound: boolean };
          mcp?: {
            context7?: {
              enabled: boolean;
              installHintsDismissed?: Record<string, boolean>;
            };
          };
          defaultProvider?: string;
          tasks?: {
            autoGenerateName: boolean;
            autoApproveByDefault: boolean;
          };
          projects?: {
            defaultDirectory: string;
          };
          keyboard?: {
            commandPalette?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            settings?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleLeftSidebar?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleRightSidebar?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleTheme?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleKanban?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            toggleEditor?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            nextProject?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            prevProject?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            newTask?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            nextAgent?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
            prevAgent?: {
              key: string;
              modifier: 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';
            };
          };
          interface?: {
            autoRightSidebarBehavior?: boolean;
            theme?: 'light' | 'dark' | 'dark-black' | 'system';
          };
          terminal?: {
            fontFamily: string;
          };
          defaultOpenInApp?: string;
          voiceInput?: { enabled: boolean };
        };
        error?: string;
      }>;

      // Whisper (voice input)
      whisperDownloadModel: () => Promise<{ success: boolean; error?: string }>;
      whisperDeleteModel: () => Promise<{ success: boolean; error?: string }>;
      whisperModelStatus: () => Promise<{
        success: boolean;
        data?: { downloaded: boolean; sizeBytes?: number };
        error?: string;
      }>;
      whisperTranscribe: (pcmData: ArrayBuffer) => Promise<{
        success: boolean;
        data?: { text: string };
        error?: string;
      }>;
      onWhisperDownloadProgress: (
        listener: (data: { percent: number; bytesDownloaded: number; totalBytes: number }) => void
      ) => () => void;

      // PTY
      ptyStart: (opts: {
        id: string;
        cwd?: string;
        remote?: { connectionId: string };
        shell?: string;
        env?: Record<string, string>;
        cols?: number;
        rows?: number;
        autoApprove?: boolean;
        initialPrompt?: string;
        skipResume?: boolean;
      }) => Promise<{ ok: boolean; error?: string }>;
      ptyStartDirect: (opts: {
        id: string;
        providerId: string;
        cwd: string;
        remote?: { connectionId: string };
        cols?: number;
        rows?: number;
        autoApprove?: boolean;
        initialPrompt?: string;
        env?: Record<string, string>;
        resume?: boolean;
      }) => Promise<{ ok: boolean; reused?: boolean; error?: string }>;
      ptyInput: (args: { id: string; data: string }) => void;
      ptyResize: (args: { id: string; cols: number; rows?: number }) => void;
      ptyKill: (id: string) => void;
      onPtyData: (id: string, listener: (data: string) => void) => () => void;
      ptyGetSnapshot: (args: { id: string }) => Promise<{
        ok: boolean;
        snapshot?: any;
        error?: string;
      }>;
      ptySaveSnapshot: (args: { id: string; payload: TerminalSnapshotPayload }) => Promise<{
        ok: boolean;
        error?: string;
      }>;
      ptyClearSnapshot: (args: { id: string }) => Promise<{ ok: boolean }>;
      onPtyExit: (
        id: string,
        listener: (info: { exitCode: number; signal?: number }) => void
      ) => () => void;
      onPtyStarted: (listener: (data: { id: string }) => void) => () => void;
      terminalGetTheme: () => Promise<{
        ok: boolean;
        config?: {
          terminal: string;
          theme: {
            background?: string;
            foreground?: string;
            cursor?: string;
            cursorAccent?: string;
            selectionBackground?: string;
            black?: string;
            red?: string;
            green?: string;
            yellow?: string;
            blue?: string;
            magenta?: string;
            cyan?: string;
            white?: string;
            brightBlack?: string;
            brightRed?: string;
            brightGreen?: string;
            brightYellow?: string;
            brightBlue?: string;
            brightMagenta?: string;
            brightCyan?: string;
            brightWhite?: string;
            fontFamily?: string;
            fontSize?: number;
          };
        };
        error?: string;
      }>;

      // Worktree management
      worktreeCreate: (args: {
        projectPath: string;
        taskName: string;
        projectId: string;
        baseRef?: string;
      }) => Promise<{ success: boolean; worktree?: any; error?: string }>;
      worktreeList: (args: {
        projectPath: string;
      }) => Promise<{ success: boolean; worktrees?: any[]; error?: string }>;
      worktreeRemove: (args: {
        projectPath: string;
        worktreeId: string;
        worktreePath?: string;
        branch?: string;
        taskName?: string;
      }) => Promise<{ success: boolean; error?: string }>;
      worktreeStatus: (args: {
        worktreePath: string;
      }) => Promise<{ success: boolean; status?: any; error?: string }>;
      worktreeMerge: (args: {
        projectPath: string;
        worktreeId: string;
      }) => Promise<{ success: boolean; error?: string }>;
      worktreeGet: (args: {
        worktreeId: string;
      }) => Promise<{ success: boolean; worktree?: any; error?: string }>;
      worktreeGetAll: () => Promise<{
        success: boolean;
        worktrees?: any[];
        error?: string;
      }>;

      // Worktree pool (reserve) management for instant task creation
      worktreeEnsureReserve: (args: {
        projectId: string;
        projectPath: string;
        baseRef?: string;
      }) => Promise<{ success: boolean; error?: string }>;
      worktreeHasReserve: (args: {
        projectId: string;
      }) => Promise<{ success: boolean; hasReserve?: boolean; error?: string }>;
      worktreeClaimReserve: (args: {
        projectId: string;
        projectPath: string;
        taskName: string;
        baseRef?: string;
      }) => Promise<{
        success: boolean;
        worktree?: any;
        needsBaseRefSwitch?: boolean;
        error?: string;
      }>;
      worktreeRemoveReserve: (args: {
        projectId: string;
      }) => Promise<{ success: boolean; error?: string }>;

      // Multi-repo worktree management
      worktreeCreateMultiRepo: (args: {
        projectPath: string;
        projectId: string;
        taskName: string;
        subRepos: Array<{
          path: string;
          name: string;
          relativePath: string;
          gitInfo: { isGitRepo: boolean; remote?: string; branch?: string; baseRef?: string };
        }>;
        selectedRepos: string[];
        baseRef?: string;
      }) => Promise<{
        success: boolean;
        compositeWorktreePath?: string;
        repoMappings?: Array<{
          relativePath: string;
          originalPath: string;
          targetPath: string;
          isWorktree: boolean;
          branch?: string;
        }>;
        error?: string;
      }>;
      worktreeRemoveMultiRepo: (args: {
        compositeWorktreePath: string;
        subRepos: Array<{
          path: string;
          name: string;
          relativePath: string;
          gitInfo: { isGitRepo: boolean; remote?: string; branch?: string; baseRef?: string };
        }>;
      }) => Promise<{ success: boolean; error?: string }>;

      // Lifecycle scripts
      lifecycleGetScript: (args: {
        projectPath: string;
        phase: 'setup' | 'run' | 'teardown';
      }) => Promise<{ success: boolean; script?: string | null; error?: string }>;
      lifecycleSetup: (args: {
        taskId: string;
        taskPath: string;
        projectPath: string;
      }) => Promise<{ success: boolean; skipped?: boolean; error?: string }>;
      lifecycleRunStart: (args: {
        taskId: string;
        taskPath: string;
        projectPath: string;
      }) => Promise<{ success: boolean; skipped?: boolean; error?: string }>;
      lifecycleRunStop: (args: {
        taskId: string;
      }) => Promise<{ success: boolean; skipped?: boolean; error?: string }>;
      lifecycleTeardown: (args: {
        taskId: string;
        taskPath: string;
        projectPath: string;
      }) => Promise<{ success: boolean; skipped?: boolean; error?: string }>;
      lifecycleGetState: (args: { taskId: string }) => Promise<{
        success: boolean;
        state?: {
          taskId: string;
          setup: {
            status: 'idle' | 'running' | 'succeeded' | 'failed';
            startedAt?: string;
            finishedAt?: string;
            exitCode?: number | null;
            error?: string | null;
          };
          run: {
            status: 'idle' | 'running' | 'succeeded' | 'failed';
            startedAt?: string;
            finishedAt?: string;
            exitCode?: number | null;
            error?: string | null;
            pid?: number | null;
          };
          teardown: {
            status: 'idle' | 'running' | 'succeeded' | 'failed';
            startedAt?: string;
            finishedAt?: string;
            exitCode?: number | null;
            error?: string | null;
          };
        };
        error?: string;
      }>;
      lifecycleClearTask: (args: {
        taskId: string;
      }) => Promise<{ success: boolean; error?: string }>;
      onLifecycleEvent: (listener: (data: any) => void) => () => void;

      // Project management
      openProject: () => Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>;
      getProjectSettings: (projectId: string) => Promise<{
        success: boolean;
        settings?: ProjectSettingsPayload;
        error?: string;
      }>;
      updateProjectSettings: (args: { projectId: string; baseRef: string }) => Promise<{
        success: boolean;
        settings?: ProjectSettingsPayload;
        error?: string;
      }>;
      getGitInfo: (projectPath: string) => Promise<{
        isGitRepo: boolean;
        remote?: string;
        branch?: string;
        baseRef?: string;
        upstream?: string;
        aheadCount?: number;
        behindCount?: number;
        path?: string;
        rootPath?: string;
        error?: string;
      }>;
      detectSubRepos: (projectPath: string) => Promise<{
        success: boolean;
        subRepos: Array<{
          path: string;
          name: string;
          relativePath: string;
          gitInfo: {
            isGitRepo: boolean;
            remote?: string;
            branch?: string;
            baseRef?: string;
          };
        }>;
        error?: string;
      }>;

      // Update Project feature
      getProjectRepoStatus: (args: { projectId: string }) => Promise<{
        success: boolean;
        data?: {
          repos: RepoStatus[];
        };
        error?: string;
      }>;
      updateProjectRepos: (args: {
        projectId: string;
        repoPaths?: string[];
        stashIfDirty?: boolean;
      }) => Promise<{
        success: boolean;
        data?: RepoUpdateResult[];
        error?: string;
      }>;
      getRepoBranches: (args: { repoPath: string }) => Promise<{
        success: boolean;
        data?: RepoBranchesResult;
        error?: string;
      }>;
      switchRepoBranch: (args: {
        repoPath: string;
        branch: string;
        stashIfDirty?: boolean;
      }) => Promise<{
        success: boolean;
        stashed?: boolean;
        error?: string;
      }>;

      getGitStatus: (
        arg:
          | string
          | { taskPath: string; repoMappings?: Array<{ relativePath: string; targetPath: string }> }
      ) => Promise<{
        success: boolean;
        changes?: Array<{
          path: string;
          status: string;
          additions: number;
          deletions: number;
          isStaged: boolean;
          diff?: string;
          repoName?: string;
          repoCwd?: string;
        }>;
        error?: string;
      }>;
      watchGitStatus: (taskPath: string) => Promise<{
        success: boolean;
        watchId?: string;
        error?: string;
      }>;
      unwatchGitStatus: (
        taskPath: string,
        watchId?: string
      ) => Promise<{
        success: boolean;
        error?: string;
      }>;
      onGitStatusChanged: (
        listener: (data: { taskPath: string; error?: string }) => void
      ) => () => void;
      getFileDiff: (args: { taskPath: string; filePath: string; repoCwd?: string }) => Promise<{
        success: boolean;
        diff?: {
          lines: Array<{
            left?: string;
            right?: string;
            type: 'context' | 'add' | 'del';
          }>;
          rawPatch?: string;
        };
        error?: string;
      }>;
      stageFile: (args: { taskPath: string; filePath: string; repoCwd?: string }) => Promise<{
        success: boolean;
        error?: string;
      }>;
      stageAllFiles: (args: { taskPath: string; repoCwds?: string[] }) => Promise<{
        success: boolean;
        error?: string;
      }>;
      unstageFile: (args: { taskPath: string; filePath: string; repoCwd?: string }) => Promise<{
        success: boolean;
        error?: string;
      }>;
      revertFile: (args: { taskPath: string; filePath: string; repoCwd?: string }) => Promise<{
        success: boolean;
        action?: 'unstaged' | 'reverted';
        error?: string;
      }>;
      gitCommitAndPush: (args: {
        taskPath: string;
        commitMessage?: string;
        createBranchIfOnDefault?: boolean;
        branchPrefix?: string;
      }) => Promise<{
        success: boolean;
        branch?: string;
        output?: string;
        error?: string;
      }>;
      gitPush: (args: { repoPath: string }) => Promise<{
        success: boolean;
        branch?: string;
        error?: string;
      }>;
      generatePrContent: (args: { taskPath: string; base?: string }) => Promise<{
        success: boolean;
        title?: string;
        description?: string;
        error?: string;
      }>;
      createPullRequest: (args: {
        taskPath: string;
        title?: string;
        body?: string;
        base?: string;
        head?: string;
        draft?: boolean;
        web?: boolean;
        fill?: boolean;
      }) => Promise<{
        success: boolean;
        url?: string;
        output?: string;
        error?: string;
      }>;
      mergeToMain: (args: { taskPath: string }) => Promise<{
        success: boolean;
        output?: string;
        prUrl?: string;
        error?: string;
      }>;
      getPrStatus: (args: { taskPath: string }) => Promise<{
        success: boolean;
        pr?: {
          number: number;
          url: string;
          state: string;
          isDraft?: boolean;
          mergeStateStatus?: string;
          headRefName?: string;
          baseRefName?: string;
          title?: string;
          author?: any;
          additions?: number;
          deletions?: number;
          changedFiles?: number;
        } | null;
        error?: string;
      }>;
      getCheckRuns: (args: { taskPath: string }) => Promise<{
        success: boolean;
        checks?: Array<{
          name: string;
          state: string;
          bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';
          description?: string;
          link?: string;
          workflow?: string;
          event?: string;
          startedAt?: string;
          completedAt?: string;
        }> | null;
        error?: string;
        code?: string;
      }>;
      getPrComments: (args: { taskPath: string; prNumber?: number }) => Promise<{
        success: boolean;
        comments?: Array<{
          id: string;
          author: { login: string; avatarUrl?: string };
          body: string;
          createdAt: string;
        }>;
        reviews?: Array<{
          id: string;
          author: { login: string; avatarUrl?: string };
          body: string;
          submittedAt: string;
          state: string;
        }>;
        error?: string;
        code?: string;
      }>;
      getBranchStatus: (args: { taskPath: string }) => Promise<{
        success: boolean;
        branch?: string;
        defaultBranch?: string;
        ahead?: number;
        behind?: number;
        error?: string;
      }>;
      renameBranch: (args: { repoPath: string; oldBranch: string; newBranch: string }) => Promise<{
        success: boolean;
        remotePushed?: boolean;
        error?: string;
      }>;
      listRemoteBranches: (args: { projectPath: string; remote?: string }) => Promise<{
        success: boolean;
        branches?: Array<{ ref: string; remote: string; branch: string; label: string }>;
        error?: string;
      }>;
      getRepoBranches: (args: { repoPath: string }) => Promise<{
        success: boolean;
        data?: RepoBranchesResult;
        error?: string;
      }>;
      switchRepoBranch: (args: {
        repoPath: string;
        branch: string;
        stashIfDirty?: boolean;
      }) => Promise<{
        success: boolean;
        stashed?: boolean;
        error?: string;
      }>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      openIn: (args: {
        app: OpenInAppId;
        path: string;
        isRemote?: boolean;
        sshConnectionId?: string | null;
      }) => Promise<{ success: boolean; error?: string }>;
      checkInstalledApps: () => Promise<Record<OpenInAppId, boolean>>;
      connectToGitHub: (projectPath: string) => Promise<{
        success: boolean;
        repository?: string;
        branch?: string;
        error?: string;
      }>;
      // Telemetry
      captureTelemetry: (
        event: string,
        properties?: Record<string, any>
      ) => Promise<{ success: boolean; disabled?: boolean; error?: string }>;
      getTelemetryStatus: () => Promise<{
        success: boolean;
        status?: {
          enabled: boolean;
          envDisabled: boolean;
          userOptOut: boolean;
          hasKeyAndHost: boolean;
          onboardingSeen?: boolean;
        };
        error?: string;
      }>;
      setTelemetryEnabled: (enabled: boolean) => Promise<{
        success: boolean;
        status?: {
          enabled: boolean;
          envDisabled: boolean;
          userOptOut: boolean;
          hasKeyAndHost: boolean;
          onboardingSeen?: boolean;
        };
        error?: string;
      }>;
      setOnboardingSeen: (flag: boolean) => Promise<{
        success: boolean;
        status?: {
          enabled: boolean;
          envDisabled: boolean;
          userOptOut: boolean;
          hasKeyAndHost: boolean;
          onboardingSeen?: boolean;
        };
        error?: string;
      }>;

      // Filesystem helpers
      fsList: (
        root: string,
        opts?: { includeDirs?: boolean; maxEntries?: number; timeBudgetMs?: number }
      ) => Promise<{
        success: boolean;
        items?: Array<{ path: string; type: 'file' | 'dir' }>;
        error?: string;
        canceled?: boolean;
        truncated?: boolean;
        reason?: string;
        durationMs?: number;
      }>;
      fsReaddir: (dirPath: string) => Promise<{
        success: boolean;
        items?: Array<{ name: string; type: 'file' | 'dir' }>;
        error?: string;
      }>;
      fsRead: (
        root: string,
        relPath: string,
        maxBytes?: number
      ) => Promise<{
        success: boolean;
        path?: string;
        size?: number;
        truncated?: boolean;
        content?: string;
        error?: string;
      }>;
      fsReadImage: (
        root: string,
        relPath: string
      ) => Promise<{
        success: boolean;
        dataUrl?: string;
        mimeType?: string;
        size?: number;
        error?: string;
      }>;
      fsSearchContent: (
        root: string,
        query: string,
        options?: {
          caseSensitive?: boolean;
          maxResults?: number;
          fileExtensions?: string[];
        }
      ) => Promise<{
        success: boolean;
        results?: Array<{
          file: string;
          matches: Array<{
            line: number;
            column: number;
            text: string;
            preview: string;
          }>;
        }>;
        error?: string;
      }>;
      fsWriteFile: (
        root: string,
        relPath: string,
        content: string,
        mkdirs?: boolean
      ) => Promise<{ success: boolean; error?: string }>;
      fsRemove: (root: string, relPath: string) => Promise<{ success: boolean; error?: string }>;
      fsCheckIgnored: (
        rootPath: string,
        paths: string[]
      ) => Promise<{ success: boolean; ignoredPaths?: string[]; error?: string }>;
      getProjectConfig: (
        projectPath: string
      ) => Promise<{ success: boolean; path?: string; content?: string; error?: string }>;
      saveProjectConfig: (
        projectPath: string,
        content: string
      ) => Promise<{ success: boolean; path?: string; error?: string }>;
      // Attachments
      saveAttachment: (args: { taskPath: string; srcPath: string; subdir?: string }) => Promise<{
        success: boolean;
        absPath?: string;
        relPath?: string;
        fileName?: string;
        error?: string;
      }>;

      // GitHub integration
      githubAuth: () => Promise<{
        success: boolean;
        token?: string;
        user?: any;
        device_code?: string;
        user_code?: string;
        verification_uri?: string;
        expires_in?: number;
        interval?: number;
        error?: string;
      }>;
      githubCancelAuth: () => Promise<{ success: boolean; error?: string }>;
      onGithubAuthDeviceCode: (
        callback: (data: {
          userCode: string;
          verificationUri: string;
          expiresIn: number;
          interval: number;
        }) => void
      ) => () => void;
      onGithubAuthPolling: (callback: (data: { status: string }) => void) => () => void;
      onGithubAuthSlowDown: (callback: (data: { newInterval: number }) => void) => () => void;
      onGithubAuthSuccess: (callback: (data: { token: string; user: any }) => void) => () => void;
      onGithubAuthError: (
        callback: (data: { error: string; message: string }) => void
      ) => () => void;
      onGithubAuthCancelled: (callback: () => void) => () => void;
      onGithubAuthUserUpdated: (callback: (data: { user: any }) => void) => () => void;
      githubIsAuthenticated: () => Promise<boolean>;
      githubGetStatus: () => Promise<{
        installed: boolean;
        authenticated: boolean;
        user?: any;
      }>;
      githubGetUser: () => Promise<any>;
      githubGetRepositories: () => Promise<any[]>;
      githubCloneRepository: (
        repoUrl: string,
        localPath: string
      ) => Promise<{ success: boolean; error?: string }>;
      githubGetOwners: () => Promise<{
        success: boolean;
        owners?: Array<{ login: string; type: 'User' | 'Organization' }>;
        error?: string;
      }>;
      githubValidateRepoName: (
        name: string,
        owner: string
      ) => Promise<{
        success: boolean;
        valid?: boolean;
        exists?: boolean;
        error?: string;
      }>;
      githubCreateNewProject: (params: {
        name: string;
        description?: string;
        owner: string;
        isPrivate: boolean;
        gitignoreTemplate?: string;
      }) => Promise<{
        success: boolean;
        projectPath?: string;
        repoUrl?: string;
        fullName?: string;
        defaultBranch?: string;
        githubRepoCreated?: boolean;
        error?: string;
      }>;
      githubCheckCLIInstalled: () => Promise<boolean>;
      githubInstallCLI: () => Promise<{ success: boolean; error?: string }>;
      githubListPullRequests: (
        projectPath: string
      ) => Promise<{ success: boolean; prs?: any[]; error?: string }>;
      githubCreatePullRequestWorktree: (args: {
        projectPath: string;
        projectId: string;
        prNumber: number;
        prTitle?: string;
        taskName?: string;
        branchName?: string;
      }) => Promise<{
        success: boolean;
        worktree?: any;
        branchName?: string;
        taskName?: string;
        error?: string;
      }>;
      githubLogout: () => Promise<void>;
      // Linear integration
      linearCheckConnection?: () => Promise<{
        connected: boolean;
        taskName?: string;
        error?: string;
      }>;
      linearSaveToken?: (token: string) => Promise<{
        success: boolean;
        taskName?: string;
        error?: string;
      }>;
      linearClearToken?: () => Promise<{
        success: boolean;
        error?: string;
      }>;
      linearInitialFetch?: (limit?: number) => Promise<{
        success: boolean;
        issues?: any[];
        error?: string;
      }>;
      linearSearchIssues?: (
        searchTerm: string,
        limit?: number
      ) => Promise<{
        success: boolean;
        issues?: any[];
        error?: string;
      }>;
      // Jira integration
      jiraSaveCredentials?: (args: {
        siteUrl: string;
        email: string;
        token: string;
      }) => Promise<{ success: boolean; displayName?: string; error?: string }>;
      jiraClearCredentials?: () => Promise<{ success: boolean; error?: string }>;
      jiraCheckConnection?: () => Promise<{
        connected: boolean;
        displayName?: string;
        siteUrl?: string;
        error?: string;
      }>;
      jiraInitialFetch?: (limit?: number) => Promise<{
        success: boolean;
        issues?: any[];
        error?: string;
      }>;
      jiraSearchIssues?: (
        searchTerm: string,
        limit?: number
      ) => Promise<{ success: boolean; issues?: any[]; error?: string }>;
      getProviderStatuses?: (opts?: {
        refresh?: boolean;
        providers?: string[];
        providerId?: string;
      }) => Promise<{
        success: boolean;
        statuses?: Record<
          string,
          { installed: boolean; path?: string | null; version?: string | null; lastChecked: number }
        >;
        error?: string;
      }>;
      onProviderStatusUpdated?: (
        listener: (data: { providerId: string; status: any }) => void
      ) => () => void;

      // Database operations
      getProjects: () => Promise<any[]>;
      saveProject: (project: any) => Promise<{ success: boolean; error?: string }>;
      updateProjectOrder: (projectIds: string[]) => Promise<{ success: boolean; error?: string }>;
      // Project groups
      getProjectGroups: () => Promise<{
        success: boolean;
        groups?: Array<{
          id: string;
          name: string;
          displayOrder: number;
          isCollapsed: boolean;
          createdAt: string;
          updatedAt: string;
        }>;
        error?: string;
      }>;
      createProjectGroup: (name: string) => Promise<{
        success: boolean;
        group?: {
          id: string;
          name: string;
          displayOrder: number;
          isCollapsed: boolean;
          createdAt: string;
          updatedAt: string;
        };
        error?: string;
      }>;
      renameProjectGroup: (args: {
        id: string;
        name: string;
      }) => Promise<{ success: boolean; error?: string }>;
      deleteProjectGroup: (id: string) => Promise<{ success: boolean; error?: string }>;
      updateProjectGroupOrder: (
        groupIds: string[]
      ) => Promise<{ success: boolean; error?: string }>;
      setProjectGroup: (args: {
        projectId: string;
        groupId: string | null;
      }) => Promise<{ success: boolean; error?: string }>;
      toggleProjectGroupCollapsed: (args: {
        id: string;
        isCollapsed: boolean;
      }) => Promise<{ success: boolean; error?: string }>;
      // Workspaces
      getWorkspaces: () => Promise<{
        success: boolean;
        workspaces?: Array<{
          id: string;
          name: string;
          color: string;
          emoji: string | null;
          displayOrder: number;
          isDefault: boolean;
          createdAt: string;
          updatedAt: string;
        }>;
        error?: string;
      }>;
      createWorkspace: (args: { name: string; color?: string }) => Promise<{
        success: boolean;
        workspace?: {
          id: string;
          name: string;
          color: string;
          emoji: string | null;
          displayOrder: number;
          isDefault: boolean;
          createdAt: string;
          updatedAt: string;
        };
        error?: string;
      }>;
      renameWorkspace: (args: {
        id: string;
        name: string;
      }) => Promise<{ success: boolean; error?: string }>;
      deleteWorkspace: (id: string) => Promise<{ success: boolean; error?: string }>;
      updateWorkspaceOrder: (
        workspaceIds: string[]
      ) => Promise<{ success: boolean; error?: string }>;
      updateWorkspaceColor: (args: {
        id: string;
        color: string;
      }) => Promise<{ success: boolean; error?: string }>;
      updateWorkspaceEmoji: (args: {
        id: string;
        emoji: string | null;
      }) => Promise<{ success: boolean; error?: string }>;
      setProjectWorkspace: (args: {
        projectId: string;
        workspaceId: string | null;
      }) => Promise<{ success: boolean; error?: string }>;
      getTasks: (projectId?: string) => Promise<any[]>;
      saveTask: (task: any) => Promise<{ success: boolean; error?: string }>;
      deleteProject: (projectId: string) => Promise<{ success: boolean; error?: string }>;
      renameProject: (args: {
        projectId: string;
        newName: string;
      }) => Promise<{ success: boolean; project?: any; error?: string }>;
      deleteTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
      archiveTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
      restoreTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
      getArchivedTasks: (projectId?: string) => Promise<any[]>;

      // Conversation and Message operations
      saveConversation: (conversation: any) => Promise<{ success: boolean; error?: string }>;
      getConversations: (
        taskId: string
      ) => Promise<{ success: boolean; conversations?: any[]; error?: string }>;
      deleteConversation: (conversationId: string) => Promise<{ success: boolean; error?: string }>;
      cleanupSessionDirectory: (args: {
        taskPath: string;
        conversationId: string;
      }) => Promise<{ success: boolean }>;
      saveMessage: (message: any) => Promise<{ success: boolean; error?: string }>;
      getMessages: (
        conversationId: string
      ) => Promise<{ success: boolean; messages?: any[]; error?: string }>;
      getOrCreateDefaultConversation: (
        taskId: string
      ) => Promise<{ success: boolean; conversation?: any; error?: string }>;

      // Multi-chat support
      createConversation: (params: {
        taskId: string;
        title: string;
        provider?: string;
        isMain?: boolean;
      }) => Promise<{ success: boolean; conversation?: any; error?: string }>;
      setActiveConversation: (params: {
        taskId: string;
        conversationId: string;
      }) => Promise<{ success: boolean; error?: string }>;
      getActiveConversation: (
        taskId: string
      ) => Promise<{ success: boolean; conversation?: any; error?: string }>;
      reorderConversations: (params: {
        taskId: string;
        conversationIds: string[];
      }) => Promise<{ success: boolean; error?: string }>;
      updateConversationTitle: (params: {
        conversationId: string;
        title: string;
      }) => Promise<{ success: boolean; error?: string }>;
      updateConversationAcpSessionId: (params: {
        conversationId: string;
        acpSessionId: string;
      }) => Promise<{ success: boolean; error?: string }>;

      // App state
      getAppState(): Promise<{
        success: boolean;
        data?: {
          activeProjectId: string | null;
          activeTaskId: string | null;
          activeWorkspaceId: string | null;
          prMode: string | null;
          prDraft: boolean;
        };
        error?: string;
      }>;
      updateAppState(partial: {
        activeProjectId?: string | null;
        activeTaskId?: string | null;
        activeWorkspaceId?: string | null;
        prMode?: string | null;
        prDraft?: boolean;
      }): Promise<{ success: boolean; error?: string }>;
      // Task pinned/agent
      setTaskPinned(args: {
        taskId: string;
        pinned: boolean;
      }): Promise<{ success: boolean; error?: string }>;
      getPinnedTaskIds(): Promise<{ success: boolean; data?: string[]; error?: string }>;
      setTaskAgent(args: {
        taskId: string;
        lastAgent?: string | null;
        lockedAgent?: string | null;
      }): Promise<{ success: boolean; error?: string }>;
      setTaskInitialPromptSent(args: {
        taskId: string;
        sent: boolean;
      }): Promise<{ success: boolean; error?: string }>;
      // Terminal sessions
      getTerminalSessions(taskKey: string): Promise<{
        success: boolean;
        data?: Array<{
          id: string;
          taskKey: string;
          terminalId: string;
          title: string;
          cwd: string | null;
          isActive: boolean;
          displayOrder: number;
          createdAt: string;
        }>;
        error?: string;
      }>;
      saveTerminalSessions(args: {
        taskKey: string;
        sessions: Array<{
          id: string;
          terminalId: string;
          title: string;
          cwd?: string | null;
          isActive: boolean;
          displayOrder: number;
        }>;
      }): Promise<{ success: boolean; error?: string }>;
      deleteTerminalSessions(taskKey: string): Promise<{ success: boolean; error?: string }>;
      // Kanban
      getKanbanStatuses(): Promise<{
        success: boolean;
        data?: Array<{ taskId: string; status: string }>;
        error?: string;
      }>;
      setKanbanStatus(args: {
        taskId: string;
        status: string;
      }): Promise<{ success: boolean; error?: string }>;

      // Debug helpers
      debugAppendLog: (
        filePath: string,
        content: string,
        options?: { reset?: boolean }
      ) => Promise<{ success: boolean; error?: string }>;

      // Line comments
      lineCommentsGet: (args: { taskId: string; filePath?: string }) => Promise<{
        success: boolean;
        comments?: LineComment[];
        error?: string;
      }>;
      lineCommentsCreate: (args: {
        taskId: string;
        filePath: string;
        lineNumber: number;
        lineContent?: string;
        content: string;
      }) => Promise<{
        success: boolean;
        id?: string;
        error?: string;
      }>;
      lineCommentsUpdate: (args: { id: string; content: string }) => Promise<{
        success: boolean;
        error?: string;
      }>;
      lineCommentsDelete: (id: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
      lineCommentsGetFormatted: (taskId: string) => Promise<{
        success: boolean;
        formatted?: string;
        error?: string;
      }>;
      lineCommentsMarkSent: (commentIds: string[]) => Promise<{
        success: boolean;
        error?: string;
      }>;
      lineCommentsGetUnsent: (taskId: string) => Promise<{
        success: boolean;
        comments?: LineComment[];
        error?: string;
      }>;

      // SSH operations
      sshTestConnection: (config: {
        id?: string;
        name: string;
        host: string;
        port: number;
        username: string;
        authType: 'password' | 'key' | 'agent';
        privateKeyPath?: string;
        useAgent?: boolean;
        password?: string;
        passphrase?: string;
      }) => Promise<{ success: boolean; error?: string; latency?: number }>;
      sshSaveConnection: (config: {
        id?: string;
        name: string;
        host: string;
        port: number;
        username: string;
        authType: 'password' | 'key' | 'agent';
        privateKeyPath?: string;
        useAgent?: boolean;
        password?: string;
        passphrase?: string;
      }) => Promise<{
        id: string;
        name: string;
        host: string;
        port: number;
        username: string;
        authType: 'password' | 'key' | 'agent';
        privateKeyPath?: string;
        useAgent?: boolean;
      }>;
      sshGetConnections: () => Promise<
        Array<{
          id: string;
          name: string;
          host: string;
          port: number;
          username: string;
          authType: 'password' | 'key' | 'agent';
          privateKeyPath?: string;
          useAgent?: boolean;
        }>
      >;
      sshDeleteConnection: (id: string) => Promise<void>;
      sshConnect: (
        arg:
          | string
          | {
              id?: string;
              name: string;
              host: string;
              port: number;
              username: string;
              authType: 'password' | 'key' | 'agent';
              privateKeyPath?: string;
              useAgent?: boolean;
              password?: string;
              passphrase?: string;
            }
      ) => Promise<string>;
      sshDisconnect: (connectionId: string) => Promise<void>;
      sshExecuteCommand: (
        connectionId: string,
        command: string,
        cwd?: string
      ) => Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
      }>;
      sshListFiles: (
        connectionId: string,
        path: string
      ) => Promise<
        Array<{
          path: string;
          name: string;
          type: 'file' | 'directory' | 'symlink';
          size: number;
          modifiedAt: Date;
          permissions?: string;
        }>
      >;
      sshReadFile: (connectionId: string, path: string) => Promise<string>;
      sshWriteFile: (connectionId: string, path: string, content: string) => Promise<void>;
      sshGetState: (
        connectionId: string
      ) => Promise<'connecting' | 'connected' | 'disconnected' | 'error'>;
      sshGetConfig: () => Promise<{ success: boolean; hosts?: any[]; error?: string }>;
      sshGetSshConfigHost: (hostAlias: string) => Promise<{
        success: boolean;
        host?: {
          host: string;
          hostname?: string;
          user?: string;
          port?: number;
          identityFile?: string;
        };
        error?: string;
      }>;

      // MCP server management
      mcpGetGlobalServers: () => Promise<{
        success: boolean;
        data?: import('@shared/mcp/types').McpServerConfig[];
        error?: string;
      }>;
      mcpSaveGlobalServers: (servers: import('@shared/mcp/types').McpServerConfig[]) => Promise<{
        success: boolean;
        data?: import('@shared/mcp/types').McpServerConfig[];
        error?: string;
      }>;
      mcpGetProjectServers: (projectPath: string) => Promise<{
        success: boolean;
        data?: import('@shared/mcp/types').McpServerConfig[];
        error?: string;
      }>;
      mcpSaveProjectServers: (
        projectPath: string,
        servers: import('@shared/mcp/types').McpServerConfig[]
      ) => Promise<{
        success: boolean;
        data?: import('@shared/mcp/types').McpServerConfig[];
        error?: string;
      }>;
      mcpDetectAgentServers: (args?: {
        projectPath?: string;
      }) => Promise<{
        success: boolean;
        data?: AgentMcpDiscovery[];
        error?: string;
      }>;
      mcpSearchRegistry: (args: {
        query: string;
        limit?: number;
        cursor?: string;
      }) => Promise<{
        success: boolean;
        data?: {
          servers: McpRegistryServer[];
          metadata: { count: number; nextCursor?: string };
        };
        error?: string;
      }>;

      // Skills management
      skillsGetCatalog: () => Promise<{
        success: boolean;
        data?: import('@shared/skills/types').CatalogIndex;
        error?: string;
      }>;
      skillsRefreshCatalog: () => Promise<{
        success: boolean;
        data?: import('@shared/skills/types').CatalogIndex;
        error?: string;
      }>;
      skillsInstall: (args: { skillId: string }) => Promise<{
        success: boolean;
        data?: import('@shared/skills/types').CatalogSkill;
        error?: string;
      }>;
      skillsUninstall: (args: { skillId: string }) => Promise<{
        success: boolean;
        error?: string;
      }>;
      skillsGetDetail: (args: { skillId: string }) => Promise<{
        success: boolean;
        data?: import('@shared/skills/types').CatalogSkill;
        error?: string;
      }>;
      skillsGetDetectedAgents: () => Promise<{
        success: boolean;
        data?: import('@shared/skills/types').DetectedAgent[];
        error?: string;
      }>;
      skillsCreate: (args: { name: string; description: string }) => Promise<{
        success: boolean;
        data?: import('@shared/skills/types').CatalogSkill;
        error?: string;
      }>;

      // Script runner
      getScripts: (projectPath: string) => Promise<{
        success: boolean;
        data?: { name: string; command: string }[];
        error?: string;
      }>;
      runScript: (
        projectPath: string,
        scriptName: string
      ) => Promise<{
        success: boolean;
        data?: { ptyId: string };
        error?: string;
      }>;
      stopScript: (ptyId: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
      getRunningScripts: (projectPath: string) => Promise<{
        success: boolean;
        data?: { scriptName: string; ptyId: string }[];
        error?: string;
      }>;
      onScriptData: (ptyId: string, listener: (data: string) => void) => () => void;
      onScriptExit: (
        ptyId: string,
        listener: (info: { exitCode: number; signal?: number }) => void
      ) => () => void;
      onScriptStarted: (
        listener: (data: { ptyId: string; scriptName: string; projectPath: string }) => void
      ) => () => void;
      scriptInput: (args: { ptyId: string; data: string }) => void;
      scriptResize: (args: { ptyId: string; cols: number; rows: number }) => void;

      // ACP Registry — browse, install, uninstall agents
      acpRegistryFetch: () => Promise<{
        success: boolean;
        data?: import('@shared/acpRegistry').AcpRegistryEntry[];
        error?: string;
      }>;
      acpRegistryGetInstalled: () => Promise<{
        success: boolean;
        data?: import('@shared/acpRegistry').InstalledAcpAgent[];
        error?: string;
      }>;
      acpRegistryInstall: (args: {
        agentId: string;
        method?: 'npx' | 'binary';
      }) => Promise<{ success: boolean; error?: string }>;
      acpRegistryUninstall: (args: {
        agentId: string;
      }) => Promise<{ success: boolean; error?: string }>;

      // ACP (Agent Communication Protocol) session management
      acpStart: (args: {
        conversationId: string;
        providerId: string;
        cwd: string;
        env?: Record<string, string>;
        acpSessionId?: string;
        projectPath?: string;
      }) => Promise<{
        success: boolean;
        sessionKey?: string;
        acpSessionId?: string;
        modes?: AcpSessionModes;
        models?: AcpSessionModels;
        historyEvents?: AcpUpdateEvent[];
        resumed?: boolean;
        error?: string;
      }>;
      acpPrompt: (args: {
        sessionKey: string;
        message: string;
        files?: Array<{ url: string; mediaType: string; filename?: string }>;
      }) => Promise<{ success: boolean; error?: string }>;
      acpCancel: (args: { sessionKey: string }) => Promise<{ success: boolean; error?: string }>;
      acpKill: (args: { sessionKey: string }) => Promise<{ success: boolean; error?: string }>;
      acpDetach: (args: { sessionKey: string }) => Promise<{ success: boolean; error?: string }>;
      acpApprove: (args: {
        sessionKey: string;
        toolCallId: string;
        approved: boolean;
      }) => Promise<{ success: boolean; error?: string }>;
      acpSetMode: (args: {
        sessionKey: string;
        mode: string;
      }) => Promise<{ success: boolean; error?: string }>;
      acpSetModel: (args: {
        sessionKey: string;
        modelId: string;
      }) => Promise<{ success: boolean; error?: string }>;
      acpSetConfigOption: (args: {
        sessionKey: string;
        optionId: string;
        value: string;
      }) => Promise<{ success: boolean; error?: string }>;
      acpListSessions: (args: {
        sessionKey: string;
      }) => Promise<{ success: boolean; sessions?: any[]; error?: string }>;
      acpForkSession: (args: {
        sessionKey: string;
      }) => Promise<{ success: boolean; newSessionId?: string; error?: string }>;
      acpExtMethod: (args: {
        sessionKey: string;
        method: string;
        params?: Record<string, unknown>;
      }) => Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }>;
      acpGetClaudeUsageLimits: () => Promise<{
        success: boolean;
        data?: ClaudeUsageLimits | null;
        error?: string;
      }>;
      onAcpUpdate: (sessionKey: string, listener: (event: AcpUpdateEvent) => void) => () => void;
      onAcpStatus: (sessionKey: string, listener: (status: AcpSessionStatus) => void) => () => void;

      // Model metadata
      modelMetadataGet: (args: {
        acpModelId: string;
        providerId: string;
      }) => Promise<{ success: boolean; data?: ModelMetadataResult | null; error?: string }>;
      modelMetadataGetUptime: (args: {
        providerId: string;
      }) => Promise<{ success: boolean; data?: UptimeDayData[]; error?: string }>;
      modelMetadataGetStatus: (args: {
        providerId: string;
      }) => Promise<{ success: boolean; data?: ProviderStatusResult | null; error?: string }>;
    };
  }
}

// Explicit type export for better TypeScript recognition
export interface ElectronAPI {
  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  listInstalledFonts: (args?: {
    refresh?: boolean;
  }) => Promise<{ success: boolean; fonts?: string[]; cached?: boolean; error?: string }>;
  // Updater
  checkForUpdates: () => Promise<{ success: boolean; result?: any; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  quitAndInstallUpdate: () => Promise<{ success: boolean; error?: string }>;
  openLatestDownload: () => Promise<{ success: boolean; error?: string }>;
  onUpdateEvent: (listener: (data: { type: string; payload?: any }) => void) => () => void;
  // Enhanced update methods
  getUpdateState: () => Promise<{ success: boolean; data?: any; error?: string }>;
  getUpdateSettings: () => Promise<{ success: boolean; data?: any; error?: string }>;
  updateUpdateSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
  getReleaseNotes: () => Promise<{ success: boolean; data?: string | null; error?: string }>;
  checkForUpdatesNow: () => Promise<{ success: boolean; data?: any; error?: string }>;

  // PTY
  ptyStart: (opts: {
    id: string;
    cwd?: string;
    shell?: string;
    env?: Record<string, string>;
    cols?: number;
    rows?: number;
    autoApprove?: boolean;
    initialPrompt?: string;
    skipResume?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  ptyStartDirect: (opts: {
    id: string;
    providerId: string;
    cwd: string;
    cols?: number;
    rows?: number;
    autoApprove?: boolean;
    initialPrompt?: string;
    env?: Record<string, string>;
    resume?: boolean;
  }) => Promise<{ ok: boolean; reused?: boolean; error?: string }>;
  ptyInput: (args: { id: string; data: string }) => void;
  ptyResize: (args: { id: string; cols: number; rows?: number }) => void;
  ptyKill: (id: string) => void;
  onPtyData: (id: string, listener: (data: string) => void) => () => void;
  ptyGetSnapshot: (args: { id: string }) => Promise<{
    ok: boolean;
    snapshot?: any;
    error?: string;
  }>;
  ptySaveSnapshot: (args: { id: string; payload: TerminalSnapshotPayload }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  ptyClearSnapshot: (args: { id: string }) => Promise<{ ok: boolean }>;
  onPtyExit: (
    id: string,
    listener: (info: { exitCode: number; signal?: number }) => void
  ) => () => void;
  onPtyStarted: (listener: (data: { id: string }) => void) => () => void;

  // Worktree management
  worktreeCreate: (args: {
    projectPath: string;
    taskName: string;
    projectId: string;
    baseRef?: string;
  }) => Promise<{ success: boolean; worktree?: any; error?: string }>;
  worktreeList: (args: {
    projectPath: string;
  }) => Promise<{ success: boolean; worktrees?: any[]; error?: string }>;
  worktreeRemove: (args: {
    projectPath: string;
    worktreeId: string;
    worktreePath?: string;
    branch?: string;
    taskName?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  worktreeStatus: (args: {
    worktreePath: string;
  }) => Promise<{ success: boolean; status?: any; error?: string }>;
  worktreeMerge: (args: {
    projectPath: string;
    worktreeId: string;
  }) => Promise<{ success: boolean; error?: string }>;
  worktreeGet: (args: {
    worktreeId: string;
  }) => Promise<{ success: boolean; worktree?: any; error?: string }>;
  worktreeGetAll: () => Promise<{
    success: boolean;
    worktrees?: any[];
    error?: string;
  }>;

  // Worktree pool (reserve) management for instant task creation
  worktreeEnsureReserve: (args: {
    projectId: string;
    projectPath: string;
    baseRef?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  worktreeHasReserve: (args: {
    projectId: string;
  }) => Promise<{ success: boolean; hasReserve?: boolean; error?: string }>;
  worktreeClaimReserve: (args: {
    projectId: string;
    projectPath: string;
    taskName: string;
    baseRef?: string;
  }) => Promise<{
    success: boolean;
    worktree?: any;
    needsBaseRefSwitch?: boolean;
    error?: string;
  }>;
  worktreeRemoveReserve: (args: {
    projectId: string;
  }) => Promise<{ success: boolean; error?: string }>;

  // Multi-repo worktree management
  worktreeCreateMultiRepo: (args: {
    projectPath: string;
    projectId: string;
    taskName: string;
    subRepos: Array<{
      path: string;
      name: string;
      relativePath: string;
      gitInfo: { isGitRepo: boolean; remote?: string; branch?: string; baseRef?: string };
    }>;
    selectedRepos: string[];
    baseRef?: string;
  }) => Promise<{
    success: boolean;
    compositeWorktreePath?: string;
    repoMappings?: Array<{
      relativePath: string;
      originalPath: string;
      targetPath: string;
      isWorktree: boolean;
      branch?: string;
    }>;
    error?: string;
  }>;
  worktreeRemoveMultiRepo: (args: {
    compositeWorktreePath: string;
    subRepos: Array<{
      path: string;
      name: string;
      relativePath: string;
      gitInfo: { isGitRepo: boolean; remote?: string; branch?: string; baseRef?: string };
    }>;
  }) => Promise<{ success: boolean; error?: string }>;

  // Lifecycle scripts
  lifecycleGetScript: (args: {
    projectPath: string;
    phase: 'setup' | 'run' | 'teardown';
  }) => Promise<{ success: boolean; script?: string | null; error?: string }>;
  lifecycleSetup: (args: {
    taskId: string;
    taskPath: string;
    projectPath: string;
  }) => Promise<{ success: boolean; skipped?: boolean; error?: string }>;
  lifecycleRunStart: (args: {
    taskId: string;
    taskPath: string;
    projectPath: string;
  }) => Promise<{ success: boolean; skipped?: boolean; error?: string }>;
  lifecycleRunStop: (args: {
    taskId: string;
  }) => Promise<{ success: boolean; skipped?: boolean; error?: string }>;
  lifecycleTeardown: (args: {
    taskId: string;
    taskPath: string;
    projectPath: string;
  }) => Promise<{ success: boolean; skipped?: boolean; error?: string }>;
  lifecycleGetState: (args: { taskId: string }) => Promise<{
    success: boolean;
    state?: {
      taskId: string;
      setup: {
        status: 'idle' | 'running' | 'succeeded' | 'failed';
        startedAt?: string;
        finishedAt?: string;
        exitCode?: number | null;
        error?: string | null;
      };
      run: {
        status: 'idle' | 'running' | 'succeeded' | 'failed';
        startedAt?: string;
        finishedAt?: string;
        exitCode?: number | null;
        error?: string | null;
        pid?: number | null;
      };
      teardown: {
        status: 'idle' | 'running' | 'succeeded' | 'failed';
        startedAt?: string;
        finishedAt?: string;
        exitCode?: number | null;
        error?: string | null;
      };
    };
    error?: string;
  }>;
  lifecycleClearTask: (args: { taskId: string }) => Promise<{ success: boolean; error?: string }>;
  onLifecycleEvent: (listener: (data: any) => void) => () => void;

  // Project management
  openProject: () => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;
  getProjectSettings: (projectId: string) => Promise<{
    success: boolean;
    settings?: ProjectSettingsPayload;
    error?: string;
  }>;
  updateProjectSettings: (args: { projectId: string; baseRef: string }) => Promise<{
    success: boolean;
    settings?: ProjectSettingsPayload;
    error?: string;
  }>;
  getGitInfo: (projectPath: string) => Promise<{
    isGitRepo: boolean;
    remote?: string;
    branch?: string;
    baseRef?: string;
    upstream?: string;
    aheadCount?: number;
    behindCount?: number;
    path?: string;
    error?: string;
  }>;
  detectSubRepos: (projectPath: string) => Promise<{
    success: boolean;
    subRepos: Array<{
      path: string;
      name: string;
      relativePath: string;
      gitInfo: {
        isGitRepo: boolean;
        remote?: string;
        branch?: string;
        baseRef?: string;
      };
    }>;
    error?: string;
  }>;
  listRemoteBranches: (args: { projectPath: string; remote?: string }) => Promise<{
    success: boolean;
    branches?: Array<{ ref: string; remote: string; branch: string; label: string }>;
    error?: string;
  }>;
  createPullRequest: (args: {
    taskPath: string;
    title?: string;
    body?: string;
    base?: string;
    head?: string;
    draft?: boolean;
    web?: boolean;
    fill?: boolean;
  }) => Promise<{
    success: boolean;
    url?: string;
    output?: string;
    error?: string;
  }>;
  mergeToMain: (args: { taskPath: string }) => Promise<{
    success: boolean;
    output?: string;
    prUrl?: string;
    error?: string;
  }>;
  connectToGitHub: (projectPath: string) => Promise<{
    success: boolean;
    repository?: string;
    branch?: string;
    error?: string;
  }>;
  getProviderStatuses?: (opts?: {
    refresh?: boolean;
    providers?: string[];
    providerId?: string;
  }) => Promise<{
    success: boolean;
    statuses?: Record<
      string,
      { installed: boolean; path?: string | null; version?: string | null; lastChecked: number }
    >;
    error?: string;
  }>;
  onProviderStatusUpdated?: (
    listener: (data: { providerId: string; status: any }) => void
  ) => () => void;
  // Telemetry
  captureTelemetry: (
    event: string,
    properties?: Record<string, any>
  ) => Promise<{ success: boolean; disabled?: boolean; error?: string }>;
  getTelemetryStatus: () => Promise<{
    success: boolean;
    status?: {
      enabled: boolean;
      envDisabled: boolean;
      userOptOut: boolean;
      hasKeyAndHost: boolean;
      onboardingSeen?: boolean;
    };
    error?: string;
  }>;
  setTelemetryEnabled: (enabled: boolean) => Promise<{
    success: boolean;
    status?: {
      enabled: boolean;
      envDisabled: boolean;
      userOptOut: boolean;
      hasKeyAndHost: boolean;
      onboardingSeen?: boolean;
    };
    error?: string;
  }>;

  // Filesystem
  fsList: (
    root: string,
    opts?: { includeDirs?: boolean; maxEntries?: number; timeBudgetMs?: number }
  ) => Promise<{
    success: boolean;
    items?: Array<{ path: string; type: 'file' | 'dir' }>;
    error?: string;
    canceled?: boolean;
    truncated?: boolean;
    reason?: string;
    durationMs?: number;
  }>;
  fsReaddir: (dirPath: string) => Promise<{
    success: boolean;
    items?: Array<{ name: string; type: 'file' | 'dir' }>;
    error?: string;
  }>;
  fsRead: (
    root: string,
    relPath: string,
    maxBytes?: number
  ) => Promise<{
    success: boolean;
    path?: string;
    size?: number;
    truncated?: boolean;
    content?: string;
    error?: string;
  }>;
  fsSearchContent: (
    root: string,
    query: string,
    options?: {
      caseSensitive?: boolean;
      maxResults?: number;
      fileExtensions?: string[];
    }
  ) => Promise<{
    success: boolean;
    results?: Array<{
      file: string;
      matches: Array<{
        line: number;
        column: number;
        text: string;
        preview: string;
      }>;
    }>;
    error?: string;
  }>;
  fsCheckIgnored: (
    rootPath: string,
    paths: string[]
  ) => Promise<{ success: boolean; ignoredPaths?: string[]; error?: string }>;

  // GitHub integration
  githubAuth: () => Promise<{
    success: boolean;
    token?: string;
    user?: any;
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
  }>;
  githubCancelAuth: () => Promise<{ success: boolean; error?: string }>;
  onGithubAuthDeviceCode: (
    callback: (data: {
      userCode: string;
      verificationUri: string;
      expiresIn: number;
      interval: number;
    }) => void
  ) => () => void;
  onGithubAuthPolling: (callback: (data: { status: string }) => void) => () => void;
  onGithubAuthSlowDown: (callback: (data: { newInterval: number }) => void) => () => void;
  onGithubAuthSuccess: (callback: (data: { token: string; user: any }) => void) => () => void;
  onGithubAuthError: (callback: (data: { error: string; message: string }) => void) => () => void;
  onGithubAuthCancelled: (callback: () => void) => () => void;
  onGithubAuthUserUpdated: (callback: (data: { user: any }) => void) => () => void;
  githubIsAuthenticated: () => Promise<boolean>;
  githubGetUser: () => Promise<any>;
  githubGetRepositories: () => Promise<any[]>;
  githubCloneRepository: (
    repoUrl: string,
    localPath: string
  ) => Promise<{ success: boolean; error?: string }>;
  githubGetStatus?: () => Promise<{
    installed: boolean;
    authenticated: boolean;
    user?: any;
  }>;
  githubCheckCLIInstalled?: () => Promise<boolean>;
  githubInstallCLI?: () => Promise<{ success: boolean; error?: string }>;
  githubListPullRequests: (
    projectPath: string
  ) => Promise<{ success: boolean; prs?: any[]; error?: string }>;
  githubCreatePullRequestWorktree: (args: {
    projectPath: string;
    projectId: string;
    prNumber: number;
    prTitle?: string;
    taskName?: string;
    branchName?: string;
  }) => Promise<{
    success: boolean;
    worktree?: any;
    branchName?: string;
    taskName?: string;
    error?: string;
  }>;
  githubLogout: () => Promise<void>;
  // GitHub issues
  githubIssuesList?: (
    projectPath: string,
    limit?: number
  ) => Promise<{ success: boolean; issues?: any[]; error?: string }>;
  githubIssuesSearch?: (
    projectPath: string,
    searchTerm: string,
    limit?: number
  ) => Promise<{ success: boolean; issues?: any[]; error?: string }>;
  githubIssueGet?: (
    projectPath: string,
    number: number
  ) => Promise<{ success: boolean; issue?: any; error?: string }>;

  // Linear integration
  linearCheckConnection?: () => Promise<{
    connected: boolean;
    taskName?: string;
    error?: string;
  }>;
  linearSaveToken?: (token: string) => Promise<{
    success: boolean;
    taskName?: string;
    error?: string;
  }>;
  linearClearToken?: () => Promise<{
    success: boolean;
    error?: string;
  }>;
  linearInitialFetch?: (limit?: number) => Promise<{
    success: boolean;
    issues?: any[];
    error?: string;
  }>;
  linearSearchIssues?: (
    searchTerm: string,
    limit?: number
  ) => Promise<{
    success: boolean;
    issues?: any[];
    error?: string;
  }>;

  // Database operations
  getProjects: () => Promise<any[]>;
  saveProject: (project: any) => Promise<{ success: boolean; error?: string }>;
  updateProjectOrder: (projectIds: string[]) => Promise<{ success: boolean; error?: string }>;
  // Project groups
  getProjectGroups: () => Promise<{
    success: boolean;
    groups?: Array<{
      id: string;
      name: string;
      displayOrder: number;
      isCollapsed: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    error?: string;
  }>;
  createProjectGroup: (name: string) => Promise<{
    success: boolean;
    group?: {
      id: string;
      name: string;
      displayOrder: number;
      isCollapsed: boolean;
      createdAt: string;
      updatedAt: string;
    };
    error?: string;
  }>;
  renameProjectGroup: (args: {
    id: string;
    name: string;
  }) => Promise<{ success: boolean; error?: string }>;
  deleteProjectGroup: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateProjectGroupOrder: (groupIds: string[]) => Promise<{ success: boolean; error?: string }>;
  setProjectGroup: (args: {
    projectId: string;
    groupId: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
  toggleProjectGroupCollapsed: (args: {
    id: string;
    isCollapsed: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  // Workspaces
  getWorkspaces: () => Promise<{
    success: boolean;
    workspaces?: Array<{
      id: string;
      name: string;
      color: string;
      emoji: string | null;
      displayOrder: number;
      isDefault: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    error?: string;
  }>;
  createWorkspace: (args: { name: string; color?: string }) => Promise<{
    success: boolean;
    workspace?: {
      id: string;
      name: string;
      color: string;
      emoji: string | null;
      displayOrder: number;
      isDefault: boolean;
      createdAt: string;
      updatedAt: string;
    };
    error?: string;
  }>;
  renameWorkspace: (args: {
    id: string;
    name: string;
  }) => Promise<{ success: boolean; error?: string }>;
  deleteWorkspace: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateWorkspaceOrder: (workspaceIds: string[]) => Promise<{ success: boolean; error?: string }>;
  updateWorkspaceColor: (args: {
    id: string;
    color: string;
  }) => Promise<{ success: boolean; error?: string }>;
  updateWorkspaceEmoji: (args: {
    id: string;
    emoji: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
  setProjectWorkspace: (args: {
    projectId: string;
    workspaceId: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
  getTasks: (projectId?: string) => Promise<any[]>;
  saveTask: (task: any) => Promise<{ success: boolean; error?: string }>;
  deleteProject: (projectId: string) => Promise<{ success: boolean; error?: string }>;
  renameProject: (args: {
    projectId: string;
    newName: string;
  }) => Promise<{ success: boolean; project?: any; error?: string }>;
  deleteTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  archiveTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  restoreTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  getArchivedTasks: (projectId?: string) => Promise<any[]>;

  // Message operations
  saveMessage: (message: any) => Promise<{ success: boolean; error?: string }>;
  getMessages: (
    conversationId: string
  ) => Promise<{ success: boolean; messages?: any[]; error?: string }>;
  getOrCreateDefaultConversation: (
    taskId: string
  ) => Promise<{ success: boolean; conversation?: any; error?: string }>;

  // Debug helpers
  debugAppendLog: (
    filePath: string,
    content: string,
    options?: { reset?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;

  // Line comments
  lineCommentsGet: (args: { taskId: string; filePath?: string }) => Promise<{
    success: boolean;
    comments?: LineComment[];
    error?: string;
  }>;
  lineCommentsCreate: (args: {
    taskId: string;
    filePath: string;
    lineNumber: number;
    lineContent?: string;
    content: string;
  }) => Promise<{
    success: boolean;
    id?: string;
    error?: string;
  }>;
  lineCommentsUpdate: (args: { id: string; content: string }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  lineCommentsDelete: (id: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  lineCommentsGetFormatted: (taskId: string) => Promise<{
    success: boolean;
    formatted?: string;
    error?: string;
  }>;
  lineCommentsMarkSent: (commentIds: string[]) => Promise<{
    success: boolean;
    error?: string;
  }>;
  lineCommentsGetUnsent: (taskId: string) => Promise<{
    success: boolean;
    comments?: LineComment[];
    error?: string;
  }>;

  // App state
  getAppState(): Promise<{
    success: boolean;
    data?: {
      activeProjectId: string | null;
      activeTaskId: string | null;
      activeWorkspaceId: string | null;
      prMode: string | null;
      prDraft: boolean;
    };
    error?: string;
  }>;
  updateAppState(partial: {
    activeProjectId?: string | null;
    activeTaskId?: string | null;
    activeWorkspaceId?: string | null;
    prMode?: string | null;
    prDraft?: boolean;
  }): Promise<{ success: boolean; error?: string }>;
  // Task pinned/agent
  setTaskPinned(args: {
    taskId: string;
    pinned: boolean;
  }): Promise<{ success: boolean; error?: string }>;
  getPinnedTaskIds(): Promise<{ success: boolean; data?: string[]; error?: string }>;
  setTaskAgent(args: {
    taskId: string;
    lastAgent?: string | null;
    lockedAgent?: string | null;
  }): Promise<{ success: boolean; error?: string }>;
  setTaskInitialPromptSent(args: {
    taskId: string;
    sent: boolean;
  }): Promise<{ success: boolean; error?: string }>;
  // Terminal sessions
  getTerminalSessions(taskKey: string): Promise<{
    success: boolean;
    data?: Array<{
      id: string;
      taskKey: string;
      terminalId: string;
      title: string;
      cwd: string | null;
      isActive: boolean;
      displayOrder: number;
      createdAt: string;
    }>;
    error?: string;
  }>;
  saveTerminalSessions(args: {
    taskKey: string;
    sessions: Array<{
      id: string;
      terminalId: string;
      title: string;
      cwd?: string | null;
      isActive: boolean;
      displayOrder: number;
    }>;
  }): Promise<{ success: boolean; error?: string }>;
  deleteTerminalSessions(taskKey: string): Promise<{ success: boolean; error?: string }>;
  // Kanban
  getKanbanStatuses(): Promise<{
    success: boolean;
    data?: Array<{ taskId: string; status: string }>;
    error?: string;
  }>;
  setKanbanStatus(args: {
    taskId: string;
    status: string;
  }): Promise<{ success: boolean; error?: string }>;

  // MCP server management
  mcpGetGlobalServers: () => Promise<{
    success: boolean;
    data?: import('@shared/mcp/types').McpServerConfig[];
    error?: string;
  }>;
  mcpSaveGlobalServers: (servers: import('@shared/mcp/types').McpServerConfig[]) => Promise<{
    success: boolean;
    data?: import('@shared/mcp/types').McpServerConfig[];
    error?: string;
  }>;
  mcpGetProjectServers: (projectPath: string) => Promise<{
    success: boolean;
    data?: import('@shared/mcp/types').McpServerConfig[];
    error?: string;
  }>;
  mcpSaveProjectServers: (
    projectPath: string,
    servers: import('@shared/mcp/types').McpServerConfig[]
  ) => Promise<{
    success: boolean;
    data?: import('@shared/mcp/types').McpServerConfig[];
    error?: string;
  }>;
  mcpDetectAgentServers: (args?: {
    projectPath?: string;
  }) => Promise<{
    success: boolean;
    data?: AgentMcpDiscovery[];
    error?: string;
  }>;
  mcpSearchRegistry: (args: {
    query: string;
    limit?: number;
    cursor?: string;
  }) => Promise<{
    success: boolean;
    data?: {
      servers: McpRegistryServer[];
      metadata: { count: number; nextCursor?: string };
    };
    error?: string;
  }>;

  // Skills management
  skillsGetCatalog: () => Promise<{
    success: boolean;
    data?: import('@shared/skills/types').CatalogIndex;
    error?: string;
  }>;
  skillsRefreshCatalog: () => Promise<{
    success: boolean;
    data?: import('@shared/skills/types').CatalogIndex;
    error?: string;
  }>;
  skillsInstall: (args: { skillId: string }) => Promise<{
    success: boolean;
    data?: import('@shared/skills/types').CatalogSkill;
    error?: string;
  }>;
  skillsUninstall: (args: { skillId: string }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  skillsGetDetail: (args: { skillId: string }) => Promise<{
    success: boolean;
    data?: import('@shared/skills/types').CatalogSkill;
    error?: string;
  }>;
  skillsGetDetectedAgents: () => Promise<{
    success: boolean;
    data?: import('@shared/skills/types').DetectedAgent[];
    error?: string;
  }>;
  skillsCreate: (args: { name: string; description: string }) => Promise<{
    success: boolean;
    data?: import('@shared/skills/types').CatalogSkill;
    error?: string;
  }>;

  // Script runner
  getScripts: (projectPath: string) => Promise<{
    success: boolean;
    data?: { name: string; command: string }[];
    error?: string;
  }>;
  runScript: (
    projectPath: string,
    scriptName: string
  ) => Promise<{
    success: boolean;
    data?: { ptyId: string };
    error?: string;
  }>;
  stopScript: (ptyId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  getRunningScripts: (projectPath: string) => Promise<{
    success: boolean;
    data?: { scriptName: string; ptyId: string }[];
    error?: string;
  }>;
  onScriptData: (ptyId: string, listener: (data: string) => void) => () => void;
  onScriptExit: (
    ptyId: string,
    listener: (info: { exitCode: number; signal?: number }) => void
  ) => () => void;
  onScriptStarted: (
    listener: (data: { ptyId: string; scriptName: string; projectPath: string }) => void
  ) => () => void;
  scriptInput: (args: { ptyId: string; data: string }) => void;
  scriptResize: (args: { ptyId: string; cols: number; rows: number }) => void;

  // ACP Registry — browse, install, uninstall agents
  acpRegistryFetch: () => Promise<{
    success: boolean;
    data?: import('@shared/acpRegistry').AcpRegistryEntry[];
    error?: string;
  }>;
  acpRegistryGetInstalled: () => Promise<{
    success: boolean;
    data?: import('@shared/acpRegistry').InstalledAcpAgent[];
    error?: string;
  }>;
  acpRegistryInstall: (args: {
    agentId: string;
    method?: 'npx' | 'binary';
  }) => Promise<{ success: boolean; error?: string }>;
  acpRegistryUninstall: (args: {
    agentId: string;
  }) => Promise<{ success: boolean; error?: string }>;

  // ACP (Agent Communication Protocol) session management
  acpStart: (args: {
    conversationId: string;
    providerId: string;
    cwd: string;
    env?: Record<string, string>;
    acpSessionId?: string;
    projectPath?: string;
  }) => Promise<{
    success: boolean;
    sessionKey?: string;
    acpSessionId?: string;
    modes?: AcpSessionModes;
    models?: AcpSessionModels;
    historyEvents?: AcpUpdateEvent[];
    resumed?: boolean;
    error?: string;
  }>;
  acpPrompt: (args: {
    sessionKey: string;
    message: string;
  }) => Promise<{ success: boolean; error?: string }>;
  acpCancel: (args: { sessionKey: string }) => Promise<{ success: boolean; error?: string }>;
  acpKill: (args: { sessionKey: string }) => Promise<{ success: boolean; error?: string }>;
  acpDetach: (args: { sessionKey: string }) => Promise<{ success: boolean; error?: string }>;
  acpApprove: (args: {
    sessionKey: string;
    toolCallId: string;
    approved: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  acpSetMode: (args: {
    sessionKey: string;
    mode: string;
  }) => Promise<{ success: boolean; error?: string }>;
  acpSetModel: (args: {
    sessionKey: string;
    modelId: string;
  }) => Promise<{ success: boolean; error?: string }>;
  acpSetConfigOption: (args: {
    sessionKey: string;
    optionId: string;
    value: string;
  }) => Promise<{ success: boolean; error?: string }>;
  acpListSessions: (args: {
    sessionKey: string;
  }) => Promise<{ success: boolean; sessions?: any[]; error?: string }>;
  acpForkSession: (args: {
    sessionKey: string;
  }) => Promise<{ success: boolean; newSessionId?: string; error?: string }>;
  acpExtMethod: (args: {
    sessionKey: string;
    method: string;
    params?: Record<string, unknown>;
  }) => Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }>;
  acpGetClaudeUsageLimits: () => Promise<{
    success: boolean;
    data?: ClaudeUsageLimits | null;
    error?: string;
  }>;
  onAcpUpdate: (sessionKey: string, listener: (event: AcpUpdateEvent) => void) => () => void;
  onAcpStatus: (sessionKey: string, listener: (status: AcpSessionStatus) => void) => () => void;

  // Model metadata
  modelMetadataGet: (args: {
    acpModelId: string;
    providerId: string;
  }) => Promise<{ success: boolean; data?: ModelMetadataResult | null; error?: string }>;
  modelMetadataGetUptime: (args: {
    providerId: string;
  }) => Promise<{ success: boolean; data?: UptimeDayData[]; error?: string }>;
  modelMetadataGetStatus: (args: {
    providerId: string;
  }) => Promise<{ success: boolean; data?: ProviderStatusResult | null; error?: string }>;
}
import type { TerminalSnapshotPayload } from '#types/terminalSnapshot';
import type { OpenInAppId } from '#shared/openInApps';
