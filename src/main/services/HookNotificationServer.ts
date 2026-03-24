/**
 * Local HTTP server that receives hook notifications from Claude Code.
 *
 * Claude Code hooks are configured to POST to:
 *   http://127.0.0.1:{port}/hook/notify
 *
 * Each request includes the event type and a session ID that maps back
 * to a Valkyr task/PTY, allowing us to update the correct status dot.
 */

import http from 'http';
import { Notification, ipcMain } from 'electron';
import { log } from '../lib/logger';
import { mapHookEvent, type HookStatus } from './hookEventMapper';
import { broadcastToAllWindows } from '../lib/safeSend';
import { getMainWindow } from '../app/window';
import { getAppSettings } from '../settings';

export type HookNotification = {
  sessionId: string;
  event: string;
  status: HookStatus;
};

type HookListener = (notification: HookNotification) => void;

/** Pending batch entry for desktop notification batching */
type PendingBatch = {
  count: number;
  hasNeedsInput: boolean;
  sessionId: string;
  taskName: string | null;
  timer: ReturnType<typeof setTimeout>;
};

class HookNotificationServer {
  private server: http.Server | null = null;
  private port = 0;
  private listeners = new Set<HookListener>();
  /** Pending notifications for renderer to poll via IPC */
  private pendingNotifications: HookNotification[] = [];
  private ipcRegistered = false;

  /** Currently active session in the renderer (set via IPC) */
  private activeSessionId: string | null = null;
  /** Task name associated with active view (for notification enrichment) */
  private activeTaskName: string | null = null;
  /** Session ID → task name mapping (set via renderer) */
  private sessionTaskNames = new Map<string, string>();
  /** Session ID → project ID mapping (for per-project mute) */
  private sessionProjectIds = new Map<string, string>();
  /** Batched desktop notifications: taskId → PendingBatch */
  private pendingDesktopNotifications = new Map<string, PendingBatch>();
  /** Cooldown for done notifications when focused on different chat: taskId → timestamp */
  private lastDoneNotificationTime = new Map<string, number>();
  /** How long to batch notifications before sending (ms) */
  private static readonly BATCH_WINDOW_MS = 3000;
  /** Cooldown for done notifications when window is focused but on different chat (ms) */
  private static readonly DONE_COOLDOWN_MS = 30000;

  /**
   * Start the notification server on a random available port.
   * Returns the port number for use in hook registration.
   */
  async start(): Promise<number> {
    if (!this.ipcRegistered) {
      this.ipcRegistered = true;
      // Renderer polls this to get hook status updates
      ipcMain.handle('hook:poll-status', () => {
        const pending = this.pendingNotifications;
        this.pendingNotifications = [];
        return pending;
      });

      // Renderer reports which session is currently being viewed
      ipcMain.handle(
        'hook:set-active-view',
        (
          _event,
          args: {
            sessionId: string | null;
            taskName?: string | null;
            projectId?: string | null;
          }
        ) => {
          this.activeSessionId = args.sessionId;
          if (args.taskName !== undefined) {
            this.activeTaskName = args.taskName ?? null;
          }
          // Store session → taskName mapping for notification enrichment
          if (args.sessionId && args.taskName) {
            this.sessionTaskNames.set(args.sessionId, args.taskName);
          }
          // Store session → projectId mapping for per-project mute
          if (args.sessionId && args.projectId) {
            this.sessionProjectIds.set(args.sessionId, args.projectId);
          }
          return { success: true };
        }
      );
    }

    if (this.server) return this.port;

    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        // Only accept POST to /hook/notify
        if (req.method !== 'POST' || req.url !== '/hook/notify') {
          res.writeHead(404);
          res.end();
          return;
        }

        let body = '';
        req.on('data', (chunk: string) => {
          body += chunk;
          // Prevent abuse: reject payloads > 8KB
          if (body.length > 8192) {
            res.writeHead(413);
            res.end();
            req.destroy();
          }
        });

        req.on('end', () => {
          // Always respond success for forward compatibility
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"success":true}');

          try {
            const data = JSON.parse(body);
            this.handleNotification(data);
          } catch (err) {
            log.warn('hookServer: failed to parse notification', { error: String(err) });
          }
        });
      });

      // Listen on localhost only (not exposed to network)
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        if (typeof addr === 'object' && addr) {
          this.port = addr.port;
          this.server = srv;
          log.info('hookServer: listening', { port: this.port });
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      srv.on('error', (err) => {
        log.error('hookServer: server error', { error: String(err) });
        reject(err);
      });
    });
  }

  getPort(): number {
    return this.port;
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Subscribe to hook notifications.
   * Returns unsubscribe function.
   */
  onNotification(listener: HookListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Stop the server and clean up.
   */
  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.port = 0;
        this.listeners.clear();
        log.info('hookServer: stopped');
        resolve();
      });
    });
  }

  private maybeShowDesktopNotification(status: HookStatus, sessionId: string): void {
    // Only notify for actionable states
    if (status === 'working') return;

    const settings = getAppSettings();
    if (!settings.notifications?.enabled) return;

    // Per-project mute check
    const taskName = this.sessionTaskNames.get(sessionId) || null;
    const projectId = this.sessionProjectIds.get(sessionId);
    if (projectId && settings.notifications?.mutedProjects?.includes(projectId)) {
      return;
    }

    const win = getMainWindow();
    const isWindowFocused = win && !win.isDestroyed() && win.isFocused();

    if (isWindowFocused) {
      // If active view tracking is not yet initialized (renderer hasn't reported),
      // fall back to the original behavior: suppress all when focused
      if (this.activeSessionId === null) return;

      const isViewingThisChat = this.activeSessionId === sessionId;

      // Trigger matrix:
      // Viewing this exact chat + focused → never notify
      if (isViewingThisChat) return;

      // Different chat/task/project + focused:
      //   needs-input → always notify
      //   done → only after 30s cooldown
      if (status === 'done') {
        const lastTime = this.lastDoneNotificationTime.get(sessionId) || 0;
        if (Date.now() - lastTime < HookNotificationServer.DONE_COOLDOWN_MS) return;
      }
    }

    // Window unfocused → always notify (both needs-input and done)

    // Use batching: queue this notification
    this.queueBatchedNotification(sessionId, status, taskName);
  }

  /**
   * Queue a notification for batching. The first notification for a session
   * fires immediately. If more arrive within the batch window, they are
   * collapsed into a single follow-up notification.
   */
  private queueBatchedNotification(
    sessionId: string,
    status: HookStatus,
    taskName: string | null
  ): void {
    const existing = this.pendingDesktopNotifications.get(sessionId);

    if (existing) {
      // More events within the batch window — update the pending batch
      existing.count += 1;
      if (status === 'needs-input') existing.hasNeedsInput = true;
      if (taskName && !existing.taskName) existing.taskName = taskName;
      return;
    }

    // First notification for this session — fire immediately
    this.fireDesktopNotification(sessionId, status, taskName, 1);

    // Start a batch window for any follow-up events
    const timer = setTimeout(() => {
      this.flushBatchedNotification(sessionId);
    }, HookNotificationServer.BATCH_WINDOW_MS);

    this.pendingDesktopNotifications.set(sessionId, {
      count: 0, // 0 because the first was already sent
      hasNeedsInput: false,
      sessionId,
      taskName,
      timer,
    });
  }

  /**
   * Send the batched follow-up notification for a session (if any events accumulated).
   */
  private flushBatchedNotification(sessionId: string): void {
    const batch = this.pendingDesktopNotifications.get(sessionId);
    if (!batch) return;
    this.pendingDesktopNotifications.delete(sessionId);

    // If no follow-up events accumulated, nothing to send
    if (batch.count === 0) return;

    const effectiveStatus: HookStatus = batch.hasNeedsInput ? 'needs-input' : 'done';
    this.fireDesktopNotification(
      sessionId,
      effectiveStatus,
      batch.taskName,
      batch.count
    );
  }

  /**
   * Create and show a desktop notification.
   */
  private fireDesktopNotification(
    sessionId: string,
    status: HookStatus,
    taskName: string | null,
    count: number
  ): void {
    const settings = getAppSettings();
    const win = getMainWindow();

    // Build enriched notification content
    const taskLabel = taskName ? `${taskName} — ` : '';
    let title: string;
    let body: string;

    if (count > 1) {
      if (status === 'needs-input') {
        title = `${taskLabel}Agent needs input`;
        body = `${count} agents need your attention.`;
      } else {
        title = `${taskLabel}Agents finished`;
        body = `${count} agents completed their tasks.`;
      }
    } else {
      if (status === 'needs-input') {
        title = `${taskLabel}Agent needs input`;
        body = 'Agent is waiting for your approval.';
      } else {
        title = `${taskLabel}Agent finished`;
        body = 'Agent completed successfully.';
      }
    }

    // Track done notification time for cooldown
    if (status === 'done') {
      this.lastDoneNotificationTime.set(sessionId, Date.now());
    }

    const notif = new Notification({
      title,
      body,
      silent: !settings.notifications?.sound,
    });

    notif.on('click', () => {
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.focus();
        // Deep-navigate to the specific session
        broadcastToAllWindows('hook:navigate-to-session', { sessionId });
      }
    });

    notif.show();
  }

  private handleNotification(data: Record<string, unknown>): void {
    const eventType = typeof data.event === 'string' ? data.event : '';
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';

    if (!eventType || !sessionId) {
      log.warn('hookServer: missing event or sessionId', { data });
      return;
    }

    const status = mapHookEvent(eventType);
    if (!status) {
      // Unknown event type — ignore silently for forward compatibility
      return;
    }

    const notification: HookNotification = { sessionId, event: eventType, status };

    // Show native desktop notification (smart trigger based on active view)
    this.maybeShowDesktopNotification(status, sessionId);

    // Queue for renderer polling
    this.pendingNotifications.push(notification);
    // Keep queue bounded
    if (this.pendingNotifications.length > 100) {
      this.pendingNotifications = this.pendingNotifications.slice(-50);
    }

    // Also try push-based broadcast (may not work in all Electron configs)
    broadcastToAllWindows('hook:status-update', notification);

    // Notify in-process listeners
    for (const listener of this.listeners) {
      try {
        listener(notification);
      } catch (err) {
        log.error('hookServer: listener error', { error: String(err) });
      }
    }
  }
}

export const hookNotificationServer = new HookNotificationServer();
