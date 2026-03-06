import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getShellEnvVar, detectSshAuthSock, initializeShellEnvironment } from '../shellEnv';

// Mock child_process (both sync and async)
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  statSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { execSync, exec } from 'child_process';
import { statSync, readdirSync } from 'fs';

const mockedExecSync = vi.mocked(execSync);
const mockedExec = vi.mocked(exec);
const mockedStatSync = vi.mocked(statSync);
const mockedReaddirSync = vi.mocked(readdirSync);

describe('shellEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env
    process.env = { ...originalEnv };
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getShellEnvVar', () => {
    it('should return environment variable from shell', () => {
      mockedExecSync.mockReturnValue('/path/to/socket');

      const result = getShellEnvVar('SSH_AUTH_SOCK');

      expect(result).toBe('/path/to/socket');
      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('printenv SSH_AUTH_SOCK'),
        expect.objectContaining({ encoding: 'utf8', timeout: 5000 })
      );
    });

    it('should return undefined when variable is empty', () => {
      mockedExecSync.mockReturnValue('');

      const result = getShellEnvVar('SSH_AUTH_SOCK');

      expect(result).toBeUndefined();
    });

    it('should return undefined when shell command fails', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = getShellEnvVar('SSH_AUTH_SOCK');

      expect(result).toBeUndefined();
    });
  });

  describe('detectSshAuthSock', () => {
    it('should return existing SSH_AUTH_SOCK if already set', async () => {
      process.env.SSH_AUTH_SOCK = '/existing/socket';

      const result = await detectSshAuthSock();

      expect(result).toBe('/existing/socket');
      expect(mockedExecSync).not.toHaveBeenCalled();
    });

    it('should check common locations before shell detection', async () => {
      delete process.env.SSH_AUTH_SOCK;
      mockedExecSync.mockImplementation(() => {
        throw new Error('launchctl detection failed');
      });

      // Mock readdirSync to simulate finding a socket
      mockedReaddirSync.mockImplementation((dirPath) => {
        const pathStr = dirPath.toString();
        if (pathStr.includes('com.apple.launchd')) {
          return ['Listeners'] as any;
        }
        return [] as any;
      });

      // Mock statSync to indicate it's a socket
      mockedStatSync.mockReturnValue({ isSocket: () => true } as any);

      const result = await detectSshAuthSock();

      // Should find the socket in common locations
      expect(result).toBeTruthy();
    });

    it('should fall back to async shell detection', async () => {
      delete process.env.SSH_AUTH_SOCK;
      mockedExecSync.mockImplementation(() => {
        throw new Error('launchctl detection failed');
      });
      mockedReaddirSync.mockImplementation(() => [] as any);
      mockedStatSync.mockImplementation(() => {
        throw new Error('Not found');
      });

      // Mock async exec to return the socket
      mockedExec.mockImplementation((_cmd: any, _opts: any, cb: any) => {
        cb(null, '/async/detected/socket\n', '');
        return {} as any;
      });

      const result = await detectSshAuthSock();

      expect(result).toBe('/async/detected/socket');
    });

    it('should return undefined when no socket is found', async () => {
      delete process.env.SSH_AUTH_SOCK;
      mockedExecSync.mockImplementation(() => {
        throw new Error('Shell detection failed');
      });
      mockedReaddirSync.mockImplementation(() => [] as any);
      mockedStatSync.mockImplementation(() => {
        throw new Error('Not found');
      });

      // Mock async exec to return nothing
      mockedExec.mockImplementation((_cmd: any, _opts: any, cb: any) => {
        cb(null, '', '');
        return {} as any;
      });

      const result = await detectSshAuthSock();

      expect(result).toBeUndefined();
    });
  });

  describe('initializeShellEnvironment', () => {
    it('should set process.env.SSH_AUTH_SOCK when socket is detected', async () => {
      delete process.env.SSH_AUTH_SOCK;
      mockedExecSync.mockReturnValue('/detected/socket');

      await initializeShellEnvironment();

      expect(process.env.SSH_AUTH_SOCK).toBe('/detected/socket');
    });

    it('should not overwrite existing SSH_AUTH_SOCK', async () => {
      process.env.SSH_AUTH_SOCK = '/existing/socket';

      await initializeShellEnvironment();

      expect(process.env.SSH_AUTH_SOCK).toBe('/existing/socket');
      expect(mockedExecSync).not.toHaveBeenCalled();
    });
  });
});
