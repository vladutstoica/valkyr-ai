import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { gitQueue } from './GitQueue';

const execFileAsync = promisify(execFile);
const MAX_UNTRACKED_LINECOUNT_BYTES = 512 * 1024;
const MAX_UNTRACKED_DIFF_BYTES = 512 * 1024;

async function countFileNewlinesCapped(filePath: string, maxBytes: number): Promise<number | null> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return null;
  }

  if (!stat.isFile() || stat.size > maxBytes) {
    return null;
  }

  return await new Promise<number | null>((resolve) => {
    let count = 0;
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk: string | Buffer) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0x0a) count++;
      }
    });
    stream.on('error', () => resolve(null));
    stream.on('end', () => resolve(count));
  });
}

async function readFileTextCapped(filePath: string, maxBytes: number): Promise<string | null> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return null;
  }

  if (!stat.isFile() || stat.size > maxBytes) {
    return null;
  }

  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export type GitChange = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  isStaged: boolean;
  repoName?: string;
  repoCwd?: string;
};

export type RepoMapping = {
  relativePath: string;
  targetPath: string;
};

export async function getMultiRepoStatus(repoMappings: RepoMapping[]): Promise<GitChange[]> {
  const allChanges: GitChange[] = [];

  for (const mapping of repoMappings) {
    const repoName = mapping.relativePath || path.basename(mapping.targetPath);
    const changes = await getStatus(mapping.targetPath);

    for (const change of changes) {
      allChanges.push({
        ...change,
        path: repoName ? `${repoName}/${change.path}` : change.path,
        repoName,
        repoCwd: mapping.targetPath,
      });
    }
  }

  return allChanges;
}

/** Parse `git diff --numstat` output into a map of filePath → {additions, deletions}. */
function parseNumstat(stdout: string): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>();
  if (!stdout || !stdout.trim()) return map;
  for (const line of stdout.trim().split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;
    const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
    const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
    // Handle renames: "old => new" or "{old => new}/path"
    let filePath = parts.slice(2).join('\t');
    if (filePath.includes(' => ')) {
      // git numstat uses "old => new" for renames
      const match = filePath.match(/\{.*? => (.*?)\}/);
      if (match) {
        filePath = filePath.replace(/\{.*? => .*?\}/, match[1]);
      } else {
        const renameParts = filePath.split(' => ');
        filePath = renameParts[renameParts.length - 1].trim();
      }
    }
    const existing = map.get(filePath);
    if (existing) {
      existing.additions += additions;
      existing.deletions += deletions;
    } else {
      map.set(filePath, { additions, deletions });
    }
  }
  return map;
}

export async function getStatus(taskPath: string): Promise<GitChange[]> {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: taskPath,
    });
  } catch {
    return [];
  }

  const { stdout: statusOutput } = await execFileAsync(
    'git',
    ['status', '--porcelain', '--untracked-files=all'],
    {
      cwd: taskPath,
    }
  );

  if (!statusOutput.trim()) return [];

  const statusLines = statusOutput
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.length > 0);

  // Batch: fetch numstat for ALL files at once (2 calls total instead of 2×N)
  const [stagedResult, unstagedResult] = await Promise.all([
    execFileAsync('git', ['diff', '--numstat', '--cached'], { cwd: taskPath }).catch(() => ({
      stdout: '',
      stderr: '',
    })),
    execFileAsync('git', ['diff', '--numstat'], { cwd: taskPath }).catch(() => ({
      stdout: '',
      stderr: '',
    })),
  ]);

  const stagedStats = parseNumstat(stagedResult.stdout);
  const unstagedStats = parseNumstat(unstagedResult.stdout);

  const changes: GitChange[] = [];
  const untrackedPaths: Array<{ filePath: string; index: number }> = [];

  for (const line of statusLines) {
    const statusCode = line.substring(0, 2);
    let filePath = line.substring(3);
    if (statusCode.includes('R') && filePath.includes('->')) {
      const parts = filePath.split('->');
      filePath = parts[parts.length - 1].trim();
    }

    let status = 'modified';
    if (statusCode.includes('A') || statusCode.includes('?')) status = 'added';
    else if (statusCode.includes('D')) status = 'deleted';
    else if (statusCode.includes('R')) status = 'renamed';
    else if (statusCode.includes('M')) status = 'modified';

    const isStaged = statusCode[0] !== ' ' && statusCode[0] !== '?';

    // Look up from batch results instead of spawning per-file git commands
    const staged = stagedStats.get(filePath);
    const unstaged = unstagedStats.get(filePath);
    let additions = (staged?.additions ?? 0) + (unstaged?.additions ?? 0);
    let deletions = (staged?.deletions ?? 0) + (unstaged?.deletions ?? 0);

    if (additions === 0 && deletions === 0 && statusCode.includes('?')) {
      // Defer untracked file line counting (need async I/O)
      untrackedPaths.push({ filePath, index: changes.length });
    }

    changes.push({ path: filePath, status, additions, deletions, isStaged });
  }

  // Count lines for untracked files in parallel
  if (untrackedPaths.length > 0) {
    const counts = await Promise.all(
      untrackedPaths.map(({ filePath }) =>
        countFileNewlinesCapped(path.join(taskPath, filePath), MAX_UNTRACKED_LINECOUNT_BYTES)
      )
    );
    for (let i = 0; i < untrackedPaths.length; i++) {
      const count = counts[i];
      if (typeof count === 'number') {
        changes[untrackedPaths[i].index].additions = count;
      }
    }
  }

  return changes;
}

export async function stageFile(taskPath: string, filePath: string): Promise<void> {
  return gitQueue.run(taskPath, async () => {
    await execFileAsync('git', ['add', '--', filePath], { cwd: taskPath });
  });
}

export async function stageAllFiles(taskPath: string): Promise<void> {
  return gitQueue.run(taskPath, async () => {
    await execFileAsync('git', ['add', '-A'], { cwd: taskPath });
  });
}

export async function unstageFile(taskPath: string, filePath: string): Promise<void> {
  return gitQueue.run(taskPath, async () => {
    await execFileAsync('git', ['reset', 'HEAD', '--', filePath], { cwd: taskPath });
  });
}

export async function revertFile(
  taskPath: string,
  filePath: string
): Promise<{ action: 'unstaged' | 'reverted' }> {
  return gitQueue.run(taskPath, async () => {
    // Check if file is staged
    try {
      const { stdout: stagedStatus } = await execFileAsync(
        'git',
        ['diff', '--cached', '--name-only', '--', filePath],
        {
          cwd: taskPath,
        }
      );

      if (stagedStatus.trim()) {
        // File is staged, unstage it (but keep working directory changes)
        await execFileAsync('git', ['reset', 'HEAD', '--', filePath], { cwd: taskPath });
        return { action: 'unstaged' as const };
      }
    } catch {}

    // Check if file is tracked in git (exists in HEAD)
    let fileExistsInHead = false;
    try {
      await execFileAsync('git', ['cat-file', '-e', `HEAD:${filePath}`], { cwd: taskPath });
      fileExistsInHead = true;
    } catch {
      // File doesn't exist in HEAD (it's a new/untracked file), delete it
      const absPath = path.join(taskPath, filePath);
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
      return { action: 'reverted' as const };
    }

    // File exists in HEAD, revert it
    if (fileExistsInHead) {
      try {
        await execFileAsync('git', ['checkout', 'HEAD', '--', filePath], { cwd: taskPath });
      } catch (error) {
        // If checkout fails, don't delete the file - throw the error instead
        throw new Error(
          `Failed to revert file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return { action: 'reverted' as const };
  });
}

export async function getFileDiff(
  taskPath: string,
  filePath: string
): Promise<{
  lines: Array<{ left?: string; right?: string; type: 'context' | 'add' | 'del' }>;
  rawPatch?: string;
}> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--no-color', '--unified=3', 'HEAD', '--', filePath],
      { cwd: taskPath }
    );

    // Store raw patch for diff viewer component
    const rawPatch = stdout;

    const linesRaw = stdout.split('\n');
    const result: Array<{ left?: string; right?: string; type: 'context' | 'add' | 'del' }> = [];
    for (const line of linesRaw) {
      if (!line) continue;
      if (
        line.startsWith('diff ') ||
        line.startsWith('index ') ||
        line.startsWith('--- ') ||
        line.startsWith('+++ ') ||
        line.startsWith('@@')
      )
        continue;
      const prefix = line[0];
      const content = line.slice(1);
      if (prefix === ' ') result.push({ left: content, right: content, type: 'context' });
      else if (prefix === '-') result.push({ left: content, type: 'del' });
      else if (prefix === '+') result.push({ right: content, type: 'add' });
      else result.push({ left: line, right: line, type: 'context' });
    }

    if (result.length === 0) {
      try {
        const abs = path.join(taskPath, filePath);
        const content = await readFileTextCapped(abs, MAX_UNTRACKED_DIFF_BYTES);
        if (content !== null) {
          // For new untracked files, construct a complete unified diff
          const lines = content.split('\n');
          const addLines = lines.map((l) => `+${l}`).join('\n');
          const constructedPatch = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n${addLines}`;
          return {
            lines: lines.map((l) => ({ right: l, type: 'add' as const })),
            rawPatch: constructedPatch,
          };
        }
        const { stdout: prev } = await execFileAsync('git', ['show', `HEAD:${filePath}`], {
          cwd: taskPath,
        });
        // For deleted files, construct a complete unified diff
        const lines = prev.split('\n');
        const delLines = lines.map((l) => `-${l}`).join('\n');
        const constructedPatch = `--- a/${filePath}\n+++ /dev/null\n@@ -1,${lines.length} +0,0 @@\n${delLines}`;
        return {
          lines: lines.map((l) => ({ left: l, type: 'del' as const })),
          rawPatch: constructedPatch,
        };
      } catch {
        return { lines: [] };
      }
    }

    return { lines: result, rawPatch };
  } catch {
    const abs = path.join(taskPath, filePath);
    const content = await readFileTextCapped(abs, MAX_UNTRACKED_DIFF_BYTES);
    if (content !== null) {
      const lines = content.split('\n');
      // For new untracked files, construct a complete unified diff
      const addLines = lines.map((l) => `+${l}`).join('\n');
      const constructedPatch = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n${addLines}`;
      return {
        lines: lines.map((l) => ({ right: l, type: 'add' as const })),
        rawPatch: constructedPatch,
      };
    }
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', '--no-color', '--unified=3', 'HEAD', '--', filePath],
        { cwd: taskPath }
      );
      const rawPatch = stdout;
      const linesRaw = stdout.split('\n');
      const result: Array<{ left?: string; right?: string; type: 'context' | 'add' | 'del' }> = [];
      for (const line of linesRaw) {
        if (!line) continue;
        if (
          line.startsWith('diff ') ||
          line.startsWith('index ') ||
          line.startsWith('--- ') ||
          line.startsWith('+++ ') ||
          line.startsWith('@@')
        )
          continue;
        const prefix = line[0];
        const content = line.slice(1);
        if (prefix === ' ') result.push({ left: content, right: content, type: 'context' });
        else if (prefix === '-') result.push({ left: content, type: 'del' });
        else if (prefix === '+') result.push({ right: content, type: 'add' });
        else result.push({ left: line, right: line, type: 'context' });
      }
      if (result.length === 0) {
        try {
          const { stdout: prev } = await execFileAsync('git', ['show', `HEAD:${filePath}`], {
            cwd: taskPath,
          });
          // For deleted files, construct a complete unified diff
          const lines = prev.split('\n');
          const delLines = lines.map((l) => `-${l}`).join('\n');
          const constructedPatch = `--- a/${filePath}\n+++ /dev/null\n@@ -1,${lines.length} +0,0 @@\n${delLines}`;
          return {
            lines: lines.map((l) => ({ left: l, type: 'del' as const })),
            rawPatch: constructedPatch,
          };
        } catch {
          return { lines: [] };
        }
      }
      return { lines: result, rawPatch };
    } catch {
      return { lines: [] };
    }
  }
}

/**
 * Remove stale Git lock files left by interrupted operations.
 * Only removes locks older than 10 seconds to avoid interfering with active operations.
 */
export async function cleanupStaleLockFiles(): Promise<void> {
  const { databaseService } = await import('./DatabaseService');
  const STALE_THRESHOLD_MS = 10_000;

  let projects: Array<{ path: string | null }>;
  try {
    projects = await databaseService.getProjects();
  } catch {
    return;
  }

  for (const project of projects) {
    if (!project.path) continue;

    const lockPaths = [
      path.join(project.path, '.git', 'index.lock'),
      path.join(project.path, '.git', 'HEAD.lock'),
    ];

    // Also check worktree locks
    const worktreesDir = path.join(project.path, '.git', 'worktrees');
    try {
      const entries = await fs.promises.readdir(worktreesDir);
      for (const entry of entries) {
        lockPaths.push(path.join(worktreesDir, entry, 'index.lock'));
      }
    } catch {
      // No worktrees directory — expected
    }

    for (const lockPath of lockPaths) {
      try {
        const stat = await fs.promises.stat(lockPath);
        const age = Date.now() - stat.mtimeMs;
        if (age > STALE_THRESHOLD_MS) {
          await fs.promises.unlink(lockPath);
          console.warn(
            `Removed stale Git lock file: ${lockPath} (age: ${Math.round(age / 1000)}s)`
          );
        }
      } catch {
        // Lock doesn't exist or can't be removed — skip
      }
    }
  }
}
