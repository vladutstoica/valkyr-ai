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

class HookNotificationServer {
  private server: http.Server | null = null;
  private port = 0;
  private listeners = new Set<HookListener>();
  /** Pending notifications for renderer to poll via IPC */
  private pendingNotifications: HookNotification[] = [];
  private ipcRegistered = false;

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

  private maybeShowDesktopNotification(status: HookStatus): void {
    // Only notify for actionable states
    if (status === 'working') return;

    const settings = getAppSettings();
    if (!settings.notifications?.enabled) return;

    // Skip if the app window is focused (user is already looking)
    const win = getMainWindow();
    if (win && !win.isDestroyed() && win.isFocused()) return;

    const title = status === 'needs-input' ? 'Agent needs input' : 'Agent finished';
    const body =
      status === 'needs-input'
        ? 'An agent is waiting for your approval.'
        : 'An agent has completed its task.';

    const notif = new Notification({
      title,
      body,
      silent: !settings.notifications?.sound,
    });

    notif.on('click', () => {
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.focus();
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

    // Show native desktop notification when window is not focused
    this.maybeShowDesktopNotification(status);

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
