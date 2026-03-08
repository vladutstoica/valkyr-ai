/**
 * Abstraction layer for PTY (pseudo-terminal) operations via electronAPI.
 * Decouples renderer components from direct window.electronAPI.pty* calls.
 */

export function ptyInput(id: string, data: string): void {
  window.electronAPI?.ptyInput?.({ id, data });
}

export function ptyKill(id: string): void {
  window.electronAPI?.ptyKill?.(id);
}

export function ptyResize(id: string, cols: number, rows: number): void {
  window.electronAPI?.ptyResize?.({ id, cols, rows });
}
