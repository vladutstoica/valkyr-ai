/**
 * Lightweight pub/sub for default "Open In" app changes.
 * Replaces window.dispatchEvent('defaultOpenInAppChanged') pattern.
 */
import type { OpenInAppId } from '@shared/openInApps';

type OpenInAppChangeListener = (appId: OpenInAppId) => void;

const listeners = new Set<OpenInAppChangeListener>();

export function onDefaultOpenInAppChange(listener: OpenInAppChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDefaultOpenInAppChange(appId: OpenInAppId): void {
  for (const listener of listeners) {
    listener(appId);
  }
}
