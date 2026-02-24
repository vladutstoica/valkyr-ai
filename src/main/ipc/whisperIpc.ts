import { ipcMain } from 'electron';
import { whisperService } from '../services/WhisperService';

export function registerWhisperIpc() {
  ipcMain.handle('whisper:download-model', async () => {
    try {
      await whisperService.downloadModel();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('whisper:delete-model', async () => {
    try {
      await whisperService.deleteModel();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('whisper:model-status', async () => {
    try {
      const data = whisperService.getModelStatus();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('whisper:transcribe', async (_, pcmData: ArrayBuffer) => {
    try {
      const text = await whisperService.transcribe(pcmData);
      return { success: true, data: { text } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
