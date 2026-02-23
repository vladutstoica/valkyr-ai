import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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

  getProjectServers(projectPath: string): McpServerConfig[] {
    const configPath = join(projectPath, '.valkyr.json');
    if (!existsSync(configPath)) return [];
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf8'));
      return Array.isArray(raw.mcpServers) ? raw.mcpServers : [];
    } catch (err) {
      log.error(`Failed to read MCP servers from ${configPath}:`, err);
      return [];
    }
  }

  saveProjectServers(projectPath: string, servers: McpServerConfig[]): McpServerConfig[] {
    const configPath = join(projectPath, '.valkyr.json');
    let raw: any = {};
    if (existsSync(configPath)) {
      try {
        raw = JSON.parse(readFileSync(configPath, 'utf8'));
      } catch {
        // Start fresh if parsing fails
      }
    }
    raw.mcpServers = servers;
    writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8');
    return servers;
  }

  // ---- Merge + adapter for ACP injection ----

  getMergedServersForSession(projectPath?: string): AcpMcpServer[] {
    const globalServers = this.getGlobalServers().filter((s) => s.enabled);
    const projectServers = projectPath
      ? this.getProjectServers(projectPath).filter((s) => s.enabled)
      : [];

    // Project servers override global ones with the same name
    const byName = new Map<string, McpServerConfig>();
    for (const s of globalServers) byName.set(s.name, s);
    for (const s of projectServers) byName.set(s.name, s);

    const merged = Array.from(byName.values());
    log.info(`MCP: injecting ${merged.length} servers into session (${globalServers.length} global, ${projectServers.length} project)`);
    return merged.map(toAcpMcpServer);
  }
}

export const mcpConfigService = new McpConfigService();
