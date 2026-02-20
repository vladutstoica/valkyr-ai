import { app, ipcMain } from 'electron';
import { dirname, resolve, normalize, sep } from 'path';
import * as fs from 'fs';

export function registerDebugIpc() {
  ipcMain.handle(
    'debug:append-log',
    async (_, filePath: string, content: string, options: { reset?: boolean } = {}) => {
      try {
        if (!filePath) throw new Error('filePath is required');

        // Restrict writes to the app's userData directory to prevent arbitrary filesystem writes
        const allowedRoot = normalize(app.getPath('userData'));
        const resolvedPath = normalize(resolve(filePath));
        if (!resolvedPath.startsWith(allowedRoot + sep) && resolvedPath !== allowedRoot) {
          throw new Error('Debug log path must be within the application data directory');
        }

        const dir = dirname(resolvedPath);
        await fs.promises.mkdir(dir, { recursive: true });

        const flag = options.reset ? 'w' : 'a';
        await fs.promises.writeFile(resolvedPath, content, { flag, encoding: 'utf8' });
        return { success: true };
      } catch (error) {
        console.error('Failed to append debug log:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );
}
