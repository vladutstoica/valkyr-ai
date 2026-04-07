import { app } from 'electron';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname, join } from 'path';

let cached: Record<string, string> | null = null;

function getFilePath(): string {
  return join(app.getPath('userData'), 'ui-state.json');
}

/** Get a single key from ui-state */
export function getUiStateItem(key: string): string | null {
  if (!cached) {
    try {
      const file = getFilePath();
      if (existsSync(file)) {
        cached = JSON.parse(readFileSync(file, 'utf8'));
      } else {
        cached = {};
      }
    } catch {
      cached = {};
    }
  }
  return cached![key] ?? null;
}

/** Set a single key in ui-state and persist */
export function setUiStateItem(key: string, value: string): void {
  if (!cached) {
    // Load existing state first
    getUiStateItem(key);
  }
  cached![key] = value;
  persistUiState();
}

/** Remove a key from ui-state */
export function removeUiStateItem(key: string): void {
  if (!cached) {
    getUiStateItem(key);
  }
  delete cached![key];
  persistUiState();
}

function persistUiState(): void {
  try {
    const file = getFilePath();
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    void writeFile(file, JSON.stringify(cached, null, 2), 'utf8').catch(() => {});
  } catch {
    // swallow errors to avoid crashing
  }
}
