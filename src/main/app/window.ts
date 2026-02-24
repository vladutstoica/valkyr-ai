import { BrowserWindow, session } from 'electron';
import { join } from 'path';
import { isDev } from '../utils/dev';
import { registerExternalLinkHandlers } from '../utils/externalLinks';
import { ensureRendererServer } from './staticServer';

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  // In development, resolve icon from src/assets
  // In production (packaged), electron-builder handles the icon
  const iconPath = isDev
    ? join(__dirname, '..', '..', '..', 'src', 'assets', 'images', 'valkyr', 'valkyr_logo.png')
    : undefined;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: 'Valkyr',
    ...(iconPath && { icon: iconPath }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Allow using <webview> in renderer for in‑app browser pane.
      // The webview runs in a separate process; nodeIntegration remains disabled.
      webviewTag: true,
      // __dirname here resolves to dist/main/main/app at runtime (dev)
      // Preload is emitted to dist/main/main/preload.js
      preload: join(__dirname, '..', 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  if (isDev) {
    const devPort = process.env.DEV_SERVER_PORT || '3000';
    mainWindow.loadURL(`http://localhost:${devPort}`);
  } else {
    // Serve renderer over an HTTP origin in production so embeds work.
    const rendererRoot = join(__dirname, '..', '..', '..', 'renderer');
    void ensureRendererServer(rendererRoot)
      .then((url: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(url);
        }
      })
      .catch(() => {
        // Fallback to file load if server fails for any reason.
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadFile(join(rendererRoot, 'index.html'));
        }
      });
  }

  // Content Security Policy — restrict script/style sources to same-origin.
  // 'unsafe-inline' is needed for Vite HMR in dev and inline styles from UI libs.
  // 'unsafe-eval' is needed for the ACP SDK dynamic import workaround (new Function).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self' ws://localhost:* http://localhost:* https:",
            "media-src 'self' blob:",
            "worker-src 'self' blob:",
          ].join('; '),
        ],
      },
    });
  });

  // Route external links to the user's default browser
  registerExternalLinkHandlers(mainWindow, isDev);

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Track window focus for telemetry
  mainWindow.on('focus', () => {
    // Lazy import to avoid circular dependencies
    void import('../telemetry').then(({ capture, checkAndReportDailyActiveUser }) => {
      void capture('app_window_focused');
      // Also check for daily active user when window gains focus
      checkAndReportDailyActiveUser();
    });
  });

  // Cleanup reference on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
