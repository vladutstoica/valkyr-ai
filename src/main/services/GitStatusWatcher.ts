import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { log } from '../lib/logger';
import { broadcastToAllWindows } from '../lib/safeSend';

const GIT_STATUS_DEBOUNCE_MS = 500;
const supportsRecursiveWatch = process.platform === 'darwin' || process.platform === 'win32';

type GitStatusWatchEntry = {
  watcher: fs.FSWatcher;
  watchIds: Set<string>;
  debounceTimer?: NodeJS.Timeout;
};

const gitStatusWatchers = new Map<string, GitStatusWatchEntry>();

function broadcastGitStatusChange(taskPath: string, error?: string): void {
  broadcastToAllWindows('git:status-changed', { taskPath, error });
}

/** Clear all debounce timers — called when windows are closing to prevent disposed-frame errors */
export function clearAllDebounceTimers(): void {
  for (const [, entry] of gitStatusWatchers) {
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = undefined;
    }
  }
}

/** Start watching a task path for git status changes. Returns a watchId for later release. */
export function watchGitStatus(taskPath: string) {
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
      } catch {
        // Watcher may already be closed
      }
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
}

/** Release a watch subscription. Closes the watcher when no subscribers remain. */
export function releaseGitStatusWatch(taskPath: string, watchId?: string) {
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
}

/** Close all watchers and clear state. Call on app quit. */
export function closeAllWatchers(): void {
  for (const [, entry] of gitStatusWatchers) {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    try {
      entry.watcher.close();
    } catch {
      // Watcher may already be closed — ignore
    }
  }
  gitStatusWatchers.clear();
}
