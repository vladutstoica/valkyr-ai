import * as path from 'path';
import * as fsp from 'fs/promises';
import type {
  Client,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from '@agentclientprotocol/sdk';
import { log } from '../../lib/logger';
import type { AcpSession, AcpUpdateEvent } from './acpTypes';
import { buildTerminalCallbacks, type SessionResolver } from './AcpTerminalManager';

export interface ClientFactoryDeps {
  /** Resolve an ACP session by its acpSessionId (or connectionKey fallback). */
  resolveSession: SessionResolver['resolveSession'];
  /** Look up a session directly by sessionKey. */
  getSession: (sessionKey: string) => AcpSession | undefined;
  /** Get the history buffer for a session (active during loadSession replay). */
  getHistoryBuffer: (sessionKey: string) => AcpUpdateEvent[] | undefined;
  /** Buffer an event for IPC delivery. */
  bufferEvent: (sessionKey: string, event: AcpUpdateEvent) => void;
  /** Transition a session's status. */
  setStatus: (sessionKey: string, status: AcpSession['status']) => void;
}

/**
 * AcpClientFactory — builds the connection-scoped Client objects that the ACP
 * SDK calls back into for session events, permission requests, and file I/O.
 *
 * The `resolveSession` helper eliminates the 9x-duplicated session-routing
 * boilerplate that existed in the original monolithic implementation.
 */
export class AcpClientFactory {
  constructor(private readonly deps: ClientFactoryDeps) {}

  createForConnection(connectionKey: string): Client {
    const resolver: SessionResolver = {
      resolveSession: (acpSessionId, connKey) => this.deps.resolveSession(acpSessionId, connKey),
    };

    const terminalCallbacks = buildTerminalCallbacks(connectionKey, resolver);

    return {
      sessionUpdate: async (params: SessionNotification) => {
        const r = this.resolveOrLog((params as any).sessionId, connectionKey, 'sessionUpdate');
        if (!r) return;
        const { sessionKey, session } = r;

        const event: AcpUpdateEvent = { type: 'session_update', data: params };

        // During loadSession, capture history events instead of forwarding to IPC
        const historyBuf = this.deps.getHistoryBuffer(sessionKey);
        if (historyBuf) {
          historyBuf.push(event);
          return;
        }

        // Transition to streaming on first content
        if (session.status === 'submitted') {
          this.deps.setStatus(sessionKey, 'streaming');
        }

        this.deps.bufferEvent(sessionKey, event);
      },

      requestPermission: async (
        params: RequestPermissionRequest
      ): Promise<RequestPermissionResponse> => {
        const r = this.resolveOrLog((params as any).sessionId, connectionKey, 'requestPermission');
        if (!r) return { outcome: { outcome: 'cancelled' } };
        const { sessionKey, session } = r;

        const toolCallId = params.toolCall?.toolCallId || `perm-${Date.now()}`;
        const options = (params.options || []).map((o) => ({
          optionId: o.optionId,
          kind: o.kind,
          name: o.name,
        }));

        return new Promise<RequestPermissionResponse>((resolve, reject) => {
          session.pendingPermissions.set(toolCallId, { resolve, reject, options });

          this.deps.bufferEvent(sessionKey, {
            type: 'permission_request',
            data: params,
            toolCallId,
          });
        });
      },

      readTextFile: async (params: ReadTextFileRequest): Promise<ReadTextFileResponse> => {
        const r = this.resolveOrThrow((params as any).sessionId, connectionKey);
        const { session } = r;

        const resolved = path.resolve(session.cwd, params.path);
        if (!resolved.startsWith(session.cwd)) {
          throw new Error(`Path traversal blocked: ${params.path}`);
        }

        let content = await fsp.readFile(resolved, 'utf-8');

        const line = (params as any).line as number | undefined | null;
        const limit = (params as any).limit as number | undefined | null;
        if (line != null || limit != null) {
          const lines = content.split('\n');
          const start = Math.max(0, (line ?? 1) - 1);
          const sliced = limit != null ? lines.slice(start, start + limit) : lines.slice(start);
          content = sliced.join('\n');
        }

        return { content };
      },

      writeTextFile: async (params: WriteTextFileRequest): Promise<WriteTextFileResponse> => {
        const r = this.resolveOrThrow((params as any).sessionId, connectionKey);
        const { session } = r;

        const resolved = path.resolve(session.cwd, params.path);
        if (!resolved.startsWith(session.cwd)) {
          throw new Error(`Path traversal blocked: ${params.path}`);
        }

        await fsp.mkdir(path.dirname(resolved), { recursive: true });
        await fsp.writeFile(resolved, params.content, 'utf-8');
        return {};
      },

      ...terminalCallbacks,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — eliminate the repeated session-routing pattern
  // ---------------------------------------------------------------------------

  private resolveOrLog(
    acpSessionId: string | undefined,
    connectionKey: string,
    callbackName: string
  ): { sessionKey: string; session: AcpSession } | null {
    const r = this.deps.resolveSession(acpSessionId, connectionKey);
    if (!r) {
      log.debug(
        `[ConnPool] Unroutable ${callbackName} for acpSessionId=${acpSessionId} on ${connectionKey}`
      );
      return null;
    }
    return r;
  }

  private resolveOrThrow(
    acpSessionId: string | undefined,
    connectionKey: string
  ): { sessionKey: string; session: AcpSession } {
    const r = this.deps.resolveSession(acpSessionId, connectionKey);
    if (!r) throw new Error('Session not found');
    return r;
  }
}
