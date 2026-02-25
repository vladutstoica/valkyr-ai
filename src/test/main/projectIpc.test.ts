import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();
const execMock = vi.fn();
const execFileMock = vi.fn();
const dialogShowOpenDialogMock = vi.fn();
const getMainWindowMock = vi.fn();
const existsSyncMock = vi.fn();
const realpathMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
  dialog: {
    showOpenDialog: dialogShowOpenDialogMock,
  },
}));

vi.mock('../../main/app/window', () => ({
  getMainWindow: getMainWindowMock,
}));

vi.mock('../../main/errorTracking', () => ({
  errorTracking: {
    captureProjectError: vi.fn(),
  },
}));

vi.mock('../../main/services/DatabaseService', () => ({
  databaseService: {
    getProjectById: vi.fn(),
  },
}));

vi.mock('../../main/lib/logger', () => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('child_process', () => ({
  exec: execMock,
  execFile: execFileMock,
}));

vi.mock('util', () => ({
  promisify: (fn: any) => {
    return (...args: any[]) =>
      new Promise((resolve, reject) => {
        fn(...args, (err: any, stdout: string, stderr: string) => {
          if (err) return reject(err);
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
        });
      });
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...args: any[]) => existsSyncMock(...args),
    promises: {
      realpath: (...args: any[]) => realpathMock(...args),
      readdir: vi.fn().mockResolvedValue([]),
      stat: vi.fn(),
    },
  },
  existsSync: (...args: any[]) => existsSyncMock(...args),
  promises: {
    realpath: (...args: any[]) => realpathMock(...args),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn(),
  },
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

  // Default: resolveGitBin needs existsSync to find git
  existsSyncMock.mockReturnValue(true);
  realpathMock.mockImplementation(async (p: string) => p);

  vi.mock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
    dialog: {
      showOpenDialog: dialogShowOpenDialogMock,
    },
  }));

  const mod = await import('../../main/ipc/projectIpc');
  mod.registerProjectIpc();
});

describe('projectIpc', () => {
  describe('project:open', () => {
    it('returns selected path on success', async () => {
      getMainWindowMock.mockReturnValue({ id: 1 });
      dialogShowOpenDialogMock.mockResolvedValue({
        canceled: false,
        filePaths: ['/Users/test/my-project'],
      });

      const result = await callHandler('project:open');
      expect(result).toEqual({ success: true, path: '/Users/test/my-project' });
    });

    it('returns error when cancelled', async () => {
      getMainWindowMock.mockReturnValue({ id: 1 });
      dialogShowOpenDialogMock.mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await callHandler('project:open');
      expect(result.success).toBe(false);
    });

    it('returns error when no window', async () => {
      getMainWindowMock.mockReturnValue(null);
      const result = await callHandler('project:open');
      expect(result).toEqual({ success: false, error: 'No active window' });
    });
  });

  describe('git:getInfo', () => {
    it('returns isGitRepo false for non-git directory', async () => {
      existsSyncMock.mockImplementation((p: string) => {
        if (p.endsWith('.git')) return false;
        return true;
      });

      const result = await callHandler('git:getInfo', '/tmp/not-git');
      expect(result.isGitRepo).toBe(false);
      expect(result.path).toBe('/tmp/not-git');
    });

    it('returns git info for valid repo', async () => {
      existsSyncMock.mockReturnValue(true);

      // Mock execAsync calls in sequence
      let callCount = 0;
      execMock.mockImplementation((_cmd: string, _opts: any, cb: any) => {
        callCount++;
        switch (callCount) {
          case 1: // git remote get-url origin
            cb(null, 'https://github.com/user/repo.git\n', '');
            break;
          case 2: // git branch --show-current
            cb(null, 'main\n', '');
            break;
          case 3: // git rev-parse --abbrev-ref @{u}
            cb(null, 'origin/main\n', '');
            break;
          case 4: // git rev-list --left-right --count
            cb(null, '2\t1\n', '');
            break;
          case 5: // git rev-parse --show-toplevel
            cb(null, '/tmp/repo\n', '');
            break;
          default:
            cb(null, '', '');
        }
      });

      const result = await callHandler('git:getInfo', '/tmp/repo');
      expect(result.isGitRepo).toBe(true);
      expect(result.remote).toBe('https://github.com/user/repo.git');
      expect(result.branch).toBe('main');
      expect(result.aheadCount).toBe(2);
      expect(result.behindCount).toBe(1);
    });
  });

  describe('git:detectSubRepos', () => {
    it('returns empty when no sub-repos found', async () => {
      existsSyncMock.mockImplementation((p: string) => {
        // Root .git exists
        if (p === '/tmp/project/.git') return true;
        return false;
      });

      // The handler reads the directory for entries to find nested .git dirs
      // With readdir mocked to return [], it should return a result
      execMock.mockImplementation((_cmd: string, _opts: any, cb: any) => {
        cb(null, '', '');
      });

      const result = await callHandler('git:detectSubRepos', '/tmp/project');
      expect(result).toBeDefined();
    });
  });

  describe('project:getBranches', () => {
    it('returns branch data', async () => {
      execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: any, cb: any) => {
        cb(null, 'main\n', '');
      });

      const result = await callHandler('project:getBranches', {
        repoPath: '/tmp/repo',
      });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.current).toBeDefined();
    });

    it('returns error for non-git directory', async () => {
      existsSyncMock.mockImplementation((p: string) => {
        if (p.endsWith('.git')) return false;
        return true;
      });

      const result = await callHandler('project:getBranches', {
        repoPath: '/tmp/not-repo',
      });
      expect(result.success).toBe(false);
    });
  });
});
