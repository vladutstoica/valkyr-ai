import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { getAppSettings, updateAppSettings } from '../settings';
import type { McpServerConfig } from '@shared/mcp/types';
import { log } from '../lib/logger';

// ACP SDK McpServer type — defined inline to avoid ESM import issues
// Matches: McpServerStdio | (McpServerHttp & { type: 'http' }) | (McpServerSse & { type: 'sse' })
interface AcpEnvVariable {
  name: string;
  value: string;
}

interface AcpHttpHeader {
  name: string;
  value: string;
}

export type AcpMcpServer =
  | {
      name: string;
      command: string;
      args: string[];
      env: AcpEnvVariable[];
    }
  | {
      type: 'http';
      name: string;
      url: string;
      headers: AcpHttpHeader[];
    }
  | {
      type: 'sse';
      name: string;
      url: string;
      headers: AcpHttpHeader[];
    };

/**
 * Converts Valkyr's map-based MCP config to ACP SDK's array-based format.
 */
function toAcpMcpServer(s: McpServerConfig): AcpMcpServer {
  if (s.transport === 'stdio') {
    return {
      name: s.name,
      command: s.command,
      args: s.args,
      env: Object.entries(s.env).map(([name, value]) => ({ name, value })),
    };
  }
  return {
    type: s.transport,
    name: s.name,
    url: s.url,
    headers: Object.entries(s.headers).map(([name, value]) => ({ name, value })),
  };
}

export class McpConfigService {
  // ---- Global servers (settings.json) ----

  getGlobalServers(): McpServerConfig[] {
    return getAppSettings().mcp?.servers ?? [];
  }

  saveGlobalServers(servers: McpServerConfig[]): McpServerConfig[] {
    const settings = getAppSettings();
    const updated = updateAppSettings({
      mcp: {
        ...settings.mcp,
        servers,
      },
    } as any);
    return updated.mcp?.servers ?? [];
  }

  // ---- Project servers (.valkyr.json) ----

  async getProjectServers(projectPath: string): Promise<McpServerConfig[]> {
    const configPath = join(projectPath, '.valkyr.json');
    if (!existsSync(configPath)) return [];
    try {
      const raw = JSON.parse(await readFile(configPath, 'utf8'));
      return Array.isArray(raw.mcpServers) ? raw.mcpServers : [];
    } catch (err) {
      log.error(`Failed to read MCP servers from ${configPath}:`, err);
      return [];
    }
  }

  async saveProjectServers(projectPath: string, servers: McpServerConfig[]): Promise<McpServerConfig[]> {
    const configPath = join(projectPath, '.valkyr.json');
    let raw: any = {};
    if (existsSync(configPath)) {
      try {
        raw = JSON.parse(await readFile(configPath, 'utf8'));
      } catch {
        // Start fresh if parsing fails
      }
    }
    raw.mcpServers = servers;
    await writeFile(configPath, JSON.stringify(raw, null, 2), 'utf8');
    return servers;
  }

  // ---- Merge + adapter for ACP injection ----

  async getMergedServersForSession(projectPath?: string): Promise<AcpMcpServer[]> {
    const globalServers = this.getGlobalServers().filter((s) => s.enabled);
    const projectServers = projectPath
      ? (await this.getProjectServers(projectPath)).filter((s) => s.enabled)
      : [];

    // Project servers override global ones with the same name
    const byName = new Map<string, McpServerConfig>();
    for (const s of globalServers) byName.set(s.name, s);
    for (const s of projectServers) byName.set(s.name, s);

    const merged = Array.from(byName.values());
    log.info(
      `MCP: injecting ${merged.length} servers into session (${globalServers.length} global, ${projectServers.length} project)`
    );
    return merged.map(toAcpMcpServer);
  }
  // ---- Detect MCP servers from other agents ----

  /**
   * Scans known agent config files for MCP server definitions.
   * Returns discovered servers grouped by agent, converted to Valkyr format.
   */
  async detectAgentServers(projectPath?: string): Promise<AgentMcpDiscovery[]> {
    const home = homedir();
    const results: AgentMcpDiscovery[] = [];

    // Agent config file locations — all use { mcpServers: { name: { type, command, args, env, url } } }
    const agentGlobalConfigs: Array<{ agent: string; path: string }> = [
      { agent: 'Claude Code', path: join(home, '.claude.json') },
      { agent: 'Cursor', path: join(home, '.cursor', 'mcp.json') },
      { agent: 'Windsurf', path: join(home, '.codeium', 'windsurf', 'mcp_config.json') },
    ];

    // Global configs — read all in parallel
    const globalResults = await Promise.all(
      agentGlobalConfigs.map(async ({ agent, path: configPath }) => {
        const servers = await this.readAgentMcpFile(configPath);
        return servers.length > 0 ? { agent, scope: 'global' as const, configPath, servers } : null;
      })
    );
    for (const r of globalResults) if (r) results.push(r);

    // Project-level configs (per-project .mcp.json, .cursor/mcp.json, etc.)
    if (projectPath) {
      const projectConfigs: Array<{ agent: string; path: string }> = [
        { agent: 'Claude Code', path: join(projectPath, '.mcp.json') },
        { agent: 'Cursor', path: join(projectPath, '.cursor', 'mcp.json') },
      ];
      const projectResults = await Promise.all(
        projectConfigs.map(async ({ agent, path: configPath }) => {
          const servers = await this.readAgentMcpFile(configPath);
          return servers.length > 0 ? { agent, scope: 'project' as const, configPath, servers } : null;
        })
      );
      for (const r of projectResults) if (r) results.push(r);
    }

    return results;
  }

  /**
   * Reads an agent's MCP config file and converts to Valkyr McpServerConfig[].
   * Handles the common { mcpServers: { name: { type, command, args, env, url } } } format.
   */
  private async readAgentMcpFile(configPath: string): Promise<McpServerConfig[]> {
    if (!existsSync(configPath)) return [];
    try {
      const raw = JSON.parse(await readFile(configPath, 'utf8'));
      const mcpServers = raw.mcpServers;
      if (!mcpServers || typeof mcpServers !== 'object') return [];

      const results: McpServerConfig[] = [];
      for (const [name, config] of Object.entries(mcpServers)) {
        const server = this.convertAgentServer(name, config);
        if (server) results.push(server);
      }
      return results;
    } catch (err) {
      log.warn(`Failed to read agent MCP config from ${configPath}:`, err);
      return [];
    }
  }

  /**
   * Converts a single agent MCP server entry to Valkyr format.
   */
  private convertAgentServer(name: string, raw: unknown): McpServerConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const config = raw as Record<string, unknown>;
    const id = `imported-${name}-${Date.now()}`;
    const type = (config.type as string) || 'stdio';

    if (type === 'stdio') {
      return {
        id,
        name,
        transport: 'stdio',
        enabled: true,
        command: (config.command as string) || '',
        args: Array.isArray(config.args) ? (config.args as string[]) : [],
        env: (config.env as Record<string, string>) ?? {},
      };
    }

    if (type === 'http' || type === 'streamable-http') {
      return {
        id,
        name,
        transport: 'http',
        enabled: true,
        url: (config.url as string) || '',
        headers: (config.headers as Record<string, string>) ?? {},
      };
    }

    if (type === 'sse') {
      return {
        id,
        name,
        transport: 'sse',
        enabled: true,
        url: (config.url as string) || '',
        headers: (config.headers as Record<string, string>) ?? {},
      };
    }

    return null;
  }
}

export interface AgentMcpDiscovery {
  agent: string;
  scope: 'global' | 'project';
  configPath: string;
  servers: McpServerConfig[];
}

export const mcpConfigService = new McpConfigService();
