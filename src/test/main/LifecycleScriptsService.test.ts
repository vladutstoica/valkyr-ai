import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(os.tmpdir()),
    getName: vi.fn().mockReturnValue('valkyr-test'),
  },
}));

vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a .valkyr.json config to a temp directory and return the directory path.
 */
function setupProjectWithConfig(tmpDir: string, config: object): void {
  fs.writeFileSync(path.join(tmpDir, '.valkyr.json'), JSON.stringify(config, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LifecycleScriptsService', () => {
  let tmpDir: string;
  let service: typeof import('../../main/services/LifecycleScriptsService').lifecycleScriptsService;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-test-'));
    vi.resetModules();
    vi.mock('electron', () => ({
      app: { getPath: vi.fn().mockReturnValue(os.tmpdir()) },
    }));
    vi.mock('../../main/lib/logger', () => ({
      log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    ({ lifecycleScriptsService: service } = await import(
      '../../main/services/LifecycleScriptsService'
    ));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // readConfig
  // -------------------------------------------------------------------------

  describe('readConfig', () => {
    it('returns null when .valkyr.json does not exist', () => {
      const result = service.readConfig(tmpDir);
      expect(result).toBeNull();
    });

    it('parses a valid .valkyr.json', () => {
      setupProjectWithConfig(tmpDir, {
        preservePatterns: ['node_modules', '.env'],
        scripts: {
          setup: 'npm install',
          run: 'npm start',
          teardown: 'npm run cleanup',
        },
      });

      const result = service.readConfig(tmpDir);

      expect(result).not.toBeNull();
      expect(result!.preservePatterns).toEqual(['node_modules', '.env']);
      expect(result!.scripts!.setup).toBe('npm install');
      expect(result!.scripts!.run).toBe('npm start');
      expect(result!.scripts!.teardown).toBe('npm run cleanup');
    });

    it('returns config with no scripts field when scripts are absent', () => {
      setupProjectWithConfig(tmpDir, {
        preservePatterns: ['dist'],
      });

      const result = service.readConfig(tmpDir);

      expect(result).not.toBeNull();
      expect(result!.scripts).toBeUndefined();
    });

    it('returns null when .valkyr.json contains invalid JSON', () => {
      fs.writeFileSync(path.join(tmpDir, '.valkyr.json'), '{ invalid json }', 'utf8');

      const result = service.readConfig(tmpDir);

      expect(result).toBeNull();
    });

    it('returns null when .valkyr.json is an empty file', () => {
      fs.writeFileSync(path.join(tmpDir, '.valkyr.json'), '', 'utf8');

      const result = service.readConfig(tmpDir);

      expect(result).toBeNull();
    });

    it('handles .valkyr.json with only an empty scripts object', () => {
      setupProjectWithConfig(tmpDir, { scripts: {} });

      const result = service.readConfig(tmpDir);

      expect(result).not.toBeNull();
      expect(result!.scripts).toEqual({});
    });

    it('returns null for a non-existent project directory (does not throw)', () => {
      const nonExistentPath = path.join(os.tmpdir(), 'definitely-does-not-exist-xyz');
      const result = service.readConfig(nonExistentPath);
      expect(result).toBeNull();
    });

    it('reads config from the exact project path (not a parent directory)', () => {
      // Create a nested structure to confirm path specificity
      const nested = path.join(tmpDir, 'subproject');
      fs.mkdirSync(nested);
      setupProjectWithConfig(nested, { scripts: { setup: 'echo nested-setup' } });

      // Root has no config
      const rootResult = service.readConfig(tmpDir);
      expect(rootResult).toBeNull();

      // Nested has config
      const nestedResult = service.readConfig(nested);
      expect(nestedResult!.scripts!.setup).toBe('echo nested-setup');
    });
  });

  // -------------------------------------------------------------------------
  // getScript
  // -------------------------------------------------------------------------

  describe('getScript', () => {
    it('returns null when no .valkyr.json exists', () => {
      expect(service.getScript(tmpDir, 'setup')).toBeNull();
    });

    it('returns the setup script command', () => {
      setupProjectWithConfig(tmpDir, {
        scripts: { setup: 'pnpm install' },
      });

      expect(service.getScript(tmpDir, 'setup')).toBe('pnpm install');
    });

    it('returns the run script command', () => {
      setupProjectWithConfig(tmpDir, {
        scripts: { run: 'pnpm dev' },
      });

      expect(service.getScript(tmpDir, 'run')).toBe('pnpm dev');
    });

    it('returns the teardown script command', () => {
      setupProjectWithConfig(tmpDir, {
        scripts: { teardown: 'docker-compose down' },
      });

      expect(service.getScript(tmpDir, 'teardown')).toBe('docker-compose down');
    });

    it('returns null when the requested phase is not present in scripts', () => {
      setupProjectWithConfig(tmpDir, {
        scripts: { setup: 'npm install' },
      });

      expect(service.getScript(tmpDir, 'teardown')).toBeNull();
    });

    it('returns null when the script value is an empty string', () => {
      setupProjectWithConfig(tmpDir, {
        scripts: { setup: '' },
      });

      expect(service.getScript(tmpDir, 'setup')).toBeNull();
    });

    it('returns null when the script value is only whitespace', () => {
      setupProjectWithConfig(tmpDir, {
        scripts: { run: '   ' },
      });

      expect(service.getScript(tmpDir, 'run')).toBeNull();
    });

    it('trims leading and trailing whitespace from the script command', () => {
      setupProjectWithConfig(tmpDir, {
        scripts: { setup: '  npm ci  ' },
      });

      expect(service.getScript(tmpDir, 'setup')).toBe('npm ci');
    });

    it('returns null when scripts key is missing entirely', () => {
      setupProjectWithConfig(tmpDir, {
        preservePatterns: ['node_modules'],
      });

      expect(service.getScript(tmpDir, 'setup')).toBeNull();
    });

    it('returns null when .valkyr.json is malformed', () => {
      fs.writeFileSync(path.join(tmpDir, '.valkyr.json'), 'not-json-at-all', 'utf8');

      expect(service.getScript(tmpDir, 'setup')).toBeNull();
    });

    it('handles all three lifecycle phases independently', () => {
      setupProjectWithConfig(tmpDir, {
        scripts: {
          setup: 'echo setup',
          run: 'echo run',
          teardown: 'echo teardown',
        },
      });

      expect(service.getScript(tmpDir, 'setup')).toBe('echo setup');
      expect(service.getScript(tmpDir, 'run')).toBe('echo run');
      expect(service.getScript(tmpDir, 'teardown')).toBe('echo teardown');
    });

    it('returns the script for a multi-word command with arguments', () => {
      setupProjectWithConfig(tmpDir, {
        scripts: { setup: 'docker-compose up -d --build' },
      });

      expect(service.getScript(tmpDir, 'setup')).toBe('docker-compose up -d --build');
    });
  });
});
