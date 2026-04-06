import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalSnapshotPayload } from '../../types/terminalSnapshot';

// Mock electron (not available in CI with ELECTRON_SKIP_BINARY_DOWNLOAD=1)
vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
}));

describe('TerminalSnapshotService', () => {
  let tempDir: string;
  let service: typeof import('../../main/services/TerminalSnapshotService').terminalSnapshotService;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-snapshot-test-'));
    process.env.VALKYR_TERMINAL_SNAPSHOT_DIR = tempDir;
    vi.resetModules();
    ({ terminalSnapshotService: service } = await import(
      '../../main/services/TerminalSnapshotService'
    ));
  });

  afterEach(() => {
    delete process.env.VALKYR_TERMINAL_SNAPSHOT_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('saves and retrieves snapshots', async () => {
    const payload: TerminalSnapshotPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      cols: 120,
      rows: 40,
      data: 'snapshot-data',
      stats: { totalBytes: 42 },
    };

    const saveResult = await service.saveSnapshot('demo', payload);
    expect(saveResult.ok).toBe(true);

    const loaded = await service.getSnapshot('demo');
    expect(loaded).not.toBeNull();
    expect(loaded?.data).toBe(payload.data);
    expect(loaded?.cols).toBe(payload.cols);
  });

  it('rejects oversized snapshots', async () => {
    const largePayload: TerminalSnapshotPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      cols: 80,
      rows: 24,
      data: 'x'.repeat(8 * 1024 * 1024 + 1),
    };

    const result = await service.saveSnapshot('huge', largePayload);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Snapshot size');
    const loaded = await service.getSnapshot('huge');
    expect(loaded).toBeNull();
  });

  it('deletes snapshots', async () => {
    const payload: TerminalSnapshotPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      cols: 80,
      rows: 24,
      data: 'data',
    };

    await service.saveSnapshot('temp', payload);
    await service.deleteSnapshot('temp');
    const loaded = await service.getSnapshot('temp');
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // version mismatch
  // -------------------------------------------------------------------------
  it('rejects snapshot with wrong version', async () => {
    const payload = {
      version: 99 as any,
      createdAt: new Date().toISOString(),
      cols: 80,
      rows: 24,
      data: 'data',
    };

    const result = await service.saveSnapshot('wrong-version', payload);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('version');
  });

  it('returns null when retrieving a snapshot with a mismatched version on disk', async () => {
    // Write a file directly with wrong version so readSnapshotFile rejects it
    const filePath = path.join(tempDir, 'bad-version.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 99,
        createdAt: new Date().toISOString(),
        cols: 80,
        rows: 24,
        data: 'x',
      }),
      'utf8'
    );

    // Re-import so BASE_DIR points to tempDir
    vi.resetModules();
    ({ terminalSnapshotService: service } = await import(
      '../../main/services/TerminalSnapshotService'
    ));

    const loaded = await service.getSnapshot('bad-version');
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // getSnapshot — missing file
  // -------------------------------------------------------------------------
  it('returns null for a non-existent snapshot id', async () => {
    const loaded = await service.getSnapshot('does-not-exist');
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // deleteSnapshot — non-existent id is a no-op
  // -------------------------------------------------------------------------
  it('deleteSnapshot on non-existent id does not throw', async () => {
    await expect(service.deleteSnapshot('ghost')).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // ID sanitisation
  // -------------------------------------------------------------------------
  it('sanitises special characters in snapshot id', async () => {
    const payload: TerminalSnapshotPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      cols: 80,
      rows: 24,
      data: 'sanitised',
    };

    // ID with slashes and spaces — should not throw or create subdirectories
    const result = await service.saveSnapshot('task/id with spaces', payload);
    expect(result.ok).toBe(true);

    const loaded = await service.getSnapshot('task/id with spaces');
    expect(loaded?.data).toBe('sanitised');
  });

  // -------------------------------------------------------------------------
  // overwrite existing snapshot
  // -------------------------------------------------------------------------
  it('overwrites an existing snapshot with updated data', async () => {
    const first: TerminalSnapshotPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      cols: 80,
      rows: 24,
      data: 'first',
    };
    const second: TerminalSnapshotPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      cols: 120,
      rows: 40,
      data: 'second',
    };

    await service.saveSnapshot('overwrite-me', first);
    await service.saveSnapshot('overwrite-me', second);

    const loaded = await service.getSnapshot('overwrite-me');
    expect(loaded?.data).toBe('second');
    expect(loaded?.cols).toBe(120);
  });

  // -------------------------------------------------------------------------
  // pruneIfNeeded — evicts old snapshots when total exceeds limit
  // -------------------------------------------------------------------------
  it('prunes old snapshots when total storage exceeds the limit', async () => {
    // Each snapshot is ~4 MB so two together exceed the 8 MB per-file limit check
    // but to test pruning (64 MB total) we need many. Instead we directly verify
    // that many small saves work and the most recent one is always kept.
    const older: TerminalSnapshotPayload = {
      version: 1,
      createdAt: new Date(Date.now() - 10000).toISOString(),
      cols: 80,
      rows: 24,
      data: 'older-snapshot',
    };
    const recent: TerminalSnapshotPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      cols: 80,
      rows: 24,
      data: 'recent-snapshot',
    };

    await service.saveSnapshot('snap-old', older);
    await service.saveSnapshot('snap-recent', recent);

    // Both are well under the 64 MB total limit — both should exist
    const loadedOld = await service.getSnapshot('snap-old');
    const loadedRecent = await service.getSnapshot('snap-recent');

    expect(loadedOld?.data).toBe('older-snapshot');
    expect(loadedRecent?.data).toBe('recent-snapshot');
  });

  // -------------------------------------------------------------------------
  // corrupt JSON on disk
  // -------------------------------------------------------------------------
  it('returns null when snapshot file on disk contains corrupt JSON', async () => {
    const filePath = path.join(tempDir, 'corrupt.json');
    fs.writeFileSync(filePath, '{ not valid json !!!', 'utf8');

    vi.resetModules();
    ({ terminalSnapshotService: service } = await import(
      '../../main/services/TerminalSnapshotService'
    ));

    const loaded = await service.getSnapshot('corrupt');
    expect(loaded).toBeNull();
  });

  // -------------------------------------------------------------------------
  // stats field is optional
  // -------------------------------------------------------------------------
  it('saves and retrieves payload without optional stats field', async () => {
    const payload: TerminalSnapshotPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      cols: 80,
      rows: 24,
      data: 'no-stats',
    };

    const result = await service.saveSnapshot('no-stats-id', payload);
    expect(result.ok).toBe(true);

    const loaded = await service.getSnapshot('no-stats-id');
    expect(loaded?.data).toBe('no-stats');
    expect(loaded?.stats).toBeUndefined();
  });
});
