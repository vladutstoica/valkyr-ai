import { ipcMain } from 'electron';
import { z } from 'zod';
import { mcpConfigService } from '../services/McpConfigService';
import { log } from '../lib/logger';

const McpServerBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
});

const McpServerStdioSchema = McpServerBaseSchema.extend({
  transport: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()),
  env: z.record(z.string()),
});

const McpServerHttpSchema = McpServerBaseSchema.extend({
  transport: z.literal('http'),
  url: z.string().min(1),
  headers: z.record(z.string()),
});

const McpServerSseSchema = McpServerBaseSchema.extend({
  transport: z.literal('sse'),
  url: z.string().min(1),
  headers: z.record(z.string()),
});

const McpServerSchema = z.discriminatedUnion('transport', [
  McpServerStdioSchema,
  McpServerHttpSchema,
  McpServerSseSchema,
]);

const McpServersArraySchema = z.array(McpServerSchema);

export function registerMcpIpc() {
  ipcMain.handle('mcp:getGlobalServers', async () => {
    try {
      const data = mcpConfigService.getGlobalServers();
      return { success: true, data };
    } catch (err: any) {
      log.error('mcp:getGlobalServers failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mcp:saveGlobalServers', async (_event, args: unknown) => {
    try {
      const { servers } = z.object({ servers: McpServersArraySchema }).parse(args);
      const data = mcpConfigService.saveGlobalServers(servers);
      return { success: true, data };
    } catch (err: any) {
      log.error('mcp:saveGlobalServers failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mcp:getProjectServers', async (_event, args: unknown) => {
    try {
      const { projectPath } = z.object({ projectPath: z.string().min(1) }).parse(args);
      const data = await mcpConfigService.getProjectServers(projectPath);
      return { success: true, data };
    } catch (err: any) {
      log.error('mcp:getProjectServers failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mcp:saveProjectServers', async (_event, args: unknown) => {
    try {
      const { projectPath, servers } = z
        .object({
          projectPath: z.string().min(1),
          servers: McpServersArraySchema,
        })
        .parse(args);
      const data = await mcpConfigService.saveProjectServers(projectPath, servers);
      return { success: true, data };
    } catch (err: any) {
      log.error('mcp:saveProjectServers failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mcp:detectAgentServers', async (_event, args: unknown) => {
    try {
      const { projectPath } = z.object({ projectPath: z.string().optional() }).parse(args ?? {});
      const data = await mcpConfigService.detectAgentServers(projectPath);
      return { success: true, data };
    } catch (err: any) {
      log.error('mcp:detectAgentServers failed:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mcp:searchRegistry', async (_event, args: unknown) => {
    try {
      const { query, limit, cursor } = z
        .object({
          query: z.string().default(''),
          limit: z.number().int().min(1).max(50).default(20),
          cursor: z.string().optional(),
        })
        .parse(args);

      const params = new URLSearchParams({ limit: String(limit) });
      if (query) params.set('search', query);
      if (cursor) params.set('cursor', cursor);

      const response = await fetch(
        `https://registry.modelcontextprotocol.io/v0/servers?${params.toString()}`
      );

      if (!response.ok) {
        return { success: false, error: `Registry returned ${response.status}` };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await response.json();
      // API wraps each entry as { server: {...}, _meta: {...} } — unwrap to flat server objects
      const allServers = (data.servers ?? []).map((entry: any) => entry.server ?? entry);

      // Deduplicate by server name — keep only the latest version (last occurrence)
      const seen = new Map<string, any>();
      for (const s of allServers) {
        seen.set(s.name, s);
      }
      const servers = Array.from(seen.values());

      return {
        success: true,
        data: {
          servers,
          metadata: data.metadata ?? { count: servers.length },
        },
      };
    } catch (err: any) {
      log.error('mcp:searchRegistry failed:', err);
      return { success: false, error: err.message };
    }
  });
}
