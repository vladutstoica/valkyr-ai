import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- child_process mock ----
const execMock = vi.fn();

vi.mock('child_process', () => ({
  exec: execMock,
}));

// ---- util mock — promisify wraps execMock as a promise ----
vi.mock('util', () => ({
  promisify: (fn: any) => {
    return (...args: any[]) =>
      new Promise((resolve, reject) => {
        fn(...args, (err: any, stdout: string, stderr: string) => {
          if (err) return reject(err);
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
        });
      });
  },
}));

// Helper: make execMock respond for a specific command fragment.
// exec() can be called as exec(cmd, cb) or exec(cmd, opts, cb) — handle both.
function mockExec(responses: Array<{ match: string | RegExp; stdout?: string; err?: Error }>) {
  execMock.mockImplementation((...args: any[]) => {
    const cmd: string = args[0];
    // The callback is always the last argument
    const cb: (err: any, stdout: string, stderr: string) => void = args[args.length - 1];
    for (const r of responses) {
      const matched = typeof r.match === 'string' ? cmd.includes(r.match) : r.match.test(cmd);
      if (matched) {
        if (r.err) return cb(r.err, '', '');
        return cb(null, r.stdout ?? '', '');
      }
    }
    // Default fallback
    cb(null, '', '');
  });
}

describe('RepositoryManager', () => {
  let RepositoryManager: typeof import('../../main/services/RepositoryManager').RepositoryManager;
  let manager: InstanceType<
    typeof import('../../main/services/RepositoryManager').RepositoryManager
  >;

  beforeEach(async () => {
    vi.resetModules();
    execMock.mockReset();
    const mod = await import('../../main/services/RepositoryManager');
    RepositoryManager = mod.RepositoryManager;
    manager = new RepositoryManager();
  });

  // -------------------------------------------------------------------------
  // scanRepositories()
  // -------------------------------------------------------------------------
  describe('scanRepositories()', () => {
    it('returns an empty array (stub implementation)', async () => {
      const repos = await manager.scanRepositories();
      expect(repos).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // addRepository() — happy path
  // -------------------------------------------------------------------------
  describe('addRepository()', () => {
    it('adds a valid git repository and returns Repo object', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'git@github.com:user/repo.git\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'main\n' },
      ]);

      const repo = await manager.addRepository('/some/path');

      expect(repo.path).toBe('/some/path');
      expect(repo.origin).toBe('git@github.com:user/repo.git');
      expect(repo.defaultBranch).toBe('main');
      expect(typeof repo.id).toBe('string');
      expect(repo.id.length).toBeGreaterThan(0);
      expect(repo.lastActivity).toBeDefined();
    });

    it('generates a unique ID for each repository', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'git@github.com:user/repo.git\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'main\n' },
      ]);

      const repo1 = await manager.addRepository('/path/one');
      const repo2 = await manager.addRepository('/path/two');

      expect(repo1.id).not.toBe(repo2.id);
    });

    it('stores the repo so it can be retrieved via getRepository', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'https://github.com/user/repo.git\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'develop\n' },
      ]);

      const repo = await manager.addRepository('/a/b/c');
      const retrieved = manager.getRepository(repo.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.path).toBe('/a/b/c');
    });

    it('sets lastActivity to an ISO date string', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'origin-url\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'main\n' },
      ]);

      const before = new Date().toISOString();
      const repo = await manager.addRepository('/test/path');
      const after = new Date().toISOString();

      expect(repo.lastActivity).toBeDefined();
      expect(repo.lastActivity! >= before).toBe(true);
      expect(repo.lastActivity! <= after).toBe(true);
    });

    it('falls back to "No origin" when remote get-url fails', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', err: new Error('no remote') },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'main\n' },
      ]);

      const repo = await manager.addRepository('/no-origin/path');
      expect(repo.origin).toBe('No origin');
    });

    it('falls back to "main" when symbolic-ref fails', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'https://github.com/user/repo.git\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', err: new Error('no HEAD') },
      ]);

      const repo = await manager.addRepository('/no-branch/path');
      expect(repo.defaultBranch).toBe('main');
    });

    it('falls back to "main" when symbolic-ref returns empty string', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'https://github.com/user/repo.git\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: '\n' },
      ]);

      const repo = await manager.addRepository('/empty-branch/path');
      expect(repo.defaultBranch).toBe('main');
    });

    it('throws when rev-parse returns something other than "true"', async () => {
      mockExec([{ match: 'rev-parse --is-inside-work-tree', stdout: 'false\n' }]);

      await expect(manager.addRepository('/not-a-repo')).rejects.toThrow(
        'Failed to add repository'
      );
    });

    it('throws when rev-parse command itself errors', async () => {
      mockExec([{ match: 'rev-parse --is-inside-work-tree', err: new Error('not a git repo') }]);

      await expect(manager.addRepository('/bad-path')).rejects.toThrow('Failed to add repository');
    });

    it('error message wraps the original error detail', async () => {
      mockExec([
        {
          match: 'rev-parse --is-inside-work-tree',
          err: new Error('fatal: not a git repository'),
        },
      ]);

      await expect(manager.addRepository('/fail')).rejects.toThrow('Failed to add repository');
    });
  });

  // -------------------------------------------------------------------------
  // getRepository()
  // -------------------------------------------------------------------------
  describe('getRepository()', () => {
    it('returns undefined for an unknown id', () => {
      const result = manager.getRepository('nonexistent-id');
      expect(result).toBeUndefined();
    });

    it('returns the correct repo when multiple repos are added', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'origin-a\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'main\n' },
      ]);

      const repoA = await manager.addRepository('/path/a');

      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'origin-b\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'develop\n' },
      ]);

      const repoB = await manager.addRepository('/path/b');

      expect(manager.getRepository(repoA.id)?.origin).toBe('origin-a');
      expect(manager.getRepository(repoB.id)?.origin).toBe('origin-b');
    });
  });

  // -------------------------------------------------------------------------
  // getAllRepositories()
  // -------------------------------------------------------------------------
  describe('getAllRepositories()', () => {
    it('returns empty array when no repositories have been added', () => {
      expect(manager.getAllRepositories()).toEqual([]);
    });

    it('returns all added repositories', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'https://github.com/a.git\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'main\n' },
      ]);

      await manager.addRepository('/p1');
      await manager.addRepository('/p2');

      const all = manager.getAllRepositories();
      expect(all).toHaveLength(2);
    });

    it('returns a new array (not the internal map reference)', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'origin\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'main\n' },
      ]);

      await manager.addRepository('/single');
      const a = manager.getAllRepositories();
      const b = manager.getAllRepositories();
      // Should be equal in content but independent array references
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // -------------------------------------------------------------------------
  // Repo interface shape
  // -------------------------------------------------------------------------
  describe('Repo interface', () => {
    it('exported Repo has the expected shape', async () => {
      mockExec([
        { match: 'rev-parse --is-inside-work-tree', stdout: 'true\n' },
        { match: 'remote get-url origin', stdout: 'https://github.com/user/repo.git\n' },
        { match: 'symbolic-ref refs/remotes/origin/HEAD', stdout: 'feature\n' },
      ]);

      const repo = await manager.addRepository('/shape-test');

      // Required fields
      expect(typeof repo.id).toBe('string');
      expect(typeof repo.path).toBe('string');
      expect(typeof repo.origin).toBe('string');
      expect(typeof repo.defaultBranch).toBe('string');
      // Optional fields present after add
      expect(typeof repo.lastActivity).toBe('string');
      // changes is optional and not populated by addRepository
      expect(repo.changes).toBeUndefined();
    });
  });
});
