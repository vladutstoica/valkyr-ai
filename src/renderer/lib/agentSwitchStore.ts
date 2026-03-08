/**
 * Lightweight pub/sub for agent switching events.
 * Replaces window.dispatchEvent('valkyr:switch-agent') pattern.
 */

export type SwitchDirection = 'next' | 'prev';

type AgentSwitchListener = (direction: SwitchDirection) => void;

const listeners = new Set<AgentSwitchListener>();

export function onAgentSwitch(listener: AgentSwitchListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitAgentSwitch(direction: SwitchDirection): void {
  for (const listener of listeners) {
    listener(direction);
  }
}
