import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const shellOpenExternalMock = vi.fn();

// Captured handlers registered on webContents
let windowOpenHandler: ((details: { url: string }) => { action: string }) | null = null;
let willNavigateHandler: ((event: { preventDefault: () => void }, url: string) => void) | null =
  null;

const preventDefaultMock = vi.fn();

function makeWebContentsMock() {
  return {
    setWindowOpenHandler: vi.fn((cb: any) => {
      windowOpenHandler = cb;
    }),
    on: vi.fn((event: string, cb: any) => {
      if (event === 'will-navigate') willNavigateHandler = cb;
    }),
  };
}

vi.mock('electron', () => ({
  shell: {
    openExternal: shellOpenExternalMock,
  },
  BrowserWindow: {},
}));

beforeEach(async () => {
  vi.clearAllMocks();
  windowOpenHandler = null;
  willNavigateHandler = null;
  vi.resetModules();

  vi.mock('electron', () => ({
    shell: {
      openExternal: shellOpenExternalMock,
    },
    BrowserWindow: {},
  }));
});

async function setupHandlers(isDev: boolean, devPort?: string) {
  if (devPort !== undefined) {
    process.env.DEV_SERVER_PORT = devPort;
  } else {
    delete process.env.DEV_SERVER_PORT;
  }

  const wc = makeWebContentsMock();
  const fakeWindow = { webContents: wc } as any;

  const { registerExternalLinkHandlers } = await import('../../main/utils/externalLinks');
  registerExternalLinkHandlers(fakeWindow, isDev);

  return { wc };
}

describe('externalLinks', () => {
  describe('registerExternalLinkHandlers', () => {
    describe('setWindowOpenHandler (window.open / target=_blank)', () => {
      it('denies and opens external http URLs in default browser', async () => {
        await setupHandlers(false);

        const result = windowOpenHandler!({ url: 'http://example.com' });

        expect(result.action).toBe('deny');
        expect(shellOpenExternalMock).toHaveBeenCalledWith('http://example.com');
      });

      it('denies and opens external https URLs in default browser', async () => {
        await setupHandlers(false);

        const result = windowOpenHandler!({ url: 'https://github.com/some/repo' });

        expect(result.action).toBe('deny');
        expect(shellOpenExternalMock).toHaveBeenCalledWith('https://github.com/some/repo');
      });

      it('allows non-http/https URLs (e.g. custom protocol) to open inside Electron', async () => {
        await setupHandlers(false);

        const result = windowOpenHandler!({ url: 'valkyr://internal/action' });

        expect(result.action).toBe('allow');
        expect(shellOpenExternalMock).not.toHaveBeenCalled();
      });

      it('allows about:blank without opening externally', async () => {
        await setupHandlers(false);

        const result = windowOpenHandler!({ url: 'about:blank' });

        expect(result.action).toBe('allow');
        expect(shellOpenExternalMock).not.toHaveBeenCalled();
      });

      it('is case-insensitive for HTTP scheme check', async () => {
        await setupHandlers(false);

        const result = windowOpenHandler!({ url: 'HTTP://example.com' });

        expect(result.action).toBe('deny');
        expect(shellOpenExternalMock).toHaveBeenCalledWith('HTTP://example.com');
      });
    });

    describe('will-navigate handler (in-app navigation interception)', () => {
      it('prevents navigation and opens external http URLs in production mode', async () => {
        await setupHandlers(false);
        const event = { preventDefault: preventDefaultMock };

        willNavigateHandler!(event, 'http://external-site.com');

        expect(preventDefaultMock).toHaveBeenCalled();
        expect(shellOpenExternalMock).toHaveBeenCalledWith('http://external-site.com');
      });

      it('prevents navigation and opens external https URLs in production mode', async () => {
        await setupHandlers(false);
        const event = { preventDefault: preventDefaultMock };

        willNavigateHandler!(event, 'https://external-site.com/page');

        expect(preventDefaultMock).toHaveBeenCalled();
        expect(shellOpenExternalMock).toHaveBeenCalledWith('https://external-site.com/page');
      });

      it('allows file:// URLs through in production mode (app URL)', async () => {
        await setupHandlers(false);
        const event = { preventDefault: preventDefaultMock };

        willNavigateHandler!(event, 'file:///app/index.html');

        expect(preventDefaultMock).not.toHaveBeenCalled();
        expect(shellOpenExternalMock).not.toHaveBeenCalled();
      });

      it('allows localhost dev server URL in dev mode', async () => {
        await setupHandlers(true);
        const event = { preventDefault: preventDefaultMock };

        willNavigateHandler!(event, 'http://localhost:3000/some/path');

        expect(preventDefaultMock).not.toHaveBeenCalled();
        expect(shellOpenExternalMock).not.toHaveBeenCalled();
      });

      it('uses custom DEV_SERVER_PORT when set', async () => {
        await setupHandlers(true, '4200');
        const event = { preventDefault: preventDefaultMock };

        willNavigateHandler!(event, 'http://localhost:4200/app');

        expect(preventDefaultMock).not.toHaveBeenCalled();
        expect(shellOpenExternalMock).not.toHaveBeenCalled();
      });

      it('blocks non-localhost http URLs even in dev mode', async () => {
        await setupHandlers(true);
        const event = { preventDefault: preventDefaultMock };

        willNavigateHandler!(event, 'https://external.com');

        expect(preventDefaultMock).toHaveBeenCalled();
        expect(shellOpenExternalMock).toHaveBeenCalledWith('https://external.com');
      });

      it('does not block non-http/https URLs in dev mode (e.g. about:blank)', async () => {
        await setupHandlers(true);
        const event = { preventDefault: preventDefaultMock };

        willNavigateHandler!(event, 'about:blank');

        // about:blank does not match http/https regex — handler is a no-op
        expect(preventDefaultMock).not.toHaveBeenCalled();
        expect(shellOpenExternalMock).not.toHaveBeenCalled();
      });

      it('defaults to port 3000 when DEV_SERVER_PORT is not set', async () => {
        delete process.env.DEV_SERVER_PORT;
        await setupHandlers(true);
        const event = { preventDefault: preventDefaultMock };

        // Port 3001 should NOT be treated as the app URL
        willNavigateHandler!(event, 'http://localhost:3001/app');

        expect(preventDefaultMock).toHaveBeenCalled();
        expect(shellOpenExternalMock).toHaveBeenCalledWith('http://localhost:3001/app');
      });
    });

    describe('handler registration', () => {
      it('calls setWindowOpenHandler once during registration', async () => {
        const { wc } = await setupHandlers(false);
        expect(wc.setWindowOpenHandler).toHaveBeenCalledTimes(1);
      });

      it('registers will-navigate listener during registration', async () => {
        const { wc } = await setupHandlers(false);
        expect(wc.on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
      });
    });
  });
});
