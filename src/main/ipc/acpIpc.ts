import { ipcMain, WebContents, BrowserWindow } from 'electron';
import { z } from 'zod';
import { acpSessionManager, type AcpUpdateEvent } from '../services/AcpSessionManager';
import { log } from '../lib/logger';

// ---------------------------------------------------------------------------
// Zod schemas for input validation (S3)
// ---------------------------------------------------------------------------

const AcpStartSchema = z.object({
  conversationId: z.string().min(1),
  providerId: z.string().min(1),
  cwd: z.string().min(1),
  env: z.record(z.string()).optional(),
  acpSessionId: z.string().optional(),
});

const AcpFileSchema = z.object({
  url: z.string().min(1),
  mediaType: z.string().min(1),
  filename: z.string().optional(),
});

const AcpPromptSchema = z.object({
  sessionKey: z.string().min(1),
  message: z.string(),
  files: z.array(AcpFileSchema).optional(),
});

const AcpSessionKeySchema = z.object({
  sessionKey: z.string().min(1),
});

const AcpApproveSchema = z.object({
  sessionKey: z.string().min(1),
  toolCallId: z.string().min(1),
  approved: z.boolean(),
});

const AcpSetModeSchema = z.object({
  sessionKey: z.string().min(1),
  mode: z.string().min(1),
});

const AcpSetModelSchema = z.object({
  sessionKey: z.string().min(1),
  modelId: z.string().min(1),
});

const AcpSetConfigOptionSchema = z.object({
  sessionKey: z.string().min(1),
  optionId: z.string().min(1),
  value: z.string(),
});

const AcpExtMethodSchema = z.object({
  sessionKey: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Per-session event routing (S6: safeSendToOwner pattern)
// ---------------------------------------------------------------------------

// Map session keys to the WebContents that owns them
const sessionOwners = new Map<string, WebContents>();

// Track which WebContents IDs already have a 'destroyed' listener to avoid stacking
const destroyedListenerIds = new Set<number>();

function safeSendToOwner(sessionKey: string, channel: string, payload: unknown): boolean {
  const wc = sessionOwners.get(sessionKey);
  if (!wc) return false;
  try {
    if (wc.isDestroyed()) return false;
    wc.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerAcpIpc(): void {
  // Wire the event sender to use per-session IPC
  acpSessionManager.setEventSender((sessionKey: string, events: AcpUpdateEvent[]) => {
    for (const event of events) {
      safeSendToOwner(sessionKey, `acp:update:${sessionKey}`, event);

      // Also send status changes on dedicated channel
      if (event.type === 'status_change') {
        safeSendToOwner(sessionKey, `acp:status:${sessionKey}`, event.status);
      }
    }
  });

  // -------------------------------------------------------------------------
  // acp:start — Create an ACP session
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:start', async (event, args: unknown) => {
    try {
      const parsed = AcpStartSchema.parse(args);
      const result = await acpSessionManager.createSession(
        parsed.conversationId,
        parsed.providerId,
        parsed.cwd,
        parsed.env,
        parsed.acpSessionId,
      );

      if (result.success && result.sessionKey) {
        // Track ownership for per-session event routing
        sessionOwners.set(result.sessionKey, event.sender);
        // Re-attach in case this session was previously detached (user navigated back)
        acpSessionManager.reattachSession(result.sessionKey);

        // Clean up ownership when window is destroyed (only register once per WebContents)
        const wcId = event.sender.id;
        if (!event.sender.isDestroyed() && !destroyedListenerIds.has(wcId)) {
          destroyedListenerIds.add(wcId);
          event.sender.once('destroyed', () => {
            destroyedListenerIds.delete(wcId);
            for (const [key, wc] of sessionOwners.entries()) {
              if (wc.id === wcId) {
                sessionOwners.delete(key);
                // Detach instead of kill — sessions should persist across window reloads
                acpSessionManager.detachSession(key);
              }
            }
          });
        }
      }

      return result;
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      log.error('acp:start failed', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:prompt — Send a prompt to an ACP session
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:prompt', async (_event, args: unknown) => {
    try {
      const parsed = AcpPromptSchema.parse(args);
      return await acpSessionManager.sendPrompt(parsed.sessionKey, parsed.message, parsed.files);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:cancel — Cancel an ongoing ACP operation
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:cancel', async (_event, args: unknown) => {
    try {
      const parsed = AcpSessionKeySchema.parse(args);
      return await acpSessionManager.cancelSession(parsed.sessionKey);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:detach — Detach from session without killing it
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:detach', async (_event, args: unknown) => {
    try {
      const parsed = AcpSessionKeySchema.parse(args);
      sessionOwners.delete(parsed.sessionKey);
      acpSessionManager.detachSession(parsed.sessionKey);
      return { success: true };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:kill — Destroy an ACP session
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:kill', async (_event, args: unknown) => {
    try {
      const parsed = AcpSessionKeySchema.parse(args);
      acpSessionManager.killSession(parsed.sessionKey);
      sessionOwners.delete(parsed.sessionKey);
      return { success: true };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:approve — Respond to a permission request
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:approve', async (_event, args: unknown) => {
    try {
      const parsed = AcpApproveSchema.parse(args);
      return await acpSessionManager.approvePermission(
        parsed.sessionKey,
        parsed.toolCallId,
        parsed.approved,
      );
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:setMode — Set the session mode
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:setMode', async (_event, args: unknown) => {
    try {
      const parsed = AcpSetModeSchema.parse(args);
      return await acpSessionManager.setMode(parsed.sessionKey, parsed.mode);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:setConfigOption — Set a session config option
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:setConfigOption', async (_event, args: unknown) => {
    try {
      const parsed = AcpSetConfigOptionSchema.parse(args);
      return await acpSessionManager.setConfigOption(parsed.sessionKey, parsed.optionId, parsed.value);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:setModel — Set the session model (unstable API)
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:setModel', async (_event, args: unknown) => {
    try {
      const parsed = AcpSetModelSchema.parse(args);
      return await acpSessionManager.setModel(parsed.sessionKey, parsed.modelId);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:listSessions — List available sessions (unstable API)
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:listSessions', async (_event, args: unknown) => {
    try {
      const parsed = AcpSessionKeySchema.parse(args);
      return await acpSessionManager.listSessions(parsed.sessionKey);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:forkSession — Fork the current session (unstable API)
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:forkSession', async (_event, args: unknown) => {
    try {
      const parsed = AcpSessionKeySchema.parse(args);
      return await acpSessionManager.forkSession(parsed.sessionKey);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // -------------------------------------------------------------------------
  // acp:extMethod — Call a custom extension method
  // -------------------------------------------------------------------------
  ipcMain.handle('acp:extMethod', async (_event, args: unknown) => {
    try {
      const parsed = AcpExtMethodSchema.parse(args);
      return await acpSessionManager.extMethod(
        parsed.sessionKey,
        parsed.method,
        parsed.params || {},
      );
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: `Validation error: ${error.errors.map(e => e.message).join(', ')}` };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  });
}
