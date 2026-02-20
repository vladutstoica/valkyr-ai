import { ipcMain } from 'electron';
import { browserViewService } from '../services/browserViewService';

export function registerBrowserIpc() {
  ipcMain.handle(
    'browser:view:show',
    (_e, args: { x: number; y: number; width: number; height: number; url?: string }) => {
      try {
        const { x, y, width, height, url } = args || ({} as any);
        browserViewService.show({ x, y, width, height }, url);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );
  ipcMain.handle('browser:view:hide', () => {
    try {
      browserViewService.hide();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  ipcMain.handle(
    'browser:view:setBounds',
    (_e, args: { x: number; y: number; width: number; height: number }) => {
      try {
        const { x, y, width, height } = args || ({} as any);
        browserViewService.setBounds({ x, y, width, height });
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );
  ipcMain.handle('browser:view:loadURL', (_e, url: string, forceReload?: boolean) => {
    try {
      // Validate URL scheme to prevent loading file:// or javascript: URLs
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: 'Only http/https URLs are allowed' };
      }
      browserViewService.loadURL(url, forceReload);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  ipcMain.handle('browser:view:goBack', () => {
    try {
      browserViewService.goBack();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  ipcMain.handle('browser:view:goForward', () => {
    try {
      browserViewService.goForward();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  ipcMain.handle('browser:view:reload', () => {
    try {
      browserViewService.reload();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  ipcMain.handle('browser:view:openDevTools', () => {
    try {
      browserViewService.openDevTools();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  ipcMain.handle('browser:view:clear', () => {
    try {
      browserViewService.clear();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}
