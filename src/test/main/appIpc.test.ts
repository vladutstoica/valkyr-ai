import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();
const execFileMock = vi.fn();
const execMock = vi.fn();
const shellOpenExternalMock = vi.fn();
const readFileMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue('/tmp'),
    getName: vi.fn().mockReturnValue('valkyr'),
    getVersion: vi.fn().mockReturnValue('0.2.0'),
    getAppPath: vi.fn().mockReturnValue('/app'),
  },
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
  shell: {
    openExternal: shellOpenExternalMock,
  },
}));

vi.mock('child_process', () => ({
  exec: execMock,
  execFile: execFileMock,
}));

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
}));

vi.mock('../../main/services/ProjectPrep', () => ({
  ensureProjectPrepared: vi.fn(),
}));

vi.mock('../../main/settings', () => ({
  getAppSettings: vi.fn().mockReturnValue({}),
}));

vi.mock('../../main/services/DatabaseService', () => ({
  databaseService: {
    getSshConnection: vi.fn(),
  },
}));

vi.mock('@shared/openInApps', () => ({
  getAppById: vi.fn(),
  OPEN_IN_APPS: [],
}));

async function callHandler(channel: string, ...args: any[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler for channel: ${channel}`);
  return handler({}, ...args);
}

beforeEach(async () => {
  vi.clearAllMocks();
  ipcHandlers.clear();

  // Reset module-level caches by re-importing
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.mock('electron', () => ({
    app: {
      isPackaged: false,
      getPath: vi.fn().mockReturnValue('/tmp'),
      getName: vi.fn().mockReturnValue('valkyr'),
      getVersion: vi.fn().mockReturnValue('0.2.0'),
      getAppPath: vi.fn().mockReturnValue('/app'),
    },
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
    shell: {
      openExternal: shellOpenExternalMock,
    },
  }));

  const mod = await import('../../main/ipc/appIpc');
  mod.registerAppIpc();
});

describe('appIpc', () => {
  describe('app:checkPrerequisites', () => {
    it('detects git and agents when available', async () => {
      execFileMock.mockImplementation((cmd: string, args: string[], cb: any) => {
        if (cmd === 'git') cb(null, 'git version 2.40.0', '');
        else if (cmd === 'which') cb(null, '/usr/local/bin/' + args[0], '');
        else cb(new Error('unknown'));
      });

      const result = await callHandler('app:checkPrerequisites');
      expect(result.success).toBe(true);
      expect(result.data.git).toBe(true);
      expect(result.data.agents.length).toBeGreaterThan(0);
    });

    it('reports git missing when not installed', async () => {
      execFileMock.mockImplementation((cmd: string, _args: string[], cb: any) => {
        if (cmd === 'git') cb(new Error('not found'));
        else if (cmd === 'which') cb(new Error('not found'));
        else cb(new Error('unknown'));
      });

      const result = await callHandler('app:checkPrerequisites');
      expect(result.success).toBe(true);
      expect(result.data.git).toBe(false);
      expect(result.data.agents).toEqual([]);
    });

    it('reports no agents when none installed', async () => {
      execFileMock.mockImplementation((cmd: string, _args: string[], cb: any) => {
        if (cmd === 'git') cb(null, 'git version 2.40.0', '');
        else cb(new Error('not found'));
      });

      const result = await callHandler('app:checkPrerequisites');
      expect(result.data.git).toBe(true);
      expect(result.data.agents).toEqual([]);
    });
  });

  describe('app:openExternal', () => {
    it('opens URL via shell', async () => {
      shellOpenExternalMock.mockResolvedValue(undefined);
      const result = await callHandler('app:openExternal', 'https://example.com');
      expect(shellOpenExternalMock).toHaveBeenCalledWith('https://example.com');
      expect(result).toEqual({ success: true });
    });

    it('returns error for invalid URL', async () => {
      const result = await callHandler('app:openExternal', '');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid URL');
    });

    it('returns error when shell fails', async () => {
      shellOpenExternalMock.mockRejectedValue(new Error('Shell error'));
      const result = await callHandler('app:openExternal', 'https://example.com');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Shell error');
    });
  });

  describe('app:getAppVersion', () => {
    it('returns a version string', async () => {
      readFileMock.mockResolvedValue(JSON.stringify({ name: 'valkyr', version: '1.2.3' }));
      const result = await callHandler('app:getAppVersion');
      expect(typeof result).toBe('string');
    });
  });

  describe('app:getElectronVersion', () => {
    it('returns electron version (undefined outside Electron)', async () => {
      const result = await callHandler('app:getElectronVersion');
      // process.versions.electron is undefined outside Electron runtime
      expect(result === undefined || typeof result === 'string').toBe(true);
    });
  });

  describe('app:getPlatform', () => {
    it('returns process.platform', async () => {
      const result = await callHandler('app:getPlatform');
      expect(result).toBe(process.platform);
    });
  });

  describe('app:checkInstalledApps', () => {
    it('returns an availability map', async () => {
      // OPEN_IN_APPS is mocked as empty array, so result should be empty object
      const result = await callHandler('app:checkInstalledApps');
      expect(typeof result).toBe('object');
    });
  });
});
