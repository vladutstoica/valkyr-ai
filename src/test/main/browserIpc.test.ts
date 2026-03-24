import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();

const browserViewServiceMock = {
  show: vi.fn(),
  hide: vi.fn(),
  setBounds: vi.fn(),
  loadURL: vi.fn(),
  goBack: vi.fn(),
  goForward: vi.fn(),
  reload: vi.fn(),
  openDevTools: vi.fn(),
  clear: vi.fn(),
};

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
}));

vi.mock('../../main/services/browserViewService', () => ({
  browserViewService: browserViewServiceMock,
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
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
  }));

  vi.mock('../../main/services/browserViewService', () => ({
    browserViewService: browserViewServiceMock,
  }));

  const mod = await import('../../main/ipc/browserIpc');
  mod.registerBrowserIpc();
});

describe('browserIpc', () => {
  describe('browser:view:show', () => {
    it('calls service.show with bounds and optional URL', async () => {
      const args = { x: 0, y: 50, width: 800, height: 600, url: 'http://localhost:3000' };

      const result = await callHandler('browser:view:show', args);

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.show).toHaveBeenCalledWith(
        { x: 0, y: 50, width: 800, height: 600 },
        'http://localhost:3000'
      );
    });

    it('calls service.show without url when not provided', async () => {
      const args = { x: 10, y: 20, width: 400, height: 300 };

      const result = await callHandler('browser:view:show', args);

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.show).toHaveBeenCalledWith(
        { x: 10, y: 20, width: 400, height: 300 },
        undefined
      );
    });

    it('returns error when service.show throws', async () => {
      browserViewServiceMock.show.mockImplementation(() => {
        throw new Error('View not initialized');
      });

      const result = await callHandler('browser:view:show', { x: 0, y: 0, width: 100, height: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('View not initialized');
    });

    it('handles null args gracefully without crashing', async () => {
      // The handler destructures args with a fallback cast; should not throw
      const result = await callHandler('browser:view:show', null);

      // show is called with undefined values extracted from null args
      expect(result).toBeDefined();
    });
  });

  describe('browser:view:hide', () => {
    it('calls service.hide and returns success', async () => {
      const result = await callHandler('browser:view:hide');

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.hide).toHaveBeenCalledTimes(1);
    });

    it('returns error when service.hide throws', async () => {
      browserViewServiceMock.hide.mockImplementation(() => {
        throw new Error('Hide failed');
      });

      const result = await callHandler('browser:view:hide');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Hide failed');
    });
  });

  describe('browser:view:setBounds', () => {
    it('calls service.setBounds with the provided bounds', async () => {
      const args = { x: 5, y: 10, width: 1024, height: 768 };

      const result = await callHandler('browser:view:setBounds', args);

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.setBounds).toHaveBeenCalledWith(args);
    });

    it('returns error when service.setBounds throws', async () => {
      browserViewServiceMock.setBounds.mockImplementation(() => {
        throw new Error('Invalid bounds');
      });

      const result = await callHandler('browser:view:setBounds', { x: -1, y: -1, width: 0, height: 0 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid bounds');
    });
  });

  describe('browser:view:loadURL', () => {
    it('loads a valid http URL', async () => {
      const result = await callHandler('browser:view:loadURL', 'http://example.com', false);

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.loadURL).toHaveBeenCalledWith('http://example.com', false);
    });

    it('loads a valid https URL', async () => {
      const result = await callHandler('browser:view:loadURL', 'https://example.com');

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.loadURL).toHaveBeenCalledWith('https://example.com', undefined);
    });

    it('passes forceReload flag to service', async () => {
      const result = await callHandler('browser:view:loadURL', 'https://example.com', true);

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.loadURL).toHaveBeenCalledWith('https://example.com', true);
    });

    it('rejects file:// URLs', async () => {
      const result = await callHandler('browser:view:loadURL', 'file:///etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only http/https URLs are allowed');
      expect(browserViewServiceMock.loadURL).not.toHaveBeenCalled();
    });

    it('rejects javascript: URLs', async () => {
      const result = await callHandler('browser:view:loadURL', 'javascript:alert(1)');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only http/https URLs are allowed');
      expect(browserViewServiceMock.loadURL).not.toHaveBeenCalled();
    });

    it('rejects data: URLs', async () => {
      const result = await callHandler('browser:view:loadURL', 'data:text/html,<h1>hi</h1>');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Only http/https URLs are allowed');
      expect(browserViewServiceMock.loadURL).not.toHaveBeenCalled();
    });

    it('returns error for malformed URL', async () => {
      const result = await callHandler('browser:view:loadURL', 'not-a-url');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(browserViewServiceMock.loadURL).not.toHaveBeenCalled();
    });

    it('returns error when service.loadURL throws', async () => {
      browserViewServiceMock.loadURL.mockImplementation(() => {
        throw new Error('Load failed');
      });

      const result = await callHandler('browser:view:loadURL', 'https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Load failed');
    });
  });

  describe('browser:view:goBack', () => {
    it('calls service.goBack and returns success', async () => {
      const result = await callHandler('browser:view:goBack');

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.goBack).toHaveBeenCalledTimes(1);
    });

    it('returns error when service.goBack throws', async () => {
      browserViewServiceMock.goBack.mockImplementation(() => {
        throw new Error('No history');
      });

      const result = await callHandler('browser:view:goBack');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No history');
    });
  });

  describe('browser:view:goForward', () => {
    it('calls service.goForward and returns success', async () => {
      const result = await callHandler('browser:view:goForward');

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.goForward).toHaveBeenCalledTimes(1);
    });

    it('returns error when service.goForward throws', async () => {
      browserViewServiceMock.goForward.mockImplementation(() => {
        throw new Error('No forward history');
      });

      const result = await callHandler('browser:view:goForward');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No forward history');
    });
  });

  describe('browser:view:reload', () => {
    it('calls service.reload and returns success', async () => {
      const result = await callHandler('browser:view:reload');

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.reload).toHaveBeenCalledTimes(1);
    });

    it('returns error when service.reload throws', async () => {
      browserViewServiceMock.reload.mockImplementation(() => {
        throw new Error('Reload failed');
      });

      const result = await callHandler('browser:view:reload');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Reload failed');
    });
  });

  describe('browser:view:openDevTools', () => {
    it('calls service.openDevTools and returns success', async () => {
      const result = await callHandler('browser:view:openDevTools');

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.openDevTools).toHaveBeenCalledTimes(1);
    });

    it('returns error when service.openDevTools throws', async () => {
      browserViewServiceMock.openDevTools.mockImplementation(() => {
        throw new Error('DevTools unavailable');
      });

      const result = await callHandler('browser:view:openDevTools');

      expect(result.success).toBe(false);
      expect(result.error).toBe('DevTools unavailable');
    });
  });

  describe('browser:view:clear', () => {
    it('calls service.clear and returns success', async () => {
      const result = await callHandler('browser:view:clear');

      expect(result.success).toBe(true);
      expect(browserViewServiceMock.clear).toHaveBeenCalledTimes(1);
    });

    it('returns error when service.clear throws', async () => {
      browserViewServiceMock.clear.mockImplementation(() => {
        throw new Error('Clear failed');
      });

      const result = await callHandler('browser:view:clear');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Clear failed');
    });
  });
});
