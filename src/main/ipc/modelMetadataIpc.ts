import { ipcMain } from 'electron';
import { log } from '../lib/logger';
import { modelMetadataService } from '../services/ModelMetadataService';
import { statusPageService } from '../services/StatusPageService';

export function registerModelMetadataIpc() {
  ipcMain.handle(
    'modelMetadata:get',
    async (_event, args: { acpModelId: string; providerId: string }) => {
      try {
        const metadata = await modelMetadataService.getModelMetadata(
          args.acpModelId,
          args.providerId
        );
        return { success: true, data: metadata };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error('[modelMetadata:get]', msg);
        return { success: false, error: msg };
      }
    }
  );

  ipcMain.handle('modelMetadata:getUptime', async (_event, args: { providerId: string }) => {
    try {
      const data = await statusPageService.getUptimeData(args.providerId);
      return { success: true, data };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('[modelMetadata:getUptime]', msg);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('modelMetadata:getStatus', async (_event, args: { providerId: string }) => {
    try {
      const status = await statusPageService.getStatus(args.providerId);
      return { success: true, data: status };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('[modelMetadata:getStatus]', msg);
      return { success: false, error: msg };
    }
  });
}
