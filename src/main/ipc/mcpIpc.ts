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
      const data = mcpConfigService.getProjectServers(projectPath);
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
      const data = mcpConfigService.saveProjectServers(projectPath, servers);
      return { success: true, data };
    } catch (err: any) {
      log.error('mcp:saveProjectServers failed:', err);
      return { success: false, error: err.message };
    }
  });
}
