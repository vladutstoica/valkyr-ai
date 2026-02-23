type Level = 'debug' | 'info' | 'warn' | 'error';

function envLevel(): Level {
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage.getItem('valkyr:debug') : null;
    if (ls === '1' || ls === 'true') return 'debug';
  } catch {}
  // Default to warn in open-source builds without env
  return 'warn';
}

function enabled(target: Level, current: Level): boolean {
  const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  return order[target] >= order[current];
}

const current = envLevel();

export type Logger = {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

export function createLogger(tag: string): Logger {
  return {
    debug: (...args: any[]) => log.debug(`[${tag}]`, ...args),
    info: (...args: any[]) => log.info(`[${tag}]`, ...args),
    warn: (...args: any[]) => log.warn(`[${tag}]`, ...args),
    error: (...args: any[]) => log.error(`[${tag}]`, ...args),
  };
}

export const log = {
  debug: (...args: any[]) => {
    if (enabled('debug', current)) {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  },
  info: (...args: any[]) => {
    if (enabled('info', current)) {
      // eslint-disable-next-line no-console
      console.info(...args);
    }
  },
  warn: (...args: any[]) => {
    if (enabled('warn', current)) {
      // eslint-disable-next-line no-console
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    // Always log errors
    // eslint-disable-next-line no-console
    console.error(...args);
  },
};
