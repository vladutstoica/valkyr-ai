import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const existsSyncMock = vi.fn();
const spawnMock = vi.fn();

// Minimal child process stub returned by spawn
function makeChildStub() {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  return {
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    unref: vi.fn(),
  };
}

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

// Helper: set up existsSync to simulate the presence/absence of files
function mockFs(files: Record<string, boolean>) {
  existsSyncMock.mockImplementation((p: string) => files[p] ?? false);
}

beforeEach(() => {
  vi.clearAllMocks();
  spawnMock.mockReturnValue(makeChildStub());
});

describe('ProjectPrep', () => {
  describe('ensureProjectPrepared', () => {
    it('does nothing when node_modules already exists', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': true,
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('does nothing when package.json does not exist', async () => {
      mockFs({
        '/project/package.json': false,
        '/project/node_modules': false,
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('spawns pnpm install when pnpm-lock.yaml is present and node_modules missing', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': false,
        '/project/pnpm-lock.yaml': true,
        '/project/yarn.lock': false,
        '/project/bun.lockb': false,
        '/project/package-lock.json': false,
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [command, options] = spawnMock.mock.calls[0];
      // The fallback chain is joined with ' || '
      expect(command).toContain('pnpm install');
      expect(options.cwd).toBe('/project');
      expect(options.shell).toBe(true);
    });

    it('spawns yarn install when yarn.lock is present and node_modules missing', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': false,
        '/project/pnpm-lock.yaml': false,
        '/project/yarn.lock': true,
        '/project/bun.lockb': false,
        '/project/package-lock.json': false,
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [command] = spawnMock.mock.calls[0];
      expect(command).toContain('yarn install');
    });

    it('spawns bun install when bun.lockb is present and node_modules missing', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': false,
        '/project/pnpm-lock.yaml': false,
        '/project/yarn.lock': false,
        '/project/bun.lockb': true,
        '/project/package-lock.json': false,
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [command] = spawnMock.mock.calls[0];
      expect(command).toContain('bun install');
    });

    it('spawns npm ci when package-lock.json is present and node_modules missing', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': false,
        '/project/pnpm-lock.yaml': false,
        '/project/yarn.lock': false,
        '/project/bun.lockb': false,
        '/project/package-lock.json': true,
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [command] = spawnMock.mock.calls[0];
      expect(command).toContain('npm ci');
    });

    it('falls back to npm install when no lockfile is detected', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': false,
        '/project/pnpm-lock.yaml': false,
        '/project/yarn.lock': false,
        '/project/bun.lockb': false,
        '/project/package-lock.json': false,
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [command] = spawnMock.mock.calls[0];
      expect(command).toBe('npm install');
    });

    it('spawns the process with shell:true and stdio:ignore', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': false,
        '/project/pnpm-lock.yaml': false,
        '/project/yarn.lock': false,
        '/project/bun.lockb': false,
        '/project/package-lock.json': false,
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      const [, options] = spawnMock.mock.calls[0];
      expect(options.shell).toBe(true);
      expect(options.stdio).toBe('ignore');
      expect(options.windowsHide).toBe(true);
    });

    it('calls unref on the child process so it does not block app exit', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': false,
        '/project/pnpm-lock.yaml': false,
        '/project/yarn.lock': false,
        '/project/bun.lockb': false,
        '/project/package-lock.json': false,
      });
      const child = makeChildStub();
      spawnMock.mockReturnValue(child);

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      expect(child.unref).toHaveBeenCalled();
    });

    it('registers an error listener on the child process', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': false,
        '/project/pnpm-lock.yaml': false,
        '/project/yarn.lock': false,
        '/project/bun.lockb': false,
        '/project/package-lock.json': false,
      });
      const child = makeChildStub();
      spawnMock.mockReturnValue(child);

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      // Verify the error listener was attached (avoids unhandled error crash)
      expect(child.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('does not throw even if existsSync internally throws', async () => {
      existsSyncMock.mockImplementation(() => {
        throw new Error('FS error');
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      // Should silently swallow the error
      await expect(ensureProjectPrepared('/project')).resolves.toBeUndefined();
    });

    it('pnpm command chain includes fallback commands in order', async () => {
      mockFs({
        '/project/package.json': true,
        '/project/node_modules': false,
        '/project/pnpm-lock.yaml': true,
        '/project/yarn.lock': false,
        '/project/bun.lockb': false,
        '/project/package-lock.json': false,
      });

      const { ensureProjectPrepared } = await import('../../main/services/ProjectPrep');
      await ensureProjectPrepared('/project');

      const [command] = spawnMock.mock.calls[0];
      // The full chain: "pnpm install --frozen-lockfile || pnpm install || npm ci || npm install"
      expect(command).toContain('pnpm install --frozen-lockfile');
      expect(command).toContain('npm ci');
      expect(command).toContain('npm install');
    });
  });
});
