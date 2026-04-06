import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import type { IPty } from 'node-pty';
import { log } from '../lib/logger';

export type ScriptInfo = {
  name: string;
  command: string;
  source: 'package' | 'custom';
  cwd?: string;
};

export type CustomScriptDef = {
  name: string;
  command: string;
  cwd?: string;
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
 * Service for running package.json and custom scripts in PTY terminals.
 */
class ScriptRunnerService {
  private runningPtys = new Map<string, PtyRecord>();

  /**
   * Read .valkyr.json and return custom scripts.
   */
  getCustomScripts(projectPath: string): CustomScriptDef[] {
    try {
      const configPath = path.join(projectPath, '.valkyr.json');
      if (!fs.existsSync(configPath)) return [];
      const content = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(content);
      return Array.isArray(config.customScripts) ? config.customScripts : [];
    } catch (error) {
      log.warn('ScriptRunnerService: Failed to read .valkyr.json', { projectPath, error });
      return [];
    }
  }

  /**
   * Save a custom script to .valkyr.json (add or update by name).
   */
  async saveCustomScript(projectPath: string, script: CustomScriptDef): Promise<void> {
    const configPath = path.join(projectPath, '.valkyr.json');
    let config: Record<string, unknown> = {};

    try {
      if (fs.existsSync(configPath)) {
        const content = await fs.promises.readFile(configPath, 'utf-8');
        config = JSON.parse(content);
      }
    } catch {
      // Start fresh if file is corrupted
    }

    const scripts: CustomScriptDef[] = Array.isArray(config.customScripts)
      ? config.customScripts
      : [];

    const existing = scripts.findIndex((s) => s.name === script.name);
    if (existing >= 0) {
      scripts[existing] = script;
    } else {
      scripts.push(script);
    }

    config.customScripts = scripts;
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    log.info('ScriptRunnerService: Saved custom script', { projectPath, name: script.name });
  }

  /**
   * Delete a custom script from .valkyr.json by name.
   */
  async deleteCustomScript(projectPath: string, scriptName: string): Promise<void> {
    const configPath = path.join(projectPath, '.valkyr.json');
    if (!fs.existsSync(configPath)) return;

    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      if (!Array.isArray(config.customScripts)) return;

      config.customScripts = config.customScripts.filter(
        (s: CustomScriptDef) => s.name !== scriptName
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      log.info('ScriptRunnerService: Deleted custom script', { projectPath, name: scriptName });
    } catch (error) {
      log.error('ScriptRunnerService: Failed to delete custom script', { projectPath, error });
      throw error;
    }
  }

  /**
   * Read package.json scripts.
   */
  async getPackageScripts(projectPath: string): Promise<ScriptInfo[]> {
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return [];
    }

    try {
      const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      const scripts = packageJson.scripts || {};

      return Object.entries(scripts).map(([name, command]) => ({
        name,
        command: String(command),
        source: 'package' as const,
      }));
    } catch (error) {
      log.error('ScriptRunnerService: Failed to read package.json', { projectPath, error });
      return [];
    }
  }

  /**
   * Return all scripts: custom scripts first, then package.json scripts.
   */
  async getScripts(projectPath: string): Promise<ScriptInfo[]> {
    const custom = this.getCustomScripts(projectPath).map((s) => ({
      name: s.name,
      command: s.command,
      cwd: s.cwd,
      source: 'custom' as const,
    }));
    const pkg = await this.getPackageScripts(projectPath);
    return [...custom, ...pkg];
  }

  /**
   * Run a script in a new PTY.
   * For package.json scripts, wraps with npm run.
   * For custom scripts, runs the raw command in the specified cwd.
   */
  async runScript(projectPath: string, scriptName: string): Promise<string> {
    // Validate the script exists
    const scripts = await this.getScripts(projectPath);
    const script = scripts.find((s) => s.name === scriptName);

    if (!script) {
      throw new Error(`Script "${scriptName}" not found`);
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

    // Build the command — raw command for custom, npm run for package
    let cmd: string;
    if (script.source === 'custom') {
      cmd = script.command;
    } else {
      const npmCmd = isWindows ? 'npm.cmd' : 'npm';
      cmd = `${npmCmd} run ${scriptName}`;
    }

    const args = isWindows ? ['/c', cmd] : ['-c', cmd];

    // Resolve cwd — custom scripts may have a relative cwd
    let cwd = projectPath;
    if (script.source === 'custom' && script.cwd) {
      const resolved = path.resolve(projectPath, script.cwd);
      if (fs.existsSync(resolved)) {
        cwd = resolved;
      } else {
        log.warn('ScriptRunnerService: Custom script cwd not found, using project root', {
          cwd: script.cwd,
          resolved,
        });
      }
    }

    // Build environment
    const useEnv: Record<string, string> = {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'valkyr',
      HOME: process.env.HOME || os.homedir(),
      USER: process.env.USER || os.userInfo().username,
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      ...(process.env.LANG && { LANG: process.env.LANG }),
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
        cwd,
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
