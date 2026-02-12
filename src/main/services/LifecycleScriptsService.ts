import fs from 'fs';
import path from 'path';
import { log } from '../lib/logger';
import type { LifecyclePhase, LifecycleScriptConfig } from '@shared/lifecycle';

export interface ValkyrConfig {
  preservePatterns?: string[];
  scripts?: LifecycleScriptConfig;
}

/**
 * Manages lifecycle scripts for worktrees.
 * Scripts are configured in .valkyr.json at the project root.
 */
class LifecycleScriptsService {
  /**
   * Read .valkyr.json config from project root
   */
  readConfig(projectPath: string): ValkyrConfig | null {
    try {
      const configPath = path.join(projectPath, '.valkyr.json');
      if (!fs.existsSync(configPath)) {
        return null;
      }
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content) as ValkyrConfig;
    } catch (error) {
      log.warn('Failed to read .valkyr.json', { projectPath, error });
      return null;
    }
  }

  /**
   * Get a specific lifecycle script command if configured.
   */
  getScript(projectPath: string, phase: LifecyclePhase): string | null {
    const config = this.readConfig(projectPath);
    const scripts = config?.scripts;
    const script = scripts?.[phase];
    return typeof script === 'string' && script.trim().length > 0 ? script.trim() : null;
  }
}

export const lifecycleScriptsService = new LifecycleScriptsService();
