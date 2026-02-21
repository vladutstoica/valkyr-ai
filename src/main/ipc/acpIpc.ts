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
});

const AcpPromptSchema = z.object({
  sessionKey: z.string().min(1),
  message: z.string().min(1),
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

// ---------------------------------------------------------------------------
// Per-session event routing (S6: safeSendToOwner pattern)
// ---------------------------------------------------------------------------

// Map session keys to the WebContents that owns them
const sessionOwners = new Map<string, WebContents>();

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
      );

      if (result.success && result.sessionKey) {
        // Track ownership for per-session event routing
        sessionOwners.set(result.sessionKey, event.sender);

        // Clean up ownership when window is destroyed
        const wcId = event.sender.id;
        if (!event.sender.isDestroyed()) {
          event.sender.once('destroyed', () => {
            for (const [key, wc] of sessionOwners.entries()) {
              if (wc.id === wcId) {
                sessionOwners.delete(key);
                acpSessionManager.killSession(key);
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
      return await acpSessionManager.sendPrompt(parsed.sessionKey, parsed.message);
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
}
