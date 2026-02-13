import { ipcMain, BrowserWindow, WebContents } from 'electron';
import { log } from '../lib/logger';
import { scriptRunnerService } from '../services/ScriptRunnerService';

// Track PTY owners and data listeners
const ptyOwners = new Map<string, WebContents>();
const ptyListeners = new Set<string>();

// Buffer PTY output to reduce IPC overhead
const ptyDataBuffers = new Map<string, string>();
const ptyDataTimers = new Map<string, NodeJS.Timeout>();
const PTY_DATA_FLUSH_MS = 16;

function safeSendToOwner(ptyId: string, channel: string, payload: unknown): boolean {
  const wc = ptyOwners.get(ptyId);
  if (!wc) return false;
  try {
    if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return false;
    wc.send(channel, payload);
    return true;
  } catch (err) {
    log.warn('scriptRunnerIpc:safeSendFailed', {
      ptyId,
      channel,
      error: String((err as Error)?.message || err),
    });
    return false;
  }
}

function flushPtyData(ptyId: string): void {
  const buf = ptyDataBuffers.get(ptyId);
  if (!buf) return;
  ptyDataBuffers.delete(ptyId);
  safeSendToOwner(ptyId, `scripts:data:${ptyId}`, buf);
}

function clearPtyData(ptyId: string): void {
  const t = ptyDataTimers.get(ptyId);
  if (t) {
    clearTimeout(t);
    ptyDataTimers.delete(ptyId);
  }
  ptyDataBuffers.delete(ptyId);
}

function bufferedSendPtyData(ptyId: string, chunk: string): void {
  const prev = ptyDataBuffers.get(ptyId) || '';
  ptyDataBuffers.set(ptyId, prev + chunk);
  if (ptyDataTimers.has(ptyId)) return;
  const t = setTimeout(() => {
    ptyDataTimers.delete(ptyId);
    flushPtyData(ptyId);
  }, PTY_DATA_FLUSH_MS);
  ptyDataTimers.set(ptyId, t);
}

export function registerScriptRunnerIpc(): void {
  // Get available scripts from package.json
  ipcMain.handle('scripts:getScripts', async (_, projectPath: string) => {
    try {
      const scripts = await scriptRunnerService.getScripts(projectPath);
      return { success: true, data: scripts };
    } catch (error) {
      log.error('scripts:getScripts failed', { projectPath, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Run a script
  ipcMain.handle(
    'scripts:runScript',
    async (event, args: { projectPath: string; scriptName: string }) => {
      const { projectPath, scriptName } = args;

      try {
        const ptyId = await scriptRunnerService.runScript(projectPath, scriptName);
        const proc = scriptRunnerService.getPty(ptyId);

        if (!proc) {
          return { success: false, error: 'Failed to get PTY after spawn' };
        }

        // Register owner
        const wc = event.sender;
        ptyOwners.set(ptyId, wc);

        // Set up data and exit listeners
        if (!ptyListeners.has(ptyId)) {
          proc.onData((data) => {
            bufferedSendPtyData(ptyId, data);
          });

          proc.onExit(({ exitCode, signal }) => {
            flushPtyData(ptyId);
            clearPtyData(ptyId);
            safeSendToOwner(ptyId, `scripts:exit:${ptyId}`, { exitCode, signal });
            ptyOwners.delete(ptyId);
            ptyListeners.delete(ptyId);
          });

          ptyListeners.add(ptyId);
        }

        // Clean up if WebContents is destroyed
        wc.once('destroyed', () => {
          if (scriptRunnerService.hasPty(ptyId)) {
            scriptRunnerService.stopScript(ptyId);
          }
          ptyOwners.delete(ptyId);
          ptyListeners.delete(ptyId);
          clearPtyData(ptyId);
        });

        // Notify all windows that script started
        try {
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((w) => {
            try {
              if (!w.webContents.isDestroyed()) {
                w.webContents.send('scripts:started', { ptyId, scriptName, projectPath });
              }
            } catch {}
          });
        } catch {}

        return { success: true, data: { ptyId } };
      } catch (error) {
        log.error('scripts:runScript failed', { projectPath, scriptName, error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // Stop a running script
  ipcMain.handle('scripts:stopScript', async (_, ptyId: string) => {
    try {
      scriptRunnerService.stopScript(ptyId);
      ptyOwners.delete(ptyId);
      ptyListeners.delete(ptyId);
      clearPtyData(ptyId);
      return { success: true };
    } catch (error) {
      log.error('scripts:stopScript failed', { ptyId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Get running scripts for a project
  ipcMain.handle('scripts:getRunning', async (_, projectPath: string) => {
    try {
      const running = scriptRunnerService.getRunningScripts(projectPath);
      const data = running.map((r) => ({
        scriptName: r.scriptName,
        ptyId: r.ptyId,
      }));
      return { success: true, data };
    } catch (error) {
      log.error('scripts:getRunning failed', { projectPath, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Write input to a script PTY
  ipcMain.on('scripts:input', (_, args: { ptyId: string; data: string }) => {
    try {
      scriptRunnerService.writePty(args.ptyId, args.data);
    } catch (error) {
      log.error('scripts:input error', { ptyId: args.ptyId, error });
    }
  });

  // Resize a script PTY
  ipcMain.on('scripts:resize', (_, args: { ptyId: string; cols: number; rows: number }) => {
    try {
      scriptRunnerService.resizePty(args.ptyId, args.cols, args.rows);
    } catch (error) {
      log.error('scripts:resize error', { ptyId: args.ptyId, error });
    }
  });
}
