/**
 * Lightweight pub/sub for terminal font changes.
 * Replaces window.dispatchEvent('terminal-font-changed') pattern.
 */

type FontChangeListener = (fontFamily: string | undefined) => void;

const listeners = new Set<FontChangeListener>();

export function onTerminalFontChange(listener: FontChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitTerminalFontChange(fontFamily: string | undefined): void {
  for (const listener of listeners) {
    listener(fontFamily);
  }
}
