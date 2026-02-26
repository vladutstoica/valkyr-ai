import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fsp from 'fs/promises';
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
import { getProvider, type ProviderId } from '../../shared/providers/registry';
import { acpRegistryService } from './AcpRegistryService';
import { PROVIDER_TO_ACP_ID } from '../../shared/acpRegistry';
import { databaseService } from './DatabaseService';

// Cached dynamic import for ESM-only ACP SDK
// Use indirect eval to prevent TypeScript from converting import() to require()
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<typeof import('@agentclientprotocol/sdk')>;

let _acpSdk: typeof import('@agentclientprotocol/sdk') | null = null;
async function getAcpSdk() {
  if (!_acpSdk) {
    _acpSdk = await dynamicImport('@agentclientprotocol/sdk');
  }
  return _acpSdk;
}

/** Pre-warm the ACP SDK import so the first session doesn't pay the ESM load cost. */
export function warmAcpSdk(): void {
  getAcpSdk().catch(() => {
    /* best-effort */
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AcpSessionStatus = 'initializing' | 'ready' | 'submitted' | 'streaming' | 'error';

export type AcpUpdateEvent =
  | {
      type: 'session_update';
      data: SessionNotification;
    }
  | {
      type: 'permission_request';
      data: RequestPermissionRequest;
      toolCallId: string;
    }
  | {
      type: 'status_change';
      status: AcpSessionStatus;
    }
  | {
      type: 'session_error';
      error: string;
    }
  | {
      type: 'prompt_error';
      error: string;
    }
  | {
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

// ---------------------------------------------------------------------------
// AcpConnection — owns one subprocess + ClientSideConnection, shared by N sessions
// ---------------------------------------------------------------------------

type AcpConnection = {
  connectionKey: string;
  providerId: string;
  cwd: string;
  connection: ClientSideConnection;
  childProcess: ChildProcess;
  initResp: any;
  spawnError: Promise<never>;
  refCount: number;
  idleTimer: NodeJS.Timeout | null;
  dead: boolean;
};

// ---------------------------------------------------------------------------
// AcpSession — one ACP session on a shared (or dedicated) connection
// ---------------------------------------------------------------------------

type AcpSession = {
  sessionKey: string;
  conversationId: string;
  providerId: ProviderId;
  cwd: string;
  status: AcpSessionStatus;
  connectionKey: string; // Key into connections pool
  acpSessionId: string | null;
  modes: AcpSessionModes;
  models: AcpSessionModels;
  pendingPermissions: Map<
    string,
    {
      resolve: (resp: RequestPermissionResponse) => void;
      reject: (err: Error) => void;
      options: Array<{ optionId: string; kind: string; name: string }>;
    }
  >;
  /** Queued prompt to send when session becomes ready (avoids status desync errors). */
  pendingPrompt: {
    message: string;
    files?: Array<{ url: string; mediaType: string; filename?: string }>;
  } | null;
};

type SessionCreateResult = {
  success: boolean;
  sessionKey?: string;
  acpSessionId?: string;
  modes?: AcpSessionModes;
  models?: AcpSessionModels;
  historyEvents?: AcpUpdateEvent[];
  resumed?: boolean;
  error?: string;
};

// ---------------------------------------------------------------------------
// Event buffering (mirrors PTY 16ms pattern from ptyIpc.ts)
// ---------------------------------------------------------------------------

const EVENT_FLUSH_MS = 16;

/** Idle timeout before killing an unused connection (ms). */
const CONNECTION_IDLE_MS = 60_000;

// ---------------------------------------------------------------------------
// AcpSessionManager — singleton service
// ---------------------------------------------------------------------------

export class AcpSessionManager {
  private sessions = new Map<string, AcpSession>();
  private finalizedSessions = new Set<string>();
  private detachedSessions = new Set<string>(); // Sessions whose renderer has navigated away
  private eventBuffers = new Map<string, AcpUpdateEvent[]>();
  private eventTimers = new Map<string, NodeJS.Timeout>();
  /** Collects session_update events during loadSession so they can be returned to the renderer. */
  private historyBuffers = new Map<string, AcpUpdateEvent[]>();

  // Connection pool
  private connections = new Map<string, AcpConnection>();
  /** In-flight connection creation promises for deduplication. */
  private connectionPromises = new Map<string, Promise<AcpConnection>>();
  /** Reverse map: acpSessionId → sessionKey for event routing on shared connections. */
  private acpSessionIdToSessionKey = new Map<string, string>();

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
    log.debug('[AcpSessionManager] Event buffered', {
      sessionKey,
      eventType: event.type,
      bufferSize: buf.length,
    });
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
    log.debug('[AcpSessionManager] Flushing events', { sessionKey, count: buf.length });
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
  // Connection pool
  // -----------------------------------------------------------------------

  /**
   * Get or create a shared ACP connection for the given (providerId, cwd) pair.
   * Uses promise-based deduplication to prevent concurrent spawns for the same key.
   */
  private async getOrCreateConnection(
    providerId: string,
    cwd: string,
    env?: Record<string, string>
  ): Promise<AcpConnection> {
    const connectionKey = `${providerId}::${cwd}`;

    // Return existing healthy connection
    const existing = this.connections.get(connectionKey);
    if (existing && !existing.dead) {
      // Cancel idle timer — a new session is claiming this connection
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer);
        existing.idleTimer = null;
      }
      existing.refCount++;
      log.info(`[ConnPool] Reusing connection ${connectionKey} (refCount=${existing.refCount})`);
      return existing;
    }

    // Piggyback on in-flight creation (prevents double-spawn race)
    const pending = this.connectionPromises.get(connectionKey);
    if (pending) {
      log.info(`[ConnPool] Waiting on in-flight connection for ${connectionKey}`);
      const conn = await pending;
      conn.refCount++;
      return conn;
    }

    // Spawn a new connection
    const promise = this.spawnConnection(connectionKey, providerId, cwd, env);
    this.connectionPromises.set(connectionKey, promise);

    try {
      const conn = await promise;
      this.connections.set(connectionKey, conn);
      conn.refCount = 1;
      log.info(`[ConnPool] Created new connection ${connectionKey}`);
      return conn;
    } catch (err) {
      // Remove dead connection entry if spawn failed
      this.connections.delete(connectionKey);
      throw err;
    } finally {
      this.connectionPromises.delete(connectionKey);
    }
  }

  /**
   * Spawn subprocess, create ClientSideConnection, and initialize the ACP handshake.
   */
  private async spawnConnection(
    connectionKey: string,
    providerId: string,
    cwd: string,
    env?: Record<string, string>
  ): Promise<AcpConnection> {
    const t0 = performance.now();
    const sdkPromise = getAcpSdk();

    // Resolve ACP command: try registry first, then hardcoded acpSupport
    const acpId = PROVIDER_TO_ACP_ID[providerId] ?? providerId;
    const resolved = await acpRegistryService.resolveCommand(acpId);
    const tResolve = performance.now();
    const provider = getProvider(providerId as any);

    const fallback = provider?.acpSupport
      ? {
          command: provider.acpSupport.command,
          args: provider.acpSupport.args ?? [],
          env: {} as Record<string, string>,
        }
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

    if (provider?.envVars) {
      for (const key of provider.envVars) {
        if (process.env[key]) {
          scopedEnv[key] = process.env[key]!;
        }
      }
    }

    if (acpCommand.env) {
      Object.assign(scopedEnv, acpCommand.env);
    }

    if (env) {
      Object.assign(scopedEnv, env);
    }

    const { command, args = [] } = acpCommand;

    log.debug('[AcpSessionManager] Spawning ACP process', { connectionKey, command, cwd });
    const tPreSpawn = performance.now();
    const childProcess = spawn(command, args, {
      cwd,
      env: scopedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const tPostSpawn = performance.now();

    const spawnError = new Promise<never>((_, reject) => {
      childProcess.on('error', (err) => reject(err));
    });

    if (!childProcess.stdin || !childProcess.stdout) {
      childProcess.kill();
      throw Object.assign(new Error('acp_unavailable'), { code: 'ACP_UNAVAILABLE' });
    }

    const stdoutStream = new ReadableStream<Uint8Array>({
      start(controller) {
        childProcess.stdout!.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        childProcess.stdout!.on('end', () => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
        childProcess.stdout!.on('error', (err) => {
          try {
            controller.error(err);
          } catch {
            /* already errored */
          }
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

    const acpSdk = await sdkPromise;
    const tSdk = performance.now();
    const stream = acpSdk.ndJsonStream(stdinStream, stdoutStream);

    // Create connection-scoped client that routes by sessionId
    const connection = new acpSdk.ClientSideConnection(
      (_agent) => this.createConnectionScopedClient(connectionKey),
      stream
    );

    const conn: AcpConnection = {
      connectionKey,
      providerId,
      cwd,
      connection,
      childProcess,
      initResp: null,
      spawnError,
      refCount: 0,
      idleTimer: null,
      dead: false,
    };

    // Subprocess crash detection — notify ALL sessions on this connection
    childProcess.on('exit', (code, signal) => {
      if (conn.dead) return;
      log.info(`[ConnPool] Subprocess exited: ${connectionKey} code=${code} signal=${signal}`);
      this.handleConnectionDeath(
        connectionKey,
        `Agent process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`
      );
    });

    childProcess.stderr?.on('data', (chunk: Buffer) => {
      log.info(`ACP stderr [${connectionKey}]: ${chunk.toString().trim()}`);
    });

    connection.closed.then(() => {
      if (conn.dead) return;
      log.info(`[ConnPool] Connection closed: ${connectionKey}`);
      this.handleConnectionDeath(connectionKey, 'ACP connection closed unexpectedly');
    });

    // Initialize the ACP connection
    const tPreInit = performance.now();
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
    const tPostInit = performance.now();

    conn.initResp = initResp;

    log.info(
      `[PERF spawnConnection] resolveCmd=${(tResolve - t0).toFixed(0)}ms spawn=${(tPostSpawn - tPreSpawn).toFixed(0)}ms sdkAwait=${(tSdk - tPostSpawn).toFixed(0)}ms initialize=${(tPostInit - tPreInit).toFixed(0)}ms total=${(tPostInit - t0).toFixed(0)}ms cmd=${command}`
    );
    log.info(
      `[RESUME CHECKPOINT] Agent capabilities: loadSession=${initResp.agentCapabilities?.loadSession}, protocolVersion=${initResp.protocolVersion}`
    );

    return conn;
  }

  /**
   * Handle the death of a shared connection — notify all sessions using it.
   */
  private handleConnectionDeath(connectionKey: string, errorMessage: string): void {
    const conn = this.connections.get(connectionKey);
    if (!conn || conn.dead) return;
    conn.dead = true;

    if (conn.idleTimer) {
      clearTimeout(conn.idleTimer);
      conn.idleTimer = null;
    }

    // Find all sessions on this connection and notify them
    for (const [sessionKey, session] of this.sessions) {
      if (session.connectionKey !== connectionKey) continue;
      if (this.finalizedSessions.has(sessionKey)) continue;

      if (this.detachedSessions.has(sessionKey)) {
        log.info(`[ConnPool] Connection died while session detached: ${sessionKey}`);
        this.finalizedSessions.add(sessionKey);
        this.sessions.delete(sessionKey);
        continue;
      }

      this.setStatus(sessionKey, 'error');
      this.bufferEvent(sessionKey, {
        type: 'session_error',
        error: errorMessage,
      });
    }

    // Clean up the connection from the pool
    this.connections.delete(connectionKey);
    try {
      if (!conn.childProcess.killed) {
        conn.childProcess.kill();
      }
    } catch {
      /* already dead */
    }
  }

  /**
   * Release a session's reference to a connection.
   * Starts idle timer when refCount drops to 0.
   */
  private releaseConnection(connectionKey: string): void {
    const conn = this.connections.get(connectionKey);
    if (!conn || conn.dead) return;

    conn.refCount = Math.max(0, conn.refCount - 1);
    log.info(`[ConnPool] Released connection ${connectionKey} (refCount=${conn.refCount})`);

    if (conn.refCount <= 0 && !conn.idleTimer) {
      conn.idleTimer = setTimeout(() => {
        log.info(`[ConnPool] Idle timeout — killing connection ${connectionKey}`);
        this.destroyConnection(connectionKey);
      }, CONNECTION_IDLE_MS);
    }
  }

  /**
   * Force-destroy a connection and all its sessions.
   */
  private destroyConnection(connectionKey: string): void {
    const conn = this.connections.get(connectionKey);
    if (!conn) return;

    if (conn.idleTimer) {
      clearTimeout(conn.idleTimer);
      conn.idleTimer = null;
    }

    conn.dead = true;
    this.connections.delete(connectionKey);

    // Kill all sessions on this connection
    for (const [sessionKey, session] of this.sessions) {
      if (session.connectionKey === connectionKey) {
        this.finalizedSessions.add(sessionKey);
        // Clean up reverse map
        if (session.acpSessionId) {
          this.acpSessionIdToSessionKey.delete(session.acpSessionId);
        }
        this.clearEventBuffer(sessionKey);
        this.sessions.delete(sessionKey);
      }
    }

    try {
      if (!conn.childProcess.killed) {
        conn.childProcess.kill();
      }
    } catch {
      /* already dead */
    }

    log.info(`[ConnPool] Destroyed connection ${connectionKey}`);
  }

  // -----------------------------------------------------------------------
  // Session lifecycle
  // -----------------------------------------------------------------------

  async createSession(
    conversationId: string,
    providerId: string,
    cwd: string,
    env?: Record<string, string>,
    resumeAcpSessionId?: string,
    mcpServers?: any[]
  ): Promise<SessionCreateResult> {
    const sessionKey = `${providerId}-acp-${conversationId}`;

    // Reuse healthy existing session (e.g. when switching back to a task)
    const existing = this.sessions.get(sessionKey);
    if (existing && !this.finalizedSessions.has(sessionKey) && existing.status !== 'error') {
      log.info(`Reusing existing ACP session: ${sessionKey}`);
      return {
        success: true,
        sessionKey,
        acpSessionId: existing.acpSessionId ?? undefined,
        modes: existing.modes,
        models: existing.models,
      };
    }

    // If a stale/errored session exists (e.g. after Ctrl+R reload), kill it first
    if (this.sessions.has(sessionKey)) {
      log.info(`Killing stale ACP session before recreate: ${sessionKey}`);
      this.killSession(sessionKey);
    }
    // Clear finalized flag so crash/close handlers work for the new session
    this.finalizedSessions.delete(sessionKey);

    // Determine whether to use connection pooling
    const provider = getProvider(providerId as any);
    const usePool = provider?.acpMultiSession === true;

    try {
      const tCreate0 = performance.now();

      // Get or create a connection (pooled or dedicated)
      let conn: AcpConnection;
      let storedSessionId: string | null;

      if (usePool) {
        // Pooled path: shared connection for (providerId, cwd)
        [conn, storedSessionId] = await Promise.all([
          this.getOrCreateConnection(providerId, cwd, env),
          resumeAcpSessionId
            ? Promise.resolve(resumeAcpSessionId)
            : databaseService.getConversationAcpSessionId(conversationId).catch(() => null),
        ]);
      } else {
        // Dedicated path: one connection per session (old behavior)
        // Use sessionKey as connectionKey to keep it unique per conversation
        [conn, storedSessionId] = await Promise.all([
          this.spawnDedicatedConnection(sessionKey, providerId, cwd, env),
          resumeAcpSessionId
            ? Promise.resolve(resumeAcpSessionId)
            : databaseService.getConversationAcpSessionId(conversationId).catch(() => null),
        ]);
      }
      const tConnReady = performance.now();

      const { connection, initResp, spawnError } = conn;

      // Create the session object
      const session: AcpSession = {
        sessionKey,
        conversationId,
        providerId: providerId as ProviderId,
        cwd,
        status: 'initializing',
        connectionKey: conn.connectionKey,
        acpSessionId: null,
        modes: null,
        models: null,
        pendingPermissions: new Map(),
        pendingPrompt: null,
      };
      this.sessions.set(sessionKey, session);

      let acpSessionId: string;
      let sessionResp: any;

      // Try to resume an existing session if we have a stored acpSessionId
      const mcpServerList = mcpServers ?? [];
      let historyEvents: AcpUpdateEvent[] | undefined;
      let resumed = false;
      if (storedSessionId) {
        // Pre-register the stored session ID so events arriving during loadSession
        // are routed correctly instead of being logged as "Unroutable"
        this.acpSessionIdToSessionKey.set(storedSessionId, sessionKey);
        // Start buffering session_update events so loadSession history isn't lost
        this.historyBuffers.set(sessionKey, []);
        let preRegisteredId: string | null = storedSessionId;
        try {
          const result = await this.tryResumeOrCreate(
            connection,
            spawnError,
            storedSessionId,
            cwd,
            initResp,
            mcpServerList
          );
          acpSessionId = result.sessionId;
          sessionResp = result.sessionResp;
          resumed = result.resumed;
          // If the actual session ID matches the pre-registered one, no cleanup needed
          if (acpSessionId === storedSessionId) {
            preRegisteredId = null;
          }
        } finally {
          // Clean up pre-registered mapping if the session ID changed or an error occurred
          if (preRegisteredId !== null) {
            this.acpSessionIdToSessionKey.delete(preRegisteredId);
          }
          const buf = this.historyBuffers.get(sessionKey);
          this.historyBuffers.delete(sessionKey);
          if (buf && buf.length > 0) {
            historyEvents = buf;
            log.info(`Captured ${buf.length} history events from loadSession for ${sessionKey}`);
          }
        }
      } else {
        // Create a brand new session (no stored session ID to resume from)
        log.info(
          `[RESUME CHECKPOINT] No stored sessionId for conversation ${conversationId}, creating fresh session`
        );
        sessionResp = await Promise.race([
          connection.newSession({ cwd, mcpServers: mcpServerList }),
          spawnError,
        ]);
        acpSessionId = sessionResp.sessionId;
      }
      const tSessionCreated = performance.now();

      // Register reverse mapping for event routing
      this.acpSessionIdToSessionKey.set(acpSessionId, sessionKey);

      // Capture modes/models from session response
      const modes: AcpSessionModes = sessionResp?.modes
        ? {
            availableModes: sessionResp.modes.availableModes || [],
            currentModeId: sessionResp.modes.currentModeId || '',
          }
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

      // When resume failed but we had a previous session, replay conversation
      // history as a context prompt so the agent knows what was discussed.
      let tReplayDone = tSessionCreated;
      if (!resumed && storedSessionId) {
        try {
          await this.replayConversationContext(conversationId, connection, acpSessionId);
          tReplayDone = performance.now();
        } catch (err) {
          tReplayDone = performance.now();
          log.error(`[RESUME CHECKPOINT] Context replay failed for ${sessionKey}`, err);
        }
      }

      this.setStatus(sessionKey, 'ready');
      log.info(
        `[PERF createSession] connection=${(tConnReady - tCreate0).toFixed(0)}ms ${storedSessionId ? 'resume/newSession' : 'newSession'}=${(tSessionCreated - tConnReady).toFixed(0)}ms replay=${(tReplayDone - tSessionCreated).toFixed(0)}ms total=${(tReplayDone - tCreate0).toFixed(0)}ms resumed=${resumed} hadStoredId=${!!storedSessionId} pooled=${usePool}`
      );

      // Persist the acpSessionId to DB for future resume
      databaseService.updateConversationAcpSessionId(conversationId, acpSessionId).catch((err) => {
        log.error(`Failed to persist acpSessionId for ${conversationId}`, err);
      });

      log.info(
        `[RESUME CHECKPOINT] Session ready: sessionKey=${sessionKey}, acpSessionId=${acpSessionId}, resumed=${resumed}, pooled=${usePool}`
      );
      return { success: true, sessionKey, acpSessionId, modes, models, historyEvents, resumed };
    } catch (error: any) {
      // Cleanup on failure
      const session = this.sessions.get(sessionKey);
      if (session) {
        this.releaseConnection(session.connectionKey);
        this.sessions.delete(sessionKey);
      }
      log.error(`ACP session creation failed: ${sessionKey}`, error);

      const errorCode =
        error.code === 'NO_ACP_SUPPORT'
          ? 'no_acp_support'
          : error.code === 'ENOENT'
            ? 'acp_unavailable'
            : error.message || 'acp_unavailable';
      return { success: false, error: errorCode };
    }
  }

  /**
   * Spawn a dedicated (non-pooled) connection for providers that don't support multi-session.
   * Uses sessionKey as connectionKey to keep it unique.
   */
  private async spawnDedicatedConnection(
    sessionKey: string,
    providerId: string,
    cwd: string,
    env?: Record<string, string>
  ): Promise<AcpConnection> {
    const conn = await this.spawnConnection(sessionKey, providerId, cwd, env);
    conn.refCount = 1;
    this.connections.set(sessionKey, conn);
    return conn;
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
    mcpServers: any[]
  ): Promise<{ sessionId: string; sessionResp: any; resumed: boolean }> {
    const supportsLoadSession = initResp.agentCapabilities?.loadSession === true;

    if (supportsLoadSession) {
      // Try loadSession twice — the first attempt may fail due to a race with agent startup
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          log.info(`Attempting loadSession (attempt ${attempt}/2) with sessionId=${acpSessionId}`);
          const loadResp = await Promise.race([
            connection.loadSession({ sessionId: acpSessionId, cwd, mcpServers }),
            spawnError,
          ]);
          log.info(`[RESUME CHECKPOINT] loadSession SUCCEEDED for sessionId=${acpSessionId}`);
          return { sessionId: acpSessionId, sessionResp: loadResp, resumed: true };
        } catch (loadErr: any) {
          log.warn(
            `[RESUME CHECKPOINT] loadSession attempt ${attempt} FAILED for sessionId=${acpSessionId}: ${loadErr.message}`
          );
          if (attempt === 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
      log.warn(
        `[RESUME CHECKPOINT] loadSession exhausted retries for sessionId=${acpSessionId}, falling back to newSession + context replay`
      );
    } else {
      log.warn(
        `[RESUME CHECKPOINT] Agent does not support loadSession (agentCapabilities.loadSession=${initResp.agentCapabilities?.loadSession}), creating new session + context replay`
      );
    }

    // Fallback: create a new session — conversation context is LOST
    const sessionResp = await Promise.race([
      connection.newSession({ cwd, mcpServers }),
      spawnError,
    ]);
    log.warn(
      `[RESUME CHECKPOINT] Created NEW session ${sessionResp.sessionId} (previous session ${acpSessionId} could not be resumed — context lost)`
    );
    return { sessionId: sessionResp.sessionId, sessionResp, resumed: false };
  }

  /**
   * When session resume fails, load saved messages from DB and send them
   * as a context prompt so the agent knows the prior conversation.
   */
  private async replayConversationContext(
    conversationId: string,
    connection: ClientSideConnection,
    acpSessionId: string
  ): Promise<void> {
    const messages = await databaseService.getMessages(conversationId);
    if (!messages || messages.length === 0) {
      log.info(`[RESUME CHECKPOINT] No saved messages to replay for ${conversationId}`);
      return;
    }

    const lines: string[] = [
      '[CONTEXT REPLAY] The previous session could not be resumed. Below is the conversation history from the prior session so you have full context. Do not repeat or summarize this back to the user — just continue naturally from where the conversation left off.',
      '',
    ];

    for (const msg of messages) {
      const role = msg.sender === 'user' ? 'User' : 'Assistant';
      const content = (msg.content || '').trim();
      if (content) {
        lines.push(`--- ${role} ---`);
        lines.push(content);
        lines.push('');
      }
    }

    lines.push('[END OF CONTEXT REPLAY] Continue the conversation from here.');

    const contextText = lines.join('\n');
    log.info(
      `[RESUME CHECKPOINT] Replaying ${messages.length} messages (${contextText.length} chars) as context to new session ${acpSessionId}`
    );

    await connection.prompt({
      sessionId: acpSessionId,
      prompt: [{ type: 'text', text: contextText }],
    });
    log.info(`[RESUME CHECKPOINT] Context replay completed for ${conversationId}`);
  }

  async sendPrompt(
    sessionKey: string,
    message: string,
    files?: Array<{ url: string; mediaType: string; filename?: string }>
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    // Queue the prompt if the session is busy — drain happens in setStatus when ready
    if (session.status !== 'ready') {
      log.info(`Queueing prompt for ${sessionKey} (status: ${session.status})`);
      session.pendingPrompt = { message, files };
      return { success: true };
    }

    const conn = this.connections.get(session.connectionKey);
    if (!conn || conn.dead) {
      return { success: false, error: 'Connection is dead' };
    }

    this.setStatus(sessionKey, 'submitted');

    // Build prompt content blocks
    const promptBlocks: Array<any> = [];

    if (files && files.length > 0) {
      for (const file of files) {
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

    if (message) {
      promptBlocks.push({ type: 'text', text: message });
    }

    // Fire and forget — the prompt response comes async via the connection
    conn.connection
      .prompt({
        sessionId: session.acpSessionId,
        prompt: promptBlocks,
      })
      .then((resp) => {
        const s = this.sessions.get(sessionKey);
        if (s && (s.status === 'streaming' || s.status === 'submitted')) {
          this.bufferEvent(sessionKey, {
            type: 'prompt_complete',
            stopReason: (resp as any).stopReason || 'end_turn',
          });
          this.setStatus(sessionKey, 'ready');
        }
      })
      .catch((err) => {
        log.error(`ACP prompt failed: ${sessionKey}`, err);
        const s = this.sessions.get(sessionKey);
        if (s && s.status !== 'ready') {
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
    approved: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (!toolCallId || typeof toolCallId !== 'string') {
      return { success: false, error: 'Invalid toolCallId' };
    }

    const pending = session.pendingPermissions.get(toolCallId);
    if (!pending) {
      return { success: false, error: 'No pending permission for this toolCallId' };
    }

    session.pendingPermissions.delete(toolCallId);
    if (approved) {
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

  async cancelSession(sessionKey: string): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    const conn = this.connections.get(session.connectionKey);
    if (!conn || conn.dead) {
      return { success: false, error: 'Connection is dead' };
    }

    try {
      await conn.connection.cancel({
        sessionId: session.acpSessionId,
      });
      this.setStatus(sessionKey, 'ready');
      return { success: true };
    } catch (err: any) {
      if (session.status === 'streaming' || session.status === 'submitted') {
        this.setStatus(sessionKey, 'ready');
      }
      return { success: false, error: err.message };
    }
  }

  async setMode(sessionKey: string, mode: string): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    const conn = this.connections.get(session.connectionKey);
    if (!conn || conn.dead) {
      return { success: false, error: 'Connection is dead' };
    }

    try {
      await conn.connection.setSessionMode({
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
    value: string
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    const conn = this.connections.get(session.connectionKey);
    if (!conn || conn.dead) {
      return { success: false, error: 'Connection is dead' };
    }

    try {
      await conn.connection.setSessionConfigOption({
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
    modelId: string
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    const conn = this.connections.get(session.connectionKey);
    if (!conn || conn.dead) {
      return { success: false, error: 'Connection is dead' };
    }

    try {
      await (conn.connection as any).unstable_setSessionModel({
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
    cwd?: string
  ): Promise<{ success: boolean; sessions?: any[]; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const conn = this.connections.get(session.connectionKey);
    if (!conn || conn.dead) {
      return { success: false, error: 'Connection is dead' };
    }

    try {
      const params: { cwd?: string; cursor?: string } = {};
      if (cwd) params.cwd = cwd;

      const allSessions: any[] = [];
      let cursor: string | undefined;

      do {
        if (cursor) params.cursor = cursor;
        const resp = await (conn.connection as any).unstable_listSessions(params);
        if (resp.sessions) allSessions.push(...resp.sessions);
        cursor = resp.nextCursor ?? undefined;
      } while (cursor);

      return { success: true, sessions: allSessions };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async forkSession(
    sessionKey: string
  ): Promise<{ success: boolean; newSessionId?: string; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    if (!session.acpSessionId) {
      return { success: false, error: 'No ACP session ID' };
    }

    const conn = this.connections.get(session.connectionKey);
    if (!conn || conn.dead) {
      return { success: false, error: 'Connection is dead' };
    }

    try {
      const resp = await (conn.connection as any).unstable_forkSession({
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
    params: Record<string, unknown>
  ): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const conn = this.connections.get(session.connectionKey);
    if (!conn || conn.dead) {
      return { success: false, error: 'Connection is dead' };
    }

    try {
      const resp = await conn.connection.extMethod(method, params);
      return { success: true, result: resp };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Mark a session as detached (renderer navigated away).
   * The subprocess stays alive — don't treat close/exit as errors.
   */
  detachSession(sessionKey: string): void {
    this.detachedSessions.add(sessionKey);
    log.info(`ACP session detached: ${sessionKey}`);
  }

  /**
   * Re-attach a previously detached session (renderer navigated back).
   * Flushes any events that were buffered while detached so the renderer
   * catches up on missed streaming output and status changes.
   */
  reattachSession(sessionKey: string): void {
    this.detachedSessions.delete(sessionKey);
    log.info(`ACP session reattached: ${sessionKey}`);
    this.flushEvents(sessionKey);
  }

  killSession(sessionKey: string): void {
    if (this.finalizedSessions.has(sessionKey)) return;
    log.debug('[AcpSessionManager] Killing session', { sessionKey });
    this.finalizedSessions.add(sessionKey);
    this.detachedSessions.delete(sessionKey);

    const session = this.sessions.get(sessionKey);
    if (!session) return;

    // Discard any queued prompt
    session.pendingPrompt = null;

    // Reject any pending permissions
    for (const [, pending] of session.pendingPermissions) {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
    }
    session.pendingPermissions.clear();

    // Clear event buffer
    this.clearEventBuffer(sessionKey);

    // Clean up reverse map
    if (session.acpSessionId) {
      this.acpSessionIdToSessionKey.delete(session.acpSessionId);
    }

    // Release connection reference (may trigger idle timer)
    this.releaseConnection(session.connectionKey);

    this.sessions.delete(sessionKey);
    log.info(`ACP session killed: ${sessionKey}`);
  }

  shutdown(): void {
    const connKeys = [...this.connections.keys()];
    if (connKeys.length === 0) return;
    log.info(`Shutting down ${connKeys.length} ACP connection(s)`);
    for (const key of connKeys) {
      this.destroyConnection(key);
    }
  }

  getStatus(sessionKey: string): AcpSessionStatus | null {
    return this.sessions.get(sessionKey)?.status || null;
  }

  hasSession(sessionKey: string): boolean {
    return this.sessions.has(sessionKey);
  }

  // -----------------------------------------------------------------------
  // Internal: Connection-scoped Client for ACP event routing
  // -----------------------------------------------------------------------

  /**
   * Creates a Client that routes events by sessionId to the correct AcpSession.
   * One Client per connection — shared by all sessions on that connection.
   */
  private createConnectionScopedClient(connectionKey: string): Client {
    return {
      sessionUpdate: async (params: SessionNotification) => {
        // Route by acpSessionId → sessionKey
        const acpSessionId = (params as any).sessionId;
        const sessionKey = acpSessionId
          ? this.acpSessionIdToSessionKey.get(acpSessionId)
          : this.findSessionKeyByConnectionKey(connectionKey);

        if (!sessionKey) {
          log.debug(
            `[ConnPool] Unroutable sessionUpdate for acpSessionId=${acpSessionId} on ${connectionKey}`
          );
          return;
        }

        const session = this.sessions.get(sessionKey);
        if (!session) return;

        const event: AcpUpdateEvent = { type: 'session_update', data: params };

        // During loadSession, capture history events instead of forwarding to IPC
        const historyBuf = this.historyBuffers.get(sessionKey);
        if (historyBuf) {
          historyBuf.push(event);
          return;
        }

        // Transition to streaming on first content
        if (session.status === 'submitted') {
          this.setStatus(sessionKey, 'streaming');
        }

        this.bufferEvent(sessionKey, event);
      },

      requestPermission: async (
        params: RequestPermissionRequest
      ): Promise<RequestPermissionResponse> => {
        const acpSessionId = (params as any).sessionId;
        const sessionKey = acpSessionId
          ? this.acpSessionIdToSessionKey.get(acpSessionId)
          : this.findSessionKeyByConnectionKey(connectionKey);

        const session = sessionKey ? this.sessions.get(sessionKey) : null;
        if (!session || !sessionKey) {
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
        const acpSessionId = (params as any).sessionId;
        const sessionKey = acpSessionId
          ? this.acpSessionIdToSessionKey.get(acpSessionId)
          : this.findSessionKeyByConnectionKey(connectionKey);

        const session = sessionKey ? this.sessions.get(sessionKey) : null;
        if (!session) {
          throw new Error('Session not found');
        }

        // S5: Validate file path is within worktree
        const resolved = path.resolve(session.cwd, params.path);
        if (!resolved.startsWith(session.cwd)) {
          throw new Error(`Path traversal blocked: ${params.path}`);
        }

        const content = await fsp.readFile(resolved, 'utf-8');
        return { content };
      },

      writeTextFile: async (params: WriteTextFileRequest): Promise<WriteTextFileResponse> => {
        const acpSessionId = (params as any).sessionId;
        const sessionKey = acpSessionId
          ? this.acpSessionIdToSessionKey.get(acpSessionId)
          : this.findSessionKeyByConnectionKey(connectionKey);

        const session = sessionKey ? this.sessions.get(sessionKey) : null;
        if (!session) {
          throw new Error('Session not found');
        }

        // S5: Validate file path is within worktree
        const resolved = path.resolve(session.cwd, params.path);
        if (!resolved.startsWith(session.cwd)) {
          throw new Error(`Path traversal blocked: ${params.path}`);
        }

        await fsp.mkdir(path.dirname(resolved), { recursive: true });
        await fsp.writeFile(resolved, params.content, 'utf-8');
        return {};
      },
    };
  }

  /**
   * Fallback: find a session on this connection when sessionId is not in the event.
   * Used for dedicated (non-pooled) connections where there's only one session.
   */
  private findSessionKeyByConnectionKey(connectionKey: string): string | undefined {
    for (const [sessionKey, session] of this.sessions) {
      if (session.connectionKey === connectionKey) return sessionKey;
    }
    return undefined;
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

    // Auto-drain queued prompt when session becomes ready
    if (status === 'ready' && session.pendingPrompt) {
      const { message, files } = session.pendingPrompt;
      session.pendingPrompt = null;
      log.info(`Draining pending prompt for ${sessionKey}`);
      // Use nextTick so the ready status event flushes before the new prompt starts
      process.nextTick(() => {
        this.sendPrompt(sessionKey, message, files).catch((err) => {
          log.error(`Failed to drain pending prompt for ${sessionKey}`, err);
        });
      });
    }
  }
}

export const acpSessionManager = new AcpSessionManager();
