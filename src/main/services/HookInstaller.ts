/**
 * Manages Claude Code hook registration in ~/.claude/settings.json.
 *
 * On start: injects Valkyr-managed hooks that POST lifecycle events
 * (Stop, PostToolUse, PermissionRequest) to our local notification server.
 *
 * On shutdown: removes only the hooks that Valkyr added (identified by
 * a marker comment in the command string).
 *
 * Claude Code hook format:
 *   { "hooks": { "EventName": [{ "matcher": "", "hooks": [{ "type": "command", "command": "..." }] }] } }
 *
 * Each event is an array of matcher groups. Each matcher group has:
 *   - matcher: tool name filter (empty string = match all)
 *   - hooks: array of { type: "command", command: string }
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { log } from '../lib/logger';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

// Marker to identify hooks managed by Valkyr (embedded in the curl command)
const VALKYR_HOOK_MARKER = 'VALKYR_HOOK';

// Hook events we register
const HOOK_EVENTS = ['Stop', 'PostToolUse', 'PermissionRequest'] as const;

type ClaudeHookCommand = {
  type: 'command';
  command: string;
};

type ClaudeMatcherGroup = {
  matcher: string;
  hooks: ClaudeHookCommand[];
};

type ClaudeSettings = {
  hooks?: Record<string, ClaudeMatcherGroup[]>;
  [key: string]: unknown;
};

function isValkyrEntry(entry: Record<string, unknown>): boolean {
  // New format: { matcher, hooks: [{ type, command }] }
  if (Array.isArray(entry.hooks)) {
    return entry.hooks.some(
      (h: Record<string, unknown>) =>
        typeof h.command === 'string' && h.command.includes(VALKYR_HOOK_MARKER)
    );
  }
  // Old format (pre-fix): { type: "command", command: "..." } — flat entry without matcher/hooks
  if (typeof entry.command === 'string' && entry.command.includes(VALKYR_HOOK_MARKER)) {
    return true;
  }
  return false;
}

class HookInstaller {
  private installed = false;
  private previousSettings: string | null = null;

  /**
   * Install Valkyr hooks into Claude Code's settings.
   * Safe to call multiple times — will update port if changed.
   */
  install(port: number): void {
    try {
      // Ensure ~/.claude/ directory exists
      if (!fs.existsSync(CLAUDE_DIR)) {
        fs.mkdirSync(CLAUDE_DIR, { recursive: true });
      }

      // Read existing settings (or start fresh)
      let settings: ClaudeSettings = {};
      if (fs.existsSync(SETTINGS_FILE)) {
        try {
          const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
          this.previousSettings = raw;
          settings = JSON.parse(raw);
        } catch (err) {
          log.warn('hookInstaller: failed to parse existing settings, starting fresh', {
            error: String(err),
          });
          // Back up corrupted file
          try {
            fs.copyFileSync(SETTINGS_FILE, SETTINGS_FILE + '.bak');
          } catch {}
        }
      }

      if (!settings.hooks) {
        settings.hooks = {};
      }

      // For each hook event, remove any existing Valkyr matcher groups and add fresh ones
      for (const event of HOOK_EVENTS) {
        if (!settings.hooks[event]) {
          settings.hooks[event] = [];
        }

        // Remove old Valkyr matcher groups (by marker in any hook command)
        settings.hooks[event] = settings.hooks[event].filter(
          (group) => !isValkyrEntry(group as unknown as Record<string, unknown>)
        );

        // Build the curl command that posts to our local server.
        // The VALKYR_SESSION_ID env var is injected into the PTY env when spawning Claude.
        const command = [
          `# ${VALKYR_HOOK_MARKER}`,
          `curl -s -X POST http://127.0.0.1:${port}/hook/notify`,
          `--connect-timeout 1 --max-time 2`,
          `-H "Content-Type: application/json"`,
          `-d "{\\"event\\":\\"${event}\\",\\"sessionId\\":\\"$VALKYR_SESSION_ID\\"}"`,
          `> /dev/null 2>&1 || true`,
        ].join(' ');

        // Add as a matcher group with empty matcher (match all tools)
        settings.hooks[event].push({
          matcher: '',
          hooks: [{ type: 'command', command }],
        });
      }

      // Write back atomically (write to temp, then rename)
      const tmpFile = SETTINGS_FILE + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(settings, null, 2), 'utf-8');
      fs.renameSync(tmpFile, SETTINGS_FILE);

      this.installed = true;
      log.info('hookInstaller: hooks installed', { port, events: HOOK_EVENTS });
    } catch (err) {
      log.error('hookInstaller: failed to install hooks', { error: String(err) });
    }
  }

  /**
   * Remove all Valkyr-managed hooks from Claude Code's settings.
   * Called on app shutdown.
   */
  uninstall(): void {
    if (!this.installed) return;

    try {
      if (!fs.existsSync(SETTINGS_FILE)) return;

      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const settings: ClaudeSettings = JSON.parse(raw);

      if (!settings.hooks) return;

      let changed = false;
      for (const event of Object.keys(settings.hooks)) {
        const before = settings.hooks[event].length;
        settings.hooks[event] = settings.hooks[event].filter(
          (group) => !isValkyrEntry(group as unknown as Record<string, unknown>)
        );
        if (settings.hooks[event].length !== before) changed = true;

        // Remove empty event arrays for cleanliness
        if (settings.hooks[event].length === 0) {
          delete settings.hooks[event];
        }
      }

      // Remove empty hooks object
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }

      if (changed) {
        const tmpFile = SETTINGS_FILE + '.tmp';
        fs.writeFileSync(tmpFile, JSON.stringify(settings, null, 2), 'utf-8');
        fs.renameSync(tmpFile, SETTINGS_FILE);
        log.info('hookInstaller: hooks uninstalled');
      }

      this.installed = false;
    } catch (err) {
      log.error('hookInstaller: failed to uninstall hooks', { error: String(err) });
    }
  }

  isInstalled(): boolean {
    return this.installed;
  }
}

export const hookInstaller = new HookInstaller();
