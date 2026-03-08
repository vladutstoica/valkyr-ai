import { ipcMain } from 'electron';
import { AppSettings, getAppSettings, updateAppSettings } from '../settings';
import { log } from '../lib/logger';

const KEYTAR_SERVICE = 'valkyr-provider-keys';

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', async () => {
    try {
      const settings = getAppSettings();
      return { success: true, settings };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('settings:update', async (_, partial: Partial<AppSettings>) => {
    try {
      const settings = updateAppSettings(partial || {});
      return { success: true, settings };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Provider API key management via keytar
  ipcMain.handle('providerKeys:set', async (_, args: { envVar: string; value: string }) => {
    try {
      const keytar = await import('keytar');
      await keytar.setPassword(KEYTAR_SERVICE, args.envVar, args.value);
      return { success: true };
    } catch (error) {
      log.error('Failed to store provider key', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('providerKeys:get', async (_, args: { envVar: string }) => {
    try {
      const keytar = await import('keytar');
      const value = await keytar.getPassword(KEYTAR_SERVICE, args.envVar);
      return { success: true, data: { hasKey: !!value } };
    } catch (error) {
      log.error('Failed to read provider key', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('providerKeys:delete', async (_, args: { envVar: string }) => {
    try {
      const keytar = await import('keytar');
      await keytar.deletePassword(KEYTAR_SERVICE, args.envVar);
      return { success: true };
    } catch (error) {
      log.error('Failed to delete provider key', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('providerKeys:list', async () => {
    try {
      const keytar = await import('keytar');
      const creds = await keytar.findCredentials(KEYTAR_SERVICE);
      const keys = creds.map((c) => c.account);
      return { success: true, data: keys };
    } catch (error) {
      log.error('Failed to list provider keys', error);
      return { success: false, error: (error as Error).message };
    }
  });
}

/**
 * Load all stored provider API keys from keytar.
 * Returns a Record<envVarName, value> for injection into agent env.
 */
export async function getStoredProviderKeys(): Promise<Record<string, string>> {
  try {
    const keytar = await import('keytar');
    const creds = await keytar.findCredentials(KEYTAR_SERVICE);
    const result: Record<string, string> = {};
    for (const c of creds) {
      result[c.account] = c.password;
    }
    return result;
  } catch {
    return {};
  }
}
