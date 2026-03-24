import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DEFAULT_IGNORES } from '../utils/fsIgnores';
import { createLogger } from '../lib/logger';
import { fsService } from './fs/FsService';
import { fsSearchService } from './fs/FsSearchService';
import { fsListService } from './fs/FsListService';
import { fsConfigService } from './fs/FsConfigService';
import type { ListArgs } from './fs/FsListService';

const log = createLogger('ipc:fs');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Broadcast a plan event to all renderer windows.
 * Used to surface write/remove permission failures to the Plan Mode UI.
 */
function emitPlanEvent(payload: unknown): void {
  try {
    const { BrowserWindow } = require('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('plan:event', payload);
      } catch {}
    }
  } catch {}
}

/**
 * Thin wrapper that standardises the try/catch/log pattern shared by every
 * IPC handler. Each handler delegates to a service method and this wrapper
 * converts thrown errors into the `{ success: false, error }` envelope.
 */
async function wrapIpcHandler<T>(
  channel: string,
  fn: () => Promise<T> | T
): Promise<{ success: true } & T extends void ? Record<string, never> : T extends object ? T : { data: T }>;
async function wrapIpcHandler<T>(channel: string, fn: () => Promise<T> | T): Promise<unknown> {
  try {
    const result = await fn();
    if (result === undefined || result === null) return { success: true };
    if (typeof result === 'object') return { success: true, ...result };
    return { success: true, data: result };
  } catch (error) {
    log.error(`${channel} failed:`, error);
    return { success: false, error: (error as Error).message ?? 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerFsIpc(): void {
  // -------------------------------------------------------------------------
  // fs:readdir — simple directory listing (no recursion)
  // -------------------------------------------------------------------------
  ipcMain.handle('fs:readdir', async (_event, args: { dirPath: string }) => {
    return wrapIpcHandler('fs:readdir', () => {
      const { dirPath } = args;
      if (!dirPath || !fs.existsSync(dirPath)) {
        return { success: false, error: 'Invalid path' };
      }
      const items = fsService.readDirectory(dirPath);
      return { items };
    });
  });

  // -------------------------------------------------------------------------
  // fs:check-ignored — check which paths are ignored by git
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'fs:check-ignored',
    async (_event, args: { rootPath: string; paths: string[] }) => {
      return wrapIpcHandler('fs:check-ignored', () => {
        const { rootPath, paths } = args;

        if (!rootPath || !fs.existsSync(rootPath)) {
          return { success: false, error: 'Invalid root path' };
        }
        if (!paths || paths.length === 0) {
          return { ignoredPaths: [] };
        }

        const isGitRepo = fs.existsSync(path.join(rootPath, '.git'));

        if (!isGitRepo) {
          return { ignoredPaths: paths.filter((p) => DEFAULT_IGNORES.has(path.basename(p))) };
        }

        try {
          const result = execSync('git check-ignore --stdin', {
            cwd: rootPath,
            input: paths.join('\n'),
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });

          const ignoredPaths = result
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

          return { ignoredPaths };
        } catch (gitError: any) {
          // git check-ignore exits 1 when no files are ignored — that is normal
          if (gitError.status === 1 && gitError.stdout !== undefined) {
            const ignoredPaths = (gitError.stdout as string)
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0);
            return { ignoredPaths };
          }

          log.warn('git check-ignore failed, falling back to DEFAULT_IGNORES:', gitError.message);
          return { ignoredPaths: paths.filter((p) => DEFAULT_IGNORES.has(path.basename(p))) };
        }
      });
    }
  );

  // -------------------------------------------------------------------------
  // fs:list — recursive file listing via worker pool
  // -------------------------------------------------------------------------
  ipcMain.handle('fs:list', async (_event, args: ListArgs) => {
    return wrapIpcHandler('fs:list', async () => {
      const result = await fsListService.list(_event.sender.id, args);
      return result;
    });
  });

  // -------------------------------------------------------------------------
  // fs:read — read a text file relative to a root
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'fs:read',
    async (_event, args: { root: string; relPath: string; maxBytes?: number }) => {
      return wrapIpcHandler('fs:read', () => {
        const { root, relPath } = args;
        const maxBytes = Math.min(Math.max(args.maxBytes ?? 200 * 1024, 1024), 5 * 1024 * 1024);
        if (!root || !fs.existsSync(root)) return { success: false, error: 'Invalid root path' };
        if (!relPath) return { success: false, error: 'Invalid relPath' };
        return fsService.readFile(root, relPath, maxBytes);
      });
    }
  );

  // -------------------------------------------------------------------------
  // fs:read-image — read image as base64 data URL
  // -------------------------------------------------------------------------
  ipcMain.handle('fs:read-image', async (_event, args: { root: string; relPath: string }) => {
    return wrapIpcHandler('fs:read-image', () => {
      const { root, relPath } = args;
      if (!root || !fs.existsSync(root)) return { success: false, error: 'Invalid root path' };
      if (!relPath) return { success: false, error: 'Invalid relPath' };
      return fsService.readImage(root, relPath);
    });
  });

  // -------------------------------------------------------------------------
  // fs:searchContent — content search across project files
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'fs:searchContent',
    async (
      _event,
      args: {
        root: string;
        query: string;
        options?: { caseSensitive?: boolean; maxResults?: number; fileExtensions?: string[] };
      }
    ) => {
      return wrapIpcHandler('fs:searchContent', async () => {
        const { root, query, options = {} } = args;
        if (!root || !fs.existsSync(root)) return { success: false, error: 'Invalid root path' };
        if (!query || query.length < 2)
          return { success: false, error: 'Query too short (min 2 chars)' };
        return fsSearchService.searchContent(root, query, options);
      });
    }
  );

  // -------------------------------------------------------------------------
  // fs:save-attachment — copy an image into a task-managed folder
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'fs:save-attachment',
    async (_event, args: { taskPath: string; srcPath: string; subdir?: string }) => {
      return wrapIpcHandler('fs:save-attachment', () => {
        const { taskPath, srcPath, subdir } = args;
        if (!taskPath || !fs.existsSync(taskPath))
          return { success: false, error: 'Invalid taskPath' };
        if (!srcPath || !fs.existsSync(srcPath))
          return { success: false, error: 'Invalid srcPath' };
        return fsService.saveAttachment(taskPath, srcPath, subdir);
      });
    }
  );

  // -------------------------------------------------------------------------
  // fs:write — write a file relative to a root
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'fs:write',
    async (
      _event,
      args: { root: string; relPath: string; content: string; mkdirs?: boolean }
    ) => {
      return wrapIpcHandler('fs:write', () => {
        const { root, relPath, content, mkdirs = true } = args;
        if (!root || !fs.existsSync(root)) return { success: false, error: 'Invalid root path' };
        if (!relPath) return { success: false, error: 'Invalid relPath' };

        try {
          fsService.writeFile(root, relPath, content, mkdirs);
        } catch (e: any) {
          if ((e?.code || '').toUpperCase() === 'EACCES') {
            emitPlanEvent({
              type: 'write_blocked',
              root,
              relPath,
              code: e?.code,
              message: e?.message || String(e),
            });
          }
          throw e;
        }

        return {};
      });
    }
  );

  // -------------------------------------------------------------------------
  // fs:remove — delete a file relative to a root
  // -------------------------------------------------------------------------
  ipcMain.handle('fs:remove', async (_event, args: { root: string; relPath: string }) => {
    return wrapIpcHandler('fs:remove', () => {
      const { root, relPath } = args;
      if (!root || !fs.existsSync(root)) return { success: false, error: 'Invalid root path' };
      if (!relPath) return { success: false, error: 'Invalid relPath' };

      try {
        fsService.removeFile(root, relPath);
      } catch (e: any) {
        if ((e?.code || '').toUpperCase() === 'EACCES') {
          emitPlanEvent({
            type: 'remove_blocked',
            root,
            relPath,
            code: e?.code,
            message: e?.message || String(e),
          });
        }
        throw e;
      }

      return {};
    });
  });

  // -------------------------------------------------------------------------
  // fs:getProjectConfig — read (or create) .valkyr.json
  // -------------------------------------------------------------------------
  ipcMain.handle('fs:getProjectConfig', async (_event, args: { projectPath: string }) => {
    return wrapIpcHandler('fs:getProjectConfig', () => {
      const { projectPath } = args;
      if (!projectPath || !fs.existsSync(projectPath)) {
        return { success: false, error: 'Invalid project path' };
      }
      return fsConfigService.getProjectConfig(projectPath);
    });
  });

  // -------------------------------------------------------------------------
  // fs:saveProjectConfig — write validated JSON to .valkyr.json
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'fs:saveProjectConfig',
    async (_event, args: { projectPath: string; content: string }) => {
      return wrapIpcHandler('fs:saveProjectConfig', () => {
        const { projectPath, content } = args;
        if (!projectPath || !fs.existsSync(projectPath)) {
          return { success: false, error: 'Invalid project path' };
        }
        try {
          const configPath = fsConfigService.saveProjectConfig(projectPath, content);
          return { path: configPath };
        } catch (e: any) {
          if (e instanceof SyntaxError) {
            return { success: false, error: 'Invalid JSON format' };
          }
          throw e;
        }
      });
    }
  );
}
