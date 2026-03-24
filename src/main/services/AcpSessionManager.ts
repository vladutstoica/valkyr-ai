import { log } from '../lib/logger';
import { getProvider } from '../../shared/providers/registry';
import { databaseService } from './DatabaseService';
import type { ClientSideConnection } from '@agentclientprotocol/sdk';

// Sub-modules
import { AcpEventBuffer } from './acp/AcpEventBuffer';
import { AcpConnectionPool } from './acp/AcpConnectionPool';
import { AcpClientFactory } from './acp/AcpClientFactory';
import { cleanupSessionTerminals } from './acp/AcpTerminalManager';

// Re-export types & constants for backward compatibility (callers import from here)
export type {
  AcpSessionStatus,
  AcpUpdateEvent,
  AcpSessionMode,
  AcpSessionModel,
  AcpSessionModes,
  AcpSessionModels,
  AcpSession,
  AcpConnection,
  AcpTerminal,
  SessionCreateResult,
} from './acp/acpTypes';
export { warmAcpSdk } from './acp/AcpSdkLoader';

import type {
  AcpSessionStatus,
  AcpUpdateEvent,
  AcpSession,
  AcpSessionModes,
  AcpSessionModels,
  SessionCreateResult,
} from './acp/acpTypes';

// ---------------------------------------------------------------------------
// AcpSessionManager — session lifecycle orchestration
// ---------------------------------------------------------------------------

export class AcpSessionManager {
  private sessions = new Map<string, AcpSession>();
  private finalizedSessions = new Set<string>();
  private detachedSessions = new Set<string>();

  /** Collects session_update events during loadSession so they can be returned to the renderer. */
  private historyBuffers = new Map<string, AcpUpdateEvent[]>();

  /** Reverse map: acpSessionId → sessionKey for event routing on shared connections. */
  private acpSessionIdToSessionKey = new Map<string, string>();

  /** Event batching — flushes on 16ms timer. */
  private eventBuffer: AcpEventBuffer;

  /** Connection pool. */
  private connectionPool: AcpConnectionPool;

  /** Client factory (builds ACP Client objects for each connection). */
  private clientFactory: AcpClientFactory;

  /** Callback for sending flushed events to the renderer — set by acpIpc.ts. */
  private eventSender: ((sessionKey: string, events: AcpUpdateEvent[]) => void) | null = null;

  constructor() {
    this.eventBuffer = new AcpEventBuffer((sessionKey, events) => {
      this.eventSender?.(sessionKey, events);
    });

    this.connectionPool = new AcpConnectionPool({
      onConnectionDied: (connectionKey, errorMessage) =>
        this.handleConnectionDeath(connectionKey, errorMessage),
      createClient: (connectionKey) => this.clientFactory.createForConnection(connectionKey),
    });

    this.clientFactory = new AcpClientFactory({
      resolveSession: (acpSessionId, connectionKey) =>
        this.resolveSession(acpSessionId, connectionKey),
      getSession: (sessionKey) => this.sessions.get(sessionKey),
      getHistoryBuffer: (sessionKey) => this.historyBuffers.get(sessionKey),
      bufferEvent: (sessionKey, event) => this.bufferEvent(sessionKey, event),
      setStatus: (sessionKey, status) => this.setStatus(sessionKey, status),
    });
  }

  setEventSender(sender: (sessionKey: string, events: AcpUpdateEvent[]) => void): void {
    this.eventSender = sender;
  }

  // -----------------------------------------------------------------------
  // Event buffering (thin wrappers)
  // -----------------------------------------------------------------------

  private bufferEvent(sessionKey: string, event: AcpUpdateEvent): void {
    this.eventBuffer.buffer(sessionKey, event);
  }

  private flushEvents(sessionKey: string): void {
    this.eventBuffer.flush(sessionKey);
  }

  private clearEventBuffer(sessionKey: string): void {
    this.eventBuffer.clear(sessionKey);
  }

  // -----------------------------------------------------------------------
  // Session routing helper (used by AcpClientFactory + AcpTerminalManager)
  // -----------------------------------------------------------------------

  /**
   * Resolve an ACP session from either its acpSessionId (primary) or by
   * falling back to the first session on the connection (dedicated mode).
   */
  private resolveSession(
    acpSessionId: string | undefined,
    connectionKey: string
  ): { sessionKey: string; session: AcpSession } | null {
    const sessionKey = acpSessionId
      ? this.acpSessionIdToSessionKey.get(acpSessionId)
      : this.connectionPool.firstSessionOnConnection(connectionKey);

    if (!sessionKey) return null;
    const session = this.sessions.get(sessionKey);
    if (!session) return null;
    return { sessionKey, session };
  }

  // -----------------------------------------------------------------------
  // Guard helper — eliminates the 7x repeated pattern in session operations
  // -----------------------------------------------------------------------

  private getSessionAndConnection(
    sessionKey: string
  ):
    | {
        session: AcpSession;
        conn: import('./acp/acpTypes').AcpConnection;
      }
    | { error: string } {
    const session = this.sessions.get(sessionKey);
    if (!session) return { error: 'Session not found' };
    if (!session.acpSessionId) return { error: 'No ACP session ID' };

    const conn = this.connectionPool.get(session.connectionKey);
    if (!conn || conn.dead) return { error: 'Connection is dead' };

    return { session, conn };
  }

  // -----------------------------------------------------------------------
  // Connection death handler
  // -----------------------------------------------------------------------

  private handleConnectionDeath(connectionKey: string, errorMessage: string): void {
    const conn = this.connectionPool.get(connectionKey);
    if (!conn || conn.dead) return;

    // Mark dead before destroying so the idle timer + event callbacks stop
    conn.dead = true;
    if (conn.idleTimer) {
      clearTimeout(conn.idleTimer);
      conn.idleTimer = null;
    }

    this.connectionPool.forEachSessionOnConnection(connectionKey, this.sessions, (sessionKey, session) => {
      if (this.finalizedSessions.has(sessionKey)) return;

      cleanupSessionTerminals(session);

      if (this.detachedSessions.has(sessionKey)) {
        log.info(`[ConnPool] Connection died while session detached: ${sessionKey}`);
        this.finalizedSessions.add(sessionKey);
        this.sessions.delete(sessionKey);
        return;
      }

      this.setStatus(sessionKey, 'error');
      this.bufferEvent(sessionKey, {
        type: 'session_error',
        error: errorMessage,
      });
    });

    this.connectionPool.destroy(connectionKey);
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

    // Kill stale/errored session (e.g. after Ctrl+R reload)
    if (this.sessions.has(sessionKey)) {
      log.info(`Killing stale ACP session before recreate: ${sessionKey}`);
      this.killSession(sessionKey);
    }
    this.finalizedSessions.delete(sessionKey);

    const provider = getProvider(providerId as any);
    const usePool = provider?.acpMultiSession === true;

    try {
      const tCreate0 = performance.now();

      let conn: import('./acp/acpTypes').AcpConnection;
      let storedSessionId: string | null;

      if (usePool) {
        [conn, storedSessionId] = await Promise.all([
          this.connectionPool.getOrCreate(providerId, cwd, env),
          resumeAcpSessionId
            ? Promise.resolve(resumeAcpSessionId)
            : databaseService.getConversationAcpSessionId(conversationId).catch(() => null),
        ]);
      } else {
        [conn, storedSessionId] = await Promise.all([
          this.connectionPool.spawnDedicated(sessionKey, providerId, cwd, env),
          resumeAcpSessionId
            ? Promise.resolve(resumeAcpSessionId)
            : databaseService.getConversationAcpSessionId(conversationId).catch(() => null),
        ]);
      }
      const tConnReady = performance.now();

      const { connection, initResp, spawnError } = conn;

      const session: AcpSession = {
        sessionKey,
        conversationId,
        providerId: providerId as any,
        cwd,
        status: 'initializing',
        connectionKey: conn.connectionKey,
        acpSessionId: null,
        modes: null,
        models: null,
        pendingPermissions: new Map(),
        pendingPrompt: null,
        terminals: new Map(),
      };
      this.sessions.set(sessionKey, session);
      this.connectionPool.trackSession(conn.connectionKey, sessionKey);

      let acpSessionId: string;
      let sessionResp: any;

      const mcpServerList = mcpServers ?? [];
      let historyEvents: AcpUpdateEvent[] | undefined;
      let resumed = false;

      if (storedSessionId) {
        // Pre-register the stored session ID so events arriving during loadSession are routed correctly
        this.acpSessionIdToSessionKey.set(storedSessionId, sessionKey);
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
          if (acpSessionId === storedSessionId) {
            preRegisteredId = null;
          }
        } finally {
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

      databaseService.updateConversationAcpSessionId(conversationId, acpSessionId).catch((err) => {
        log.error(`Failed to persist acpSessionId for ${conversationId}`, err);
      });

      log.info(
        `[RESUME CHECKPOINT] Session ready: sessionKey=${sessionKey}, acpSessionId=${acpSessionId}, resumed=${resumed}, pooled=${usePool}`
      );
      return { success: true, sessionKey, acpSessionId, modes, models, historyEvents, resumed };
    } catch (error: any) {
      const session = this.sessions.get(sessionKey);
      if (session) {
        this.connectionPool.untrackSession(session.connectionKey, sessionKey);
        this.connectionPool.release(session.connectionKey);
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

  // -----------------------------------------------------------------------
  // Session resume helpers
  // -----------------------------------------------------------------------

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

    const sessionResp = await Promise.race([
      connection.newSession({ cwd, mcpServers }),
      spawnError,
    ]);
    log.warn(
      `[RESUME CHECKPOINT] Created NEW session ${sessionResp.sessionId} (previous session ${acpSessionId} could not be resumed — context lost)`
    );
    return { sessionId: sessionResp.sessionId, sessionResp, resumed: false };
  }

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

  // -----------------------------------------------------------------------
  // Public session operations
  // -----------------------------------------------------------------------

  async sendPrompt(
    sessionKey: string,
    message: string,
    files?: Array<{ url: string; mediaType: string; filename?: string }>
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) return { success: false, error: 'Session not found' };
    if (!session.acpSessionId) return { success: false, error: 'No ACP session ID' };

    // Queue the prompt if the session is busy — drain happens in setStatus when ready
    if (session.status !== 'ready') {
      log.info(`Queueing prompt for ${sessionKey} (status: ${session.status})`);
      session.pendingPrompt = { message, files };
      return { success: true };
    }

    const conn = this.connectionPool.get(session.connectionKey);
    if (!conn || conn.dead) return { success: false, error: 'Connection is dead' };

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
    optionId: string | null
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionKey);
    if (!session) return { success: false, error: 'Session not found' };

    if (!toolCallId || typeof toolCallId !== 'string') {
      return { success: false, error: 'Invalid toolCallId' };
    }

    const pending = session.pendingPermissions.get(toolCallId);
    if (!pending) return { success: false, error: 'No pending permission for this toolCallId' };

    session.pendingPermissions.delete(toolCallId);
    if (optionId) {
      pending.resolve({ outcome: { outcome: 'selected', optionId } });
    } else {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
    }

    return { success: true };
  }

  async cancelSession(sessionKey: string): Promise<{ success: boolean; error?: string }> {
    const r = this.getSessionAndConnection(sessionKey);
    if ('error' in r) return { success: false, error: r.error };
    const { session, conn } = r;

    try {
      await conn.connection.cancel({ sessionId: session.acpSessionId! });
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
    const r = this.getSessionAndConnection(sessionKey);
    if ('error' in r) return { success: false, error: r.error };
    const { session, conn } = r;

    try {
      await conn.connection.setSessionMode({ sessionId: session.acpSessionId!, modeId: mode });
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
    const r = this.getSessionAndConnection(sessionKey);
    if ('error' in r) return { success: false, error: r.error };
    const { session, conn } = r;

    try {
      await conn.connection.setSessionConfigOption({
        sessionId: session.acpSessionId!,
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
    const r = this.getSessionAndConnection(sessionKey);
    if ('error' in r) return { success: false, error: r.error };
    const { session, conn } = r;

    try {
      await (conn.connection as any).unstable_setSessionModel({
        sessionId: session.acpSessionId!,
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
    if (!session) return { success: false, error: 'Session not found' };

    const conn = this.connectionPool.get(session.connectionKey);
    if (!conn || conn.dead) return { success: false, error: 'Connection is dead' };

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
    const r = this.getSessionAndConnection(sessionKey);
    if ('error' in r) return { success: false, error: r.error };
    const { session, conn } = r;

    try {
      const resp = await (conn.connection as any).unstable_forkSession({
        sessionId: session.acpSessionId!,
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
    if (!session) return { success: false, error: 'Session not found' };

    const conn = this.connectionPool.get(session.connectionKey);
    if (!conn || conn.dead) return { success: false, error: 'Connection is dead' };

    try {
      const resp = await conn.connection.extMethod(method, params);
      return { success: true, result: resp };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  detachSession(sessionKey: string): void {
    this.detachedSessions.add(sessionKey);
    log.info(`ACP session detached: ${sessionKey}`);
  }

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

    session.pendingPrompt = null;
    cleanupSessionTerminals(session);

    for (const [, pending] of session.pendingPermissions) {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
    }
    session.pendingPermissions.clear();

    this.clearEventBuffer(sessionKey);

    if (session.acpSessionId) {
      this.acpSessionIdToSessionKey.delete(session.acpSessionId);
    }

    this.connectionPool.untrackSession(session.connectionKey, sessionKey);
    this.connectionPool.release(session.connectionKey);

    this.sessions.delete(sessionKey);
    log.info(`ACP session killed: ${sessionKey}`);
  }

  shutdown(): void {
    const connKeys = this.connectionPool.allKeys();
    if (connKeys.length === 0) return;
    log.info(`Shutting down ${connKeys.length} ACP connection(s)`);
    for (const key of connKeys) {
      this.connectionPool.destroy(key);
    }
  }

  getStatus(sessionKey: string): AcpSessionStatus | null {
    return this.sessions.get(sessionKey)?.status || null;
  }

  hasSession(sessionKey: string): boolean {
    return this.sessions.has(sessionKey);
  }

  // -----------------------------------------------------------------------
  // Internal: status management
  // -----------------------------------------------------------------------

  private setStatus(sessionKey: string, status: AcpSessionStatus): void {
    const session = this.sessions.get(sessionKey);
    if (!session) return;
    const prevStatus = session.status;
    if (prevStatus === status) return;

    session.status = status;
    this.bufferEvent(sessionKey, { type: 'status_change', status });

    // Auto-drain queued prompt when session becomes ready
    if (status === 'ready' && session.pendingPrompt) {
      const { message, files } = session.pendingPrompt;
      session.pendingPrompt = null;
      log.info(`Draining pending prompt for ${sessionKey}`);
      process.nextTick(() => {
        this.sendPrompt(sessionKey, message, files).catch((err) => {
          log.error(`Failed to drain pending prompt for ${sessionKey}`, err);
        });
      });
    } else if (status === 'ready' && (prevStatus === 'streaming' || prevStatus === 'submitted')) {
      this.showAcpCompletionNotification(session.providerId);
    }
  }

  private showAcpCompletionNotification(providerId: string): void {
    try {
      const { getAppSettings } = require('../settings') as typeof import('../settings');
      const settings = getAppSettings();
      if (!settings.notifications?.enabled) return;

      const { Notification: ElectronNotification, BrowserWindow } = require('electron');
      if (!ElectronNotification.isSupported()) return;

      const windows = BrowserWindow.getAllWindows();
      const anyFocused = windows.some((w: any) => w.isFocused());
      if (anyFocused) return;

      const providerDef = getProvider(providerId as any);
      const providerName = providerDef?.name ?? providerId;

      const notification = new ElectronNotification({
        title: `${providerName} Task Complete`,
        body: 'Your agent has finished working',
        silent: !settings.notifications?.sound,
      });
      notification.show();
    } catch (error) {
      log.warn('Failed to show ACP completion notification', { error });
    }
  }
}

export const acpSessionManager = new AcpSessionManager();
