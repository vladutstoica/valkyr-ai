import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module import that pulls in the mocked modules
// ---------------------------------------------------------------------------

const mockNotification = {
  on: vi.fn(),
  show: vi.fn(),
};
const MockNotification = vi.fn().mockImplementation(() => mockNotification);

let mockWindowFocused = false;
let mockWindowDestroyed = false;
const mockWin = {
  isFocused: vi.fn(() => mockWindowFocused),
  isDestroyed: vi.fn(() => mockWindowDestroyed),
  isMinimized: vi.fn(() => false),
  restore: vi.fn(),
  focus: vi.fn(),
};

const mockBroadcast = vi.fn();
const mockGetMainWindow = vi.fn(() => mockWin);
const mockGetAppSettings = vi.fn(() => ({ notifications: { enabled: true, sound: false } }));

vi.mock('electron', () => ({
  Notification: MockNotification,
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue('/tmp'),
    getName: vi.fn().mockReturnValue('valkyr'),
    getVersion: vi.fn().mockReturnValue('0.0.0'),
  },
}));

vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../main/lib/safeSend', () => ({
  broadcastToAllWindows: mockBroadcast,
}));

vi.mock('../../main/app/window', () => ({
  getMainWindow: mockGetMainWindow,
}));

vi.mock('../../main/settings', () => ({
  getAppSettings: mockGetAppSettings,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function freshServer() {
  vi.resetModules();
  // Re-apply all vi.mock factories after resetModules
  vi.mock('electron', () => ({ Notification: MockNotification }));
  vi.mock('../../main/lib/logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }));
  vi.mock('../../main/lib/safeSend', () => ({ broadcastToAllWindows: mockBroadcast }));
  vi.mock('../../main/app/window', () => ({ getMainWindow: mockGetMainWindow }));
  vi.mock('../../main/settings', () => ({ getAppSettings: mockGetAppSettings }));

  const mod = await import('../../main/services/HookNotificationServer');
  return mod.hookNotificationServer;
}

/** Fire a raw HTTP request at the given port and collect the response. */
async function request(
  port: number,
  options: { method?: string; path?: string; body?: string } = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path ?? '/hook/notify',
        method: options.method ?? 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HookNotificationServer', () => {
  let server: Awaited<ReturnType<typeof freshServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    MockNotification.mockClear();
    mockNotification.on.mockClear();
    mockNotification.show.mockClear();
    mockWindowFocused = false;
    mockWindowDestroyed = false;
    mockGetAppSettings.mockReturnValue({ notifications: { enabled: true, sound: false } });
    server = await freshServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  // -------------------------------------------------------------------------
  // start() / stop()
  // -------------------------------------------------------------------------

  describe('start()', () => {
    it('returns a positive port number', async () => {
      const port = await server.start();
      expect(port).toBeGreaterThan(0);
    });

    it('returns the same port if called again (idempotent)', async () => {
      const port1 = await server.start();
      const port2 = await server.start();
      expect(port1).toBe(port2);
    });

    it('sets isRunning() to true after start', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);
    });

    it('binds to 127.0.0.1 only (accessible on localhost)', async () => {
      const port = await server.start();
      const res = await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 's1' }) });
      expect(res.status).toBe(200);
    });
  });

  describe('stop()', () => {
    it('sets isRunning() to false', async () => {
      await server.start();
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('resets getPort() to 0', async () => {
      await server.start();
      await server.stop();
      expect(server.getPort()).toBe(0);
    });

    it('is safe to call when server was never started', async () => {
      await expect(server.stop()).resolves.not.toThrow();
    });

    it('clears all listeners on stop', async () => {
      const listener = vi.fn();
      await server.start();
      server.onNotification(listener);

      // Stop clears the listener set. Restart on a new port and confirm no call.
      await server.stop();
      const newPort = await server.start();

      await request(newPort, { body: JSON.stringify({ event: 'Stop', sessionId: 's1' }) });
      await new Promise((r) => setTimeout(r, 10));

      // listener was registered before stop — the cleared set means it never fires
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // HTTP routing
  // -------------------------------------------------------------------------

  describe('HTTP routing', () => {
    it('responds 200 for POST /hook/notify', async () => {
      const port = await server.start();
      const res = await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 's1' }) });
      expect(res.status).toBe(200);
    });

    it('responds with {"success":true} on success', async () => {
      const port = await server.start();
      const res = await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 's1' }) });
      expect(res.body).toBe('{"success":true}');
    });

    it('responds 404 for GET /hook/notify', async () => {
      const port = await server.start();
      const res = await request(port, { method: 'GET', body: undefined });
      expect(res.status).toBe(404);
    });

    it('responds 404 for POST to a different path', async () => {
      const port = await server.start();
      const res = await request(port, {
        method: 'POST',
        path: '/some/other/path',
        body: '{}',
      });
      expect(res.status).toBe(404);
    });

    it('responds 404 for PUT /hook/notify', async () => {
      const port = await server.start();
      const res = await request(port, { method: 'PUT', body: '{}' });
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Payload size limit
  // -------------------------------------------------------------------------

  describe('payload size limit', () => {
    it('rejects payloads larger than 8KB with 413', async () => {
      const port = await server.start();
      const oversized = JSON.stringify({ event: 'Stop', sessionId: 's1', junk: 'x'.repeat(9000) });
      const res = await request(port, { body: oversized });
      expect(res.status).toBe(413);
    });

    it('accepts payloads at exactly the boundary (8192 bytes)', async () => {
      const port = await server.start();
      // Build a payload where the total body is exactly 8192 bytes.
      // The JSON overhead for the known keys is ~40 chars; pad the rest.
      const prefix = '{"event":"Stop","sessionId":"s1","pad":"';
      const suffix = '"}';
      const padLen = 8192 - prefix.length - suffix.length;
      const payload = prefix + 'x'.repeat(padLen) + suffix;
      expect(payload.length).toBe(8192);
      const res = await request(port, { body: payload });
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // handleNotification — valid payloads
  // -------------------------------------------------------------------------

  describe('handleNotification — valid events', () => {
    it('broadcasts a hook:status-update IPC event for a known event type', async () => {
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'abc' }) });
      // Allow the end event to fire
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBroadcast).toHaveBeenCalledWith('hook:status-update', {
        sessionId: 'abc',
        event: 'Stop',
        status: 'done',
      });
    });

    it('broadcasts correct status for PostToolUse (working)', async () => {
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'PostToolUse', sessionId: 'sess-2' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBroadcast).toHaveBeenCalledWith('hook:status-update', {
        sessionId: 'sess-2',
        event: 'PostToolUse',
        status: 'working',
      });
    });

    it('broadcasts correct status for PermissionRequest (needs-input)', async () => {
      const port = await server.start();
      await request(port, {
        body: JSON.stringify({ event: 'PermissionRequest', sessionId: 'sess-3' }),
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBroadcast).toHaveBeenCalledWith('hook:status-update', {
        sessionId: 'sess-3',
        event: 'PermissionRequest',
        status: 'needs-input',
      });
    });

    it('calls in-process listeners registered with onNotification()', async () => {
      const port = await server.start();
      const listener = vi.fn();
      server.onNotification(listener);

      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'ls1' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(listener).toHaveBeenCalledWith({ sessionId: 'ls1', event: 'Stop', status: 'done' });
    });

    it('supports multiple in-process listeners simultaneously', async () => {
      const port = await server.start();
      const l1 = vi.fn();
      const l2 = vi.fn();
      server.onNotification(l1);
      server.onNotification(l2);

      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'multi' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });

    it('unsubscribing via the returned function stops future calls', async () => {
      const port = await server.start();
      const listener = vi.fn();
      const unsubscribe = server.onNotification(listener);

      unsubscribe();

      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'unsub' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(listener).not.toHaveBeenCalled();
    });

    it('a throwing listener does not crash the server', async () => {
      const port = await server.start();
      const bad = vi.fn(() => {
        throw new Error('listener exploded');
      });
      server.onNotification(bad);

      // Should not reject
      await expect(
        request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'err' }) })
      ).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // handleNotification — invalid / malformed payloads
  // -------------------------------------------------------------------------

  describe('handleNotification — invalid/malformed payloads', () => {
    it('ignores unknown event types silently (no broadcast)', async () => {
      const port = await server.start();
      await request(port, {
        body: JSON.stringify({ event: 'UnknownFutureEvent', sessionId: 'x' }),
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('ignores payloads with a missing sessionId', async () => {
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('ignores payloads with a missing event field', async () => {
      const port = await server.start();
      await request(port, { body: JSON.stringify({ sessionId: 'sess' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('returns 200 even for malformed JSON (forward-compatible)', async () => {
      const port = await server.start();
      const res = await request(port, { body: 'not-json{{{{' });
      expect(res.status).toBe(200);
    });

    it('does not broadcast for malformed JSON', async () => {
      const port = await server.start();
      await request(port, { body: 'not-json' });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('ignores payloads where event is not a string', async () => {
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 42, sessionId: 'sess' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBroadcast).not.toHaveBeenCalled();
    });

    it('ignores payloads where sessionId is not a string', async () => {
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: null }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBroadcast).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // maybeShowDesktopNotification
  // -------------------------------------------------------------------------

  describe('maybeShowDesktopNotification', () => {
    it('shows a notification for Stop when window is not focused', async () => {
      mockWindowFocused = false;
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'n1' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(MockNotification).toHaveBeenCalled();
      expect(mockNotification.show).toHaveBeenCalled();
    });

    it('shows a notification for PermissionRequest when window is not focused', async () => {
      mockWindowFocused = false;
      const port = await server.start();
      await request(port, {
        body: JSON.stringify({ event: 'PermissionRequest', sessionId: 'n2' }),
      });
      await new Promise((r) => setTimeout(r, 10));

      expect(MockNotification).toHaveBeenCalled();
    });

    it('does NOT show a notification for working-state events', async () => {
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'PostToolUse', sessionId: 'n3' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(MockNotification).not.toHaveBeenCalled();
    });

    it('does NOT show a notification when notifications are disabled in settings', async () => {
      mockGetAppSettings.mockReturnValue({ notifications: { enabled: false, sound: false } });
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'n4' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(MockNotification).not.toHaveBeenCalled();
    });

    it('does NOT show a notification when the window is focused', async () => {
      mockWindowFocused = true;
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'n5' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(MockNotification).not.toHaveBeenCalled();
    });

    it('shows a notification when the main window is null (no window open)', async () => {
      mockGetMainWindow.mockReturnValueOnce(null as unknown as typeof mockWin);
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'n6' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(MockNotification).toHaveBeenCalled();
    });

    it('shows a notification when the window is destroyed', async () => {
      mockWindowDestroyed = true;
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'n7' }) });
      await new Promise((r) => setTimeout(r, 10));

      expect(MockNotification).toHaveBeenCalled();
    });

    it('sets the correct title for Stop (done) notifications', async () => {
      mockWindowFocused = false;
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'n8' }) });
      await new Promise((r) => setTimeout(r, 10));

      const callArgs = MockNotification.mock.calls[0][0];
      expect(callArgs.title).toBe('Agent finished');
    });

    it('sets the correct title for PermissionRequest (needs-input) notifications', async () => {
      mockWindowFocused = false;
      const port = await server.start();
      await request(port, {
        body: JSON.stringify({ event: 'PermissionRequest', sessionId: 'n9' }),
      });
      await new Promise((r) => setTimeout(r, 10));

      const callArgs = MockNotification.mock.calls[0][0];
      expect(callArgs.title).toBe('Agent needs input');
    });

    it('sets silent based on the sound setting', async () => {
      mockWindowFocused = false;
      mockGetAppSettings.mockReturnValue({ notifications: { enabled: true, sound: true } });
      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'n10' }) });
      await new Promise((r) => setTimeout(r, 10));

      const callArgs = MockNotification.mock.calls[0][0];
      // silent = !sound
      expect(callArgs.silent).toBe(false);
    });

    it('restores and focuses the window when the notification is clicked', async () => {
      mockWindowFocused = false;
      mockWin.isMinimized.mockReturnValueOnce(true);

      const port = await server.start();
      await request(port, { body: JSON.stringify({ event: 'Stop', sessionId: 'n11' }) });
      await new Promise((r) => setTimeout(r, 10));

      // Simulate click event on the notification
      const clickHandler = mockNotification.on.mock.calls.find(([ev]) => ev === 'click')?.[1];
      expect(clickHandler).toBeDefined();
      clickHandler?.();

      expect(mockWin.restore).toHaveBeenCalled();
      expect(mockWin.focus).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getPort() / isRunning()
  // -------------------------------------------------------------------------

  describe('getPort() / isRunning()', () => {
    it('getPort() returns 0 before start', async () => {
      expect(server.getPort()).toBe(0);
    });

    it('getPort() matches the port returned by start()', async () => {
      const port = await server.start();
      expect(server.getPort()).toBe(port);
    });

    it('isRunning() returns false before start', async () => {
      expect(server.isRunning()).toBe(false);
    });

    it('isRunning() returns true after start and false after stop', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });
  });
});
