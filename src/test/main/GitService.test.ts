import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (must be declared before dynamic import) ---

const execFileMock = vi.fn();
vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('util', () => ({
  promisify: (fn: any) => {
    // Return a function that wraps execFileMock as a promise
    return (...args: any[]) =>
      new Promise((resolve, reject) => {
        fn(...args, (err: any, stdout: string, stderr: string) => {
          if (err) return reject(err);
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
        });
      });
  },
}));

vi.mock('../../main/services/GitQueue', () => ({
  gitQueue: {
    run: vi.fn((_repoPath: string, operation: () => Promise<any>) => operation()),
  },
}));

// We need to mock fs for countFileNewlinesCapped / readFileTextCapped
const statMock = vi.fn();
const readFileMock = vi.fn();
const createReadStreamMock = vi.fn();
const existsSyncMock = vi.fn();
const unlinkSyncMock = vi.fn();
const readdirMock = vi.fn();
const unlinkMock = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: (...args: any[]) => existsSyncMock(...args),
    unlinkSync: (...args: any[]) => unlinkSyncMock(...args),
    createReadStream: (...args: any[]) => createReadStreamMock(...args),
    promises: {
      stat: (...args: any[]) => statMock(...args),
      readFile: (...args: any[]) => readFileMock(...args),
      readdir: (...args: any[]) => readdirMock(...args),
      unlink: (...args: any[]) => unlinkMock(...args),
    },
  },
  existsSync: (...args: any[]) => existsSyncMock(...args),
  unlinkSync: (...args: any[]) => unlinkSyncMock(...args),
  createReadStream: (...args: any[]) => createReadStreamMock(...args),
  promises: {
    stat: (...args: any[]) => statMock(...args),
    readFile: (...args: any[]) => readFileMock(...args),
    readdir: (...args: any[]) => readdirMock(...args),
    unlink: (...args: any[]) => unlinkMock(...args),
  },
}));

let getStatus: typeof import('../../main/services/GitService').getStatus;
let getMultiRepoStatus: typeof import('../../main/services/GitService').getMultiRepoStatus;
let stageFile: typeof import('../../main/services/GitService').stageFile;
let stageAllFiles: typeof import('../../main/services/GitService').stageAllFiles;
let unstageFile: typeof import('../../main/services/GitService').unstageFile;
let revertFile: typeof import('../../main/services/GitService').revertFile;
let getFileDiff: typeof import('../../main/services/GitService').getFileDiff;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  const mod = await import('../../main/services/GitService');
  getStatus = mod.getStatus;
  getMultiRepoStatus = mod.getMultiRepoStatus;
  stageFile = mod.stageFile;
  stageAllFiles = mod.stageAllFiles;
  unstageFile = mod.unstageFile;
  revertFile = mod.revertFile;
  getFileDiff = mod.getFileDiff;
});

// Helper: make execFileMock resolve in order for sequential calls
function mockExecFileSequence(responses: Array<{ stdout?: string; err?: Error }>) {
  let callIndex = 0;
  execFileMock.mockImplementation((...args: any[]) => {
    const cb = args[args.length - 1];
    const response = responses[callIndex++] || { stdout: '' };
    if (typeof cb === 'function') {
      if (response.err) cb(response.err, '', '');
      else cb(null, response.stdout ?? '', '');
    }
  });
}

describe('GitService', () => {
  describe('getStatus', () => {
    it('returns empty array for non-git directory', async () => {
      // rev-parse fails → not a git repo
      mockExecFileSequence([{ err: new Error('not a git repo') }]);
      const result = await getStatus('/tmp/not-a-repo');
      expect(result).toEqual([]);
    });

    it('returns empty array when no changes', async () => {
      mockExecFileSequence([
        { stdout: 'true' }, // rev-parse
        { stdout: '' }, // status --porcelain (empty)
      ]);
      const result = await getStatus('/tmp/repo');
      expect(result).toEqual([]);
    });

    it('parses modified files correctly', async () => {
      mockExecFileSequence([
        { stdout: 'true' }, // rev-parse
        { stdout: ' M src/file.ts\n' }, // status --porcelain
        { stdout: '5\t2\tsrc/file.ts\n' }, // diff --numstat --cached
        { stdout: '3\t1\tsrc/file.ts\n' }, // diff --numstat (unstaged)
      ]);
      const result = await getStatus('/tmp/repo');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: 'src/file.ts',
        status: 'modified',
        additions: 8,
        deletions: 3,
        isStaged: false,
      });
    });

    it('parses added (untracked) files correctly', async () => {
      // For untracked files, numstat returns empty, so it falls through to countFileNewlinesCapped
      statMock.mockResolvedValueOnce({ isFile: () => true, size: 100 });
      // Mock createReadStream for newline counting
      const mockStream = {
        on: vi.fn((event: string, cb: any) => {
          if (event === 'data') cb(Buffer.from('line1\nline2\nline3\n'));
          if (event === 'end') cb();
          return mockStream;
        }),
      };
      createReadStreamMock.mockReturnValueOnce(mockStream);

      mockExecFileSequence([
        { stdout: 'true' }, // rev-parse
        { stdout: '?? new-file.ts\n' }, // status --porcelain
        { stdout: '' }, // diff --numstat --cached (empty for untracked)
        { stdout: '' }, // diff --numstat (empty for untracked)
      ]);

      const result = await getStatus('/tmp/repo');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('added');
      expect(result[0].isStaged).toBe(false);
      expect(result[0].additions).toBe(3);
    });

    it('parses staged files correctly', async () => {
      mockExecFileSequence([
        { stdout: 'true' }, // rev-parse
        { stdout: 'A  staged.ts\n' }, // status --porcelain
        { stdout: '10\t0\tstaged.ts\n' }, // diff --numstat --cached
        { stdout: '' }, // diff --numstat (no unstaged changes)
      ]);
      const result = await getStatus('/tmp/repo');
      expect(result).toHaveLength(1);
      expect(result[0].isStaged).toBe(true);
      expect(result[0].status).toBe('added');
    });

    it('parses deleted files correctly', async () => {
      mockExecFileSequence([
        { stdout: 'true' }, // rev-parse
        { stdout: ' D removed.ts\n' }, // status --porcelain
        { stdout: '' }, // diff --numstat --cached
        { stdout: '0\t15\tremoved.ts\n' }, // diff --numstat
      ]);
      const result = await getStatus('/tmp/repo');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('deleted');
      expect(result[0].deletions).toBe(15);
    });

    it('parses renamed files correctly', async () => {
      mockExecFileSequence([
        { stdout: 'true' }, // rev-parse
        { stdout: 'R  old.ts -> new.ts\n' }, // status --porcelain
        { stdout: '0\t0\tnew.ts\n' }, // diff --numstat --cached
        { stdout: '' }, // diff --numstat
      ]);
      const result = await getStatus('/tmp/repo');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('new.ts');
      expect(result[0].status).toBe('renamed');
    });

    it('handles multiple files', async () => {
      mockExecFileSequence([
        { stdout: 'true' }, // rev-parse
        { stdout: ' M file1.ts\nA  file2.ts\n' }, // status --porcelain
        // file1 numstat calls
        { stdout: '1\t1\tfile1.ts\n' },
        { stdout: '' },
        // file2 numstat calls
        { stdout: '5\t0\tfile2.ts\n' },
        { stdout: '' },
      ]);
      const result = await getStatus('/tmp/repo');
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('file1.ts');
      expect(result[1].path).toBe('file2.ts');
    });
  });

  describe('getMultiRepoStatus', () => {
    it('prefixes paths with repo name', async () => {
      mockExecFileSequence([
        { stdout: 'true' }, // rev-parse for repo-a
        { stdout: 'M  src/a.ts\n' }, // status for repo-a
        { stdout: '1\t0\tsrc/a.ts\n' }, // numstat cached
        { stdout: '' }, // numstat unstaged
        { stdout: 'true' }, // rev-parse for repo-b
        { stdout: '' }, // status for repo-b (no changes)
      ]);

      const result = await getMultiRepoStatus([
        { relativePath: 'repo-a', targetPath: '/tmp/repo-a' },
        { relativePath: 'repo-b', targetPath: '/tmp/repo-b' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('repo-a/src/a.ts');
      expect(result[0].repoName).toBe('repo-a');
      expect(result[0].repoCwd).toBe('/tmp/repo-a');
    });
  });

  describe('stageFile', () => {
    it('calls git add with correct args', async () => {
      mockExecFileSequence([{ stdout: '' }]);
      await stageFile('/tmp/repo', 'src/file.ts');
      expect(execFileMock).toHaveBeenCalledWith(
        'git',
        ['add', '--', 'src/file.ts'],
        { cwd: '/tmp/repo' },
        expect.any(Function)
      );
    });
  });

  describe('stageAllFiles', () => {
    it('calls git add -A', async () => {
      mockExecFileSequence([{ stdout: '' }]);
      await stageAllFiles('/tmp/repo');
      expect(execFileMock).toHaveBeenCalledWith(
        'git',
        ['add', '-A'],
        { cwd: '/tmp/repo' },
        expect.any(Function)
      );
    });
  });

  describe('unstageFile', () => {
    it('calls git reset HEAD', async () => {
      mockExecFileSequence([{ stdout: '' }]);
      await unstageFile('/tmp/repo', 'src/file.ts');
      expect(execFileMock).toHaveBeenCalledWith(
        'git',
        ['reset', 'HEAD', '--', 'src/file.ts'],
        { cwd: '/tmp/repo' },
        expect.any(Function)
      );
    });
  });

  describe('revertFile', () => {
    it('unstages a staged file', async () => {
      mockExecFileSequence([
        { stdout: 'src/file.ts\n' }, // diff --cached (file IS staged)
        { stdout: '' }, // git reset HEAD
      ]);
      const result = await revertFile('/tmp/repo', 'src/file.ts');
      expect(result).toEqual({ action: 'unstaged' });
    });

    it('reverts a tracked modified file', async () => {
      mockExecFileSequence([
        { stdout: '' }, // diff --cached (not staged)
        { stdout: '' }, // cat-file -e (file exists in HEAD)
        { stdout: '' }, // git checkout HEAD
      ]);
      const result = await revertFile('/tmp/repo', 'src/file.ts');
      expect(result).toEqual({ action: 'reverted' });
    });

    it('deletes an untracked file', async () => {
      existsSyncMock.mockReturnValueOnce(true);
      mockExecFileSequence([
        { stdout: '' }, // diff --cached (not staged)
        { err: new Error('not in HEAD') }, // cat-file -e fails (untracked)
      ]);
      const result = await revertFile('/tmp/repo', 'newfile.ts');
      expect(result).toEqual({ action: 'reverted' });
      expect(unlinkSyncMock).toHaveBeenCalled();
    });
  });

  describe('getFileDiff', () => {
    it('parses unified diff output', async () => {
      const diffOutput = [
        'diff --git a/file.ts b/file.ts',
        'index abc..def 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1,3 +1,3 @@',
        ' line1',
        '-old line',
        '+new line',
        ' line3',
      ].join('\n');

      mockExecFileSequence([{ stdout: diffOutput }]);
      const result = await getFileDiff('/tmp/repo', 'file.ts');
      // 4 lines: context, del, add, context
      expect(result.lines.length).toBeGreaterThanOrEqual(3);
      expect(result.lines[0]).toEqual({ left: 'line1', right: 'line1', type: 'context' });
      expect(result.lines[1]).toEqual({ left: 'old line', type: 'del' });
      expect(result.lines[2]).toEqual({ right: 'new line', type: 'add' });
      expect(result.rawPatch).toBe(diffOutput);
    });

    it('handles untracked file (no git diff, reads file)', async () => {
      statMock.mockResolvedValueOnce({ isFile: () => true, size: 50 });
      readFileMock.mockResolvedValueOnce('new content\nline 2');

      mockExecFileSequence([
        { stdout: '' }, // git diff returns empty
      ]);

      const result = await getFileDiff('/tmp/repo', 'new-file.ts');
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toEqual({ right: 'new content', type: 'add' });
      expect(result.lines[1]).toEqual({ right: 'line 2', type: 'add' });
      expect(result.rawPatch).toContain('+++ b/new-file.ts');
    });
  });
});
