import { describe, it, expect } from 'vitest';
import { DEFAULT_IGNORES } from '../../main/utils/fsIgnores';

describe('DEFAULT_IGNORES', () => {
  it('is a Set', () => {
    expect(DEFAULT_IGNORES).toBeInstanceOf(Set);
  });

  it('is non-empty', () => {
    expect(DEFAULT_IGNORES.size).toBeGreaterThan(0);
  });

  // ─── Version control ────────────────────────────────────────────────────

  describe('version control directories', () => {
    it('ignores .git', () => {
      expect(DEFAULT_IGNORES.has('.git')).toBe(true);
    });

    it('ignores .svn', () => {
      expect(DEFAULT_IGNORES.has('.svn')).toBe(true);
    });

    it('ignores .hg', () => {
      expect(DEFAULT_IGNORES.has('.hg')).toBe(true);
    });
  });

  // ─── Dependencies ──────────────────────────────────────────────────────

  describe('dependency directories', () => {
    it('ignores node_modules', () => {
      expect(DEFAULT_IGNORES.has('node_modules')).toBe(true);
    });

    it('ignores .pnpm-store', () => {
      expect(DEFAULT_IGNORES.has('.pnpm-store')).toBe(true);
    });

    it('ignores vendor', () => {
      expect(DEFAULT_IGNORES.has('vendor')).toBe(true);
    });

    it('ignores bower_components', () => {
      expect(DEFAULT_IGNORES.has('bower_components')).toBe(true);
    });
  });

  // ─── Build outputs ─────────────────────────────────────────────────────

  describe('build output directories', () => {
    it('ignores dist', () => {
      expect(DEFAULT_IGNORES.has('dist')).toBe(true);
    });

    it('ignores build', () => {
      expect(DEFAULT_IGNORES.has('build')).toBe(true);
    });

    it('ignores out', () => {
      expect(DEFAULT_IGNORES.has('out')).toBe(true);
    });

    it('ignores release', () => {
      expect(DEFAULT_IGNORES.has('release')).toBe(true);
    });

    it('ignores target', () => {
      expect(DEFAULT_IGNORES.has('target')).toBe(true);
    });
  });

  // ─── Framework caches ──────────────────────────────────────────────────

  describe('framework cache directories', () => {
    it('ignores .next', () => {
      expect(DEFAULT_IGNORES.has('.next')).toBe(true);
    });

    it('ignores .nuxt', () => {
      expect(DEFAULT_IGNORES.has('.nuxt')).toBe(true);
    });

    it('ignores .cache', () => {
      expect(DEFAULT_IGNORES.has('.cache')).toBe(true);
    });

    it('ignores .parcel-cache', () => {
      expect(DEFAULT_IGNORES.has('.parcel-cache')).toBe(true);
    });

    it('ignores .turbo', () => {
      expect(DEFAULT_IGNORES.has('.turbo')).toBe(true);
    });
  });

  // ─── Test and coverage ─────────────────────────────────────────────────

  describe('test and coverage directories', () => {
    it('ignores coverage', () => {
      expect(DEFAULT_IGNORES.has('coverage')).toBe(true);
    });

    it('ignores .nyc_output', () => {
      expect(DEFAULT_IGNORES.has('.nyc_output')).toBe(true);
    });

    it('ignores __pycache__', () => {
      expect(DEFAULT_IGNORES.has('__pycache__')).toBe(true);
    });

    it('ignores .pytest_cache', () => {
      expect(DEFAULT_IGNORES.has('.pytest_cache')).toBe(true);
    });
  });

  // ─── IDE / editor ──────────────────────────────────────────────────────

  describe('IDE and editor directories', () => {
    it('ignores .idea', () => {
      expect(DEFAULT_IGNORES.has('.idea')).toBe(true);
    });

    it('ignores .vscode-test', () => {
      expect(DEFAULT_IGNORES.has('.vscode-test')).toBe(true);
    });
  });

  // ─── OS artifacts ──────────────────────────────────────────────────────

  describe('OS artifact files', () => {
    it('ignores .DS_Store', () => {
      expect(DEFAULT_IGNORES.has('.DS_Store')).toBe(true);
    });

    it('ignores Thumbs.db', () => {
      expect(DEFAULT_IGNORES.has('Thumbs.db')).toBe(true);
    });
  });

  // ─── AI agent directories ──────────────────────────────────────────────

  describe('AI agent configuration directories', () => {
    const agentDirs = [
      '.claude',
      '.cursor',
      '.amp',
      '.codex',
      '.aider',
      '.continue',
      '.cody',
      '.windsurf',
      '.conductor',
    ];

    it.each(agentDirs)('ignores %s', (dir) => {
      expect(DEFAULT_IGNORES.has(dir)).toBe(true);
    });
  });

  // ─── Misc ──────────────────────────────────────────────────────────────

  describe('miscellaneous directories', () => {
    it('ignores tmp', () => {
      expect(DEFAULT_IGNORES.has('tmp')).toBe(true);
    });

    it('ignores temp', () => {
      expect(DEFAULT_IGNORES.has('temp')).toBe(true);
    });

    it('ignores .terraform', () => {
      expect(DEFAULT_IGNORES.has('.terraform')).toBe(true);
    });

    it('ignores .serverless', () => {
      expect(DEFAULT_IGNORES.has('.serverless')).toBe(true);
    });

    it('ignores worktrees', () => {
      expect(DEFAULT_IGNORES.has('worktrees')).toBe(true);
    });

    it('ignores .worktrees', () => {
      expect(DEFAULT_IGNORES.has('.worktrees')).toBe(true);
    });

    it('ignores .checkouts', () => {
      expect(DEFAULT_IGNORES.has('.checkouts')).toBe(true);
    });

    it('ignores checkouts', () => {
      expect(DEFAULT_IGNORES.has('checkouts')).toBe(true);
    });
  });

  // ─── Non-ignored names ─────────────────────────────────────────────────

  describe('does not ignore legitimate source directories', () => {
    const allowedDirs = ['src', 'lib', 'components', 'pages', 'public', 'assets', 'docs', 'tests'];

    it.each(allowedDirs)('does not ignore "%s"', (dir) => {
      expect(DEFAULT_IGNORES.has(dir)).toBe(false);
    });
  });

  // ─── Case sensitivity ──────────────────────────────────────────────────

  describe('case sensitivity', () => {
    it('does not match uppercase variants of ignored entries', () => {
      expect(DEFAULT_IGNORES.has('NODE_MODULES')).toBe(false);
      expect(DEFAULT_IGNORES.has('Dist')).toBe(false);
      expect(DEFAULT_IGNORES.has('.GIT')).toBe(false);
    });
  });

  // ─── Usage as a lookup (simulated real-world filter) ───────────────────

  describe('practical file-listing filter simulation', () => {
    it('filters out all ignored directories from a mixed list', () => {
      const entries = [
        'src',
        'node_modules',
        'dist',
        'README.md',
        '.git',
        'package.json',
        'coverage',
        'lib',
      ];

      const visible = entries.filter((e) => !DEFAULT_IGNORES.has(e));
      expect(visible).toEqual(['src', 'README.md', 'package.json', 'lib']);
    });

    it('passes through a list with no ignored entries unchanged', () => {
      const entries = ['src', 'lib', 'README.md', 'index.ts'];
      const visible = entries.filter((e) => !DEFAULT_IGNORES.has(e));
      expect(visible).toEqual(entries);
    });

    it('returns empty list when all entries are ignored', () => {
      const entries = ['node_modules', '.git', 'dist', 'coverage'];
      const visible = entries.filter((e) => !DEFAULT_IGNORES.has(e));
      expect(visible).toHaveLength(0);
    });
  });
});
