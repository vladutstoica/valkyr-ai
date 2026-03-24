import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();

// execFile mock — controls what happens when a binary is probed
const execFileMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('../../main/lib/logger', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

async function callHandler(channel: string, ...args: any[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`);
  return handler({}, ...args);
}

/**
 * Configure execFileMock so that:
 *  - `which <binary>` returns the path when installed = true, error otherwise
 *  - `<binary> --version` returns the version string when installed = true
 */
function mockProbe(binary: string, { installed = true, version = '1.0.0', path = `/usr/local/bin/${binary}` } = {}) {
  execFileMock.mockImplementation((cmd: string, args: string[], ...rest: any[]) => {
    // execFile(cmd, args, cb) or execFile(cmd, args, opts, cb)
    const cb = typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : rest[0];

    if (cmd === 'which' && args[0] === binary) {
      if (installed) cb(null, path + '\n', '');
      else cb(new Error('not found'), '', 'not found');
      return;
    }
    if (cmd === binary) {
      if (installed) cb(null, `${binary} version ${version}\n`, '');
      else cb(new Error('command not found'), '', '');
      return;
    }
    // Unrecognised command — fail silently
    cb(new Error('unknown cmd'), '', '');
  });
}

/**
 * Configure all probes to return "installed" or "not installed" depending on the set.
 */
function mockAllProbes(installedIds: string[]) {
  const BINARIES: Record<string, string> = {
    'claude-code': 'claude',
    codex: 'codex',
    'qwen-code': 'qwen',
    amp: 'amp',
    gemini: 'gemini',
  };
  execFileMock.mockImplementation((cmd: string, args: string[], ...rest: any[]) => {
    const cb = typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : rest[0];

    if (cmd === 'which') {
      const probeId = Object.keys(BINARIES).find((id) => BINARIES[id] === args[0]);
      const installed = probeId ? installedIds.includes(probeId) : false;
      if (installed) cb(null, `/usr/local/bin/${args[0]}\n`, '');
      else cb(new Error('not found'), '', '');
      return;
    }

    const probeId = Object.keys(BINARIES).find((id) => BINARIES[id] === cmd);
    const installed = probeId ? installedIds.includes(probeId) : false;
    if (installed) cb(null, `${cmd} version 1.0.0\n`, '');
    else cb(new Error('not found'), '', '');
  });
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

  vi.mock('child_process', () => ({
    execFile: execFileMock,
  }));

  vi.mock('../../main/lib/logger', () => ({
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }));

  const mod = await import('../../main/ipc/connectionsIpc');
  mod.registerConnectionsIpc();
});

// ---------------------------------------------------------------------------
// connections:getProviderStatuses
// ---------------------------------------------------------------------------

describe('connections:getProviderStatuses', () => {
  it('returns installed: true with path and version for a found provider', async () => {
    mockProbe('claude', { installed: true, version: '1.2.3', path: '/usr/local/bin/claude' });

    const result = await callHandler('connections:getProviderStatuses', {
      providers: ['claude-code'],
    });

    expect(result.success).toBe(true);
    const status = result.statuses['claude-code'];
    expect(status.installed).toBe(true);
    expect(status.path).toBe('/usr/local/bin/claude');
    expect(status.version).toContain('1.2.3');
    expect(typeof status.lastChecked).toBe('number');
  });

  it('returns installed: false with null path and version when binary is missing', async () => {
    mockProbe('claude', { installed: false });

    const result = await callHandler('connections:getProviderStatuses', {
      providers: ['claude-code'],
    });

    expect(result.success).toBe(true);
    const status = result.statuses['claude-code'];
    expect(status.installed).toBe(false);
    expect(status.path).toBeNull();
    expect(status.version).toBeNull();
  });

  it('returns statuses for multiple providers in one call', async () => {
    mockAllProbes(['claude-code', 'codex']);

    const result = await callHandler('connections:getProviderStatuses', {
      providers: ['claude-code', 'codex', 'qwen-code'],
    });

    expect(result.success).toBe(true);
    expect(result.statuses['claude-code'].installed).toBe(true);
    expect(result.statuses['codex'].installed).toBe(true);
    expect(result.statuses['qwen-code'].installed).toBe(false);
  });

  it('checks the default provider set when no providers specified', async () => {
    mockAllProbes([]);

    const result = await callHandler('connections:getProviderStatuses', {});

    expect(result.success).toBe(true);
    // Default set includes at least these
    expect('claude-code' in result.statuses).toBe(true);
    expect('codex' in result.statuses).toBe(true);
  });

  it('checks only a single provider when providerId is given', async () => {
    mockProbe('codex', { installed: true, version: '0.5.0' });

    const result = await callHandler('connections:getProviderStatuses', {
      providerId: 'codex',
    });

    expect(result.success).toBe(true);
    expect(Object.keys(result.statuses)).toEqual(['codex']);
    expect(result.statuses['codex'].installed).toBe(true);
  });

  it('uses cached result within the TTL window (no re-probe)', async () => {
    mockProbe('claude', { installed: true });

    // First call — populates cache
    await callHandler('connections:getProviderStatuses', { providers: ['claude-code'] });
    const callsAfterFirst = execFileMock.mock.calls.length;

    // Second call — should use cache
    await callHandler('connections:getProviderStatuses', { providers: ['claude-code'] });
    expect(execFileMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('bypasses cache when refresh: true is passed', async () => {
    mockProbe('claude', { installed: true });

    // First call — caches result
    await callHandler('connections:getProviderStatuses', { providers: ['claude-code'] });
    const callsAfterFirst = execFileMock.mock.calls.length;

    // Second call with refresh — should re-probe
    await callHandler('connections:getProviderStatuses', {
      providers: ['claude-code'],
      refresh: true,
    });
    expect(execFileMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('handles a probe throwing unexpectedly and marks the provider not installed', async () => {
    // Make which throw synchronously inside the cb
    execFileMock.mockImplementation((_cmd: string, _args: string[], ...rest: any[]) => {
      const cb = typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : rest[0];
      // Simulate which succeeding but version check throwing
      if (_cmd === 'which') cb(null, '/bin/amp\n', '');
      else throw new Error('unexpected exec error');
    });

    const result = await callHandler('connections:getProviderStatuses', {
      providers: ['amp'],
      refresh: true,
    });

    // Should not throw; status should reflect the failure gracefully
    expect(result.success).toBe(true);
    expect(result.statuses['amp'].installed).toBe(false);
  });

  it('returns statuses with lastChecked as a recent timestamp', async () => {
    mockAllProbes([]);
    const before = Date.now();

    const result = await callHandler('connections:getProviderStatuses', {
      providers: ['codex'],
      refresh: true,
    });

    expect(result.statuses['codex'].lastChecked).toBeGreaterThanOrEqual(before);
    expect(result.statuses['codex'].lastChecked).toBeLessThanOrEqual(Date.now());
  });

  it('handles empty providers array by checking default set', async () => {
    mockAllProbes([]);

    const result = await callHandler('connections:getProviderStatuses', { providers: [] });
    expect(result.success).toBe(true);
    // Empty array falls through to default set
    expect(Object.keys(result.statuses).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// connections:clearCache
// ---------------------------------------------------------------------------

describe('connections:clearCache', () => {
  it('returns success: true', async () => {
    const result = await callHandler('connections:clearCache');
    expect(result).toEqual({ success: true });
  });

  it('causes a subsequent getProviderStatuses call to re-probe', async () => {
    mockProbe('claude', { installed: true });

    // Populate cache
    await callHandler('connections:getProviderStatuses', { providers: ['claude-code'] });
    const callsAfterFirst = execFileMock.mock.calls.length;

    // Clear cache
    await callHandler('connections:clearCache');

    // Next status check should re-probe (not use cache)
    mockProbe('claude', { installed: true });
    await callHandler('connections:getProviderStatuses', { providers: ['claude-code'] });
    expect(execFileMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
