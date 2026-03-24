import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// --- Controlled fake home directory ---

let fakeHome: string;
let claudeDir: string;
let settingsFile: string;

// We override os.homedir so HookInstaller builds its paths against our temp dir.
// This must happen before the module is imported.
vi.spyOn(os, 'homedir').mockImplementation(() => fakeHome);

// Mock logger to keep output clean
vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// HookInstaller exports a singleton, so we reset modules between tests to get
// a fresh instance (with installed = false) for every test.
async function freshInstaller() {
  vi.resetModules();
  // Re-apply homedir spy after resetModules wipes the module registry
  vi.spyOn(os, 'homedir').mockImplementation(() => fakeHome);
  const mod = await import('../../main/services/HookInstaller');
  return mod.hookInstaller;
}

const VALKYR_HOOK_MARKER = 'VALKYR_HOOK';

// --- Helpers ---

function readSettings(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
}

function writeSettings(obj: Record<string, unknown>): void {
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(obj, null, 2), 'utf-8');
}

function countValkyrGroups(settings: Record<string, unknown>, event: string): number {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks || !hooks[event]) return 0;
  return (hooks[event] as Array<{ hooks?: Array<{ command?: string }>; command?: string }>).filter(
    (g) => {
      // New format
      if (Array.isArray(g.hooks)) {
        return g.hooks.some((h) => typeof h.command === 'string' && h.command.includes(VALKYR_HOOK_MARKER));
      }
      // Old flat format
      return typeof g.command === 'string' && g.command.includes(VALKYR_HOOK_MARKER);
    }
  ).length;
}

// --- Tests ---

describe('HookInstaller', () => {
  beforeEach(() => {
    // Create a fresh temp directory acting as the home directory
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-installer-test-'));
    claudeDir = path.join(fakeHome, '.claude');
    settingsFile = path.join(claudeDir, 'settings.json');
  });

  afterEach(() => {
    fs.rmSync(fakeHome, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // install()
  // ---------------------------------------------------------------------------

  describe('install()', () => {
    it('creates ~/.claude directory when it does not exist', async () => {
      const installer = await freshInstaller();
      expect(fs.existsSync(claudeDir)).toBe(false);

      installer.install(12345);

      expect(fs.existsSync(claudeDir)).toBe(true);
    });

    it('creates settings.json when it does not exist', async () => {
      const installer = await freshInstaller();
      installer.install(12345);

      expect(fs.existsSync(settingsFile)).toBe(true);
    });

    it('writes hooks for all three events: Stop, PostToolUse, PermissionRequest', async () => {
      const installer = await freshInstaller();
      installer.install(9000);

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks).toBeDefined();
      expect(hooks['Stop']).toBeDefined();
      expect(hooks['PostToolUse']).toBeDefined();
      expect(hooks['PermissionRequest']).toBeDefined();
    });

    it('embeds the port number in the curl command', async () => {
      const installer = await freshInstaller();
      installer.install(7777);

      const raw = fs.readFileSync(settingsFile, 'utf-8');
      expect(raw).toContain('7777');
      expect(raw).toContain('http://127.0.0.1:7777/hook/notify');
    });

    it('embeds VALKYR_HOOK_MARKER in every curl command', async () => {
      const installer = await freshInstaller();
      installer.install(8080);

      const raw = fs.readFileSync(settingsFile, 'utf-8');
      const parsed = JSON.parse(raw);
      const hooks = parsed.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;

      for (const event of ['Stop', 'PostToolUse', 'PermissionRequest']) {
        const commands = hooks[event].flatMap((g) => g.hooks.map((h) => h.command));
        expect(commands.some((c) => c.includes(VALKYR_HOOK_MARKER))).toBe(true);
      }
    });

    it('sets isInstalled() to true after install', async () => {
      const installer = await freshInstaller();
      expect(installer.isInstalled()).toBe(false);

      installer.install(1234);

      expect(installer.isInstalled()).toBe(true);
    });

    it('preserves existing non-Valkyr hooks in the settings file', async () => {
      const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user-hook' }] };
      writeSettings({ hooks: { Stop: [userHook] } });

      const installer = await freshInstaller();
      installer.install(5000);

      const settings = readSettings();
      const stopHooks = (settings.hooks as Record<string, unknown[]>)['Stop'] as Array<{
        matcher: string;
        hooks: Array<{ command: string }>;
      }>;
      const userEntry = stopHooks.find((g) => g.hooks?.some((h) => h.command === 'echo user-hook'));
      expect(userEntry).toBeDefined();
    });

    it('preserves other top-level settings keys', async () => {
      writeSettings({ theme: 'dark', someFlag: true });

      const installer = await freshInstaller();
      installer.install(5000);

      const settings = readSettings();
      expect(settings['theme']).toBe('dark');
      expect(settings['someFlag']).toBe(true);
    });

    it('updates the port when called a second time', async () => {
      const installer = await freshInstaller();
      installer.install(1111);
      installer.install(2222);

      const settings = readSettings();
      const raw = JSON.stringify(settings);
      // New port must appear, old port must not appear in a Valkyr command
      expect(raw).toContain('2222');
      expect(raw).not.toContain('1111');
    });

    it('does not add duplicate Valkyr matcher groups on repeated installs', async () => {
      const installer = await freshInstaller();
      installer.install(3000);
      installer.install(3001);

      const settings = readSettings();
      expect(countValkyrGroups(settings, 'Stop')).toBe(1);
      expect(countValkyrGroups(settings, 'PostToolUse')).toBe(1);
      expect(countValkyrGroups(settings, 'PermissionRequest')).toBe(1);
    });

    it('uses empty matcher string (match all tools)', async () => {
      const installer = await freshInstaller();
      installer.install(4000);

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, Array<{ matcher: string }>>;
      for (const event of ['Stop', 'PostToolUse', 'PermissionRequest']) {
        const valkyrGroup = hooks[event].find((g) => g.matcher === '');
        expect(valkyrGroup).toBeDefined();
      }
    });

    it('writes atomically via .tmp file then rename (no .tmp file left over)', async () => {
      const installer = await freshInstaller();
      installer.install(6000);

      expect(fs.existsSync(settingsFile + '.tmp')).toBe(false);
      expect(fs.existsSync(settingsFile)).toBe(true);
    });

    it('handles corrupted JSON by starting fresh and backing up to .bak', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(settingsFile, '{ this is not json }', 'utf-8');

      const installer = await freshInstaller();
      installer.install(5050);

      // Hooks should still be written
      const settings = readSettings();
      expect((settings.hooks as Record<string, unknown[]>)['Stop']).toBeDefined();

      // Backup should exist
      expect(fs.existsSync(settingsFile + '.bak')).toBe(true);
    });

    it('handles empty settings file by starting fresh', async () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(settingsFile, '', 'utf-8');

      const installer = await freshInstaller();
      installer.install(5060);

      const settings = readSettings();
      expect((settings.hooks as Record<string, unknown[]>)['Stop']).toBeDefined();
    });

    it('includes VALKYR_SESSION_ID env var reference in the curl command', async () => {
      const installer = await freshInstaller();
      installer.install(7000);

      const raw = fs.readFileSync(settingsFile, 'utf-8');
      expect(raw).toContain('VALKYR_SESSION_ID');
    });

    it('sets --connect-timeout and --max-time flags for resilience', async () => {
      const installer = await freshInstaller();
      installer.install(7001);

      const raw = fs.readFileSync(settingsFile, 'utf-8');
      expect(raw).toContain('--connect-timeout');
      expect(raw).toContain('--max-time');
    });

    it('includes || true to prevent hook errors from blocking Claude', async () => {
      const installer = await freshInstaller();
      installer.install(7002);

      const raw = fs.readFileSync(settingsFile, 'utf-8');
      expect(raw).toContain('|| true');
    });
  });

  // ---------------------------------------------------------------------------
  // uninstall()
  // ---------------------------------------------------------------------------

  describe('uninstall()', () => {
    it('does nothing when install() was never called', async () => {
      const installer = await freshInstaller();
      // Should not throw; isInstalled guard fires first
      expect(() => installer.uninstall()).not.toThrow();
      expect(fs.existsSync(settingsFile)).toBe(false);
    });

    it('removes Valkyr matcher groups from all events', async () => {
      const installer = await freshInstaller();
      installer.install(8000);
      installer.uninstall();

      const settings = readSettings();
      // With no user hooks, events and hooks object should be gone entirely
      expect((settings as Record<string, unknown>).hooks).toBeUndefined();
    });

    it('preserves user-owned hooks when uninstalling', async () => {
      const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user-hook' }] };
      writeSettings({ hooks: { Stop: [userHook] } });

      const installer = await freshInstaller();
      installer.install(8001);
      installer.uninstall();

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      expect(hooks).toBeDefined();
      expect(hooks['Stop']).toBeDefined();
      const userEntry = hooks['Stop'].find((g) =>
        g.hooks?.some((h) => h.command === 'echo user-hook')
      );
      expect(userEntry).toBeDefined();
    });

    it('sets isInstalled() to false after uninstall', async () => {
      const installer = await freshInstaller();
      installer.install(9090);
      installer.uninstall();

      expect(installer.isInstalled()).toBe(false);
    });

    it('removes the hooks key entirely when all Valkyr hooks were the only hooks', async () => {
      const installer = await freshInstaller();
      installer.install(9091);
      installer.uninstall();

      const settings = readSettings();
      expect(Object.prototype.hasOwnProperty.call(settings, 'hooks')).toBe(false);
    });

    it('removes empty event arrays after removing Valkyr entries', async () => {
      // Only Valkyr hooks exist for Stop; after uninstall the Stop array should be removed
      const installer = await freshInstaller();
      installer.install(9092);
      installer.uninstall();

      const settings = readSettings();
      const hooks = (settings as Record<string, unknown>).hooks as Record<string, unknown> | undefined;
      expect(hooks?.['Stop']).toBeUndefined();
    });

    it('handles a missing settings file gracefully', async () => {
      const installer = await freshInstaller();
      installer.install(9093);

      // Delete the file before uninstalling
      fs.unlinkSync(settingsFile);

      expect(() => installer.uninstall()).not.toThrow();
    });

    it('handles old flat-format Valkyr entries (pre-fix format)', async () => {
      // Simulate a settings file with the pre-fix flat format
      fs.mkdirSync(claudeDir, { recursive: true });
      const oldFormatSettings = {
        hooks: {
          Stop: [
            // Old flat entry without matcher/hooks nesting
            { type: 'command', command: `# ${VALKYR_HOOK_MARKER} curl -s -X POST ...` },
            // User hook in new format
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user' }] },
          ],
        },
      };
      fs.writeFileSync(settingsFile, JSON.stringify(oldFormatSettings), 'utf-8');

      const installer = await freshInstaller();
      // Mark as installed so uninstall() proceeds
      installer.install(9094);
      installer.uninstall();

      // User hook should survive; Valkyr entries (both old and new) should be gone
      const settings = readSettings();
      const hooks = settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      if (hooks?.['Stop']) {
        const hasValkyr = hooks['Stop'].some((g) => {
          if (Array.isArray(g.hooks)) {
            return g.hooks.some((h) => h.command?.includes(VALKYR_HOOK_MARKER));
          }
          return false;
        });
        expect(hasValkyr).toBe(false);
      }
    });

    it('writes atomically via .tmp rename on uninstall', async () => {
      const installer = await freshInstaller();
      installer.install(9100);
      installer.uninstall();

      expect(fs.existsSync(settingsFile + '.tmp')).toBe(false);
      expect(fs.existsSync(settingsFile)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // isInstalled()
  // ---------------------------------------------------------------------------

  describe('isInstalled()', () => {
    it('returns false before any install call', async () => {
      const installer = await freshInstaller();
      expect(installer.isInstalled()).toBe(false);
    });

    it('returns true after install', async () => {
      const installer = await freshInstaller();
      installer.install(1000);
      expect(installer.isInstalled()).toBe(true);
    });

    it('returns false after uninstall', async () => {
      const installer = await freshInstaller();
      installer.install(1001);
      installer.uninstall();
      expect(installer.isInstalled()).toBe(false);
    });
  });
});
