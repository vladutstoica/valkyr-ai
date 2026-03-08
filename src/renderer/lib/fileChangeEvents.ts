/**
 * Pub/sub store for file change events.
 * Replaces window.dispatchEvent('file-change-notification') pattern.
 * Notifies components when files are saved (e.g., CodeEditor → FileChangesPanel).
 */

export interface FileChangeEvent {
  taskPath: string;
  filePath?: string;
}

type FileChangeListener = (event: FileChangeEvent) => void;

const listeners = new Set<FileChangeListener>();

/**
 * Subscribe to file change events.
 * Returns a cleanup function to remove the listener.
 */
export function subscribeToFileChanges(callback: FileChangeListener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Dispatch a file change event to notify listeners that files have been saved.
 */
export function dispatchFileChangeEvent(taskPath: string, filePath?: string): void {
  const event: FileChangeEvent = { taskPath, filePath };
  for (const listener of listeners) {
    listener(event);
  }
}
