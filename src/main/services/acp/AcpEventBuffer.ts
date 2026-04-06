import { log } from '../../lib/logger';
import type { AcpUpdateEvent } from './acpTypes';
import { EVENT_FLUSH_MS } from './acpTypes';

/**
 * AcpEventBuffer — batches ACP events and flushes them on a 16ms timer,
 * mirroring the PTY pattern from ptyIpc.ts.
 */
export class AcpEventBuffer {
  private eventBuffers = new Map<string, AcpUpdateEvent[]>();
  private eventTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly onFlush: (sessionKey: string, events: AcpUpdateEvent[]) => void) {}

  buffer(sessionKey: string, event: AcpUpdateEvent): void {
    const buf = this.eventBuffers.get(sessionKey) ?? [];
    buf.push(event);
    this.eventBuffers.set(sessionKey, buf);
    log.debug('[AcpEventBuffer] Event buffered', {
      sessionKey,
      eventType: event.type,
      bufferSize: buf.length,
    });

    if (this.eventTimers.has(sessionKey)) return;
    const t = setTimeout(() => {
      this.eventTimers.delete(sessionKey);
      this.flush(sessionKey);
    }, EVENT_FLUSH_MS);
    this.eventTimers.set(sessionKey, t);
  }

  flush(sessionKey: string): void {
    const buf = this.eventBuffers.get(sessionKey);
    if (!buf || buf.length === 0) return;
    log.debug('[AcpEventBuffer] Flushing events', { sessionKey, count: buf.length });
    this.eventBuffers.delete(sessionKey);
    this.onFlush(sessionKey, buf);
  }

  clear(sessionKey: string): void {
    const t = this.eventTimers.get(sessionKey);
    if (t) {
      clearTimeout(t);
      this.eventTimers.delete(sessionKey);
    }
    this.eventBuffers.delete(sessionKey);
  }
}
