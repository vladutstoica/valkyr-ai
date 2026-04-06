/**
 * Shared Electron mock factories for unit tests.
 *
 * Usage:
 *   import { createElectronMock, createIpcMainMock } from '../helpers/electronMock';
 *   vi.mock('electron', () => createElectronMock());
 *
 * These helpers reduce boilerplate and ensure consistent mocking across tests.
 */

import { vi } from 'vitest';

/**
 * Create a mock BrowserWindow instance.
 */
export function createBrowserWindowMock(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    focus: vi.fn(),
    restore: vi.fn(),
    webContents: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
    on: vi.fn(),
    once: vi.fn(),
    ...overrides,
  };
}

/**
 * Create a mock ipcMain that captures handlers for testing.
 */
export function createIpcMainMock() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    mock: {
      handle: vi.fn((channel: string, cb: (...args: unknown[]) => unknown) => {
        handlers.set(channel, cb);
      }),
      on: vi.fn(),
    },
    handlers,
    /** Call a registered handler by channel name */
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for channel: ${channel}`);
      return handler({}, ...args);
    },
  };
}

/**
 * Create a full Electron mock for vi.mock('electron', () => ...).
 */
export function createElectronMock(overrides: Record<string, unknown> = {}) {
  const ipc = createIpcMainMock();
  const win = createBrowserWindowMock();

  return {
    app: {
      isPackaged: false,
      getPath: vi.fn().mockReturnValue('/tmp'),
      getName: vi.fn().mockReturnValue('valkyr'),
      getVersion: vi.fn().mockReturnValue('0.3.1'),
      getAppPath: vi.fn().mockReturnValue('/app'),
      on: vi.fn(),
      quit: vi.fn(),
    },
    ipcMain: ipc.mock,
    BrowserWindow: {
      getAllWindows: vi.fn(() => [win]),
    },
    Notification: vi.fn().mockImplementation(() => ({
      show: vi.fn(),
      on: vi.fn(),
    })),
    shell: {
      openExternal: vi.fn(),
    },
    __ipc: ipc, // Expose for test assertions
    __win: win, // Expose for test assertions
    ...overrides,
  };
}

/**
 * Create a mock fs module for file system tests.
 */
export function createFsMock(
  files: Record<string, string> = {},
  overrides: Record<string, unknown> = {}
) {
  return {
    existsSync: vi.fn((path: string) => path in files),
    readFileSync: vi.fn((path: string) => {
      if (path in files) return files[path];
      throw new Error(`ENOENT: no such file: ${path}`);
    }),
    writeFileSync: vi.fn((path: string, content: string) => {
      files[path] = content;
    }),
    renameSync: vi.fn((from: string, to: string) => {
      if (from in files) {
        files[to] = files[from];
        delete files[from];
      }
    }),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    ...overrides,
  };
}

/**
 * Create a mock settings module.
 */
export function createSettingsMock(overrides: Record<string, unknown> = {}) {
  return {
    getAppSettings: vi.fn(() => ({
      notifications: { enabled: true, sound: true },
      providerOverrides: {},
      ...overrides,
    })),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  };
}
