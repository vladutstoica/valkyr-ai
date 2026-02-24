import { app, ipcMain, BrowserWindow } from 'electron';
import { log } from '../lib/logger';
import { broadcastToAllWindows } from '../lib/safeSend';
import { execFile } from 'child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
import { prGenerationService } from '../services/PrGenerationService';
import { databaseService } from '../services/DatabaseService';

const execFileAsync = promisify(execFile);

const GIT_STATUS_DEBOUNCE_MS = 500;
const supportsRecursiveWatch = process.platform === 'darwin' || process.platform === 'win32';

type GitStatusWatchEntry = {
  watcher: fs.FSWatcher;
  watchIds: Set<string>;
  debounceTimer?: NodeJS.Timeout;
};

const gitStatusWatchers = new Map<string, GitStatusWatchEntry>();

// Clear all debounce timers - called when windows are closing to prevent
// "Render frame was disposed" errors from Electron
function clearAllDebounceTimers(): void {
  for (const [, entry] of gitStatusWatchers) {
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = undefined;
    }
  }
}

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

const broadcastGitStatusChange = (taskPath: string, error?: string) => {
  broadcastToAllWindows('git:status-changed', { taskPath, error });
};

const ensureGitStatusWatcher = (taskPath: string) => {
  if (!supportsRecursiveWatch) {
    return { success: false as const, error: 'recursive-watch-unsupported' };
  }
  if (!taskPath || !fs.existsSync(taskPath)) {
    return { success: false as const, error: 'workspace-unavailable' };
  }
  const existing = gitStatusWatchers.get(taskPath);
  const watchId = randomUUID();
  if (existing) {
    existing.watchIds.add(watchId);
    return { success: true as const, watchId };
  }
  try {
    const watcher = fs.watch(taskPath, { recursive: true }, () => {
      const entry = gitStatusWatchers.get(taskPath);
      if (!entry) return;
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.debounceTimer = setTimeout(() => {
        broadcastGitStatusChange(taskPath);
      }, GIT_STATUS_DEBOUNCE_MS);
    });
    watcher.on('error', (error) => {
      log.warn('[git:watch-status] watcher error', error);
      const entry = gitStatusWatchers.get(taskPath);
      if (entry?.debounceTimer) clearTimeout(entry.debounceTimer);
      try {
        entry?.watcher.close();
      } catch {}
      gitStatusWatchers.delete(taskPath);
      broadcastGitStatusChange(taskPath, 'watcher-error');
    });
    gitStatusWatchers.set(taskPath, { watcher, watchIds: new Set([watchId]) });
    return { success: true as const, watchId };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Failed to watch workspace',
    };
  }
};

const releaseGitStatusWatcher = (taskPath: string, watchId?: string) => {
  const entry = gitStatusWatchers.get(taskPath);
  if (!entry) return { success: true as const };
  if (watchId) {
    entry.watchIds.delete(watchId);
  }
  if (entry.watchIds.size <= 0) {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.watcher.close();
    gitStatusWatchers.delete(taskPath);
  }
  return { success: true as const };
};

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

  function resolveGitBin(): string {
    // Allow override via env
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
    // Last resort: try /usr/bin/env git
    return 'git';
  }
  const GIT = resolveGitBin();

  ipcMain.handle('git:watch-status', async (_, taskPath: string) => {
    return ensureGitStatusWatcher(taskPath);
  });

  ipcMain.handle('git:unwatch-status', async (_, taskPath: string, watchId?: string) => {
    return releaseGitStatusWatcher(taskPath, watchId);
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
  // Git: Generate PR title and description
  ipcMain.handle(
    'git:generate-pr-content',
    async (
      _,
      args: {
        taskPath: string;
        base?: string;
      }
    ) => {
      const { taskPath, base = 'main' } = args || ({} as { taskPath: string; base?: string });
      try {
        validateTaskPath(taskPath);
        // Try to get the task to find which provider was used
        let providerId: string | null = null;
        try {
          const task = await databaseService.getTaskByPath(taskPath);
          if (task?.agentId) {
            providerId = task.agentId;
            log.debug('Found task provider for PR generation', { taskPath, providerId });
          }
        } catch (error) {
          log.debug('Could not lookup task provider', { error });
          // Non-fatal - continue without provider
        }

        const result = await prGenerationService.generatePrContent(taskPath, base, providerId);
        return { success: true, ...result };
      } catch (error) {
        log.error('Failed to generate PR content:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // Git: Create Pull Request via GitHub CLI
  ipcMain.handle(
    'git:create-pr',
    async (
      _,
      args: {
        taskPath: string;
        title?: string;
        body?: string;
        base?: string;
        head?: string;
        draft?: boolean;
        web?: boolean;
        fill?: boolean;
      }
    ) => {
      const { taskPath, title, body, base, head, draft, web, fill } =
        args ||
        ({} as {
          taskPath: string;
          title?: string;
          body?: string;
          base?: string;
          head?: string;
          draft?: boolean;
          web?: boolean;
          fill?: boolean;
        });
      try {
        validateTaskPath(taskPath);
        const outputs: string[] = [];

        // Stage, commit, and push under the queue lock to prevent concurrent git operations
        const pushResult = await gitQueue.run(taskPath, async () => {
          // Stage and commit any pending changes
          try {
            const { stdout: statusOut } = await execFileAsync(
              GIT,
              ['status', '--porcelain', '--untracked-files=all'],
              { cwd: taskPath }
            );
            if (statusOut && statusOut.trim().length > 0) {
              const { stdout: addOut, stderr: addErr } = await execFileAsync(GIT, ['add', '-A'], {
                cwd: taskPath,
              });
              if (addOut?.trim()) outputs.push(addOut.trim());
              if (addErr?.trim()) outputs.push(addErr.trim());

              const commitMsg = 'stagehand: prepare pull request';
              try {
                const { stdout: commitOut, stderr: commitErr } = await execFileAsync(
                  GIT,
                  ['commit', '-m', commitMsg],
                  { cwd: taskPath }
                );
                if (commitOut?.trim()) outputs.push(commitOut.trim());
                if (commitErr?.trim()) outputs.push(commitErr.trim());
              } catch (commitErr) {
                const msg = String(commitErr);
                if (msg && /nothing to commit/i.test(msg)) {
                  outputs.push('git commit: nothing to commit');
                } else {
                  throw commitErr;
                }
              }
            }
          } catch (stageErr) {
            log.warn('Failed to stage/commit changes before PR:', String(stageErr));
            // Continue; PR may still be created for existing commits
          }

          // Ensure branch is pushed to origin so PR includes latest commit
          try {
            await execFileAsync(GIT, ['push'], { cwd: taskPath });
            outputs.push('git push: success');
          } catch (pushErr) {
            try {
              const { stdout: branchOut } = await execFileAsync(
                GIT,
                ['rev-parse', '--abbrev-ref', 'HEAD'],
                {
                  cwd: taskPath,
                }
              );
              const branch = branchOut.trim();
              await execFileAsync(GIT, ['push', '--set-upstream', 'origin', branch], {
                cwd: taskPath,
              });
              outputs.push(`git push --set-upstream origin ${branch}: success`);
            } catch (pushErr2) {
              log.error('Failed to push branch before PR:', String(pushErr2));
              return {
                success: false as const,
                error:
                  'Failed to push branch to origin. Please check your Git remotes and authentication.',
              };
            }
          }

          return null;
        });

        if (pushResult) return pushResult;

        // Resolve repo owner/name (prefer gh, fallback to parsing origin url)
        let repoNameWithOwner = '';
        try {
          const { stdout: repoOut } = await execFileAsync(
            'gh',
            ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
            { cwd: taskPath }
          );
          repoNameWithOwner = (repoOut || '').trim();
        } catch {
          try {
            const { stdout: urlOut } = await execFileAsync(GIT, ['remote', 'get-url', 'origin'], {
              cwd: taskPath,
            });
            const url = (urlOut || '').trim();
            // Handle both SSH and HTTPS forms
            const m =
              url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i) ||
              url.match(/([^/:]+)[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
            if (m) {
              const owner = m[1].includes('github.com') ? m[1].split('github.com').pop() : m[1];
              const repo = m[2] || m[3];
              repoNameWithOwner = `${owner}/${repo}`.replace(/^\/*/, '');
            }
          } catch {}
        }

        // Determine current branch and default base branch (fallback to main)
        let currentBranch = '';
        try {
          const { stdout } = await execFileAsync(GIT, ['branch', '--show-current'], {
            cwd: taskPath,
          });
          currentBranch = (stdout || '').trim();
        } catch {}
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

        // Guard: ensure there is at least one commit ahead of base
        try {
          const baseRef = base || defaultBranch;
          const { stdout: aheadOut } = await execFileAsync(
            GIT,
            ['rev-list', '--count', `origin/${baseRef}..HEAD`],
            { cwd: taskPath }
          );
          const aheadCount = parseInt((aheadOut || '0').trim(), 10) || 0;
          if (aheadCount <= 0) {
            return {
              success: false,
              error: `No commits to create a PR. Make a commit on 
current branch '${currentBranch}' ahead of base '${baseRef}'.`,
            };
          }
        } catch {
          // Non-fatal; continue
        }

        // Build gh pr create args array (no shell interpretation)
        const ghArgs: string[] = ['pr', 'create'];
        if (repoNameWithOwner) ghArgs.push('--repo', repoNameWithOwner);
        if (title) ghArgs.push('--title', title);

        // Use temp file for body to properly handle newlines and multiline content
        let bodyFile: string | null = null;
        if (body) {
          try {
            bodyFile = path.join(
              os.tmpdir(),
              `gh-pr-body-${Date.now()}-${Math.random().toString(36).substring(7)}.txt`
            );
            // Write body with actual newlines preserved
            fs.writeFileSync(bodyFile, body, 'utf8');
            ghArgs.push('--body-file', bodyFile);
          } catch (writeError) {
            log.warn('Failed to write body to temp file, falling back to --body flag', {
              writeError,
            });
            // Fallback to direct --body flag if temp file creation fails
            ghArgs.push('--body', body);
          }
        }

        if (base || defaultBranch) ghArgs.push('--base', base || defaultBranch);
        if (head) {
          ghArgs.push('--head', head);
        } else if (currentBranch) {
          // Prefer owner:branch form when repo is known; otherwise branch name
          const headRef = repoNameWithOwner
            ? `${repoNameWithOwner.split('/')[0]}:${currentBranch}`
            : currentBranch;
          ghArgs.push('--head', headRef);
        }
        if (draft) ghArgs.push('--draft');
        if (web) ghArgs.push('--web');
        if (fill) ghArgs.push('--fill');

        let stdout: string;
        let stderr: string;
        try {
          const result = await execFileAsync('gh', ghArgs, { cwd: taskPath });
          stdout = result.stdout || '';
          stderr = result.stderr || '';
        } finally {
          // Clean up temp file if it was created
          if (bodyFile && fs.existsSync(bodyFile)) {
            try {
              fs.unlinkSync(bodyFile);
            } catch (unlinkError) {
              log.debug('Failed to delete temp body file', { bodyFile, unlinkError });
            }
          }
        }
        const out = [...outputs, (stdout || '').trim() || (stderr || '').trim()]
          .filter(Boolean)
          .join('\n');

        // Try to extract PR URL from output
        const urlMatch = out.match(/https?:\/\/\S+/);
        const url = urlMatch ? urlMatch[0] : null;

        return { success: true, url, output: out };
      } catch (error: any) {
        // Capture rich error info from gh/child_process
        const errMsg = typeof error?.message === 'string' ? error.message : String(error);
        const errStdout = typeof error?.stdout === 'string' ? error.stdout : '';
        const errStderr = typeof error?.stderr === 'string' ? error.stderr : '';
        const combined = [errMsg, errStdout, errStderr].filter(Boolean).join('\n').trim();

        // Check for various error conditions
        const restrictionRe =
          /Auth App access restrictions|authorized OAuth apps|third-parties is limited/i;
        const prExistsRe = /already exists|already has.*pull request|pull request for branch/i;

        let code: string | undefined;
        if (restrictionRe.test(combined)) {
          code = 'ORG_AUTH_APP_RESTRICTED';
          log.warn('GitHub org restrictions detected during PR creation');
        } else if (prExistsRe.test(combined)) {
          code = 'PR_ALREADY_EXISTS';
          log.info('PR already exists for branch - push was successful');
        } else {
          log.error('Failed to create PR:', combined || error);
        }

        return {
          success: false,
          error: combined || errMsg || 'Failed to create PR',
          output: combined,
          code,
        } as any;
      }
    }
  );

  // Git: Get PR status for current branch via GitHub CLI
  ipcMain.handle('git:get-pr-status', async (_, args: { taskPath: string }) => {
    const { taskPath } = args || ({} as { taskPath: string });
    try {
      validateTaskPath(taskPath);
      // Ensure we're in a git repo
      await execFileAsync(GIT, ['rev-parse', '--is-inside-work-tree'], { cwd: taskPath });

      const queryFields = [
        'number',
        'url',
        'state',
        'isDraft',
        'mergeStateStatus',
        'headRefName',
        'baseRefName',
        'title',
        'author',
        'additions',
        'deletions',
        'changedFiles',
      ];
      try {
        const { stdout } = await execFileAsync(
          'gh',
          ['pr', 'view', '--json', queryFields.join(','), '-q', '.'],
          { cwd: taskPath }
        );
        const json = (stdout || '').trim();
        const data = json ? JSON.parse(json) : null;
        if (!data) return { success: false, error: 'No PR data returned' };

        // Fallback: if GH CLI didn't return diff stats, try to compute locally
        const asNumber = (v: any): number | null =>
          typeof v === 'number' && Number.isFinite(v)
            ? v
            : typeof v === 'string' && Number.isFinite(Number.parseInt(v, 10))
              ? Number.parseInt(v, 10)
              : null;

        const hasAdd = asNumber(data?.additions) !== null;
        const hasDel = asNumber(data?.deletions) !== null;
        const hasFiles = asNumber(data?.changedFiles) !== null;

        if (!hasAdd || !hasDel || !hasFiles) {
          const baseRef = typeof data?.baseRefName === 'string' ? data.baseRefName.trim() : '';
          const targetRef = baseRef ? `origin/${baseRef}` : '';
          const shortstatArgs = targetRef
            ? ['diff', '--shortstat', `${targetRef}...HEAD`]
            : ['diff', '--shortstat', 'HEAD~1..HEAD'];
          try {
            const { stdout: diffOut } = await execFileAsync(GIT, shortstatArgs, { cwd: taskPath });
            const statLine = (diffOut || '').trim();
            const m =
              statLine &&
              statLine.match(
                /(\d+)\s+files? changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/
              );
            if (m) {
              const [, filesStr, addStr, delStr] = m;
              if (!hasFiles && filesStr) data.changedFiles = Number.parseInt(filesStr, 10);
              if (!hasAdd && addStr) data.additions = Number.parseInt(addStr, 10);
              if (!hasDel && delStr) data.deletions = Number.parseInt(delStr, 10);
            }
          } catch {
            // best-effort only; ignore failures
          }
        }

        return { success: true, pr: data };
      } catch (err) {
        const msg = String(err as string);
        if (/no pull requests? found/i.test(msg) || /not found/i.test(msg)) {
          return { success: true, pr: null };
        }
        return { success: false, error: msg || 'Failed to query PR status' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Git: Get CI/CD check runs for current branch via GitHub CLI
  ipcMain.handle('git:get-check-runs', async (_, args: { taskPath: string }) => {
    const { taskPath } = args || ({} as { taskPath: string });
    try {
      validateTaskPath(taskPath);
      await execFileAsync(GIT, ['rev-parse', '--is-inside-work-tree'], { cwd: taskPath });

      const fields = 'bucket,completedAt,description,event,link,name,startedAt,state,workflow';
      try {
        const { stdout } = await execFileAsync('gh', ['pr', 'checks', '--json', fields], {
          cwd: taskPath,
        });
        const json = (stdout || '').trim();
        const checks = json ? JSON.parse(json) : [];

        // Fetch html_url from the GitHub API instead, which always points to the
        // actual check run page on GitHub.
        try {
          const { stdout: shaOut } = await execFileAsync(
            'gh',
            ['pr', 'view', '--json', 'headRefOid', '--jq', '.headRefOid'],
            { cwd: taskPath }
          );
          const sha = shaOut.trim();
          if (sha) {
            const { stdout: apiOut } = await execFileAsync(
              'gh',
              [
                'api',
                `repos/{owner}/{repo}/commits/${sha}/check-runs`,
                '--jq',
                '.check_runs | map({name: .name, html_url: .html_url}) | .[]',
              ],
              { cwd: taskPath }
            );
            const urlMap = new Map<string, string>();
            for (const line of apiOut.trim().split('\n')) {
              if (!line) continue;
              try {
                const entry = JSON.parse(line);
                if (entry.name && entry.html_url) urlMap.set(entry.name, entry.html_url);
              } catch {}
            }
            for (const check of checks) {
              const htmlUrl = urlMap.get(check.name);
              if (htmlUrl) check.link = htmlUrl;
            }
          }
        } catch {
          // Fall back to original link values if API call fails
        }

        return { success: true, checks };
      } catch (err) {
        const msg = String(err as string);
        if (/no pull requests? found/i.test(msg) || /not found/i.test(msg)) {
          return { success: true, checks: null };
        }
        if (/not installed|command not found/i.test(msg)) {
          return { success: false, error: msg, code: 'GH_CLI_UNAVAILABLE' };
        }
        return { success: false, error: msg || 'Failed to query check runs' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Git: Get PR comments and reviews via GitHub CLI
  ipcMain.handle(
    'git:get-pr-comments',
    async (_, args: { taskPath: string; prNumber?: number }) => {
      const { taskPath, prNumber } = args || ({} as { taskPath: string; prNumber?: number });
      try {
        validateTaskPath(taskPath);
        await execFileAsync(GIT, ['rev-parse', '--is-inside-work-tree'], { cwd: taskPath });

        try {
          const ghArgs = ['pr', 'view'];
          if (prNumber) ghArgs.push(String(prNumber));
          ghArgs.push('--json', 'comments,reviews,number');

          const { stdout } = await execFileAsync('gh', ghArgs, { cwd: taskPath });
          const json = (stdout || '').trim();
          const data = json ? JSON.parse(json) : { comments: [], reviews: [], number: 0 };

          const comments = data.comments || [];
          const reviews = data.reviews || [];

          // gh pr view doesn't return avatarUrl for authors.
          // Fetch from the REST API which includes avatar_url (works for GitHub Apps too).
          if (data.number) {
            try {
              const avatarMap = new Map<string, string>();

              const { stdout: commentsApi } = await execFileAsync(
                'gh',
                [
                  'api',
                  `repos/{owner}/{repo}/issues/${data.number}/comments`,
                  '--jq',
                  '.[] | {login: .user.login, avatar_url: .user.avatar_url}',
                ],
                { cwd: taskPath }
              );
              const setAvatar = (login: string, url: string) => {
                avatarMap.set(login, url);
                // REST API returns "app[bot]" while gh CLI returns "app" — store both
                if (login.endsWith('[bot]')) avatarMap.set(login.replace(/\[bot]$/, ''), url);
              };

              for (const line of commentsApi.trim().split('\n')) {
                if (!line) continue;
                try {
                  const entry = JSON.parse(line);
                  if (entry.login && entry.avatar_url) setAvatar(entry.login, entry.avatar_url);
                } catch {}
              }

              const { stdout: reviewsApi } = await execFileAsync(
                'gh',
                [
                  'api',
                  `repos/{owner}/{repo}/pulls/${data.number}/reviews`,
                  '--jq',
                  '.[] | {login: .user.login, avatar_url: .user.avatar_url}',
                ],
                { cwd: taskPath }
              );
              for (const line of reviewsApi.trim().split('\n')) {
                if (!line) continue;
                try {
                  const entry = JSON.parse(line);
                  if (entry.login && entry.avatar_url) setAvatar(entry.login, entry.avatar_url);
                } catch {}
              }

              for (const c of [...comments, ...reviews]) {
                if (c.author?.login) {
                  const avatarUrl = avatarMap.get(c.author.login);
                  if (avatarUrl) c.author.avatarUrl = avatarUrl;
                }
              }
            } catch {
              // Fall back to no avatar URLs — renderer will use GitHub fallback
            }
          }

          return { success: true, comments, reviews };
        } catch (err) {
          const msg = String(err as string);
          if (/no pull requests? found/i.test(msg) || /not found/i.test(msg)) {
            return { success: true, comments: [], reviews: [] };
          }
          if (/not installed|command not found/i.test(msg)) {
            return { success: false, error: msg, code: 'GH_CLI_UNAVAILABLE' };
          }
          return { success: false, error: msg || 'Failed to query PR comments' };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

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
        // Check if remote exists before attempting to fetch
        let hasRemote = false;
        try {
          await execFileAsync(GIT, ['remote', 'get-url', remote], { cwd: projectPath });
          hasRemote = true;
          // Remote exists, try to fetch
          try {
            await execFileAsync(GIT, ['fetch', '--prune', remote], { cwd: projectPath });
          } catch (fetchError) {
            log.warn('Failed to fetch remote before listing branches', fetchError);
          }
        } catch {
          // Remote doesn't exist, skip fetch and will use local branches instead
          log.debug(`Remote '${remote}' not found, will use local branches`);
        }

        let branches: Array<{ ref: string; remote: string; branch: string; label: string }> = [];

        if (hasRemote) {
          // List remote branches
          const { stdout } = await execFileAsync(
            GIT,
            ['for-each-ref', '--format=%(refname:short)', `refs/remotes/${remote}`],
            { cwd: projectPath }
          );

          branches =
            stdout
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

          // Also include local-only branches (not on remote)
          try {
            const { stdout: localStdout } = await execFileAsync(
              GIT,
              ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
              { cwd: projectPath }
            );

            const remoteBranchNames = new Set(branches.map((b) => b.branch));

            const localOnlyBranches =
              localStdout
                ?.split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .filter((branch) => !remoteBranchNames.has(branch))
                .map((branch) => ({
                  ref: branch,
                  remote: '',
                  branch,
                  label: branch,
                })) ?? [];

            branches = [...branches, ...localOnlyBranches];
          } catch (localBranchError) {
            log.warn('Failed to list local branches', localBranchError);
          }
        } else {
          // No remote - list local branches instead
          try {
            const { stdout } = await execFileAsync(
              GIT,
              ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
              { cwd: projectPath }
            );

            branches =
              stdout
                ?.split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((branch) => ({
                  ref: branch,
                  remote: '', // No remote
                  branch,
                  label: branch, // Just the branch name, no remote prefix
                })) ?? [];
          } catch (localBranchError) {
            log.warn('Failed to list local branches', localBranchError);
          }
        }

        return { success: true, branches };
      } catch (error) {
        log.error('Failed to list branches:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // Git: Merge current branch to main via GitHub (create PR + merge immediately)
  ipcMain.handle('git:merge-to-main', async (_, args: { taskPath: string }) => {
    const { taskPath } = args || ({} as { taskPath: string });

    try {
      validateTaskPath(taskPath);
      // Get current and default branch names
      const { stdout: currentOut } = await execFileAsync(GIT, ['branch', '--show-current'], {
        cwd: taskPath,
      });
      const currentBranch = (currentOut || '').trim();

      let defaultBranch = 'main';
      try {
        const { stdout } = await execFileAsync(
          'gh',
          ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'],
          { cwd: taskPath }
        );
        if (stdout?.trim()) defaultBranch = stdout.trim();
      } catch {
        // gh not available or not a GitHub repo - fall back to 'main'
      }

      // Validate: on a valid feature branch
      if (!currentBranch) {
        return { success: false, error: 'Not on a branch (detached HEAD state).' };
      }
      if (currentBranch === defaultBranch) {
        return {
          success: false,
          error: `Already on ${defaultBranch}. Create a feature branch first.`,
        };
      }

      // Stage and commit any pending changes
      const { stdout: statusOut } = await execFileAsync(
        GIT,
        ['status', '--porcelain', '--untracked-files=all'],
        { cwd: taskPath }
      );
      if (statusOut?.trim()) {
        await execFileAsync(GIT, ['add', '-A'], { cwd: taskPath });
        try {
          await execFileAsync(GIT, ['commit', '-m', 'chore: prepare for merge to main'], {
            cwd: taskPath,
          });
        } catch (e) {
          const msg = String(e);
          if (!/nothing to commit/i.test(msg)) throw e;
        }
      }

      // Push branch (set upstream if needed)
      try {
        await execFileAsync(GIT, ['push'], { cwd: taskPath });
      } catch {
        // No upstream set - push with -u
        await execFileAsync(GIT, ['push', '--set-upstream', 'origin', currentBranch], {
          cwd: taskPath,
        });
      }

      // Create PR (or use existing)
      let prUrl = '';
      try {
        const { stdout: prOut } = await execFileAsync(
          'gh',
          ['pr', 'create', '--fill', '--base', defaultBranch],
          { cwd: taskPath }
        );
        const urlMatch = prOut?.match(/https?:\/\/\S+/);
        prUrl = urlMatch ? urlMatch[0] : '';
      } catch (e) {
        const errMsg = (e as { stderr?: string })?.stderr || String(e);
        if (!/already exists|already has.*pull request/i.test(errMsg)) {
          return { success: false, error: `Failed to create PR: ${errMsg}` };
        }
        // PR already exists - continue to merge
      }

      // Merge PR (branch cleanup happens when workspace is deleted)
      try {
        await execFileAsync('gh', ['pr', 'merge', '--merge'], { cwd: taskPath });
        return { success: true, prUrl };
      } catch (e) {
        const errMsg = (e as { stderr?: string })?.stderr || String(e);
        return { success: false, error: `PR created but merge failed: ${errMsg}`, prUrl };
      }
    } catch (e) {
      log.error('Failed to merge to main:', e);
      return { success: false, error: (e as { message?: string })?.message || String(e) };
    }
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
    for (const [, entry] of gitStatusWatchers) {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      try {
        entry.watcher.close();
      } catch {
        // Watcher may already be closed - ignore
      }
    }
    gitStatusWatchers.clear();
  });
}
