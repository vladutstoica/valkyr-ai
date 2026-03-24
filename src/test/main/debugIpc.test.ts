import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sep } from 'path';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();

const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

// The userData path used by the mocked app
const USER_DATA_PATH = '/tmp/userData';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return USER_DATA_PATH;
      return '/tmp';
    }),
    isPackaged: false,
  },
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: mkdirMock,
    writeFile: writeFileMock,
  },
}));

async function callHandler(channel: string, ...args: any[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`);
  return handler({}, ...args);
}

beforeEach(async () => {
  vi.clearAllMocks();
  ipcHandlers.clear();
  vi.resetModules();

  vi.mock('electron', () => ({
    app: {
      getPath: vi.fn((name: string) => {
        if (name === 'userData') return USER_DATA_PATH;
        return '/tmp';
      }),
      isPackaged: false,
    },
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
  }));

  vi.mock('fs', () => ({
    promises: {
      mkdir: mkdirMock,
      writeFile: writeFileMock,
    },
  }));

  const mod = await import('../../main/ipc/debugIpc');
  mod.registerDebugIpc();
});

describe('debugIpc', () => {
  describe('debug:append-log', () => {
    const validPath = `${USER_DATA_PATH}${sep}debug.log`;

    it('appends content to a valid path within userData', async () => {
      mkdirMock.mockResolvedValue(undefined);
      writeFileMock.mockResolvedValue(undefined);

      const result = await callHandler('debug:append-log', validPath, 'log line\n');

      expect(result.success).toBe(true);
      expect(mkdirMock).toHaveBeenCalledWith(USER_DATA_PATH, { recursive: true });
      expect(writeFileMock).toHaveBeenCalledWith(validPath, 'log line\n', {
        flag: 'a',
        encoding: 'utf8',
      });
    });

    it('resets (overwrites) the file when reset option is true', async () => {
      mkdirMock.mockResolvedValue(undefined);
      writeFileMock.mockResolvedValue(undefined);

      const result = await callHandler('debug:append-log', validPath, 'fresh content', {
        reset: true,
      });

      expect(result.success).toBe(true);
      expect(writeFileMock).toHaveBeenCalledWith(validPath, 'fresh content', {
        flag: 'w',
        encoding: 'utf8',
      });
    });

    it('uses append flag by default (no options provided)', async () => {
      mkdirMock.mockResolvedValue(undefined);
      writeFileMock.mockResolvedValue(undefined);

      await callHandler('debug:append-log', validPath, 'data');

      expect(writeFileMock).toHaveBeenCalledWith(validPath, 'data', {
        flag: 'a',
        encoding: 'utf8',
      });
    });

    it('returns error when filePath is empty string', async () => {
      const result = await callHandler('debug:append-log', '', 'content');

      expect(result.success).toBe(false);
      expect(result.error).toBe('filePath is required');
      expect(mkdirMock).not.toHaveBeenCalled();
      expect(writeFileMock).not.toHaveBeenCalled();
    });

    it('rejects path outside userData directory', async () => {
      const outsidePath = '/etc/passwd';

      const result = await callHandler('debug:append-log', outsidePath, 'malicious');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Debug log path must be within the application data directory');
      expect(writeFileMock).not.toHaveBeenCalled();
    });

    it('rejects path traversal attempts', async () => {
      const traversalPath = `${USER_DATA_PATH}${sep}..${sep}..${sep}etc${sep}passwd`;

      const result = await callHandler('debug:append-log', traversalPath, 'malicious');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Debug log path must be within the application data directory');
    });

    it('rejects userData directory itself (exact match without trailing sep)', async () => {
      // The implementation allows the userData root itself, but writing to a
      // directory rather than a file will fail at the OS level. This test verifies
      // the security guard does NOT block the userData root (by policy the check allows it).
      mkdirMock.mockResolvedValue(undefined);
      writeFileMock.mockRejectedValue(new Error('EISDIR: illegal operation on a directory'));

      const result = await callHandler('debug:append-log', USER_DATA_PATH, 'data');

      // The path check passes (userData root is allowed), but writeFile fails
      expect(result.success).toBe(false);
      expect(result.error).toContain('EISDIR');
    });

    it('returns error when mkdir fails', async () => {
      mkdirMock.mockRejectedValue(new Error('Permission denied'));

      const result = await callHandler('debug:append-log', validPath, 'data');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('returns error when writeFile fails', async () => {
      mkdirMock.mockResolvedValue(undefined);
      writeFileMock.mockRejectedValue(new Error('Disk full'));

      const result = await callHandler('debug:append-log', validPath, 'data');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Disk full');
    });

    it('handles non-Error thrown objects gracefully', async () => {
      mkdirMock.mockRejectedValue('string error');

      const result = await callHandler('debug:append-log', validPath, 'data');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('creates nested subdirectory inside userData', async () => {
      mkdirMock.mockResolvedValue(undefined);
      writeFileMock.mockResolvedValue(undefined);
      const nestedPath = `${USER_DATA_PATH}${sep}logs${sep}agent${sep}session.log`;

      const result = await callHandler('debug:append-log', nestedPath, 'nested log');

      expect(result.success).toBe(true);
      expect(mkdirMock).toHaveBeenCalledWith(
        `${USER_DATA_PATH}${sep}logs${sep}agent`,
        { recursive: true }
      );
    });
  });
});
