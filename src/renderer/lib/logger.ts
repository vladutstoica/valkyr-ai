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
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export function createLogger(tag: string): Logger {
  return {
    debug: (...args: unknown[]) => log.debug(`[${tag}]`, ...args),
    info: (...args: unknown[]) => log.info(`[${tag}]`, ...args),
    warn: (...args: unknown[]) => log.warn(`[${tag}]`, ...args),
    error: (...args: unknown[]) => log.error(`[${tag}]`, ...args),
  };
}

export const log = {
  debug: (...args: unknown[]) => {
    if (enabled('debug', current)) {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (enabled('info', current)) {
      // eslint-disable-next-line no-console
      console.info(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (enabled('warn', current)) {
      // eslint-disable-next-line no-console
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    // Always log errors
    // eslint-disable-next-line no-console
    console.error(...args);
  },
};
