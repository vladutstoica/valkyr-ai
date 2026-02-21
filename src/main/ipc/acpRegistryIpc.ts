import { ipcMain } from 'electron';
import { z } from 'zod';
import { acpRegistryService } from '../services/AcpRegistryService';
import { log } from '../lib/logger';

const InstallSchema = z.object({
  agentId: z.string().min(1),
  method: z.enum(['npx', 'binary']).optional(),
});

const UninstallSchema = z.object({
  agentId: z.string().min(1),
});

export function registerAcpRegistryIpc(): void {
  ipcMain.handle('acpRegistry:fetch', async () => {
    try {
      const agents = await acpRegistryService.fetchRegistry();
      return { success: true, data: agents };
    } catch (error: any) {
      log.error('acpRegistry:fetch failed', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('acpRegistry:installed', async () => {
    try {
      const agents = await acpRegistryService.getInstalledAgents();
      return { success: true, data: agents };
    } catch (error: any) {
      log.error('acpRegistry:installed failed', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('acpRegistry:install', async (_event, args: unknown) => {
    try {
      const parsed = InstallSchema.parse(args);
      return await acpRegistryService.installAgent(parsed.agentId, parsed.method);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map((e) => e.message).join(', ')}` };
      }
      log.error('acpRegistry:install failed', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('acpRegistry:uninstall', async (_event, args: unknown) => {
    try {
      const parsed = UninstallSchema.parse(args);
      return await acpRegistryService.uninstallAgent(parsed.agentId);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map((e) => e.message).join(', ')}` };
      }
      log.error('acpRegistry:uninstall failed', error);
      return { success: false, error: error.message };
    }
  });
}
