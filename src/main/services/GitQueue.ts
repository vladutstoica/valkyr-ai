import { Mutex } from 'async-mutex';
import * as path from 'path';

class GitQueue {
  private mutexes = new Map<string, Mutex>();

  private getMutex(repoPath: string): Mutex {
    const normalized = path.resolve(repoPath);
    if (!this.mutexes.has(normalized)) {
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
}

export const gitQueue = new GitQueue();
