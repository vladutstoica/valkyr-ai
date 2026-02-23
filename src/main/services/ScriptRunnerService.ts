import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import type { IPty } from 'node-pty';
import { log } from '../lib/logger';

export type ScriptInfo = {
  name: string;
  command: string;
};

export type RunningScript = {
  scriptName: string;
  ptyId: string;
  projectPath: string;
  startedAt: number;
};

type PtyRecord = {
  ptyId: string;
  proc: IPty;
  scriptName: string;
  projectPath: string;
  startedAt: number;
};

/**
 * Service for running package.json scripts in PTY terminals.
 */
class ScriptRunnerService {
  private runningPtys = new Map<string, PtyRecord>();

  /**
   * Read package.json and return the list of scripts.
   */
  async getScripts(projectPath: string): Promise<ScriptInfo[]> {
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      log.debug('ScriptRunnerService: package.json not found', { projectPath });
      return [];
    }

    try {
      const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      const scripts = packageJson.scripts || {};

      return Object.entries(scripts).map(([name, command]) => ({
        name,
        command: String(command),
      }));
    } catch (error) {
      log.error('ScriptRunnerService: Failed to read package.json', { projectPath, error });
      throw new Error(
        `Failed to read package.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Run a script from package.json in a new PTY.
   * Returns the PTY ID for tracking and interaction.
   */
  async runScript(projectPath: string, scriptName: string): Promise<string> {
    // Validate the script exists
    const scripts = await this.getScripts(projectPath);
    const script = scripts.find((s) => s.name === scriptName);

    if (!script) {
      throw new Error(`Script "${scriptName}" not found in package.json`);
    }

    // Generate a unique PTY ID
    const ptyId = `script-${randomUUID()}`;

    // Lazy load node-pty
    let pty: typeof import('node-pty');
    try {
      pty = require('node-pty');
    } catch (e: unknown) {
      const err = e as Error;
      throw new Error(`PTY unavailable: ${err?.message || String(e)}`);
    }

    // Determine the shell and command based on platform
    const isWindows = process.platform === 'win32';
    const shell = isWindows
      ? process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
      : process.env.SHELL || '/bin/bash';

    // Build the command to run the npm script
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';
    const args = isWindows
      ? ['/c', `${npmCmd} run ${scriptName}`]
      : ['-c', `${npmCmd} run ${scriptName}`];

    // Build environment
    const useEnv: Record<string, string> = {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'valkyr',
      HOME: process.env.HOME || os.homedir(),
      USER: process.env.USER || os.userInfo().username,
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      ...(process.env.LANG && { LANG: process.env.LANG }),
      // Pass through npm-related env vars
      ...(process.env.NODE_ENV && { NODE_ENV: process.env.NODE_ENV }),
      ...(process.env.npm_config_registry && {
        npm_config_registry: process.env.npm_config_registry,
      }),
    };

    try {
      const proc = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 32,
        cwd: projectPath,
        env: useEnv,
      });

      const record: PtyRecord = {
        ptyId,
        proc,
        scriptName,
        projectPath,
        startedAt: Date.now(),
      };

      this.runningPtys.set(ptyId, record);

      // Clean up on exit
      proc.onExit(() => {
        this.runningPtys.delete(ptyId);
        log.debug('ScriptRunnerService: Script PTY exited', { ptyId, scriptName, projectPath });
      });

      log.info('ScriptRunnerService: Started script', { ptyId, scriptName, projectPath });
      return ptyId;
    } catch (error) {
      log.error('ScriptRunnerService: Failed to spawn PTY', { scriptName, projectPath, error });
      throw new Error(
        `Failed to start script: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stop a running script by killing its PTY.
   */
  stopScript(ptyId: string): void {
    const record = this.runningPtys.get(ptyId);
    if (!record) {
      log.warn('ScriptRunnerService: PTY not found', { ptyId });
      return;
    }

    try {
      record.proc.kill();
    } catch (error) {
      log.error('ScriptRunnerService: Failed to kill PTY', { ptyId, error });
    } finally {
      this.runningPtys.delete(ptyId);
    }

    log.info('ScriptRunnerService: Stopped script', { ptyId, scriptName: record.scriptName });
  }

  /**
   * Get all running scripts for a specific project.
   */
  getRunningScripts(projectPath: string): RunningScript[] {
    const results: RunningScript[] = [];

    for (const record of this.runningPtys.values()) {
      if (record.projectPath === projectPath) {
        results.push({
          scriptName: record.scriptName,
          ptyId: record.ptyId,
          projectPath: record.projectPath,
          startedAt: record.startedAt,
        });
      }
    }

    return results;
  }

  /**
   * Get PTY process for data/exit events.
   */
  getPty(ptyId: string): IPty | undefined {
    return this.runningPtys.get(ptyId)?.proc;
  }

  /**
   * Check if a PTY exists.
   */
  hasPty(ptyId: string): boolean {
    return this.runningPtys.has(ptyId);
  }

  /**
   * Write data to a PTY (for user input).
   */
  writePty(ptyId: string, data: string): void {
    const record = this.runningPtys.get(ptyId);
    if (!record) {
      return;
    }
    record.proc.write(data);
  }

  /**
   * Resize a PTY.
   */
  resizePty(ptyId: string, cols: number, rows: number): void {
    const record = this.runningPtys.get(ptyId);
    if (!record) {
      return;
    }
    try {
      record.proc.resize(cols, rows);
    } catch (error) {
      log.error('ScriptRunnerService: Failed to resize PTY', { ptyId, cols, rows, error });
    }
  }
}

export const scriptRunnerService = new ScriptRunnerService();
