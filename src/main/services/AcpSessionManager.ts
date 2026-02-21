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
import { databaseService } from './DatabaseService';

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
  type: 'prompt_error';
  error: string;
} | {
  type: 'prompt_complete';
  stopReason: string;
};

export type AcpSessionMode = {
  id: string;
  name: string;
  description?: string;
};

export type AcpSessionModel = {
  id: string;
  name: string;
  description?: string;
};

export type AcpSessionModes = {
  availableModes: AcpSessionMode[];
  currentModeId: string;
} | null;

export type AcpSessionModels = {
  availableModels: AcpSessionModel[];
  currentModelId: string;
} | null;

type AcpSession = {
  sessionKey: string;
  conversationId: string;
  providerId: ProviderId;
  cwd: string;
  status: AcpSessionStatus;
  connection: ClientSideConnection;
  childProcess: ChildProcess;
  acpSessionId: string | null;
  modes: AcpSessionModes;
  models: AcpSessionModels;
  pendingPermissions: Map<string, {
    resolve: (resp: RequestPermissionResponse) => void;
    reject: (err: Error) => void;
    options: Array<{ optionId: string; kind: string; name: string }>;
  }>;
};

type SessionCreateResult = {
  success: boolean;
  sessionKey?: string;
  acpSessionId?: string;
  modes?: AcpSessionModes;
  models?: AcpSessionModels;
  error?: string;
};

// Internal result from spawnAndInitialize
type SpawnInitResult = {
  session: AcpSession;
  connection: ClientSideConnection;
  initResp: any;
  spawnError: Promise<never>;
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

  /**
   * Spawn the ACP subprocess, create the connection, and initialize it.
   * Shared between createSession and resumeSession.
   */
  private async spawnAndInitialize(
    sessionKey: string,
    conversationId: string,
    providerId: string,
    cwd: string,
    env?: Record<string, string>,
  ): Promise<SpawnInitResult> {
    // Resolve ACP command: try registry first, then hardcoded acpSupport
    const acpId = PROVIDER_TO_ACP_ID[providerId] ?? providerId;
    const resolved = await acpRegistryService.resolveCommand(acpId);
    const provider = getProvider(providerId as any);

    const fallback = provider?.acpSupport
      ? { command: provider.acpSupport.command, args: provider.acpSupport.args ?? [], env: {} as Record<string, string> }
      : null;

    const acpCommand = resolved ?? fallback;
    if (!acpCommand) {
      throw Object.assign(new Error('no_acp_support'), { code: 'NO_ACP_SUPPORT' });
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
      throw Object.assign(new Error('acp_unavailable'), { code: 'ACP_UNAVAILABLE' });
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
      modes: null,
      models: null,
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

    return { session, connection, initResp, spawnError };
  }

  async createSession(
    conversationId: string,
    providerId: string,
    cwd: string,
    env?: Record<string, string>,
    resumeAcpSessionId?: string,
  ): Promise<SessionCreateResult> {
    const sessionKey = `${providerId}-acp-${conversationId}`;

    // If a stale session exists (e.g. after Ctrl+R reload), kill it first
    if (this.sessions.has(sessionKey)) {
      log.info(`Killing stale ACP session before recreate: ${sessionKey}`);
      this.killSession(sessionKey);
    }
    // Clear finalized flag so crash/close handlers work for the new session
    this.finalizedSessions.delete(sessionKey);

    try {
      const { session, connection, initResp, spawnError } =
        await this.spawnAndInitialize(sessionKey, conversationId, providerId, cwd, env);

      let acpSessionId: string;
      let sessionResp: any;

      // Look up stored acpSessionId from DB if not provided
      const storedSessionId = resumeAcpSessionId
        ?? await databaseService.getConversationAcpSessionId(conversationId).catch(() => null);

      // Try to resume an existing session if we have a stored acpSessionId
      if (storedSessionId) {
        const result = await this.tryResumeOrCreate(
          connection, spawnError, storedSessionId, cwd, initResp,
        );
        acpSessionId = result.sessionId;
        sessionResp = result.sessionResp;
      } else {
        // Create a brand new session
        sessionResp = await Promise.race([
          connection.newSession({ cwd, mcpServers: [] }),
          spawnError,
        ]);
        acpSessionId = sessionResp.sessionId;
      }

      // Capture modes/models from session response
      const modes: AcpSessionModes = sessionResp?.modes
        ? { availableModes: sessionResp.modes.availableModes || [], currentModeId: sessionResp.modes.currentModeId || '' }
        : null;
      const models: AcpSessionModels = sessionResp?.models
        ? {
            availableModels: (sessionResp.models.availableModels || []).map((m: any) => ({
              id: m.modelId ?? m.id,
              name: m.name,
              description: m.description,
            })),
            currentModelId: sessionResp.models.currentModelId || '',
          }
        : null;

      session.acpSessionId = acpSessionId;
      session.modes = modes;
      session.models = models;
      this.setStatus(sessionKey, 'ready');

      // Persist the acpSessionId to DB for future resume
      databaseService.updateConversationAcpSessionId(conversationId, acpSessionId).catch((err) => {
        log.error(`Failed to persist acpSessionId for ${conversationId}`, err);
      });

      return { success: true, sessionKey, acpSessionId, modes, models };
    } catch (error: any) {
      // Cleanup on failure
      const session = this.sessions.get(sessionKey);
      if (session?.childProcess) {
        try { session.childProcess.kill(); } catch { /* ignore */ }
      }
      this.sessions.delete(sessionKey);
      log.error(`ACP session creation failed: ${sessionKey}`, error);

      const errorCode =
        error.code === 'NO_ACP_SUPPORT' ? 'no_acp_support'
        : error.code === 'ENOENT' ? 'acp_unavailable'
        : (error.message || 'acp_unavailable');
      return { success: false, error: errorCode };
    }
  }

  /**
   * Try loadSession first, then fall back to newSession if unsupported or fails.
   */
  private async tryResumeOrCreate(
    connection: ClientSideConnection,
    spawnError: Promise<never>,
    acpSessionId: string,
    cwd: string,
    initResp: any,
  ): Promise<{ sessionId: string; sessionResp: any }> {
    const supportsLoadSession = initResp.agentCapabilities?.loadSession === true;

    if (supportsLoadSession) {
      try {
        log.info(`Attempting loadSession with sessionId=${acpSessionId}`);
        const loadResp = await Promise.race([
          connection.loadSession({ sessionId: acpSessionId, cwd, mcpServers: [] }),
          spawnError,
        ]);
        log.info(`loadSession succeeded for sessionId=${acpSessionId}`);
        return { sessionId: acpSessionId, sessionResp: loadResp };
      } catch (loadErr: any) {
        log.info(`loadSession failed for sessionId=${acpSessionId}: ${loadErr.message}, falling back to newSession`);
      }
    } else {
      log.info(`Agent does not support loadSession, creating new session`);
    }

    // Fallback: create a new session
    const sessionResp = await Promise.race([
      connection.newSession({ cwd, mcpServers: [] }),
      spawnError,
    ]);
    return { sessionId: sessionResp.sessionId, sessionResp };
  }

  async sendPrompt(
    sessionKey: string,
    message: string,
    files?: Array<{ url: string; mediaType: string; filename?: string }>,
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

    // Build prompt content blocks
    const promptBlocks: Array<any> = [];

    // Add file content blocks (images as ImageContent, others as EmbeddedResource)
    if (files && files.length > 0) {
      for (const file of files) {
        // Extract base64 data from data URL (format: data:<mediaType>;base64,<data>)
        const dataUrlMatch = file.url.match(/^data:([^;]+);base64,(.+)$/);
        if (!dataUrlMatch) continue;

        const base64Data = dataUrlMatch[2];

        if (file.mediaType.startsWith('image/')) {
          promptBlocks.push({
            type: 'image',
            data: base64Data,
            mimeType: file.mediaType,
          });
        } else {
          // Non-image files as embedded resources
          promptBlocks.push({
            type: 'resource',
            resource: {
              uri: file.filename ? `file:///${file.filename}` : 'file:///attachment',
              mimeType: file.mediaType,
              blob: base64Data,
            },
          });
        }
      }
    }

    // Add text content block
    if (message) {
      promptBlocks.push({ type: 'text', text: message });
    }

    // Fire and forget — the prompt response comes async via the connection
    session.connection.prompt({
      sessionId: session.acpSessionId,
      prompt: promptBlocks,
    }).then((resp) => {
      // Prompt turn completed — only transition if still streaming/submitted
      // (cancel may have already set status to 'ready')
      const s = this.sessions.get(sessionKey);
      if (s && (s.status === 'streaming' || s.status === 'submitted')) {
        this.bufferEvent(sessionKey, {
          type: 'prompt_complete',
          stopReason: (resp as any).stopReason || 'end_turn',
        });
        this.setStatus(sessionKey, 'ready');
      }
    }).catch((err) => {
      log.error(`ACP prompt failed: ${sessionKey}`, err);
      const s = this.sessions.get(sessionKey);
      // If already reset to 'ready' by cancel, don't transition
      if (s && s.status !== 'ready') {
        // Emit as prompt_error (recoverable) so the stream closes cleanly
        // and the user can keep sending messages.
        this.bufferEvent(sessionKey, {
          type: 'prompt_error',
          error: err.message || 'Prompt failed',
        });
        this.setStatus(sessionKey, 'ready');
      }
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
      // Reset status to ready so user can send new prompts
      this.setStatus(sessionKey, 'ready');
      return { success: true };
    } catch (err: any) {
      // Even if cancel fails, reset to ready to unblock the user
      if (session.status === 'streaming' || session.status === 'submitted') {
        this.setStatus(sessionKey, 'ready');
      }
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

  async setConfigOption(
    sessionKey: string,
    optionId: string,
    value: string,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    try {
      await session.connection.setSessionConfigOption({
        sessionId: session.acpSessionId,
        configId: optionId,
        value,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setModel(
    sessionKey: string,
    modelId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    try {
      await (session.connection as any).unstable_setSessionModel({
        sessionId: session.acpSessionId,
        modelId,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async listSessions(
    sessionKey: string,
  ): Promise<{ success: boolean; sessions?: any[]; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      const resp = await (session.connection as any).unstable_listSessions({});
      return { success: true, sessions: resp.sessions || [] };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async forkSession(
    sessionKey: string,
  ): Promise<{ success: boolean; newSessionId?: string; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    try {
      const resp = await (session.connection as any).unstable_forkSession({
        sessionId: session.acpSessionId,
      });
      return { success: true, newSessionId: resp.sessionId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async extMethod(
    sessionKey: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      const resp = await session.connection.extMethod(method, params);
      return { success: true, result: resp };
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
