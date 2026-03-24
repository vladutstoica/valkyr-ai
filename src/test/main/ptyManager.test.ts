/**
 * ptyManager.test.ts
 *
 * Strategy notes:
 * - ptyManager.ts lazy-loads node-pty via require('node-pty') inside each
 *   function body. Vitest's vi.mock() hoisting handles ESM imports but the
 *   require() call goes through Node's CJS loader at runtime.
 * - We intercept it by pre-populating the Node module cache with our mock
 *   before importing ptyManager, using the resolved absolute path of node-pty.
 * - After each test we restore the original (or absent) cache entry.
 * - Pure-logic branches (VALKYR_DISABLE_PTY guard, null-return on missing
 *   provider, resize guard, kill fallback, removePtyRecord, hasPty, getPty,
 *   getPtyKind, writePty no-op, setOnDirectCliExit) do NOT require node-pty
 *   to be loaded — they are covered by separate test groups that either
 *   never reach the spawn call or trigger the error path.
 */

import { createRequire } from 'module';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock node-pty spawn infrastructure
// ---------------------------------------------------------------------------

type MockProcOptions = {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
};

type MockProc = {
  pid: number;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;
  _triggerExit: (payload: { exitCode: number; signal?: number }) => void;
  _spawnArgs: { file: string; args: string[]; options: MockProcOptions };
};

const spawnedProcs: MockProc[] = [];

const nodePtySpawnMock = vi.fn((file: string, args: string[], options: MockProcOptions) => {
  let exitHandler: ((payload: { exitCode: number; signal?: number }) => void) | null = null;
  const proc: MockProc = {
    pid: Math.floor(Math.random() * 9000) + 1000,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn((cb) => {
      exitHandler = cb;
    }),
    _triggerExit: (payload) => {
      if (exitHandler) exitHandler(payload);
    },
    _spawnArgs: { file, args, options },
  };
  spawnedProcs.push(proc);
  return proc;
});

// The mock node-pty module object placed in the CJS require cache.
const mockNodePty = { spawn: nodePtySpawnMock };

// ---------------------------------------------------------------------------
// Resolve node-pty's entry-point path so we can patch the require cache.
// ---------------------------------------------------------------------------

const _require = createRequire(import.meta.url);

let nodePtyResolvedPath: string;
try {
  nodePtyResolvedPath = _require.resolve('node-pty');
} catch {
  // If the native module isn't built at all, resolve to the package index.
  nodePtyResolvedPath = 'node-pty';
}

// ---------------------------------------------------------------------------
// Static mocks that Vitest hoists and applies to ESM imports
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/valkyr-test-userData'),
    getName: vi.fn().mockReturnValue('valkyr-test'),
    getVersion: vi.fn().mockReturnValue('0.0.0-test'),
  },
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) },
}));

vi.mock('../../main/lib/logger', () => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../main/errorTracking', () => ({
  errorTracking: {
    captureAgentSpawnError: vi.fn().mockResolvedValue(undefined),
    captureCriticalError: vi.fn().mockResolvedValue(undefined),
  },
}));

const providerStatusCacheMock = {
  get: vi.fn(),
  set: vi.fn(),
  getAll: vi.fn().mockReturnValue({}),
  load: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../main/services/providerStatusCache', () => ({
  providerStatusCache: providerStatusCacheMock,
}));

const hookServerMock = {
  isRunning: vi.fn().mockReturnValue(false),
  getPort: vi.fn().mockReturnValue(0),
};

vi.mock('../../main/services/HookNotificationServer', () => ({
  hookNotificationServer: hookServerMock,
}));

vi.mock('@shared/providers/registry', () => ({
  PROVIDERS: [
    {
      id: 'claude',
      name: 'Claude Code',
      cli: 'claude',
      defaultArgs: ['--output-format', 'stream-json'],
      autoApproveFlag: '--dangerously-skip-permissions',
      initialPromptFlag: '',
      resumeFlag: '--resume',
    },
    {
      id: 'codex',
      name: 'Codex',
      cli: 'codex',
      defaultArgs: [],
      autoApproveFlag: '--full-auto',
      initialPromptFlag: '-p',
      resumeFlag: '--resume',
    },
  ],
  PROVIDER_IDS: ['claude', 'codex'],
}));

// ---------------------------------------------------------------------------
// Per-test helpers
// ---------------------------------------------------------------------------

function patchNodePtyCache() {
  // Inject mock into Node's CJS module cache before ptyManager is loaded
  _require.cache[nodePtyResolvedPath] = {
    id: nodePtyResolvedPath,
    filename: nodePtyResolvedPath,
    loaded: true,
    exports: mockNodePty,
    children: [],
    paths: [],
    parent: undefined,
  } as any;
}

function restoreNodePtyCache() {
  delete _require.cache[nodePtyResolvedPath];
}

// ---------------------------------------------------------------------------
// Tests — pure-logic paths (no node-pty spawn needed)
// ---------------------------------------------------------------------------

describe('ptyManager — pure logic (no spawn)', () => {
  let mgr: typeof import('../../main/services/ptyManager');

  beforeEach(async () => {
    vi.clearAllMocks();
    spawnedProcs.length = 0;
    delete process.env.VALKYR_DISABLE_PTY;
    patchNodePtyCache();
    vi.resetModules();
    mgr = await import('../../main/services/ptyManager');
  });

  afterEach(() => {
    restoreNodePtyCache();
    delete process.env.VALKYR_DISABLE_PTY;
  });

  describe('startDirectPty — guard paths', () => {
    it('throws when VALKYR_DISABLE_PTY=1', () => {
      process.env.VALKYR_DISABLE_PTY = '1';
      expect(() =>
        mgr.startDirectPty({ id: 'disabled', providerId: 'claude', cwd: '/tmp' })
      ).toThrow('PTY disabled via VALKYR_DISABLE_PTY=1');
    });

    it('returns null when provider has no cache entry', () => {
      providerStatusCacheMock.get.mockReturnValue(undefined);
      expect(
        mgr.startDirectPty({ id: 'no-cache', providerId: 'claude', cwd: '/tmp' })
      ).toBeNull();
    });

    it('returns null when provider is marked not installed', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: false, path: null, lastChecked: 0 });
      expect(
        mgr.startDirectPty({ id: 'not-installed', providerId: 'claude', cwd: '/tmp' })
      ).toBeNull();
    });

    it('returns null when provider entry has no path', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: null, lastChecked: 0 });
      expect(
        mgr.startDirectPty({ id: 'no-path', providerId: 'claude', cwd: '/tmp' })
      ).toBeNull();
    });
  });

  describe('startSshPty — guard paths', () => {
    it('throws when VALKYR_DISABLE_PTY=1', () => {
      process.env.VALKYR_DISABLE_PTY = '1';
      expect(() =>
        mgr.startSshPty({ id: 'ssh-disabled', target: 'user@host' })
      ).toThrow('PTY disabled via VALKYR_DISABLE_PTY=1');
    });
  });

  describe('hasPty / getPty / getPtyKind — before any PTY is registered', () => {
    it('hasPty returns false for unregistered id', () => {
      expect(mgr.hasPty('ghost')).toBe(false);
    });

    it('getPty returns undefined for unregistered id', () => {
      expect(mgr.getPty('ghost')).toBeUndefined();
    });

    it('getPtyKind returns undefined for unregistered id', () => {
      expect(mgr.getPtyKind('ghost')).toBeUndefined();
    });
  });

  describe('writePty — no-op for unknown id', () => {
    it('does not throw when id is not registered', () => {
      expect(() => mgr.writePty('nonexistent', 'hello\n')).not.toThrow();
    });
  });

  describe('resizePty — guard paths for unknown id', () => {
    it('does not throw for unknown id', () => {
      expect(() => mgr.resizePty('unknown', 80, 24)).not.toThrow();
    });
  });

  describe('killPty — guard path for unknown id', () => {
    it('does not throw for unknown id', () => {
      expect(() => mgr.killPty('ghost-pty')).not.toThrow();
    });
  });

  describe('removePtyRecord — guard path for unknown id', () => {
    it('does not throw for unknown id', () => {
      expect(() => mgr.removePtyRecord('never-existed')).not.toThrow();
    });
  });

  describe('setOnDirectCliExit', () => {
    it('registers a callback without throwing', () => {
      expect(() => mgr.setOnDirectCliExit(vi.fn())).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — spawn behaviour (node-pty mock in CJS cache)
// ---------------------------------------------------------------------------

describe('ptyManager — spawn behaviour', () => {
  let mgr: typeof import('../../main/services/ptyManager');

  beforeEach(async () => {
    vi.clearAllMocks();
    spawnedProcs.length = 0;
    delete process.env.VALKYR_DISABLE_PTY;
    patchNodePtyCache();
    vi.resetModules();
    mgr = await import('../../main/services/ptyManager');
  });

  afterEach(() => {
    restoreNodePtyCache();
    delete process.env.VALKYR_DISABLE_PTY;
  });

  // -----------------------------------------------------------------------
  // startDirectPty — spawn args
  // -----------------------------------------------------------------------

  describe('startDirectPty', () => {
    function setupProvider(path = '/usr/local/bin/claude') {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path, lastChecked: Date.now() });
    }

    it('spawns the CLI binary at the cached path', () => {
      setupProvider('/usr/local/bin/claude');
      mgr.startDirectPty({ id: 'spawn-test', providerId: 'claude', cwd: '/home/user/proj' });

      expect(nodePtySpawnMock).toHaveBeenCalledOnce();
      const spawned = spawnedProcs[0];
      expect(spawned._spawnArgs.file).toBe('/usr/local/bin/claude');
      expect(spawned._spawnArgs.options.cwd).toBe('/home/user/proj');
    });

    it('uses provided cols and rows', () => {
      setupProvider();
      mgr.startDirectPty({ id: 'size-test', providerId: 'claude', cwd: '/tmp', cols: 100, rows: 40 });

      const spawned = spawnedProcs[0];
      expect(spawned._spawnArgs.options.cols).toBe(100);
      expect(spawned._spawnArgs.options.rows).toBe(40);
    });

    it('includes default args from provider definition', () => {
      setupProvider();
      mgr.startDirectPty({ id: 'default-args', providerId: 'claude', cwd: '/tmp' });

      const args = spawnedProcs[0]._spawnArgs.args;
      expect(args).toContain('--output-format');
      expect(args).toContain('stream-json');
    });

    it('adds autoApproveFlag when autoApprove=true', () => {
      setupProvider();
      mgr.startDirectPty({ id: 'auto-approve', providerId: 'claude', cwd: '/tmp', autoApprove: true });

      expect(spawnedProcs[0]._spawnArgs.args).toContain('--dangerously-skip-permissions');
    });

    it('omits autoApproveFlag when autoApprove=false', () => {
      setupProvider();
      mgr.startDirectPty({ id: 'no-approve', providerId: 'claude', cwd: '/tmp', autoApprove: false });

      expect(spawnedProcs[0]._spawnArgs.args).not.toContain('--dangerously-skip-permissions');
    });

    it('adds --resume + session id when resuming a named claude session', () => {
      setupProvider();
      mgr.startDirectPty({
        id: 'resume-test',
        providerId: 'claude',
        cwd: '/tmp',
        resume: true,
        resumeSessionId: 'sess-abc',
      });

      const args = spawnedProcs[0]._spawnArgs.args;
      expect(args).toContain('--resume');
      expect(args).toContain('sess-abc');
    });

    it('adds --session-id for a new claude session when resumeSessionId is provided', () => {
      setupProvider();
      mgr.startDirectPty({
        id: 'new-session',
        providerId: 'claude',
        cwd: '/tmp',
        resume: false,
        resumeSessionId: 'new-xyz',
      });

      const args = spawnedProcs[0]._spawnArgs.args;
      expect(args).toContain('--session-id');
      expect(args).toContain('new-xyz');
    });

    it('adds initialPrompt with flag for codex provider', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/bin/codex', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'prompt-test', providerId: 'codex', cwd: '/tmp', initialPrompt: 'Fix the bug' });

      const args = spawnedProcs[0]._spawnArgs.args;
      expect(args).toContain('-p');
      expect(args).toContain('Fix the bug');
    });

    it('sets base env vars: TERM, COLORTERM, TERM_PROGRAM', () => {
      setupProvider();
      mgr.startDirectPty({ id: 'env-base', providerId: 'claude', cwd: '/tmp' });

      const env = spawnedProcs[0]._spawnArgs.options.env;
      expect(env.TERM).toBe('xterm-256color');
      expect(env.COLORTERM).toBe('truecolor');
      expect(env.TERM_PROGRAM).toBe('valkyr');
      expect(env.HOME).toBeDefined();
      expect(env.PATH).toBeDefined();
    });

    it('only passes VALKYR_* keys from the env option argument', () => {
      setupProvider();
      mgr.startDirectPty({
        id: 'env-filter',
        providerId: 'claude',
        cwd: '/tmp',
        env: { VALKYR_CUSTOM: 'ok', SECRET_KEY: 'blocked' },
      });

      const env = spawnedProcs[0]._spawnArgs.options.env;
      expect(env.VALKYR_CUSTOM).toBe('ok');
      expect(env.SECRET_KEY).toBeUndefined();
    });

    it('injects VALKYR_SESSION_ID and VALKYR_HOOK_PORT when hook server is running', async () => {
      hookServerMock.isRunning.mockReturnValue(true);
      hookServerMock.getPort.mockReturnValue(5555);

      // Re-import after setting hook server state
      vi.resetModules();
      patchNodePtyCache();
      const freshMgr = await import('../../main/services/ptyManager');

      setupProvider();
      freshMgr.startDirectPty({ id: 'hook-session', providerId: 'claude', cwd: '/tmp' });

      const env = spawnedProcs[spawnedProcs.length - 1]._spawnArgs.options.env;
      expect(env.VALKYR_SESSION_ID).toBe('hook-session');
      expect(env.VALKYR_HOOK_PORT).toBe('5555');

      hookServerMock.isRunning.mockReturnValue(false);
    });

    it('does NOT inject hook vars for non-claude providers', async () => {
      hookServerMock.isRunning.mockReturnValue(true);
      hookServerMock.getPort.mockReturnValue(5555);

      vi.resetModules();
      patchNodePtyCache();
      const freshMgr = await import('../../main/services/ptyManager');

      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/bin/codex', lastChecked: Date.now() });
      freshMgr.startDirectPty({ id: 'codex-no-hook', providerId: 'codex', cwd: '/tmp' });

      const env = spawnedProcs[spawnedProcs.length - 1]._spawnArgs.options.env;
      expect(env.VALKYR_SESSION_ID).toBeUndefined();

      hookServerMock.isRunning.mockReturnValue(false);
    });

    it('storedKeys are used when process.env key is absent', () => {
      const saved = process.env.AMP_API_KEY;
      delete process.env.AMP_API_KEY;

      setupProvider();
      mgr.startDirectPty({
        id: 'stored-key',
        providerId: 'claude',
        cwd: '/tmp',
        storedKeys: { AMP_API_KEY: 'stored-value' },
      });

      const env = spawnedProcs[0]._spawnArgs.options.env;
      expect(env.AMP_API_KEY).toBe('stored-value');

      if (saved !== undefined) process.env.AMP_API_KEY = saved;
    });

    it('process.env takes priority over storedKeys', () => {
      const saved = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'from-env';

      setupProvider();
      mgr.startDirectPty({
        id: 'priority-test',
        providerId: 'claude',
        cwd: '/tmp',
        storedKeys: { ANTHROPIC_API_KEY: 'from-stored' },
      });

      const env = spawnedProcs[0]._spawnArgs.options.env;
      expect(env.ANTHROPIC_API_KEY).toBe('from-env');

      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = saved;
    });

    it('registers PTY so hasPty returns true', () => {
      setupProvider();
      mgr.startDirectPty({ id: 'pty-registered', providerId: 'claude', cwd: '/tmp' });
      expect(mgr.hasPty('pty-registered')).toBe(true);
    });

    it('PTY kind is "local" for direct spawn', () => {
      setupProvider();
      mgr.startDirectPty({ id: 'local-kind', providerId: 'claude', cwd: '/tmp' });
      expect(mgr.getPtyKind('local-kind')).toBe('local');
    });

    it('fires onDirectCliExit callback when process exits', () => {
      const callback = vi.fn();
      mgr.setOnDirectCliExit(callback);

      setupProvider();
      mgr.startDirectPty({ id: 'exit-cb', providerId: 'claude', cwd: '/home/user/proj' });

      const spawned = spawnedProcs[0];
      spawned._triggerExit({ exitCode: 0 });

      expect(callback).toHaveBeenCalledWith('exit-cb', '/home/user/proj');
    });
  });

  // -----------------------------------------------------------------------
  // startSshPty — spawn args
  // -----------------------------------------------------------------------

  describe('startSshPty', () => {
    it('spawns the ssh binary with -tt and target', () => {
      mgr.startSshPty({ id: 'ssh-basic', target: 'deploy@server.example.com' });

      expect(nodePtySpawnMock).toHaveBeenCalledOnce();
      const spawned = spawnedProcs[0];
      expect(spawned._spawnArgs.file).toBe('ssh');
      expect(spawned._spawnArgs.args).toContain('-tt');
      expect(spawned._spawnArgs.args).toContain('deploy@server.example.com');
    });

    it('includes extra sshArgs between -tt and target', () => {
      mgr.startSshPty({
        id: 'ssh-args',
        target: 'user@host',
        sshArgs: ['-p', '2222'],
      });

      const args = spawnedProcs[0]._spawnArgs.args;
      expect(args).toContain('-p');
      expect(args).toContain('2222');
    });

    it('appends non-empty remoteInitCommand as last arg', () => {
      mgr.startSshPty({
        id: 'ssh-cmd',
        target: 'user@host',
        remoteInitCommand: 'bash --login',
      });

      const args = spawnedProcs[0]._spawnArgs.args;
      expect(args[args.length - 1]).toBe('bash --login');
    });

    it('does not append a whitespace-only remoteInitCommand', () => {
      mgr.startSshPty({ id: 'ssh-blank-cmd', target: 'user@host', remoteInitCommand: '   ' });

      const args = spawnedProcs[0]._spawnArgs.args;
      // Target must be last, not a blank string
      expect(args[args.length - 1]).toBe('user@host');
    });

    it('only passes VALKYR_* env keys from the env option', () => {
      mgr.startSshPty({
        id: 'ssh-env',
        target: 'user@host',
        env: { VALKYR_CUSTOM: 'yes', DANGER: 'no' },
      });

      const env = spawnedProcs[0]._spawnArgs.options.env;
      expect(env.VALKYR_CUSTOM).toBe('yes');
      expect(env.DANGER).toBeUndefined();
    });

    it('defaults to cols=120 rows=32', () => {
      mgr.startSshPty({ id: 'ssh-size', target: 'user@host' });

      expect(spawnedProcs[0]._spawnArgs.options.cols).toBe(120);
      expect(spawnedProcs[0]._spawnArgs.options.rows).toBe(32);
    });

    it('registers PTY as kind=ssh', () => {
      mgr.startSshPty({ id: 'ssh-kind', target: 'user@host' });
      expect(mgr.getPtyKind('ssh-kind')).toBe('ssh');
    });

    it('returns the proc object', () => {
      const proc = mgr.startSshPty({ id: 'ssh-return', target: 'user@host' });
      expect(proc).toBeDefined();
      expect(proc.write).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // writePty
  // -----------------------------------------------------------------------

  describe('writePty', () => {
    it('writes data to the process', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'write-me', providerId: 'claude', cwd: '/tmp' });

      mgr.writePty('write-me', 'echo hello\n');

      expect(spawnedProcs[0].write).toHaveBeenCalledWith('echo hello\n');
    });
  });

  // -----------------------------------------------------------------------
  // resizePty
  // -----------------------------------------------------------------------

  describe('resizePty', () => {
    it('calls proc.resize with the new dimensions', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'resize-me', providerId: 'claude', cwd: '/tmp' });

      mgr.resizePty('resize-me', 200, 50);

      expect(spawnedProcs[0].resize).toHaveBeenCalledWith(200, 50);
    });

    it('does not resize when cols=0', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'zero-cols', providerId: 'claude', cwd: '/tmp' });

      mgr.resizePty('zero-cols', 0, 24);

      expect(spawnedProcs[0].resize).not.toHaveBeenCalled();
    });

    it('does not resize when rows=0', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'zero-rows', providerId: 'claude', cwd: '/tmp' });

      mgr.resizePty('zero-rows', 80, 0);

      expect(spawnedProcs[0].resize).not.toHaveBeenCalled();
    });

    it('suppresses EBADF errors during shutdown', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'ebadf', providerId: 'claude', cwd: '/tmp' });

      spawnedProcs[0].resize.mockImplementation(() => {
        throw Object.assign(new Error('EBADF: bad file descriptor'), { code: 'EBADF' });
      });

      expect(() => mgr.resizePty('ebadf', 80, 24)).not.toThrow();
    });

    it('suppresses ENOTTY errors', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'enotty', providerId: 'claude', cwd: '/tmp' });

      spawnedProcs[0].resize.mockImplementation(() => {
        throw new Error('ENOTTY: inappropriate ioctl');
      });

      expect(() => mgr.resizePty('enotty', 80, 24)).not.toThrow();
    });

    it('suppresses "not open" errors', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'not-open', providerId: 'claude', cwd: '/tmp' });

      spawnedProcs[0].resize.mockImplementation(() => {
        throw new Error('Terminal is not open');
      });

      expect(() => mgr.resizePty('not-open', 80, 24)).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // killPty
  // -----------------------------------------------------------------------

  describe('killPty', () => {
    it('calls kill and removes the PTY record', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'kill-me', providerId: 'claude', cwd: '/tmp' });
      expect(mgr.hasPty('kill-me')).toBe(true);

      mgr.killPty('kill-me');

      expect(spawnedProcs[0].kill).toHaveBeenCalled();
      expect(mgr.hasPty('kill-me')).toBe(false);
    });

    it('falls back to SIGKILL when default kill() throws', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'sigkill', providerId: 'claude', cwd: '/tmp' });

      spawnedProcs[0].kill.mockImplementationOnce(() => {
        throw new Error('kill failed');
      });

      expect(() => mgr.killPty('sigkill')).not.toThrow();
      expect(spawnedProcs[0].kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('still removes PTY record even when both kill() calls throw', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'double-fail', providerId: 'claude', cwd: '/tmp' });

      spawnedProcs[0].kill.mockImplementation(() => {
        throw new Error('already dead');
      });

      expect(() => mgr.killPty('double-fail')).not.toThrow();
      expect(mgr.hasPty('double-fail')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // removePtyRecord
  // -----------------------------------------------------------------------

  describe('removePtyRecord', () => {
    it('removes the record without killing the process', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'remove-me', providerId: 'claude', cwd: '/tmp' });

      mgr.removePtyRecord('remove-me');

      expect(mgr.hasPty('remove-me')).toBe(false);
      expect(spawnedProcs[0].kill).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getPty
  // -----------------------------------------------------------------------

  describe('getPty', () => {
    it('returns the proc for a registered PTY', () => {
      providerStatusCacheMock.get.mockReturnValue({ installed: true, path: '/usr/local/bin/claude', lastChecked: Date.now() });
      mgr.startDirectPty({ id: 'get-me', providerId: 'claude', cwd: '/tmp' });

      const proc = mgr.getPty('get-me');
      expect(proc).toBeDefined();
      expect((proc as any).write).toBeTypeOf('function');
    });

    it('returns undefined for unregistered id', () => {
      expect(mgr.getPty('none')).toBeUndefined();
    });
  });
});
