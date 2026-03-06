/**
 * Utility functions for detecting shell environment variables
 * when the Electron app is launched from the GUI (not from terminal).
 */

import { exec, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Gets an environment variable from the user's login shell (synchronous).
 * This is useful when the app is launched from GUI and doesn't
 * inherit the shell's environment.
 *
 * @param varName - Name of the environment variable to retrieve
 * @returns The value of the environment variable, or undefined if not found
 */
export function getShellEnvVar(varName: string): string | undefined {
  try {
    if (!/^[A-Z0-9_]+$/.test(varName)) {
      return undefined;
    }
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');

    // -i = interactive, -l = login shell (sources .zshrc/.bash_profile)
    const result = execSync(`${shell} -ilc 'printenv ${varName} || true'`, {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        // Prevent oh-my-zsh plugins from breaking output
        DISABLE_AUTO_UPDATE: 'true',
        ZSH_TMUX_AUTOSTART: 'false',
        ZSH_TMUX_AUTOSTARTED: 'true',
      },
    });

    const value = result.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Gets an environment variable from the user's login shell (async).
 * Avoids blocking the main thread during startup.
 */
export function getShellEnvVarAsync(varName: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!/^[A-Z0-9_]+$/.test(varName)) {
      return resolve(undefined);
    }
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');

    exec(
      `${shell} -ilc 'printenv ${varName} || true'`,
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          DISABLE_AUTO_UPDATE: 'true',
          ZSH_TMUX_AUTOSTART: 'false',
          ZSH_TMUX_AUTOSTARTED: 'true',
        },
      },
      (err, stdout) => {
        if (err || !stdout) return resolve(undefined);
        const value = stdout.trim();
        resolve(value || undefined);
      }
    );
  });
}

/**
 * Common SSH agent socket locations to check as fallback
 */
const COMMON_SSH_AGENT_LOCATIONS: ReadonlyArray<{ path: string; description: string }> = [
  // macOS launchd
  { path: '/private/tmp/com.apple.launchd.*/Listeners', description: 'macOS launchd' },
  // Generic temp directory patterns
  { path: path.join(os.tmpdir(), 'ssh-??????????', 'agent.*'), description: 'OpenSSH temp' },
  // User's .ssh directory
  { path: path.join(os.homedir(), '.ssh', 'agent.*'), description: 'User SSH directory' },
  // Linux keyring
  { path: path.join(os.tmpdir(), 'keyring-*/ssh'), description: 'GNOME Keyring' },
  // GnuPG agent SSH support
  { path: path.join(os.homedir(), '.gnupg', 'S.gpg-agent.ssh'), description: 'GnuPG agent' },
];

/**
 * Checks if a path is a socket file
 */
function isSocketFile(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    return stats.isSocket();
  } catch {
    return false;
  }
}

/**
 * Expands glob patterns to find matching paths
 */
function expandGlob(pattern: string): string[] {
  try {
    // Simple glob expansion for patterns like /tmp/ssh-*/agent.*
    const parts = pattern.split('/');
    let matches: string[] = [''];

    for (const part of parts) {
      if (!part) continue;

      if (part.includes('*') || part.includes('?')) {
        // This part has wildcards
        const regex = new RegExp(
          '^' + part.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        const newMatches: string[] = [];

        for (const currentPath of matches) {
          try {
            const dir = currentPath || '/';
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
              if (regex.test(entry)) {
                newMatches.push(path.join(currentPath, entry));
              }
            }
          } catch {}
        }

        matches = newMatches;
      } else {
        // Regular path component
        matches = matches.map((m) => path.join(m, part));
      }
    }

    return matches.filter((m) => m !== '');
  } catch {
    return [];
  }
}

/**
 * Detects the SSH_AUTH_SOCK environment variable (async version).
 * First checks if it's already set, then macOS launchd (fast),
 * then common socket locations (fast), then falls back to shell detection (async).
 */
export async function detectSshAuthSock(): Promise<string | undefined> {
  // If already set, use it
  if (process.env.SSH_AUTH_SOCK) {
    return process.env.SSH_AUTH_SOCK;
  }

  // Method 1: macOS launchd (fast, no shell spawn)
  if (process.platform === 'darwin') {
    try {
      const result = execSync('launchctl getenv SSH_AUTH_SOCK', {
        encoding: 'utf8',
        timeout: 1000,
      });
      const socket = result.trim();
      if (socket) {
        return socket;
      }
    } catch {
      // launchctl detection failed
    }
  }

  // Method 2: Check common socket locations (fast filesystem checks)
  for (const location of COMMON_SSH_AGENT_LOCATIONS) {
    try {
      if (location.path.includes('*') || location.path.includes('?')) {
        const matches = expandGlob(location.path);
        for (const match of matches) {
          if (isSocketFile(match)) {
            return match;
          }
        }
      } else if (isSocketFile(location.path)) {
        return location.path;
      }
    } catch {
      // Continue to next location
    }
  }

  // Method 3: Ask user's login shell (async to avoid blocking main thread)
  const shellValue = await getShellEnvVarAsync('SSH_AUTH_SOCK');
  if (shellValue) {
    return shellValue;
  }

  return undefined;
}

/**
 * Initializes shell environment detection and sets process.env variables.
 * Runs async to avoid blocking the main thread with shell spawns.
 */
export async function initializeShellEnvironment(): Promise<void> {
  const sshAuthSock = await detectSshAuthSock();
  if (sshAuthSock) {
    process.env.SSH_AUTH_SOCK = sshAuthSock;
    console.log('[shellEnv] Detected SSH_AUTH_SOCK:', sshAuthSock);
  } else {
    console.log('[shellEnv] SSH_AUTH_SOCK not detected');
  }
}
