import { ipcMain, dialog } from 'electron';
import { join } from 'path';
import * as fs from 'fs';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { getMainWindow } from '../app/window';
import { errorTracking } from '../errorTracking';
import { databaseService } from '../services/DatabaseService';
import { log } from '../lib/logger';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Helper to resolve git binary path
function resolveGitBin(): string {
  const fromEnv = (process.env.GIT_PATH || '').trim();
  const candidates = [
    fromEnv,
    '/opt/homebrew/bin/git',
    '/usr/local/bin/git',
    '/usr/bin/git',
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  return 'git';
}

const GIT = resolveGitBin();

// Types for Update Project feature
interface RepoStatus {
  path: string;
  name: string;
  isMainRepo: boolean;
  currentBranch: string;
  trackingBranch?: string;
  ahead: number;
  behind: number;
  isDirty: boolean;
  dirtyFiles?: number;
}

// SubRepo type matches the one in DatabaseService

// Helper to get repo status for a single path
async function getRepoStatusForPath(
  repoPath: string,
  name: string,
  isMainRepo: boolean
): Promise<RepoStatus> {
  const result: RepoStatus = {
    path: repoPath,
    name,
    isMainRepo,
    currentBranch: '',
    ahead: 0,
    behind: 0,
    isDirty: false,
  };

  try {
    // Get current branch
    const { stdout: branchOut } = await execFileAsync(GIT, ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoPath,
    });
    result.currentBranch = branchOut.trim();

    // Get tracking branch
    try {
      const { stdout: trackingOut } = await execFileAsync(
        GIT,
        ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
        { cwd: repoPath }
      );
      result.trackingBranch = trackingOut.trim();
    } catch {
      // No tracking branch set
    }

    // Get ahead/behind counts (fetch first to get accurate counts)
    if (result.trackingBranch) {
      try {
        const { stdout: countOut } = await execFileAsync(
          GIT,
          ['rev-list', '--left-right', '--count', `HEAD...@{u}`],
          { cwd: repoPath }
        );
        const [ahead, behind] = countOut.trim().split(/\s+/);
        result.ahead = parseInt(ahead || '0', 10) || 0;
        result.behind = parseInt(behind || '0', 10) || 0;
      } catch {
        // Failed to get counts
      }
    }

    // Check if dirty (uncommitted changes)
    try {
      const { stdout: statusOut } = await execFileAsync(GIT, ['status', '--porcelain'], {
        cwd: repoPath,
      });
      const lines = statusOut
        .trim()
        .split('\n')
        .filter((l) => l.trim());
      result.isDirty = lines.length > 0;
      result.dirtyFiles = lines.length;
    } catch {
      // Failed to get status
    }
  } catch (error) {
    log.error(`Failed to get repo status for ${repoPath}:`, error);
  }

  return result;
}
const DEFAULT_REMOTE = 'origin';
const DEFAULT_BRANCH = 'main';

const normalizeRemoteName = (remote?: string | null) => {
  if (!remote) return DEFAULT_REMOTE;
  const trimmed = remote.trim();
  if (!trimmed) return ''; // Empty string indicates no remote (local-only repo)
  if (/^[A-Za-z0-9._-]+$/.test(trimmed) && !trimmed.includes('://')) {
    return trimmed;
  }
  return DEFAULT_REMOTE;
};

const computeBaseRef = (remote?: string | null, branch?: string | null) => {
  const remoteName = normalizeRemoteName(remote);
  if (branch && branch.trim().length > 0) {
    const trimmed = branch.trim();
    if (trimmed.includes('/')) return trimmed;
    // Prepend remote only if one exists
    return remoteName ? `${remoteName}/${trimmed}` : trimmed;
  }
  // Default: use origin/main if remote exists, otherwise just 'main'
  return remoteName ? `${remoteName}/${DEFAULT_BRANCH}` : DEFAULT_BRANCH;
};

const detectDefaultBranch = async (projectPath: string, remote?: string | null) => {
  const remoteName = normalizeRemoteName(remote);
  // If no remote, try to detect the current local branch
  if (!remoteName) {
    try {
      const { stdout } = await execAsync('git branch --show-current', {
        cwd: projectPath,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
  // Try to get remote's default branch
  try {
    const { stdout } = await execFileAsync(GIT, ['remote', 'show', remoteName], {
      cwd: projectPath,
    });
    const match = stdout.match(/HEAD branch:\s*(\S+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

export function registerProjectIpc() {
  ipcMain.handle('project:open', async () => {
    try {
      const win = getMainWindow();
      if (!win) return { success: false, error: 'No active window' };
      const result = await dialog.showOpenDialog(win, {
        title: 'Open Project',
        properties: ['openDirectory'],
        message: 'Select a project directory to open',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No directory selected' };
      }

      const projectPath = result.filePaths[0];
      return { success: true, path: projectPath };
    } catch (error) {
      console.error('Failed to open project:', error);

      // Track project open errors
      await errorTracking.captureProjectError(error, 'open');

      return { success: false, error: 'Failed to open project directory' };
    }
  });

  ipcMain.handle('git:getInfo', async (_, projectPath: string) => {
    try {
      const resolveRealPath = async (target: string) => {
        try {
          return await fs.promises.realpath(target);
        } catch {
          return target;
        }
      };

      const resolvedProjectPath = await resolveRealPath(projectPath);
      const gitPath = join(resolvedProjectPath, '.git');
      const isGitRepo = fs.existsSync(gitPath);

      if (!isGitRepo) {
        return { isGitRepo: false, path: resolvedProjectPath };
      }

      // Get remote URL
      let remote: string | null = null;
      try {
        const { stdout } = await execAsync('git remote get-url origin', {
          cwd: resolvedProjectPath,
        });
        remote = stdout.trim();
      } catch {}

      // Get current branch
      let branch: string | null = null;
      try {
        const { stdout } = await execAsync('git branch --show-current', {
          cwd: resolvedProjectPath,
        });
        branch = stdout.trim();
      } catch {}

      let defaultBranch: string | null = null;
      if (!branch) {
        defaultBranch = await detectDefaultBranch(resolvedProjectPath, remote);
      }

      let upstream: string | null = null;
      let aheadCount: number | null = null;
      let behindCount: number | null = null;
      try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
          cwd: resolvedProjectPath,
        });
        upstream = stdout.trim();
      } catch {}

      if (upstream) {
        try {
          const { stdout } = await execAsync('git rev-list --left-right --count HEAD...@{u}', {
            cwd: resolvedProjectPath,
          });
          const [ahead, behind] = stdout.trim().split(/\s+/);
          aheadCount = Number.parseInt(ahead, 10);
          behindCount = Number.parseInt(behind, 10);
        } catch {}
      }

      let rootPath: string | null = null;
      try {
        const { stdout } = await execAsync('git rev-parse --show-toplevel', {
          cwd: resolvedProjectPath,
        });
        const trimmed = stdout.trim();
        if (trimmed) {
          rootPath = await resolveRealPath(trimmed);
        }
      } catch {}

      const baseRef = computeBaseRef(remote, branch || defaultBranch);

      const safeAhead =
        typeof aheadCount === 'number' && Number.isFinite(aheadCount) ? aheadCount : undefined;
      const safeBehind =
        typeof behindCount === 'number' && Number.isFinite(behindCount) ? behindCount : undefined;

      return {
        isGitRepo: true,
        remote,
        branch,
        baseRef,
        upstream,
        aheadCount: safeAhead,
        behindCount: safeBehind,
        path: resolvedProjectPath,
        rootPath: rootPath || resolvedProjectPath,
      };
    } catch (error) {
      console.error('Failed to get Git info:', error);
      return { isGitRepo: false, error: 'Failed to read Git information', path: projectPath };
    }
  });

  // Detect sub-repositories in a multi-repo project folder
  /** Fetch git remote + branch for a directory in parallel. */
  async function getGitInfoForPath(
    cwd: string
  ): Promise<{ remote?: string; branch?: string; baseRef?: string }> {
    const [remoteResult, branchResult] = await Promise.all([
      execAsync('git remote get-url origin', { cwd }).catch(() => ({ stdout: '' })),
      execAsync('git branch --show-current', { cwd }).catch(() => ({ stdout: '' })),
    ]);
    const remote = remoteResult.stdout.trim() || undefined;
    const branch = branchResult.stdout.trim() || undefined;
    const baseRef = branch || remote ? computeBaseRef(remote, branch) : undefined;
    return { remote, branch, baseRef };
  }

  // Cache for detectSubRepos results — avoids repeated filesystem scans on rapid project clicks.
  // Same pattern as branchCache in gitIpc.ts.
  const subRepoCache = new Map<string, { result: any; fetchedAt: number }>();
  const SUB_REPO_CACHE_TTL_MS = 30_000;

  ipcMain.handle('git:detectSubRepos', async (_, projectPath: string) => {
    try {
      const cached = subRepoCache.get(projectPath);
      if (cached && Date.now() - cached.fetchedAt < SUB_REPO_CACHE_TTL_MS) {
        return cached.result;
      }
      const resolvedProjectPath = await fs.promises.realpath(projectPath).catch(() => projectPath);

      // Fetch root git info and directory entries in parallel
      const rootGitPath = join(resolvedProjectPath, '.git');
      const hasRootGit = fs.existsSync(rootGitPath);

      const [rootInfo, entries] = await Promise.all([
        hasRootGit ? getGitInfoForPath(resolvedProjectPath) : Promise.resolve(undefined),
        fs.promises.readdir(resolvedProjectPath, { withFileTypes: true }),
      ]);

      const rootGitInfo = hasRootGit && rootInfo
        ? { isGitRepo: true, ...rootInfo }
        : undefined;

      // Collect sub-repo paths first (cheap fs.existsSync), then fetch git info in parallel
      const subRepoPaths: Array<{ subPath: string; name: string }> = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const subPath = join(resolvedProjectPath, entry.name);
        if (fs.existsSync(join(subPath, '.git'))) {
          subRepoPaths.push({ subPath, name: entry.name });
        }
      }

      // Parallel git info fetch for all sub-repos
      const subRepoInfos = await Promise.all(
        subRepoPaths.map(({ subPath }) => getGitInfoForPath(subPath))
      );

      const subRepos = subRepoPaths.map(({ subPath, name }, i) => ({
        path: subPath,
        name,
        relativePath: name,
        gitInfo: {
          isGitRepo: true,
          ...subRepoInfos[i],
        },
      }));

      const result = { success: true, subRepos, rootGitInfo };
      subRepoCache.set(projectPath, { result, fetchedAt: Date.now() });
      return result;
    } catch (error) {
      console.error('Failed to detect sub-repos:', error);
      return { success: false, error: 'Failed to detect sub-repositories', subRepos: [] };
    }
  });

  // ============================================================================
  // Update Project Feature - IPC Handlers
  // ============================================================================

  /**
   * Get status for main repo and all sub-repos of a project
   * Returns current branch, ahead/behind counts, and dirty state
   */
  ipcMain.handle('project:getRepoStatus', async (_, args: { projectId: string }) => {
    const { projectId } = args;
    try {
      // Get project from database
      const project = await databaseService.getProjectById(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Collect all repo paths, then fetch status in parallel
      const statusPromises: Array<Promise<RepoStatus>> = [];

      const mainGitPath = join(project.path, '.git');
      const mainIsGitRepo = fs.existsSync(mainGitPath);

      if (mainIsGitRepo) {
        statusPromises.push(getRepoStatusForPath(project.path, project.name, true));
      }

      if (project.subRepos && Array.isArray(project.subRepos)) {
        for (const subRepo of project.subRepos) {
          if (subRepo.gitInfo?.isGitRepo && fs.existsSync(subRepo.path)) {
            statusPromises.push(getRepoStatusForPath(subRepo.path, subRepo.name, false));
          }
        }
      }

      let repos: RepoStatus[] = [];

      if (statusPromises.length > 0) {
        repos = await Promise.all(statusPromises);
      } else if (!mainIsGitRepo) {
        // If no repos found, try to detect sub-repos dynamically
        try {
          const entries = await fs.promises.readdir(project.path, { withFileTypes: true });
          const dynamicPromises: Array<Promise<RepoStatus>> = [];
          let isFirst = true;
          for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
            const subPath = join(project.path, entry.name);
            if (fs.existsSync(join(subPath, '.git'))) {
              dynamicPromises.push(getRepoStatusForPath(subPath, entry.name, isFirst));
              isFirst = false;
            }
          }
          if (dynamicPromises.length > 0) {
            repos = await Promise.all(dynamicPromises);
          }
        } catch {
          // Failed to scan directory
        }
      }

      return { success: true, data: { repos } };
    } catch (error) {
      log.error('project:getRepoStatus failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get repo status',
      };
    }
  });

  /**
   * Update (fetch + pull) multiple repos
   * Optionally stash dirty changes before pulling
   */
  ipcMain.handle(
    'project:updateRepos',
    async (
      _,
      args: {
        projectId: string;
        repoPaths?: string[];
        stashIfDirty?: boolean;
      }
    ) => {
      const { projectId, repoPaths, stashIfDirty = false } = args;
      try {
        // Get project to find all repos if repoPaths not specified
        const project = await databaseService.getProjectById(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        // Determine which repos to update
        const pathsToUpdate: string[] = repoPaths ? [...repoPaths] : [];

        if (pathsToUpdate.length === 0) {
          // Update all repos
          const mainGitPath = join(project.path, '.git');
          if (fs.existsSync(mainGitPath)) {
            pathsToUpdate.push(project.path);
          }

          if (project.subRepos && Array.isArray(project.subRepos)) {
            for (const sr of project.subRepos) {
              if (sr.gitInfo?.isGitRepo && fs.existsSync(sr.path)) {
                pathsToUpdate.push(sr.path);
              }
            }
          }
        }

        const results: Array<{
          path: string;
          success: boolean;
          error?: string;
          stashed?: boolean;
        }> = [];

        for (const repoPath of pathsToUpdate) {
          const result: { path: string; success: boolean; error?: string; stashed?: boolean } = {
            path: repoPath,
            success: false,
          };

          try {
            // Check if dirty
            const { stdout: statusOut } = await execFileAsync(GIT, ['status', '--porcelain'], {
              cwd: repoPath,
            });
            const isDirty = statusOut.trim().length > 0;

            // Stash if dirty and requested
            if (isDirty && stashIfDirty) {
              await execFileAsync(GIT, ['stash', 'push', '-m', 'valkyr-auto-stash'], {
                cwd: repoPath,
              });
              result.stashed = true;
            } else if (isDirty && !stashIfDirty) {
              result.error = 'Repository has uncommitted changes';
              results.push(result);
              continue;
            }

            // Fetch from origin
            try {
              await execFileAsync(GIT, ['fetch', 'origin'], { cwd: repoPath });
            } catch (fetchError) {
              log.warn(`Failed to fetch for ${repoPath}:`, fetchError);
              // Continue anyway - might be a local-only repo
            }

            // Pull with fast-forward only
            try {
              await execFileAsync(GIT, ['pull', '--ff-only'], { cwd: repoPath });
              result.success = true;

              // Pop stash after successful pull
              if (result.stashed) {
                try {
                  await execFileAsync(GIT, ['stash', 'pop'], { cwd: repoPath });
                } catch (popErr) {
                  log.warn(`Stash pop had conflicts after pull for ${repoPath}:`, popErr);
                  result.error = 'Pull succeeded but stash pop had conflicts. Resolve manually.';
                }
              }
            } catch (pullError: unknown) {
              const err = pullError as { stderr?: string; message?: string };
              const errMsg = err?.stderr || err?.message || String(pullError);
              if (/not possible to fast-forward/i.test(errMsg)) {
                result.error = 'Cannot fast-forward. Branches have diverged.';
              } else if (/no tracking information/i.test(errMsg)) {
                result.error = 'No tracking branch configured';
              } else {
                result.error = errMsg;
              }

              // If we stashed, pop it back on failure
              if (result.stashed) {
                try {
                  await execFileAsync(GIT, ['stash', 'pop'], { cwd: repoPath });
                } catch {
                  log.warn(`Failed to pop stash for ${repoPath}`);
                }
              }
            }
          } catch (error: unknown) {
            result.error = error instanceof Error ? error.message : String(error);
          }

          results.push(result);
        }

        const allSuccess = results.every((r) => r.success);
        return { success: allSuccess, data: results };
      } catch (error) {
        log.error('project:updateRepos failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update repos',
        };
      }
    }
  );

  /**
   * Get all branches for a repository
   * Returns local, remote, and recently checked out branches
   */
  ipcMain.handle('project:getBranches', async (_, args: { repoPath: string }) => {
    const { repoPath } = args;
    try {
      // Verify it's a git repo
      if (!fs.existsSync(join(repoPath, '.git'))) {
        return { success: false, error: 'Not a git repository' };
      }

      // Get current branch
      const { stdout: currentOut } = await execFileAsync(
        GIT,
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: repoPath }
      );
      const current = currentOut.trim();

      // Get all local branches with tracking info
      const localBranches: Array<{
        name: string;
        tracking?: string;
        ahead?: number;
        behind?: number;
      }> = [];

      try {
        const { stdout: branchOut } = await execFileAsync(
          GIT,
          [
            'for-each-ref',
            '--format=%(refname:short)|%(upstream:short)|%(upstream:track)',
            'refs/heads/',
          ],
          { cwd: repoPath }
        );

        for (const line of branchOut.trim().split('\n')) {
          if (!line.trim()) continue;
          const [name, tracking, trackInfo] = line.split('|');
          const branch: { name: string; tracking?: string; ahead?: number; behind?: number } = {
            name,
          };

          if (tracking) {
            branch.tracking = tracking;
            // Parse track info like "[ahead 2, behind 3]" or "[ahead 2]" or "[behind 3]"
            const aheadMatch = trackInfo?.match(/ahead\s+(\d+)/);
            const behindMatch = trackInfo?.match(/behind\s+(\d+)/);
            if (aheadMatch) branch.ahead = parseInt(aheadMatch[1], 10);
            if (behindMatch) branch.behind = parseInt(behindMatch[1], 10);
          }

          localBranches.push(branch);
        }
      } catch {}

      // Get remote branches
      const remoteBranches: Array<{ name: string; lastCommit?: string }> = [];
      try {
        const { stdout: remoteOut } = await execFileAsync(
          GIT,
          ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/'],
          { cwd: repoPath }
        );

        for (const line of remoteOut.trim().split('\n')) {
          const name = line.trim();
          if (!name || name.endsWith('/HEAD')) continue;
          remoteBranches.push({ name });
        }
      } catch {}

      // Get recent branches from reflog (last 5 unique branches checked out)
      const recent: string[] = [];
      try {
        const { stdout: reflogOut } = await execFileAsync(
          GIT,
          ['reflog', '--format=%gs', '-n', '50'],
          { cwd: repoPath }
        );

        const checkoutPattern = /checkout: moving from .+ to (.+)/;
        for (const line of reflogOut.trim().split('\n')) {
          const match = line.match(checkoutPattern);
          if (match && match[1]) {
            const branchName = match[1];
            // Only add if it's a valid local branch and not already in list
            if (!recent.includes(branchName) && localBranches.some((b) => b.name === branchName)) {
              recent.push(branchName);
              if (recent.length >= 5) break;
            }
          }
        }
      } catch {}

      return {
        success: true,
        data: {
          current,
          local: localBranches,
          remote: remoteBranches,
          recent,
        },
      };
    } catch (error) {
      log.error('project:getBranches failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get branches',
      };
    }
  });

  /**
   * Switch to a different branch
   * Optionally stash changes before switching and pop after
   */
  ipcMain.handle(
    'project:switchBranch',
    async (
      _,
      args: {
        repoPath: string;
        branch: string;
        stashIfDirty?: boolean;
      }
    ) => {
      const { repoPath, branch, stashIfDirty = false } = args;
      try {
        // Verify it's a git repo
        if (!fs.existsSync(join(repoPath, '.git'))) {
          return { success: false, error: 'Not a git repository' };
        }

        // Check for uncommitted changes
        const { stdout: statusOut } = await execFileAsync(GIT, ['status', '--porcelain'], {
          cwd: repoPath,
        });
        const isDirty = statusOut.trim().length > 0;
        let stashed = false;

        if (isDirty) {
          if (stashIfDirty) {
            await execFileAsync(GIT, ['stash', 'push', '-m', 'valkyr-branch-switch'], {
              cwd: repoPath,
            });
            stashed = true;
          } else {
            return {
              success: false,
              error: 'Repository has uncommitted changes. Stash or commit them first.',
            };
          }
        }

        // Switch branch
        try {
          // Check if it's a remote branch that needs to be checked out locally
          const isRemoteBranch = branch.includes('/');
          if (isRemoteBranch) {
            // e.g., "origin/feature-x" -> checkout as "feature-x"
            const localName = branch.split('/').slice(1).join('/');
            // Validate branch name to prevent flag injection
            if (localName.startsWith('-')) {
              throw new Error(`Invalid branch name: ${localName}`);
            }
            await execFileAsync(GIT, ['checkout', '-b', localName, branch], { cwd: repoPath });
          } else {
            if (branch.startsWith('-')) {
              throw new Error(`Invalid branch name: ${branch}`);
            }
            await execFileAsync(GIT, ['checkout', branch], { cwd: repoPath });
          }
        } catch (checkoutError: unknown) {
          const err = checkoutError as { stderr?: string; message?: string };
          const errMsg = err?.stderr || err?.message || String(checkoutError);

          // If we stashed, pop it back
          if (stashed) {
            try {
              await execFileAsync(GIT, ['stash', 'pop'], { cwd: repoPath });
            } catch {}
          }

          if (/already exists/i.test(errMsg)) {
            return { success: false, error: 'Branch already exists locally' };
          }
          return { success: false, error: errMsg };
        }

        // Pop stash if we stashed
        if (stashed) {
          try {
            await execFileAsync(GIT, ['stash', 'pop'], { cwd: repoPath });
          } catch (popError: unknown) {
            // Stash pop conflicts are not fatal but should be reported
            log.warn('Stash pop had conflicts:', popError as Error);
            return {
              success: true,
              stashed: true,
              error: 'Switched branch but stash pop had conflicts. Resolve manually.',
            };
          }
        }

        return { success: true, stashed };
      } catch (error) {
        log.error('project:switchBranch failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to switch branch',
        };
      }
    }
  );
}
