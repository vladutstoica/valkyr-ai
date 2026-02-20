import { Mutex } from 'async-mutex';
import * as path from 'path';

class GitQueue {
  private mutexes = new Map<string, Mutex>();
  private static readonly MAX_IDLE_MUTEXES = 50;

  private getMutex(repoPath: string): Mutex {
    const normalized = path.resolve(repoPath);
    if (!this.mutexes.has(normalized)) {
      // Prune idle mutexes if the map has grown too large
      if (this.mutexes.size >= GitQueue.MAX_IDLE_MUTEXES) {
        this.pruneIdle();
      }
      this.mutexes.set(normalized, new Mutex());
    }
    return this.mutexes.get(normalized)!;
  }

  /** Run a git operation exclusively per-repo. Serializes writes, prevents lock contention. */
  async run<T>(repoPath: string, operation: () => Promise<T>): Promise<T> {
    return this.getMutex(repoPath).runExclusive(operation);
  }

  /** Clean up mutex when a repo/worktree is removed */
  remove(repoPath: string): void {
    this.mutexes.delete(path.resolve(repoPath));
  }

  /** Remove all idle (unlocked) mutexes to prevent unbounded growth */
  private pruneIdle(): void {
    for (const [key, mutex] of this.mutexes) {
      if (!mutex.isLocked()) {
        this.mutexes.delete(key);
      }
    }
  }
}

export const gitQueue = new GitQueue();
