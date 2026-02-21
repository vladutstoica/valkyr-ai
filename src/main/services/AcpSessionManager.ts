import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
// ACP SDK is ESM-only — use type imports statically, runtime imports dynamically
import type {
  ClientSideConnection,
  Client,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from '@agentclientprotocol/sdk';
import { log } from '../lib/logger';
import {
  getProvider,
  type ProviderId,
} from '../../shared/providers/registry';
import { acpRegistryService } from './AcpRegistryService';
import { PROVIDER_TO_ACP_ID } from '../../shared/acpRegistry';

// Cached dynamic import for ESM-only ACP SDK
// Use indirect eval to prevent TypeScript from converting import() to require()
const dynamicImport = new Function('specifier', 'return import(specifier)') as
  (specifier: string) => Promise<typeof import('@agentclientprotocol/sdk')>;

let _acpSdk: typeof import('@agentclientprotocol/sdk') | null = null;
async function getAcpSdk() {
  if (!_acpSdk) {
    _acpSdk = await dynamicImport('@agentclientprotocol/sdk');
  }
  return _acpSdk;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AcpSessionStatus =
  | 'initializing'
  | 'ready'
  | 'submitted'
  | 'streaming'
  | 'error';

export type AcpUpdateEvent = {
  type: 'session_update';
  data: SessionNotification;
} | {
  type: 'permission_request';
  data: RequestPermissionRequest;
  toolCallId: string;
} | {
  type: 'status_change';
  status: AcpSessionStatus;
} | {
  type: 'session_error';
  error: string;
} | {
  type: 'prompt_complete';
  stopReason: string;
};

type AcpSession = {
  sessionKey: string;
  conversationId: string;
  providerId: ProviderId;
  cwd: string;
  status: AcpSessionStatus;
  connection: ClientSideConnection;
  childProcess: ChildProcess;
  acpSessionId: string | null;
  pendingPermissions: Map<string, {
    resolve: (resp: RequestPermissionResponse) => void;
    reject: (err: Error) => void;
    options: Array<{ optionId: string; kind: string; name: string }>;
  }>;
};

// ---------------------------------------------------------------------------
// Event buffering (mirrors PTY 16ms pattern from ptyIpc.ts)
// ---------------------------------------------------------------------------

const EVENT_FLUSH_MS = 16;

// ---------------------------------------------------------------------------
// AcpSessionManager — singleton service
// ---------------------------------------------------------------------------

export class AcpSessionManager {
  private sessions = new Map<string, AcpSession>();
  private finalizedSessions = new Set<string>();
  private eventBuffers = new Map<string, AcpUpdateEvent[]>();
  private eventTimers = new Map<string, NodeJS.Timeout>();

  // Callback for sending events to renderer — set by acpIpc.ts
  private eventSender: ((sessionKey: string, events: AcpUpdateEvent[]) => void) | null = null;

  setEventSender(sender: (sessionKey: string, events: AcpUpdateEvent[]) => void): void {
    this.eventSender = sender;
  }

  // -----------------------------------------------------------------------
  // Event buffering
  // -----------------------------------------------------------------------

  private bufferEvent(sessionKey: string, event: AcpUpdateEvent): void {
    const buf = this.eventBuffers.get(sessionKey) || [];
    buf.push(event);
    this.eventBuffers.set(sessionKey, buf);
    if (this.eventTimers.has(sessionKey)) return;
    const t = setTimeout(() => {
      this.eventTimers.delete(sessionKey);
      this.flushEvents(sessionKey);
    }, EVENT_FLUSH_MS);
    this.eventTimers.set(sessionKey, t);
  }

  private flushEvents(sessionKey: string): void {
    const buf = this.eventBuffers.get(sessionKey);
    if (!buf || buf.length === 0) return;
    this.eventBuffers.delete(sessionKey);
    this.eventSender?.(sessionKey, buf);
  }

  private clearEventBuffer(sessionKey: string): void {
    const t = this.eventTimers.get(sessionKey);
    if (t) {
      clearTimeout(t);
      this.eventTimers.delete(sessionKey);
    }
    this.eventBuffers.delete(sessionKey);
  }

  // -----------------------------------------------------------------------
  // Session lifecycle
  // -----------------------------------------------------------------------

  async createSession(
    conversationId: string,
    providerId: string,
    cwd: string,
    env?: Record<string, string>,
  ): Promise<{ success: boolean; sessionKey?: string; error?: string }> {
    const sessionKey = `${providerId}-acp-${conversationId}`;

    // Prevent duplicate sessions
    if (this.sessions.has(sessionKey)) {
      return { success: false, error: 'Session already exists' };
    }

    try {
      // Resolve ACP command: try registry first, then hardcoded acpSupport
      const acpId = PROVIDER_TO_ACP_ID[providerId] ?? providerId;
      const resolved = await acpRegistryService.resolveCommand(acpId);
      const provider = getProvider(providerId as any);

      const fallback = provider?.acpSupport
        ? { command: provider.acpSupport.command, args: provider.acpSupport.args ?? [], env: {} as Record<string, string> }
        : null;

      const acpCommand = resolved ?? fallback;
      if (!acpCommand) {
        return { success: false, error: 'no_acp_support' };
      }

      // S4: Scope environment variables per provider
      const scopedEnv: Record<string, string> = {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
        SHELL: process.env.SHELL || '',
        TERM: process.env.TERM || 'xterm-256color',
      };

      // Only pass provider-relevant env vars
      if (provider?.envVars) {
        for (const key of provider.envVars) {
          if (process.env[key]) {
            scopedEnv[key] = process.env[key]!;
          }
        }
      }

      // Merge ACP command env
      if (acpCommand.env) {
        Object.assign(scopedEnv, acpCommand.env);
      }

      // Merge caller-provided env (limited)
      if (env) {
        Object.assign(scopedEnv, env);
      }

      const { command, args = [] } = acpCommand;

      // Spawn the ACP subprocess
      const childProcess = spawn(command, args, {
        cwd,
        env: scopedEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Create a promise that rejects on spawn error (e.g. binary not found)
      const spawnError = new Promise<never>((_, reject) => {
        childProcess.on('error', (err) => reject(err));
      });

      if (!childProcess.stdin || !childProcess.stdout) {
        childProcess.kill();
        return { success: false, error: 'acp_unavailable' };
      }

      // Create ndjson stream from child stdio
      const stdoutStream = new ReadableStream<Uint8Array>({
        start(controller) {
          childProcess.stdout!.on('data', (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          childProcess.stdout!.on('end', () => {
            try { controller.close(); } catch { /* already closed */ }
          });
          childProcess.stdout!.on('error', (err) => {
            try { controller.error(err); } catch { /* already errored */ }
          });
        },
      });

      const stdinStream = new WritableStream<Uint8Array>({
        write(chunk) {
          return new Promise<void>((resolve, reject) => {
            if (childProcess.stdin!.destroyed) {
              reject(new Error('stdin destroyed'));
              return;
            }
            childProcess.stdin!.write(chunk, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        },
        close() {
          childProcess.stdin!.end();
        },
      });

      const acpSdk = await getAcpSdk();
      const stream = acpSdk.ndJsonStream(stdinStream, stdoutStream);

      const session: AcpSession = {
        sessionKey,
        conversationId,
        providerId: providerId as ProviderId,
        cwd,
        status: 'initializing',
        connection: null as unknown as ClientSideConnection,
        childProcess,
        acpSessionId: null,
        pendingPermissions: new Map(),
      };

      // Create the client-side connection
      const connection = new acpSdk.ClientSideConnection(
        (_agent) => this.createClient(sessionKey),
        stream,
      );

      session.connection = connection;
      this.sessions.set(sessionKey, session);

      // Subprocess crash detection
      childProcess.on('exit', (code, signal) => {
        if (this.finalizedSessions.has(sessionKey)) return;
        log.info(`ACP subprocess exited: ${sessionKey} code=${code} signal=${signal}`);
        this.setStatus(sessionKey, 'error');
        this.bufferEvent(sessionKey, {
          type: 'session_error',
          error: `Agent process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`,
        });
      });

      childProcess.stderr?.on('data', (chunk: Buffer) => {
        log.info(`ACP stderr [${sessionKey}]: ${chunk.toString().trim()}`);
      });

      // Connection close detection
      connection.closed.then(() => {
        if (this.finalizedSessions.has(sessionKey)) return;
        const s = this.sessions.get(sessionKey);
        if (s && s.status !== 'error') {
          this.setStatus(sessionKey, 'error');
          this.bufferEvent(sessionKey, {
            type: 'session_error',
            error: 'ACP connection closed unexpectedly',
          });
        }
      });

      // Initialize the ACP connection (race against spawn errors)
      const initResp = await Promise.race([
        connection.initialize({
          clientInfo: { name: 'Valkyr', version: '1.0.0' },
          protocolVersion: 1,
          clientCapabilities: {
            fs: {
              readTextFile: true,
              writeTextFile: true,
            },
          },
        }),
        spawnError,
      ]);

      log.info(`ACP initialized: ${sessionKey}, protocol v${initResp.protocolVersion}`);

      // Create a new session (race against spawn errors)
      const sessionResp = await Promise.race([
        connection.newSession({
          cwd,
          mcpServers: [],
        }),
        spawnError,
      ]);

      session.acpSessionId = sessionResp.sessionId;
      this.setStatus(sessionKey, 'ready');

      return { success: true, sessionKey };
    } catch (error: any) {
      // Cleanup on failure
      const session = this.sessions.get(sessionKey);
      if (session?.childProcess) {
        try { session.childProcess.kill(); } catch { /* ignore */ }
      }
      this.sessions.delete(sessionKey);
      log.error(`ACP session creation failed: ${sessionKey}`, error);
      // Spawn ENOENT or other system errors → acp_unavailable for PTY fallback
      const errorCode = error.code === 'ENOENT' ? 'acp_unavailable' : (error.message || 'acp_unavailable');
      return { success: false, error: errorCode };
    }
  }

  async sendPrompt(
    sessionKey: string,
    message: string,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (session.status !== 'ready') {
      return { success: false, error: `Cannot send prompt in status: ${session.status}` };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    this.setStatus(sessionKey, 'submitted');

    // Fire and forget — the prompt response comes async via the connection
    session.connection.prompt({
      sessionId: session.acpSessionId,
      prompt: [{ type: 'text', text: message }],
    }).then((resp) => {
      // Prompt turn completed
      this.bufferEvent(sessionKey, {
        type: 'prompt_complete',
        stopReason: (resp as any).stopReason || 'end_turn',
      });
      this.setStatus(sessionKey, 'ready');
    }).catch((err) => {
      log.error(`ACP prompt failed: ${sessionKey}`, err);
      this.setStatus(sessionKey, 'error');
      this.bufferEvent(sessionKey, {
        type: 'session_error',
        error: err.message || 'Prompt failed',
      });
    });

    return { success: true };
  }

  async approvePermission(
    sessionKey: string,
    toolCallId: string,
    approved: boolean,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // S3: Validate toolCallId format
    if (!toolCallId || typeof toolCallId !== 'string') {
      return { success: false, error: 'Invalid toolCallId' };
    }

    const pending = session.pendingPermissions.get(toolCallId);
    if (!pending) {
      return { success: false, error: 'No pending permission for this toolCallId' };
    }

    session.pendingPermissions.delete(toolCallId);
    if (approved) {
      // Find the first 'allow_once' or 'allow_always' option
      const allowOption = pending.options.find(
        (o) => o.kind === 'allow_once' || o.kind === 'allow_always'
      );
      pending.resolve({
        outcome: {
          outcome: 'selected',
          optionId: allowOption?.optionId || pending.options[0]?.optionId || 'allow',
        },
      });
    } else {
      pending.resolve({
        outcome: { outcome: 'cancelled' },
      });
    }

    return { success: true };
  }

  async cancelSession(
    sessionKey: string,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    try {
      await session.connection.cancel({
        sessionId: session.acpSessionId,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setMode(
    sessionKey: string,
    mode: string,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    try {
      await session.connection.setSessionMode({
        sessionId: session.acpSessionId,
        modeId: mode,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  killSession(sessionKey: string): void {
    if (this.finalizedSessions.has(sessionKey)) return;
    this.finalizedSessions.add(sessionKey);

    const session = this.sessions.get(sessionKey);
    if (!session) return;

    // Reject any pending permissions
    for (const [, pending] of session.pendingPermissions) {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
    }
    session.pendingPermissions.clear();

    // Clear event buffer
    this.clearEventBuffer(sessionKey);

    // Kill the subprocess
    try {
      if (!session.childProcess.killed) {
        session.childProcess.kill();
      }
    } catch {
      // already dead
    }

    this.sessions.delete(sessionKey);
    log.info(`ACP session killed: ${sessionKey}`);
  }

  getStatus(sessionKey: string): AcpSessionStatus | null {
    return this.sessions.get(sessionKey)?.status || null;
  }

  hasSession(sessionKey: string): boolean {
    return this.sessions.has(sessionKey);
  }

  // -----------------------------------------------------------------------
  // Internal: Client implementation for ACP
  // -----------------------------------------------------------------------

  private createClient(sessionKey: string): Client {
    return {
      sessionUpdate: async (params: SessionNotification) => {
        const session = this.sessions.get(sessionKey);
        if (!session) return;

        // Transition to streaming on first content
        if (session.status === 'submitted') {
          this.setStatus(sessionKey, 'streaming');
        }

        this.bufferEvent(sessionKey, {
          type: 'session_update',
          data: params,
        });
      },

      requestPermission: async (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
        const session = this.sessions.get(sessionKey);
        if (!session) {
          return { outcome: { outcome: 'cancelled' } };
        }

        const toolCallId = params.toolCall?.toolCallId || `perm-${Date.now()}`;
        const options = (params.options || []).map((o) => ({
          optionId: o.optionId,
          kind: o.kind,
          name: o.name,
        }));

        return new Promise<RequestPermissionResponse>((resolve, reject) => {
          session.pendingPermissions.set(toolCallId, { resolve, reject, options });

          this.bufferEvent(sessionKey, {
            type: 'permission_request',
            data: params,
            toolCallId,
          });
        });
      },

      readTextFile: async (params: ReadTextFileRequest): Promise<ReadTextFileResponse> => {
        const session = this.sessions.get(sessionKey);
        if (!session) {
          throw new Error('Session not found');
        }

        // S5: Validate file path is within worktree
        const resolved = path.resolve(session.cwd, params.path);
        if (!resolved.startsWith(session.cwd)) {
          throw new Error(`Path traversal blocked: ${params.path}`);
        }

        const fs = await import('fs/promises');
        const content = await fs.readFile(resolved, 'utf-8');
        return { content };
      },

      writeTextFile: async (params: WriteTextFileRequest): Promise<WriteTextFileResponse> => {
        const session = this.sessions.get(sessionKey);
        if (!session) {
          throw new Error('Session not found');
        }

        // S5: Validate file path is within worktree
        const resolved = path.resolve(session.cwd, params.path);
        if (!resolved.startsWith(session.cwd)) {
          throw new Error(`Path traversal blocked: ${params.path}`);
        }

        const fs = await import('fs/promises');
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, params.content, 'utf-8');
        return {};
      },
    };
  }

  // -----------------------------------------------------------------------
  // Internal: status management
  // -----------------------------------------------------------------------

  private setStatus(sessionKey: string, status: AcpSessionStatus): void {
    const session = this.sessions.get(sessionKey);
    if (!session) return;
    if (session.status === status) return;

    session.status = status;
    this.bufferEvent(sessionKey, {
      type: 'status_change',
      status,
    });
  }
}

export const acpSessionManager = new AcpSessionManager();
