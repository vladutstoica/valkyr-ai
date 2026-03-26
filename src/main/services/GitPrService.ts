import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveGitBin } from '../lib/gitBin';
import { log } from '../lib/logger';
import { gitQueue } from './GitQueue';

const execFileAsync = promisify(execFile);
const GIT = resolveGitBin();

function validateTaskPath(taskPath: string): void {
  if (!taskPath || typeof taskPath !== 'string') throw new Error('taskPath is required');
  if (!fs.existsSync(taskPath)) throw new Error(`Path does not exist: ${taskPath}`);
}

export async function createPullRequest(args: {
  taskPath: string;
  title?: string;
  body?: string;
  base?: string;
  head?: string;
  draft?: boolean;
  web?: boolean;
  fill?: boolean;
}): Promise<{ success: boolean; url?: string | null; output?: string; error?: string; code?: string }> {
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

export async function getPrStatus(args: {
  taskPath: string;
}): Promise<{ success: boolean; pr?: any; error?: string }> {
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
}

export async function getCheckRuns(args: {
  taskPath: string;
}): Promise<{ success: boolean; checks?: any; error?: string; code?: string }> {
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
}

export async function getPrComments(args: {
  taskPath: string;
  prNumber?: number;
}): Promise<{ success: boolean; comments?: any[]; reviews?: any[]; error?: string; code?: string }> {
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

export async function mergeToMain(args: {
  taskPath: string;
}): Promise<{ success: boolean; prUrl?: string; error?: string }> {
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
}
