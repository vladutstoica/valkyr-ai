import { ipcMain } from 'electron';
import { getUiStateItem, setUiStateItem, removeUiStateItem } from '../services/uiStateService';

export function registerUiStateIpc(): void {
  ipcMain.handle('ui-state:get-item', async (_event, key: string) => {
    try {
      return { success: true, data: getUiStateItem(key) };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ui-state:set-item', async (_event, key: string, value: string) => {
    try {
      setUiStateItem(key, value);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('ui-state:remove-item', async (_event, key: string) => {
    try {
      removeUiStateItem(key);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
