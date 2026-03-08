/**
 * Lightweight pub/sub for "run script" events.
 * Replaces window.dispatchEvent('run-script') pattern.
 */

export interface ScriptRunEvent {
  scriptName: string;
  path: string;
}

type ScriptRunListener = (event: ScriptRunEvent) => void;

const listeners = new Set<ScriptRunListener>();

export function onScriptRun(listener: ScriptRunListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitScriptRun(event: ScriptRunEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
