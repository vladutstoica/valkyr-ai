import { BrowserWindow, WebContents } from 'electron';

/**
 * Safely send an IPC message to a WebContents instance.
 *
 * Handles the "Render frame was disposed" race condition that occurs when
 * sending messages to windows that are closing. This error is benign and
 * expected during normal window lifecycle, so we suppress it silently.
 *
 * Note: Electron logs "Error sending from webFrameMain" internally before
 * throwing - we can't prevent that log, but we handle the error gracefully.
 */
export function safeSend(wc: WebContents, channel: string, ...args: unknown[]): boolean {
  try {
    if (wc.isDestroyed()) return false;
    wc.send(channel, ...args);
    return true;
  } catch {
    // Frame disposed during send - silently ignore
    return false;
  }
}

/**
 * Broadcast an IPC message to all open BrowserWindow instances safely.
 *
 * Iterates through all windows and attempts to send the message to each,
 * silently skipping any windows with disposed render frames.
 *
 * @param channel - The IPC channel name
 * @param args - Arguments to send with the message
 */
export function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      safeSend(win.webContents, channel, ...args);
    }
  }
}
