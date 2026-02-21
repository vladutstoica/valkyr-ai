import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execFile } from 'child_process';
import { log } from '../lib/logger';
import type {
  AcpRegistry,
  AcpRegistryEntry,
  InstalledAcpAgent,
} from '../../shared/acpRegistry';

const REGISTRY_URL = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class AcpRegistryService {
  private memoryCache: { registry: AcpRegistry; fetchedAt: number } | null = null;

  private get baseDir(): string {
    return path.join(app.getPath('userData'), 'acp-agents');
  }

  private get registryCachePath(): string {
    return path.join(this.baseDir, 'registry-cache.json');
  }

  private get installedPath(): string {
    return path.join(this.baseDir, 'installed.json');
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  // -----------------------------------------------------------------------
  // Registry fetch
  // -----------------------------------------------------------------------

  async fetchRegistry(): Promise<AcpRegistryEntry[]> {
    // Check memory cache
    if (this.memoryCache && Date.now() - this.memoryCache.fetchedAt < CACHE_TTL_MS) {
      return this.memoryCache.registry.agents;
    }

    try {
      const resp = await fetch(REGISTRY_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as AcpRegistry;

      this.memoryCache = { registry: data, fetchedAt: Date.now() };

      // Persist to disk cache
      await this.ensureBaseDir();
      await fs.writeFile(this.registryCachePath, JSON.stringify(data), 'utf-8');

      return data.agents;
    } catch (err) {
      log.error('Failed to fetch ACP registry, falling back to disk cache', err);
      return this.readDiskCache();
    }
  }

  private async readDiskCache(): Promise<AcpRegistryEntry[]> {
    try {
      const raw = await fs.readFile(this.registryCachePath, 'utf-8');
      const data = JSON.parse(raw) as AcpRegistry;
      return data.agents;
    } catch {
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Installed agents
  // -----------------------------------------------------------------------

  async getInstalledAgents(): Promise<InstalledAcpAgent[]> {
    try {
      const raw = await fs.readFile(this.installedPath, 'utf-8');
      return JSON.parse(raw) as InstalledAcpAgent[];
    } catch {
      return [];
    }
  }

  private async saveInstalledAgents(agents: InstalledAcpAgent[]): Promise<void> {
    await this.ensureBaseDir();
    await fs.writeFile(this.installedPath, JSON.stringify(agents, null, 2), 'utf-8');
  }

  async isInstalled(agentId: string): Promise<boolean> {
    const installed = await this.getInstalledAgents();
    return installed.some((a) => a.id === agentId);
  }

  // -----------------------------------------------------------------------
  // Install / Uninstall
  // -----------------------------------------------------------------------

  async installAgent(
    agentId: string,
    method?: 'npx' | 'binary'
  ): Promise<{ success: boolean; error?: string }> {
    const registry = await this.fetchRegistry();
    const entry = registry.find((e) => e.id === agentId);
    if (!entry) return { success: false, error: `Agent "${agentId}" not found in registry` };

    const chosenMethod = method || (entry.distribution.npx ? 'npx' : 'binary');

    if (chosenMethod === 'npx') {
      if (!entry.distribution.npx) {
        return { success: false, error: 'No npx distribution available' };
      }
      const agent: InstalledAcpAgent = {
        id: agentId,
        version: entry.version,
        method: 'npx',
        npxPackage: entry.distribution.npx.package,
        npxArgs: entry.distribution.npx.args,
        npxEnv: entry.distribution.npx.env,
        installedAt: new Date().toISOString(),
      };
      const installed = await this.getInstalledAgents();
      const filtered = installed.filter((a) => a.id !== agentId);
      filtered.push(agent);
      await this.saveInstalledAgents(filtered);
      return { success: true };
    }

    // Binary install
    if (!entry.distribution.binary) {
      return { success: false, error: 'No binary distribution available' };
    }

    const platformKey = this.getPlatformKey();
    const target = entry.distribution.binary[platformKey];
    if (!target) {
      return { success: false, error: `No binary for platform "${platformKey}"` };
    }

    try {
      const agentDir = path.join(this.baseDir, agentId);
      const tmpDir = path.join(this.baseDir, '.tmp');
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.mkdir(agentDir, { recursive: true });

      // Download
      const archiveName = path.basename(new URL(target.archive).pathname);
      const archivePath = path.join(tmpDir, archiveName);
      const resp = await fetch(target.archive);
      if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      await fs.writeFile(archivePath, buffer);

      // Extract
      if (archiveName.endsWith('.tar.gz') || archiveName.endsWith('.tgz')) {
        await this.exec('tar', ['xzf', archivePath, '-C', agentDir]);
      } else if (archiveName.endsWith('.zip')) {
        await this.exec('unzip', ['-o', archivePath, '-d', agentDir]);
      } else {
        return { success: false, error: `Unsupported archive format: ${archiveName}` };
      }

      // chmod +x on macOS/Linux
      if (process.platform !== 'win32') {
        const cmdPath = path.join(agentDir, target.cmd);
        await fs.chmod(cmdPath, 0o755);
      }

      // Cleanup archive
      await fs.rm(archivePath, { force: true });

      const agent: InstalledAcpAgent = {
        id: agentId,
        version: entry.version,
        method: 'binary',
        binaryPath: agentDir,
        installedAt: new Date().toISOString(),
      };
      const installed = await this.getInstalledAgents();
      const filtered = installed.filter((a) => a.id !== agentId);
      filtered.push(agent);
      await this.saveInstalledAgents(filtered);
      return { success: true };
    } catch (err: any) {
      log.error(`Failed to install binary agent ${agentId}`, err);
      return { success: false, error: err.message };
    }
  }

  async uninstallAgent(agentId: string): Promise<{ success: boolean; error?: string }> {
    const installed = await this.getInstalledAgents();
    const agent = installed.find((a) => a.id === agentId);
    if (!agent) return { success: false, error: 'Agent not installed' };

    // Remove binary directory if exists
    if (agent.method === 'binary' && agent.binaryPath) {
      try {
        await fs.rm(agent.binaryPath, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }

    const filtered = installed.filter((a) => a.id !== agentId);
    await this.saveInstalledAgents(filtered);
    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Command resolution
  // -----------------------------------------------------------------------

  async resolveCommand(
    agentId: string
  ): Promise<{ command: string; args: string[]; env: Record<string, string> } | null> {
    const installed = await this.getInstalledAgents();
    const agent = installed.find((a) => a.id === agentId);
    if (!agent) return null;

    if (agent.method === 'npx' && agent.npxPackage) {
      return {
        command: 'npx',
        args: ['--yes', agent.npxPackage, ...(agent.npxArgs || [])],
        env: agent.npxEnv || {},
      };
    }

    if (agent.method === 'binary' && agent.binaryPath) {
      // Need to look up cmd from registry
      const registry = await this.fetchRegistry();
      const entry = registry.find((e) => e.id === agentId);
      const platformKey = this.getPlatformKey();
      const target = entry?.distribution.binary?.[platformKey];
      if (!target) return null;

      return {
        command: path.join(agent.binaryPath, target.cmd),
        args: target.args || [],
        env: {},
      };
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  getPlatformKey(): string {
    const platform = process.platform;
    const arch = process.arch;
    if (platform === 'darwin') {
      return arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x86_64';
    }
    if (platform === 'linux') {
      return arch === 'arm64' ? 'linux-aarch64' : 'linux-x86_64';
    }
    if (platform === 'win32') {
      return 'windows-x86_64';
    }
    return `${platform}-${arch}`;
  }

  private exec(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  }
}

export const acpRegistryService = new AcpRegistryService();
