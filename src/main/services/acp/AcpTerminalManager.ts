import { spawn } from 'child_process';
import * as crypto from 'crypto';
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalCommandRequest,
  KillTerminalCommandResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
} from '@agentclientprotocol/sdk';
import { log } from '../../lib/logger';
import type { AcpSession, AcpTerminal } from './acpTypes';
import { MAX_TERMINALS_PER_SESSION, DEFAULT_OUTPUT_BYTE_LIMIT, KILL_TIMEOUT_MS } from './acpTypes';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Terminal output buffer helpers
// ---------------------------------------------------------------------------

/** Append data to terminal output buffer, truncating from start if over byte limit. */
export function appendTerminalOutput(terminal: AcpTerminal, chunk: string): void {
  const chunkBytes = Buffer.byteLength(chunk, 'utf-8');
  terminal.outputChunks.push(chunk);
  terminal.outputBytes += chunkBytes;

  if (terminal.outputByteLimit > 0 && terminal.outputBytes > terminal.outputByteLimit) {
    // Drop whole chunks from the front until we're under the limit
    while (terminal.outputChunks.length > 1 && terminal.outputBytes > terminal.outputByteLimit) {
      const dropped = terminal.outputChunks.shift()!;
      terminal.outputBytes -= Buffer.byteLength(dropped, 'utf-8');
    }
    // If a single remaining chunk still exceeds the limit, slice at a UTF-8 boundary
    if (terminal.outputChunks.length === 1 && terminal.outputBytes > terminal.outputByteLimit) {
      const buf = Buffer.from(terminal.outputChunks[0], 'utf-8');
      let cutPoint = terminal.outputBytes - terminal.outputByteLimit;
      // Advance past any UTF-8 continuation bytes to a character boundary
      while (cutPoint < buf.length && (buf[cutPoint] & 0xc0) === 0x80) {
        cutPoint++;
      }
      terminal.outputChunks[0] = buf.subarray(cutPoint).toString('utf-8');
      terminal.outputBytes = Buffer.byteLength(terminal.outputChunks[0], 'utf-8');
    }
    terminal.truncated = true;
  }
}

/** Get the full output buffer as a string (joins chunks lazily). */
export function getTerminalOutput(terminal: AcpTerminal): string {
  return terminal.outputChunks.join('');
}

/** Kill all terminals for a session and clear the map. */
export function cleanupSessionTerminals(session: AcpSession): void {
  for (const [, terminal] of session.terminals) {
    try {
      if (!terminal.process.killed) terminal.process.kill('SIGTERM');
    } catch {
      /* already dead */
    }
  }
  session.terminals.clear();
}

/**
 * Send SIGTERM to a process and escalate to SIGKILL after timeoutMs.
 * Shared by killTerminal and releaseTerminal to avoid code duplication.
 */
export function gracefulKill(proc: import('child_process').ChildProcess, timeoutMs: number): void {
  if (proc.killed) return;
  proc.kill('SIGTERM');
  setTimeout(() => {
    try {
      if (!proc.killed) proc.kill('SIGKILL');
    } catch {
      /* already dead */
    }
  }, timeoutMs);
}

// ---------------------------------------------------------------------------
// AcpTerminalManager — builds the terminal callbacks for a Client
// ---------------------------------------------------------------------------

export interface SessionResolver {
  resolveSession(
    acpSessionId: string | undefined,
    connectionKey: string
  ): { sessionKey: string; session: AcpSession } | null;
}

/**
 * Returns the terminal-protocol Client callbacks that can be merged into a
 * full Client object.  The SessionResolver is injected so this module stays
 * independent of AcpSessionManager's maps.
 */
export function buildTerminalCallbacks(
  connectionKey: string,
  resolver: SessionResolver
): {
  createTerminal: (p: CreateTerminalRequest) => Promise<CreateTerminalResponse>;
  terminalOutput: (p: TerminalOutputRequest) => Promise<TerminalOutputResponse>;
  waitForTerminalExit: (p: WaitForTerminalExitRequest) => Promise<WaitForTerminalExitResponse>;
  killTerminal: (p: KillTerminalCommandRequest) => Promise<KillTerminalCommandResponse>;
  releaseTerminal: (p: ReleaseTerminalRequest) => Promise<ReleaseTerminalResponse>;
} {
  function resolveOrThrow(params: any) {
    const acpSessionId: string | undefined = params.sessionId;
    const r = resolver.resolveSession(acpSessionId, connectionKey);
    if (!r) throw new Error('Session not found');
    return r;
  }

  return {
    createTerminal: async (params: CreateTerminalRequest): Promise<CreateTerminalResponse> => {
      const { sessionKey, session } = resolveOrThrow(params);

      if (session.terminals.size >= MAX_TERMINALS_PER_SESSION) {
        throw new Error(`Maximum of ${MAX_TERMINALS_PER_SESSION} concurrent terminals reached`);
      }

      // Validate cwd within session worktree
      const cwd = params.cwd ? path.resolve(session.cwd, params.cwd) : session.cwd;
      if (!cwd.startsWith(session.cwd)) {
        throw new Error(`Path traversal blocked: ${params.cwd}`);
      }

      // Build env from array of { name, value }
      const env: Record<string, string> = { ...process.env } as Record<string, string>;
      if (params.env) {
        for (const v of params.env) {
          env[v.name] = v.value;
        }
      }

      const terminalId = crypto.randomUUID();
      const child = spawn(params.command, params.args ?? [], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const outputByteLimit = params.outputByteLimit ?? DEFAULT_OUTPUT_BYTE_LIMIT;

      const exitPromise = new Promise<{ exitCode: number | null; signal: string | null }>(
        (resolve) => {
          child.on('close', (code, signal) => {
            terminal.exitStatus = { exitCode: code, signal: signal ?? null };
            resolve({ exitCode: code, signal: signal ?? null });
          });
        }
      );

      const terminal: AcpTerminal = {
        id: terminalId,
        process: child,
        outputChunks: [],
        outputBytes: 0,
        outputByteLimit,
        truncated: false,
        exitStatus: null,
        exitPromise,
      };

      child.stdout?.on('data', (chunk: Buffer) =>
        appendTerminalOutput(terminal, chunk.toString('utf-8'))
      );
      child.stderr?.on('data', (chunk: Buffer) =>
        appendTerminalOutput(terminal, chunk.toString('utf-8'))
      );

      session.terminals.set(terminalId, terminal);
      log.debug(
        `[AcpTerminal] Created terminal ${terminalId} for session ${sessionKey}: ${params.command}`
      );

      return { terminalId };
    },

    terminalOutput: async (params: TerminalOutputRequest): Promise<TerminalOutputResponse> => {
      const { session } = resolveOrThrow(params);

      const terminal = session.terminals.get(params.terminalId);
      if (!terminal) throw new Error(`Terminal not found: ${params.terminalId}`);

      return {
        output: getTerminalOutput(terminal),
        truncated: terminal.truncated,
        exitStatus: terminal.exitStatus ?? undefined,
      };
    },

    waitForTerminalExit: async (
      params: WaitForTerminalExitRequest
    ): Promise<WaitForTerminalExitResponse> => {
      const { session } = resolveOrThrow(params);

      const terminal = session.terminals.get(params.terminalId);
      if (!terminal) throw new Error(`Terminal not found: ${params.terminalId}`);

      const result = await terminal.exitPromise;
      return { exitCode: result.exitCode, signal: result.signal };
    },

    killTerminal: async (
      params: KillTerminalCommandRequest
    ): Promise<KillTerminalCommandResponse> => {
      const { session } = resolveOrThrow(params);

      const terminal = session.terminals.get(params.terminalId);
      if (!terminal) throw new Error(`Terminal not found: ${params.terminalId}`);

      gracefulKill(terminal.process, KILL_TIMEOUT_MS);
      return {};
    },

    releaseTerminal: async (params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> => {
      const { session } = resolveOrThrow(params);

      const terminal = session.terminals.get(params.terminalId);
      if (!terminal) throw new Error(`Terminal not found: ${params.terminalId}`);

      gracefulKill(terminal.process, KILL_TIMEOUT_MS);
      session.terminals.delete(params.terminalId);
      return {};
    },
  };
}
