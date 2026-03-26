import { app, ipcMain, BrowserWindow } from 'electron';
import { log } from '../lib/logger';
import { resolveGitBin } from '../lib/gitBin';
import {
  watchGitStatus,
  releaseGitStatusWatch,
  clearAllDebounceTimers,
  closeAllWatchers,
} from '../services/GitStatusWatcher';
import { execFile } from 'child_process';
import fs from 'node:fs';
import { promisify } from 'util';
import {
  getStatus as gitGetStatus,
  getMultiRepoStatus as gitGetMultiRepoStatus,
  getFileDiff as gitGetFileDiff,
  stageFile as gitStageFile,
  stageAllFiles as gitStageAllFiles,
  unstageFile as gitUnstageFile,
  revertFile as gitRevertFile,
} from '../services/GitService';
import type { RepoMapping } from '../services/GitService';
import { gitQueue } from '../services/GitQueue';
import {
  createPullRequest,
  getPrStatus,
  getCheckRuns,
  getPrComments,
  mergeToMain,
} from '../services/GitPrService';

const execFileAsync = promisify(execFile);

// Track windows that have close listeners
const windowCloseListeners = new Set<number>();

function registerWindowCleanup(win: BrowserWindow): void {
  if (windowCloseListeners.has(win.id)) return;
  windowCloseListeners.add(win.id);

  win.on('close', () => {
    clearAllDebounceTimers();
  });

  win.on('closed', () => {
    windowCloseListeners.delete(win.id);
  });
}

export function registerGitIpc() {
  // Register cleanup for all windows - clears debounce timers BEFORE frame is disposed
  for (const win of BrowserWindow.getAllWindows()) {
    registerWindowCleanup(win);
  }
  app.on('browser-window-created', (_, win) => {
    registerWindowCleanup(win);
  });

  function validateTaskPath(taskPath: string): void {
    if (!taskPath || typeof taskPath !== 'string') throw new Error('taskPath is required');
    if (!fs.existsSync(taskPath)) throw new Error(`Path does not exist: ${taskPath}`);
  }

  const GIT = resolveGitBin();

  ipcMain.handle('git:watch-status', async (_, taskPath: string) => {
    return watchGitStatus(taskPath);
  });

  ipcMain.handle('git:unwatch-status', async (_, taskPath: string, watchId?: string) => {
    return releaseGitStatusWatch(taskPath, watchId);
  });

  // Git: Status (moved from Codex IPC)
  ipcMain.handle(
    'git:get-status',
    async (_, arg: string | { taskPath: string; repoMappings?: RepoMapping[] }) => {
      try {
        const taskPath = typeof arg === 'string' ? arg : arg.taskPath;
        validateTaskPath(taskPath);
        const repoMappings = typeof arg === 'object' ? arg.repoMappings : undefined;

        const changes = repoMappings?.length
          ? await gitGetMultiRepoStatus(repoMappings)
          : await gitGetStatus(taskPath);
        return { success: true, changes };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Git: Per-file diff (moved from Codex IPC)
  ipcMain.handle(
    'git:get-file-diff',
    async (_, args: { taskPath: string; filePath: string; repoCwd?: string }) => {
      try {
        validateTaskPath(args.taskPath);
        const cwd = args.repoCwd || args.taskPath;
        const diff = await gitGetFileDiff(cwd, args.filePath);
        return { success: true, diff };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Git: Stage file
  ipcMain.handle(
    'git:stage-file',
    async (_, args: { taskPath: string; filePath: string; repoCwd?: string }) => {
      try {
        const cwd = args.repoCwd || args.taskPath;
        log.info('Staging file:', { cwd, filePath: args.filePath });
        await gitStageFile(cwd, args.filePath);
        log.info('File staged successfully:', args.filePath);
        return { success: true };
      } catch (error) {
        log.error('Failed to stage file:', { filePath: args.filePath, error });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Git: Stage all files
  ipcMain.handle(
    'git:stage-all-files',
    async (_, args: { taskPath: string; repoCwds?: string[] }) => {
      try {
        const cwds = args.repoCwds?.length ? args.repoCwds : [args.taskPath];
        log.info('Staging all files:', { cwds });
        for (const cwd of cwds) {
          await gitStageAllFiles(cwd);
        }
        log.info('All files staged successfully');
        return { success: true };
      } catch (error) {
        log.error('Failed to stage all files:', { taskPath: args.taskPath, error });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Git: Unstage file
  ipcMain.handle(
    'git:unstage-file',
    async (_, args: { taskPath: string; filePath: string; repoCwd?: string }) => {
      try {
        const cwd = args.repoCwd || args.taskPath;
        log.info('Unstaging file:', { cwd, filePath: args.filePath });
        await gitUnstageFile(cwd, args.filePath);
        log.info('File unstaged successfully:', args.filePath);
        return { success: true };
      } catch (error) {
        log.error('Failed to unstage file:', { filePath: args.filePath, error });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Git: Revert file
  ipcMain.handle(
    'git:revert-file',
    async (_, args: { taskPath: string; filePath: string; repoCwd?: string }) => {
      try {
        const cwd = args.repoCwd || args.taskPath;
        log.info('Reverting file:', { cwd, filePath: args.filePath });
        const result = await gitRevertFile(cwd, args.filePath);
        log.info('File operation completed:', { filePath: args.filePath, action: result.action });
        return { success: true, action: result.action };
      } catch (error) {
        log.error('Failed to revert file:', { filePath: args.filePath, error });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );
  // Git: Create Pull Request via GitHub CLI
  ipcMain.handle('git:create-pr', async (_, args) => {
    return createPullRequest(args);
  });

  // Git: Get PR status for current branch via GitHub CLI
  ipcMain.handle('git:get-pr-status', async (_, args) => {
    return getPrStatus(args);
  });

  // Git: Get CI/CD check runs for current branch via GitHub CLI
  ipcMain.handle('git:get-check-runs', async (_, args) => {
    return getCheckRuns(args);
  });

  // Git: Get PR comments and reviews via GitHub CLI
  ipcMain.handle('git:get-pr-comments', async (_, args) => {
    return getPrComments(args);
  });

  // Git: Commit all changes and push current branch (create feature branch if on default)
  ipcMain.handle(
    'git:commit-and-push',
    async (
      _,
      args: {
        taskPath: string;
        commitMessage?: string;
        createBranchIfOnDefault?: boolean;
        branchPrefix?: string;
      }
    ) => {
      const {
        taskPath,
        commitMessage = 'chore: apply task changes',
        createBranchIfOnDefault = true,
        branchPrefix = 'orch',
      } = (args ||
        ({} as {
          taskPath: string;
          commitMessage?: string;
          createBranchIfOnDefault?: boolean;
          branchPrefix?: string;
        })) as {
        taskPath: string;
        commitMessage?: string;
        createBranchIfOnDefault?: boolean;
        branchPrefix?: string;
      };

      try {
        validateTaskPath(taskPath);
        // Ensure we're in a git repo
        await execFileAsync(GIT, ['rev-parse', '--is-inside-work-tree'], { cwd: taskPath });

        // Determine current branch
        const { stdout: currentBranchOut } = await execFileAsync(
          GIT,
          ['branch', '--show-current'],
          {
            cwd: taskPath,
          }
        );
        const currentBranch = (currentBranchOut || '').trim();

        // Determine default branch via gh, fallback to main/master
        let defaultBranch = 'main';
        try {
          const { stdout } = await execFileAsync(
            'gh',
            ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'],
            { cwd: taskPath }
          );
          const db = (stdout || '').trim();
          if (db) defaultBranch = db;
        } catch {
          try {
            const { stdout } = await execFileAsync(
              GIT,
              ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
              { cwd: taskPath }
            );
            const line = (stdout || '').trim();
            const last = line.split('/').pop();
            if (last) defaultBranch = last;
          } catch {}
        }

        // Wrap branch creation, staging, commit, and push in the queue lock
        return await gitQueue.run(taskPath, async () => {
          // Optionally create a new branch if on default
          let activeBranch = currentBranch;
          if (createBranchIfOnDefault && (!currentBranch || currentBranch === defaultBranch)) {
            const short = Date.now().toString(36);
            const name = `${branchPrefix}/${short}`;
            await execFileAsync(GIT, ['checkout', '-b', name], { cwd: taskPath });
            activeBranch = name;
          }

          // Stage (only if needed) and commit
          try {
            const { stdout: st } = await execFileAsync(
              GIT,
              ['status', '--porcelain', '--untracked-files=all'],
              { cwd: taskPath }
            );
            const hasWorkingChanges = Boolean(st && st.trim().length > 0);

            const readStagedFiles = async () => {
              try {
                const { stdout } = await execFileAsync(GIT, ['diff', '--cached', '--name-only'], {
                  cwd: taskPath,
                });
                return (stdout || '')
                  .split('\n')
                  .map((f) => f.trim())
                  .filter(Boolean);
              } catch {
                return [];
              }
            };

            let stagedFiles = await readStagedFiles();

            // Only auto-stage everything when nothing is staged yet (preserves manual staging choices)
            if (hasWorkingChanges && stagedFiles.length === 0) {
              await execFileAsync(GIT, ['add', '-A'], { cwd: taskPath });
            }

            // Never commit plan mode artifacts
            try {
              await execFileAsync(GIT, ['reset', '-q', '.valkyr'], { cwd: taskPath });
            } catch {}
            try {
              await execFileAsync(GIT, ['reset', '-q', 'PLANNING.md'], { cwd: taskPath });
            } catch {}
            try {
              await execFileAsync(GIT, ['reset', '-q', 'planning.md'], { cwd: taskPath });
            } catch {}

            stagedFiles = await readStagedFiles();

            if (stagedFiles.length > 0) {
              try {
                await execFileAsync(GIT, ['commit', '-m', commitMessage], {
                  cwd: taskPath,
                });
              } catch (commitErr) {
                const msg = String(commitErr);
                if (!/nothing to commit/i.test(msg)) throw commitErr;
              }
            }
          } catch (e) {
            log.warn('Stage/commit step issue:', String(e));
          }

          // Push current branch (set upstream if needed)
          try {
            await execFileAsync(GIT, ['push'], { cwd: taskPath });
          } catch (pushErr) {
            await execFileAsync(GIT, ['push', '--set-upstream', 'origin', activeBranch], {
              cwd: taskPath,
            });
          }

          const { stdout: out } = await execFileAsync(GIT, ['status', '-sb'], { cwd: taskPath });
          return { success: true, branch: activeBranch, output: (out || '').trim() };
        });
      } catch (error) {
        log.error('Failed to commit and push:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Git: Get branch status (current branch, default branch, ahead/behind counts)
  ipcMain.handle('git:get-branch-status', async (_, args: { taskPath: string }) => {
    const { taskPath } = args || ({} as { taskPath: string });

    // Early exit for missing/invalid path
    if (!taskPath || !fs.existsSync(taskPath)) {
      log.warn(`getBranchStatus: path does not exist: ${taskPath}`);
      return { success: false, error: 'Path does not exist' };
    }

    // Check if it's a git repo - expected to fail often for non-git paths
    try {
      await execFileAsync(GIT, ['rev-parse', '--is-inside-work-tree'], { cwd: taskPath });
    } catch {
      log.warn(`getBranchStatus: not a git repository: ${taskPath}`);
      return { success: false, error: 'Not a git repository' };
    }

    try {
      // Current branch
      const { stdout: currentBranchOut } = await execFileAsync(GIT, ['branch', '--show-current'], {
        cwd: taskPath,
      });
      const branch = (currentBranchOut || '').trim();

      // Determine default branch
      let defaultBranch = 'main';
      try {
        const { stdout } = await execFileAsync(
          'gh',
          ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'],
          { cwd: taskPath }
        );
        const db = (stdout || '').trim();
        if (db) defaultBranch = db;
      } catch {
        try {
          // Use symbolic-ref to resolve origin/HEAD then take the last path part
          const { stdout } = await execFileAsync(
            GIT,
            ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
            { cwd: taskPath }
          );
          const line = (stdout || '').trim();
          const last = line.split('/').pop();
          if (last) defaultBranch = last;
        } catch {}
      }

      // Ahead/behind relative to upstream or origin/<default>
      let ahead = 0;
      let behind = 0;
      try {
        // Try explicit compare with origin/default...HEAD
        const { stdout } = await execFileAsync(
          GIT,
          ['rev-list', '--left-right', '--count', `origin/${defaultBranch}...HEAD`],
          { cwd: taskPath }
        );
        const parts = (stdout || '').trim().split(/\s+/);
        if (parts.length >= 2) {
          behind = parseInt(parts[0] || '0', 10) || 0; // commits on left (origin/default)
          ahead = parseInt(parts[1] || '0', 10) || 0; // commits on right (HEAD)
        }
      } catch {
        try {
          const { stdout } = await execFileAsync(GIT, ['status', '-sb'], { cwd: taskPath });
          const line = (stdout || '').split(/\n/)[0] || '';
          const m = line.match(/ahead\s+(\d+)/i);
          const n = line.match(/behind\s+(\d+)/i);
          if (m) ahead = parseInt(m[1] || '0', 10) || 0;
          if (n) behind = parseInt(n[1] || '0', 10) || 0;
        } catch {}
      }

      return { success: true, branch, defaultBranch, ahead, behind };
    } catch (error) {
      log.error(`getBranchStatus: unexpected error for ${taskPath}:`, error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Branch cache: return cached branches instantly, fetch in background
  const branchCache = new Map<
    string,
    {
      branches: Array<{ ref: string; remote: string; branch: string; label: string }>;
      fetchedAt: number;
    }
  >();
  const BRANCH_CACHE_TTL_MS = 60_000; // 60 seconds

  /** List branches from local refs (no network). */
  async function listBranchesFromRefs(
    projectPath: string,
    remote: string,
    hasRemote: boolean
  ): Promise<Array<{ ref: string; remote: string; branch: string; label: string }>> {
    let branches: Array<{ ref: string; remote: string; branch: string; label: string }> = [];

    if (hasRemote) {
      // List remote + local branches in parallel
      const [remoteResult, localResult] = await Promise.all([
        execFileAsync(
          GIT,
          ['for-each-ref', '--format=%(refname:short)', `refs/remotes/${remote}`],
          { cwd: projectPath }
        ).catch(() => ({ stdout: '' })),
        execFileAsync(GIT, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], {
          cwd: projectPath,
        }).catch(() => ({ stdout: '' })),
      ]);

      branches =
        remoteResult.stdout
          ?.split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .filter((line) => !line.endsWith('/HEAD'))
          .map((ref) => {
            const [remoteAlias, ...rest] = ref.split('/');
            const branch = rest.join('/') || ref;
            return {
              ref,
              remote: remoteAlias || remote,
              branch,
              label: `${remoteAlias || remote}/${branch}`,
            };
          }) ?? [];

      // Add local-only branches
      const remoteBranchNames = new Set(branches.map((b) => b.branch));
      const localOnly =
        localResult.stdout
          ?.split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .filter((branch) => !remoteBranchNames.has(branch))
          .map((branch) => ({ ref: branch, remote: '', branch, label: branch })) ?? [];

      branches = [...branches, ...localOnly];
    } else {
      const { stdout } = await execFileAsync(
        GIT,
        ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
        { cwd: projectPath }
      ).catch(() => ({ stdout: '' }));

      branches =
        stdout
          ?.split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((branch) => ({ ref: branch, remote: '', branch, label: branch })) ?? [];
    }

    return branches;
  }

  ipcMain.handle(
    'git:list-remote-branches',
    async (_, args: { projectPath: string; remote?: string }) => {
      const { projectPath, remote = 'origin' } = args || ({} as { projectPath: string });
      if (!projectPath) {
        return { success: false, error: 'projectPath is required' };
      }
      try {
        await execFileAsync(GIT, ['rev-parse', '--is-inside-work-tree'], { cwd: projectPath });
      } catch {
        return { success: false, error: 'Not a git repository' };
      }

      try {
        let hasRemote = false;
        try {
          await execFileAsync(GIT, ['remote', 'get-url', remote], { cwd: projectPath });
          hasRemote = true;
        } catch {
          log.debug(`Remote '${remote}' not found, will use local branches`);
        }

        // Return cached branches if fresh enough
        const cacheKey = `${projectPath}:${remote}`;
        const cached = branchCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < BRANCH_CACHE_TTL_MS) {
          // Refresh in background (fire-and-forget) if remote exists
          if (hasRemote) {
            execFileAsync(GIT, ['fetch', '--prune', remote], { cwd: projectPath })
              .then(() => listBranchesFromRefs(projectPath, remote, true))
              .then((branches) => {
                branchCache.set(cacheKey, { branches, fetchedAt: Date.now() });
              })
              .catch(() => {});
          }
          return { success: true, branches: cached.branches };
        }

        // First call or cache expired: list from local refs immediately (no fetch)
        const branches = await listBranchesFromRefs(projectPath, remote, hasRemote);
        branchCache.set(cacheKey, { branches, fetchedAt: Date.now() });

        // Fetch in background for next call
        if (hasRemote) {
          execFileAsync(GIT, ['fetch', '--prune', remote], { cwd: projectPath })
            .then(() => listBranchesFromRefs(projectPath, remote, true))
            .then((freshBranches) => {
              branchCache.set(cacheKey, { branches: freshBranches, fetchedAt: Date.now() });
            })
            .catch(() => {});
        }

        return { success: true, branches };
      } catch (error) {
        log.error('Failed to list branches:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Git: Merge current branch to main via GitHub (create PR + merge immediately)
  ipcMain.handle('git:merge-to-main', async (_, args) => {
    return mergeToMain(args);
  });

  // Git: Rename branch (local and optionally remote)
  ipcMain.handle(
    'git:rename-branch',
    async (
      _,
      args: {
        repoPath: string;
        oldBranch: string;
        newBranch: string;
      }
    ) => {
      const { repoPath, oldBranch, newBranch } = args;
      try {
        log.info('Renaming branch:', { repoPath, oldBranch, newBranch });

        // Check remote tracking BEFORE rename (git branch -m renames config section)
        let remotePushed = false;
        let remoteName = 'origin';
        try {
          const { stdout: remoteOut } = await execFileAsync(
            GIT,
            ['config', '--get', `branch.${oldBranch}.remote`],
            { cwd: repoPath }
          );
          if (remoteOut?.trim()) {
            remoteName = remoteOut.trim();
            remotePushed = true;
          }
        } catch {
          // Branch wasn't tracking a remote, check if it exists on origin
          try {
            const { stdout: lsRemote } = await execFileAsync(
              GIT,
              ['ls-remote', '--heads', 'origin', oldBranch],
              { cwd: repoPath }
            );
            if (lsRemote?.trim()) {
              remotePushed = true;
            }
          } catch {
            // No remote branch
          }
        }

        // Rename local branch
        await execFileAsync(GIT, ['branch', '-m', oldBranch, newBranch], { cwd: repoPath });
        log.info('Local branch renamed successfully');

        // If pushed to remote, delete old and push new
        if (remotePushed) {
          log.info('Branch was pushed to remote, updating remote...');
          try {
            // Delete old remote branch
            await execFileAsync(GIT, ['push', remoteName, '--delete', oldBranch], {
              cwd: repoPath,
            });
            log.info('Deleted old remote branch');
          } catch (deleteErr) {
            // Remote branch might not exist or already deleted
            log.warn('Could not delete old remote branch (may not exist):', deleteErr);
          }

          // Push new branch and set upstream
          await execFileAsync(GIT, ['push', '-u', remoteName, newBranch], { cwd: repoPath });
          log.info('Pushed new branch to remote');
        }

        return { success: true, remotePushed };
      } catch (error) {
        log.error('Failed to rename branch:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Git: Push current branch for a given repo path
  ipcMain.handle(
    'git:push',
    async (
      _,
      args: {
        repoPath: string;
      }
    ) => {
      const { repoPath } = args || ({} as { repoPath: string });
      if (!repoPath || typeof repoPath !== 'string') {
        return { success: false, error: 'repoPath is required' };
      }
      if (!fs.existsSync(repoPath)) {
        return { success: false, error: `Path does not exist: ${repoPath}` };
      }

      try {
        // Verify git repo
        await execFileAsync(GIT, ['rev-parse', '--is-inside-work-tree'], { cwd: repoPath });

        // Get current branch
        const { stdout: branchOut } = await execFileAsync(GIT, ['branch', '--show-current'], {
          cwd: repoPath,
        });
        const branch = (branchOut || '').trim();
        if (!branch) {
          return { success: false, error: 'Detached HEAD — cannot push' };
        }

        // Push (set upstream if needed)
        try {
          await execFileAsync(GIT, ['push'], { cwd: repoPath });
        } catch {
          await execFileAsync(GIT, ['push', '--set-upstream', 'origin', branch], {
            cwd: repoPath,
          });
        }

        return { success: true, branch };
      } catch (error) {
        log.error('git:push failed:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Cleanup git status watchers on app quit to prevent race conditions
  app.on('before-quit', () => {
    closeAllWatchers();
  });
}
