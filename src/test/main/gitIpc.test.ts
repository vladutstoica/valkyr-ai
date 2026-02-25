import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();
const appOnMock = vi.fn();
const execFileMock = vi.fn();

const gitGetStatusMock = vi.fn();
const gitGetMultiRepoStatusMock = vi.fn();
const gitGetFileDiffMock = vi.fn();
const gitStageFileMock = vi.fn();
const gitStageAllFilesMock = vi.fn();
const gitUnstageFileMock = vi.fn();
const gitRevertFileMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    on: appOnMock,
  },
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

vi.mock('../../main/lib/logger', () => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../main/lib/safeSend', () => ({
  broadcastToAllWindows: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('../../main/services/GitService', () => ({
  getStatus: gitGetStatusMock,
  getMultiRepoStatus: gitGetMultiRepoStatusMock,
  getFileDiff: gitGetFileDiffMock,
  stageFile: gitStageFileMock,
  stageAllFiles: gitStageAllFilesMock,
  unstageFile: gitUnstageFileMock,
  revertFile: gitRevertFileMock,
}));

vi.mock('../../main/services/GitQueue', () => ({
  gitQueue: { run: vi.fn((_: string, op: () => Promise<any>) => op()) },
}));

vi.mock('../../main/services/PrGenerationService', () => ({
  prGenerationService: {
    generatePrContent: vi.fn(),
  },
}));

vi.mock('../../main/services/DatabaseService', () => ({
  databaseService: {
    getTaskByPath: vi.fn(),
    savePrMetadata: vi.fn(),
    getPrMetadata: vi.fn(),
  },
}));

// Mock fs — validateTaskPath calls fs.existsSync
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    watch: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  watch: vi.fn(),
}));

async function callHandler(channel: string, ...args: any[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler for channel: ${channel}`);
  return handler({}, ...args);
}

beforeEach(async () => {
  vi.clearAllMocks();
  ipcHandlers.clear();
  vi.resetModules();

  // Re-apply electron mock
  vi.mock('electron', () => ({
    app: { on: appOnMock },
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
  }));

  const mod = await import('../../main/ipc/gitIpc');
  mod.registerGitIpc();
});

describe('gitIpc', () => {
  describe('git:get-status', () => {
    it('returns changes for single repo (string arg)', async () => {
      const changes = [{ path: 'file.ts', status: 'modified' }];
      gitGetStatusMock.mockResolvedValue(changes);

      const result = await callHandler('git:get-status', '/tmp/repo');
      expect(result).toEqual({ success: true, changes });
      expect(gitGetStatusMock).toHaveBeenCalledWith('/tmp/repo');
    });

    it('returns changes for single repo (object arg)', async () => {
      const changes = [{ path: 'file.ts', status: 'modified' }];
      gitGetStatusMock.mockResolvedValue(changes);

      const result = await callHandler('git:get-status', { taskPath: '/tmp/repo' });
      expect(result).toEqual({ success: true, changes });
    });

    it('uses multi-repo status when repoMappings provided', async () => {
      const changes = [{ path: 'sub/file.ts', status: 'added' }];
      gitGetMultiRepoStatusMock.mockResolvedValue(changes);

      const mappings = [{ relativePath: 'sub', targetPath: '/tmp/sub' }];
      const result = await callHandler('git:get-status', {
        taskPath: '/tmp/repo',
        repoMappings: mappings,
      });
      expect(result).toEqual({ success: true, changes });
      expect(gitGetMultiRepoStatusMock).toHaveBeenCalledWith(mappings);
    });

    it('returns error when service throws', async () => {
      gitGetStatusMock.mockRejectedValue(new Error('git failed'));
      const result = await callHandler('git:get-status', '/tmp/repo');
      expect(result.success).toBe(false);
      expect(result.error).toBe('git failed');
    });
  });

  describe('git:get-file-diff', () => {
    it('returns diff for a file', async () => {
      const diff = { lines: [{ left: 'old', type: 'del' }], rawPatch: '...' };
      gitGetFileDiffMock.mockResolvedValue(diff);

      const result = await callHandler('git:get-file-diff', {
        taskPath: '/tmp/repo',
        filePath: 'src/file.ts',
      });
      expect(result).toEqual({ success: true, diff });
    });

    it('uses repoCwd when provided', async () => {
      gitGetFileDiffMock.mockResolvedValue({ lines: [] });

      await callHandler('git:get-file-diff', {
        taskPath: '/tmp/repo',
        filePath: 'file.ts',
        repoCwd: '/tmp/subrepo',
      });
      expect(gitGetFileDiffMock).toHaveBeenCalledWith('/tmp/subrepo', 'file.ts');
    });
  });

  describe('git:stage-file', () => {
    it('stages a file successfully', async () => {
      gitStageFileMock.mockResolvedValue(undefined);
      const result = await callHandler('git:stage-file', {
        taskPath: '/tmp/repo',
        filePath: 'src/file.ts',
      });
      expect(result).toEqual({ success: true });
      expect(gitStageFileMock).toHaveBeenCalledWith('/tmp/repo', 'src/file.ts');
    });

    it('returns error on failure', async () => {
      gitStageFileMock.mockRejectedValue(new Error('stage failed'));
      const result = await callHandler('git:stage-file', {
        taskPath: '/tmp/repo',
        filePath: 'file.ts',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('stage failed');
    });
  });

  describe('git:stage-all-files', () => {
    it('stages all files in task path', async () => {
      gitStageAllFilesMock.mockResolvedValue(undefined);
      const result = await callHandler('git:stage-all-files', {
        taskPath: '/tmp/repo',
      });
      expect(result).toEqual({ success: true });
      expect(gitStageAllFilesMock).toHaveBeenCalledWith('/tmp/repo');
    });

    it('stages all files in multiple repoCwds', async () => {
      gitStageAllFilesMock.mockResolvedValue(undefined);
      const result = await callHandler('git:stage-all-files', {
        taskPath: '/tmp/repo',
        repoCwds: ['/tmp/sub1', '/tmp/sub2'],
      });
      expect(result).toEqual({ success: true });
      expect(gitStageAllFilesMock).toHaveBeenCalledTimes(2);
      expect(gitStageAllFilesMock).toHaveBeenCalledWith('/tmp/sub1');
      expect(gitStageAllFilesMock).toHaveBeenCalledWith('/tmp/sub2');
    });
  });

  describe('git:unstage-file', () => {
    it('unstages a file', async () => {
      gitUnstageFileMock.mockResolvedValue(undefined);
      const result = await callHandler('git:unstage-file', {
        taskPath: '/tmp/repo',
        filePath: 'file.ts',
      });
      expect(result).toEqual({ success: true });
      expect(gitUnstageFileMock).toHaveBeenCalledWith('/tmp/repo', 'file.ts');
    });
  });

  describe('git:revert-file', () => {
    it('reverts a file and returns action', async () => {
      gitRevertFileMock.mockResolvedValue({ action: 'reverted' });
      const result = await callHandler('git:revert-file', {
        taskPath: '/tmp/repo',
        filePath: 'file.ts',
      });
      expect(result).toEqual({ success: true, action: 'reverted' });
    });

    it('returns unstaged action for staged file', async () => {
      gitRevertFileMock.mockResolvedValue({ action: 'unstaged' });
      const result = await callHandler('git:revert-file', {
        taskPath: '/tmp/repo',
        filePath: 'file.ts',
      });
      expect(result).toEqual({ success: true, action: 'unstaged' });
    });
  });
});
