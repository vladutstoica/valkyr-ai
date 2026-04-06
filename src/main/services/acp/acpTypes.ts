import type {
  ClientSideConnection,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import type { ChildProcess } from 'child_process';
import type { ProviderId } from '../../../shared/providers/registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Event batch flush interval — mirrors PTY 16ms pattern from ptyIpc.ts. */
export const EVENT_FLUSH_MS = 16;

/** Idle timeout before killing an unused connection (ms). */
export const CONNECTION_IDLE_MS = 60_000;

export const MAX_TERMINALS_PER_SESSION = 10;
export const DEFAULT_OUTPUT_BYTE_LIMIT = 10 * 1024 * 1024; // 10 MB
export const KILL_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Session status & events
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

// ---------------------------------------------------------------------------
// Session modes & models
// ---------------------------------------------------------------------------

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
// Connection
// ---------------------------------------------------------------------------

export type AcpConnection = {
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
// Terminal
// ---------------------------------------------------------------------------

export type AcpTerminal = {
  id: string;
  process: ChildProcess;
  outputChunks: string[];
  outputBytes: number;
  outputByteLimit: number;
  truncated: boolean;
  exitStatus: { exitCode: number | null; signal: string | null } | null;
  exitPromise: Promise<{ exitCode: number | null; signal: string | null }>;
};

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export type AcpSession = {
  sessionKey: string;
  conversationId: string;
  providerId: ProviderId;
  cwd: string;
  status: AcpSessionStatus;
  connectionKey: string;
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
  pendingPrompt: {
    message: string;
    files?: Array<{ url: string; mediaType: string; filename?: string }>;
  } | null;
  terminals: Map<string, AcpTerminal>;
};

export type SessionCreateResult = {
  success: boolean;
  sessionKey?: string;
  acpSessionId?: string;
  modes?: AcpSessionModes;
  models?: AcpSessionModels;
  historyEvents?: AcpUpdateEvent[];
  resumed?: boolean;
  error?: string;
};
