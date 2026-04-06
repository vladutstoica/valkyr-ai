import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import type { FsListItem, FsListWorkerResponse } from '../../types/fsListWorker';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_TIME_BUDGET_MS,
  MAX_FILES_TO_SEARCH,
  MAX_TIME_BUDGET_MS,
  MIN_TIME_BUDGET_MS,
} from './fsConstants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListArgs {
  root: string;
  includeDirs?: boolean;
  maxEntries?: number;
  timeBudgetMs?: number;
}

interface ListWorkerState {
  worker: Worker;
  requestId: number;
  canceled: boolean;
}

export interface ListResult {
  items?: FsListItem[];
  truncated?: boolean;
  reason?: string;
  durationMs?: number;
  canceled?: boolean;
}

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

/**
 * FsListService manages a small pool of reusable Worker threads for directory
 * listing so that each `fs:list` call does not pay the cost of spawning a new
 * Worker process.
 *
 * Pool design:
 * - Up to POOL_SIZE workers are kept alive between requests.
 * - A worker is checked out (marked busy) for the duration of one job.
 * - Workers that remain idle for IDLE_TIMEOUT_MS are terminated.
 * - If all pool slots are occupied a fresh worker is spawned (burst capacity).
 */

const POOL_SIZE = 3;
const IDLE_TIMEOUT_MS = 30_000;

interface PoolEntry {
  worker: Worker;
  busy: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export class FsListService {
  private readonly workerPath: string;
  private readonly pool: PoolEntry[] = [];
  /** Per-sender cancellation tracking (keyed by webContents sender id). */
  private readonly senderStates = new Map<number, ListWorkerState>();

  constructor(workerPath?: string) {
    // __dirname resolves to the compiled output directory at runtime.
    this.workerPath = workerPath ?? path.join(__dirname, '..', 'workers', 'fsListWorker.js');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Run a directory listing for the given `args`.
   * `senderId` is the `event.sender.id` from the IPC event — used to cancel
   * any in-flight request from the same renderer tab.
   */
  async list(senderId: number, args: ListArgs): Promise<ListResult> {
    const root = args.root;
    if (!root || !fs.existsSync(root)) {
      throw new Error('Invalid root path');
    }

    const includeDirs = args.includeDirs ?? true;
    const maxEntries = Math.min(Math.max(args.maxEntries ?? 5000, 100), MAX_FILES_TO_SEARCH);
    const timeBudgetMs = Math.min(
      Math.max(args.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS, MIN_TIME_BUDGET_MS),
      MAX_TIME_BUDGET_MS
    );

    // Cancel any previous in-flight request from this sender
    const prev = this.senderStates.get(senderId);
    if (prev) {
      prev.canceled = true;
      this.releaseWorkerByWorker(prev.worker, true);
    }

    const requestId = (prev?.requestId ?? 0) + 1;
    const worker = this.acquireWorker();
    const state: ListWorkerState = { worker, requestId, canceled: false };
    this.senderStates.set(senderId, state);

    try {
      const response = await this.runWorker(worker, state, {
        taskId: requestId,
        root,
        includeDirs,
        maxEntries,
        timeBudgetMs,
        batchSize: DEFAULT_BATCH_SIZE,
      });

      const latest = this.senderStates.get(senderId);
      if (!latest || latest.requestId !== requestId || state.canceled) {
        return { canceled: true };
      }
      this.senderStates.delete(senderId);

      if (!response.ok) {
        if (response.error === 'Canceled') return { canceled: true };
        throw new Error(response.error);
      }

      return {
        items: response.items,
        truncated: response.truncated,
        reason: response.reason,
        durationMs: response.durationMs,
      };
    } finally {
      this.releaseWorkerByWorker(worker, false);
    }
  }

  // ---------------------------------------------------------------------------
  // Worker pool internals
  // ---------------------------------------------------------------------------

  private acquireWorker(): Worker {
    // Try to reuse an idle pool worker
    for (const entry of this.pool) {
      if (!entry.busy) {
        entry.busy = true;
        if (entry.idleTimer !== null) {
          clearTimeout(entry.idleTimer);
          entry.idleTimer = null;
        }
        return entry.worker;
      }
    }

    // All pool slots busy or pool not yet full — spawn a new worker
    const worker = new Worker(this.workerPath);

    if (this.pool.length < POOL_SIZE) {
      const entry: PoolEntry = { worker, busy: true, idleTimer: null };
      this.pool.push(entry);
    }
    // Workers spawned beyond POOL_SIZE are not tracked in the pool and are
    // terminated immediately after use (handled in releaseWorkerByWorker).

    return worker;
  }

  private releaseWorkerByWorker(worker: Worker, terminate: boolean): void {
    const entry = this.pool.find((e) => e.worker === worker);

    if (terminate || !entry) {
      worker.terminate().catch(() => {});
      if (entry) {
        this.pool.splice(this.pool.indexOf(entry), 1);
      }
      return;
    }

    entry.busy = false;
    // Schedule idle cleanup
    entry.idleTimer = setTimeout(() => {
      worker.terminate().catch(() => {});
      const idx = this.pool.indexOf(entry);
      if (idx !== -1) this.pool.splice(idx, 1);
    }, IDLE_TIMEOUT_MS);
  }

  private runWorker(
    worker: Worker,
    state: ListWorkerState,
    message: object
  ): Promise<FsListWorkerResponse> {
    return new Promise<FsListWorkerResponse>((resolve, reject) => {
      const cleanup = () => {
        worker.removeAllListeners('message');
        worker.removeAllListeners('error');
        worker.removeAllListeners('exit');
      };

      worker.once('message', (msg) => {
        cleanup();
        resolve(msg as FsListWorkerResponse);
      });

      worker.once('error', (err) => {
        cleanup();
        reject(err);
      });

      worker.once('exit', (code) => {
        cleanup();
        if (state.canceled) {
          resolve({ taskId: state.requestId, ok: false, error: 'Canceled' });
          return;
        }
        if (code === 0) {
          resolve({ taskId: state.requestId, ok: false, error: 'Worker exited before responding' });
          return;
        }
        reject(new Error(`fs:list worker exited with code ${code}`));
      });

      worker.postMessage(message);
    });
  }
}

export const fsListService = new FsListService();
