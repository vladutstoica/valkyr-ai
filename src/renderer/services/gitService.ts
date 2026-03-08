/**
 * Service abstraction for git-related IPC calls.
 */

export type GetGitInfoResult = Awaited<ReturnType<typeof window.electronAPI.getGitInfo>>;
export type DetectSubReposResult = Awaited<ReturnType<typeof window.electronAPI.detectSubRepos>>;
export type GetFileDiffResult = Awaited<ReturnType<typeof window.electronAPI.getFileDiff>>;

export function getGitInfo(projectPath: string): Promise<GetGitInfoResult> {
  return window.electronAPI.getGitInfo(projectPath);
}

export function detectSubRepos(projectPath: string): Promise<DetectSubReposResult> {
  return window.electronAPI.detectSubRepos(projectPath);
}

export function getFileDiff(args: {
  taskPath: string;
  filePath: string;
  repoCwd?: string;
}): Promise<GetFileDiffResult> {
  return window.electronAPI.getFileDiff(args);
}

export function stageFile(args: {
  taskPath: string;
  filePath: string;
  repoCwd?: string;
}) {
  return window.electronAPI.stageFile(args);
}

export function stageAllFiles(args: { taskPath: string; repoCwds?: string[] }) {
  return window.electronAPI.stageAllFiles(args);
}

export function unstageFile(args: {
  taskPath: string;
  filePath: string;
  repoCwd?: string;
}) {
  return window.electronAPI.unstageFile(args);
}

export function revertFile(args: {
  taskPath: string;
  filePath: string;
  repoCwd?: string;
}) {
  return window.electronAPI.revertFile(args);
}

export function gitCommitAndPush(args: {
  taskPath: string;
  commitMessage?: string;
  createBranchIfOnDefault?: boolean;
  branchPrefix?: string;
}) {
  return window.electronAPI.gitCommitAndPush(args);
}

export function switchRepoBranch(args: {
  repoPath: string;
  branch: string;
  create?: boolean;
  stashIfDirty?: boolean;
}) {
  return window.electronAPI.switchRepoBranch(args);
}

export function renameBranch(args: {
  repoPath: string;
  oldBranch: string;
  newBranch: string;
}) {
  return window.electronAPI.renameBranch(args);
}

export function getGitStatus(
  arg:
    | string
    | { taskPath: string; repoMappings?: Array<{ relativePath: string; targetPath: string }> }
) {
  return window.electronAPI.getGitStatus(arg);
}

export function getPrStatus(args: { taskPath: string }) {
  return window.electronAPI.getPrStatus(args);
}

export function getCheckRuns(args: { taskPath: string }) {
  return window.electronAPI.getCheckRuns(args);
}

export function getPrComments(args: { taskPath: string; prNumber?: number }) {
  return window.electronAPI.getPrComments(args);
}
