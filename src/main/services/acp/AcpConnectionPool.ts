import { spawn } from 'child_process';
import { log } from '../../lib/logger';
import { getAcpSdk } from './AcpSdkLoader';
import type { AcpConnection, AcpSession } from './acpTypes';
import { CONNECTION_IDLE_MS } from './acpTypes';
import { getProvider } from '../../../shared/providers/registry';
import { getStoredProviderKeys } from '../../ipc/settingsIpc';
import { acpRegistryService } from '../AcpRegistryService';
import { PROVIDER_TO_ACP_ID } from '../../../shared/acpRegistry';
import type { Client } from '@agentclientprotocol/sdk';

export type ConnectionPoolCallbacks = {
  /** Called when all sessions on a dying connection should be notified. */
  onConnectionDied: (connectionKey: string, errorMessage: string) => void;
  /** Factory for building the Client used per connection. */
  createClient: (connectionKey: string) => Client;
};

/**
 * AcpConnectionPool — manages ACP subprocess lifecycle (spawn, pool, idle-kill).
 *
 * Optimisation: maintains a reverse index `connectionKey -> Set<sessionKey>` so
 * connection→session lookups are O(1) instead of the previous O(n) linear scan.
 */
export class AcpConnectionPool {
  /** Live connections, keyed by connectionKey. */
  private connections = new Map<string, AcpConnection>();
  /** In-flight creation promises for deduplication. */
  private connectionPromises = new Map<string, Promise<AcpConnection>>();
  /** Reverse index: connectionKey → set of sessionKeys using that connection. */
  private connectionSessionIndex = new Map<string, Set<string>>();

  constructor(private readonly callbacks: ConnectionPoolCallbacks) {}

  // ---------------------------------------------------------------------------
  // Index helpers
  // ---------------------------------------------------------------------------

  trackSession(connectionKey: string, sessionKey: string): void {
    let set = this.connectionSessionIndex.get(connectionKey);
    if (!set) {
      set = new Set();
      this.connectionSessionIndex.set(connectionKey, set);
    }
    set.add(sessionKey);
  }

  untrackSession(connectionKey: string, sessionKey: string): void {
    const set = this.connectionSessionIndex.get(connectionKey);
    if (!set) return;
    set.delete(sessionKey);
    if (set.size === 0) this.connectionSessionIndex.delete(connectionKey);
  }

  /** O(1) look up the first sessionKey on a connection (used for dedicated connections). */
  firstSessionOnConnection(connectionKey: string): string | undefined {
    const set = this.connectionSessionIndex.get(connectionKey);
    return set ? set.values().next().value : undefined;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  get(connectionKey: string): AcpConnection | undefined {
    return this.connections.get(connectionKey);
  }

  /**
   * Get or create a shared ACP connection for the given (providerId, cwd) pair.
   * Uses promise-based deduplication to prevent concurrent spawns for the same key.
   */
  async getOrCreate(
    providerId: string,
    cwd: string,
    env?: Record<string, string>
  ): Promise<AcpConnection> {
    const connectionKey = `${providerId}::${cwd}`;

    // Return existing healthy connection
    const existing = this.connections.get(connectionKey);
    if (existing && !existing.dead) {
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
    const promise = this.spawn(connectionKey, providerId, cwd, env);
    this.connectionPromises.set(connectionKey, promise);

    try {
      const conn = await promise;
      this.connections.set(connectionKey, conn);
      conn.refCount = 1;
      log.info(`[ConnPool] Created new connection ${connectionKey}`);
      return conn;
    } catch (err) {
      this.connections.delete(connectionKey);
      throw err;
    } finally {
      this.connectionPromises.delete(connectionKey);
    }
  }

  /**
   * Spawn a dedicated (non-pooled) connection for providers that don't support multi-session.
   * Uses sessionKey as connectionKey to keep it unique per conversation.
   */
  async spawnDedicated(
    sessionKey: string,
    providerId: string,
    cwd: string,
    env?: Record<string, string>
  ): Promise<AcpConnection> {
    const conn = await this.spawn(sessionKey, providerId, cwd, env);
    conn.refCount = 1;
    this.connections.set(sessionKey, conn);
    return conn;
  }

  /**
   * Release a session's reference to a connection.
   * Starts idle timer when refCount drops to 0.
   */
  release(connectionKey: string): void {
    const conn = this.connections.get(connectionKey);
    if (!conn || conn.dead) return;

    conn.refCount = Math.max(0, conn.refCount - 1);
    log.info(`[ConnPool] Released connection ${connectionKey} (refCount=${conn.refCount})`);

    if (conn.refCount <= 0 && !conn.idleTimer) {
      conn.idleTimer = setTimeout(() => {
        log.info(`[ConnPool] Idle timeout — killing connection ${connectionKey}`);
        this.destroy(connectionKey);
      }, CONNECTION_IDLE_MS);
    }
  }

  /**
   * Force-destroy a connection and clean up its entry.
   * The caller is responsible for cleaning up sessions that used this connection.
   */
  destroy(connectionKey: string): void {
    const conn = this.connections.get(connectionKey);
    if (!conn) return;

    if (conn.idleTimer) {
      clearTimeout(conn.idleTimer);
      conn.idleTimer = null;
    }

    conn.dead = true;
    this.connections.delete(connectionKey);
    this.connectionSessionIndex.delete(connectionKey);

    try {
      if (!conn.childProcess.killed) {
        conn.childProcess.kill();
      }
    } catch {
      /* already dead */
    }

    log.info(`[ConnPool] Destroyed connection ${connectionKey}`);
  }

  /** Keys of all live connections — used during shutdown. */
  allKeys(): string[] {
    return [...this.connections.keys()];
  }

  // ---------------------------------------------------------------------------
  // Private: subprocess spawn + handshake
  // ---------------------------------------------------------------------------

  private async spawn(
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

    // Scope environment variables per provider
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

    // Inject stored provider API keys from keytar (lower priority than process.env)
    const storedKeys = await getStoredProviderKeys();
    if (provider?.envVars) {
      for (const key of provider.envVars) {
        if (!scopedEnv[key] && storedKeys[key]) {
          scopedEnv[key] = storedKeys[key];
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

    log.debug('[AcpConnectionPool] Spawning ACP process', { connectionKey, command, cwd });
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

    const connection = new acpSdk.ClientSideConnection(
      (_agent) => this.callbacks.createClient(connectionKey),
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

    // Subprocess crash detection
    childProcess.on('exit', (code, signal) => {
      if (conn.dead) return;
      log.info(`[ConnPool] Subprocess exited: ${connectionKey} code=${code} signal=${signal}`);
      this.callbacks.onConnectionDied(
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
      this.callbacks.onConnectionDied(connectionKey, 'ACP connection closed unexpectedly');
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
          terminal: true,
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

  // ---------------------------------------------------------------------------
  // Internal: session-map scan used by AcpSessionManager for handleConnectionDeath
  // ---------------------------------------------------------------------------

  /** Iterate sessions map and invoke callback for each session on this connection. */
  forEachSessionOnConnection(
    connectionKey: string,
    sessions: Map<string, AcpSession>,
    cb: (sessionKey: string, session: AcpSession) => void
  ): void {
    const set = this.connectionSessionIndex.get(connectionKey);
    if (!set) return;
    for (const sessionKey of [...set]) {
      const session = sessions.get(sessionKey);
      if (session) cb(sessionKey, session);
    }
  }
}
