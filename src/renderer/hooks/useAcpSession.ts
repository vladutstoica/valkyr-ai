import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { UIMessage } from 'ai';
import { AcpChatTransport, LazyAcpChatTransport } from '../lib/acpChatTransport';
import type { AcpSessionStatus, AcpSessionModes, AcpSessionModels } from '../types/electron-api';

const api = () => window.electronAPI;

export type UseAcpSessionOptions = {
  conversationId: string;
  providerId: string;
  cwd: string;
};

export type UseAcpSessionReturn = {
  transport: LazyAcpChatTransport | null;
  sessionStatus: AcpSessionStatus;
  sessionError: Error | null;
  initialMessages: UIMessage[];
  sessionKey: string | null;
  acpSessionId: string | null;
  modes: AcpSessionModes;
  models: AcpSessionModels;
  restartSession: () => void;
};

/**
 * Convert persisted DB message parts (old AcpMessagePart format) to AI SDK UIMessagePart format.
 */
function convertStoredParts(parts: any[]): UIMessage['parts'] {
  const result: UIMessage['parts'] = [];

  for (const part of parts) {
    if (part.type === 'text') {
      result.push({ type: 'text', text: part.text });
    } else if (part.type === 'reasoning') {
      result.push({ type: 'reasoning', text: part.text });
    } else if (part.type === 'tool-invocation') {
      // Old format used 'tool-invocation'; AI SDK uses 'tool-{toolName}'
      // For restored messages, use dynamic tool part format
      result.push({
        type: `tool-${part.toolName || 'unknown'}`,
        toolCallId: part.toolCallId || `tool-${Date.now()}`,
        toolName: part.toolName || 'unknown',
        state: part.state === 'result' ? 'output-available' : 'input-available',
        input: part.args || {},
        output: part.result,
      } as any);
    } else if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
      // New AI SDK format (tool-Read, tool-Write, etc.) — pass through as-is
      result.push(part as any);
    } else if (part.type) {
      // Unknown type — include rather than silently drop
      result.push(part as any);
    }
  }

  return result;
}

/**
 * Safely parse a message's parts JSON, falling back to plain text on error.
 */
function safeParseMessageParts(m: any): UIMessage['parts'] {
  if (!m.parts) {
    return [{ type: 'text' as const, text: m.content || '' }];
  }
  try {
    return convertStoredParts(JSON.parse(m.parts));
  } catch {
    return [{ type: 'text' as const, text: m.content || '' }];
  }
}

/**
 * Manages ACP session lifecycle (init, cleanup) separately from useChat.
 * Returns a lazy transport immediately so the UI can render without waiting
 * for the ACP subprocess to start.
 */
export function useAcpSession(options: UseAcpSessionOptions): UseAcpSessionReturn {
  const { conversationId, providerId, cwd } = options;

  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<AcpSessionStatus>('initializing');
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [modes, setModes] = useState<AcpSessionModes>(null);
  const [models, setModels] = useState<AcpSessionModels>(null);

  const [restartCount, setRestartCount] = useState(0);
  const sessionKeyRef = useRef<string | null>(null);
  const transportRef = useRef<LazyAcpChatTransport | null>(null);
  const innerTransportRef = useRef<AcpChatTransport | null>(null);

  // Create lazy transport immediately (stable across the session lifecycle)
  const transport = useMemo(() => {
    const t = new LazyAcpChatTransport();
    transportRef.current = t;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, providerId, restartCount]);

  useEffect(() => {
    // Per-effect cancel flag — prevents stale init from wiring wrong transport
    // after restartSession() is called while a previous init is still in-flight.
    let cancelled = false;
    let cleanupStatus: (() => void) | null = null;

    async function init() {
      // Run message loading and session creation in parallel
      const [msgResult, sessionResult] = await Promise.all([
        api().getMessages(conversationId).catch(() => ({ success: false as const })),
        api().acpStart({ conversationId, providerId, cwd }),
      ]);

      if (cancelled) return;

      // Restore messages from DB
      if (msgResult.success && (msgResult as any).messages) {
        const restored: UIMessage[] = (msgResult as any).messages.map((m: any) => ({
          id: m.id,
          role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
          parts: safeParseMessageParts(m),
        }));
        setInitialMessages(restored);
      }

      // Handle session creation result
      if (!sessionResult.success || !sessionResult.sessionKey) {
        const err = new Error(sessionResult.error || 'Failed to start ACP session');
        setSessionStatus('error');
        setSessionError(err);
        transportRef.current?.setError(err);
        return;
      }

      const key = sessionResult.sessionKey;
      sessionKeyRef.current = key;
      setSessionKey(key);
      setAcpSessionId(sessionResult.acpSessionId ?? null);
      setModes(sessionResult.modes ?? null);
      setModels(sessionResult.models ?? null);
      setSessionStatus('ready');

      // Create the real transport and wire it into the lazy wrapper
      const realTransport = new AcpChatTransport({ sessionKey: key, conversationId });
      innerTransportRef.current = realTransport;
      transportRef.current?.setTransport(realTransport);

      // Subscribe to ACP status changes
      cleanupStatus = api().onAcpStatus(key, (newStatus: AcpSessionStatus) => {
        if (cancelled) return;
        if (sessionKeyRef.current !== key) return;
        setSessionStatus(newStatus);
      });
    }

    init();

    return () => {
      cancelled = true;
      cleanupStatus?.();

      // Reject any queued message on the outgoing lazy transport
      transportRef.current?.setError(new Error('Session disposed'));

      if (sessionKeyRef.current) {
        // Clean up transport listeners before detaching to prevent orphaned IPC listeners
        innerTransportRef.current?.cleanupListeners();
        api().acpDetach({ sessionKey: sessionKeyRef.current });
      }
      sessionKeyRef.current = null;
      innerTransportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, providerId, cwd, restartCount]);

  const restartSession = useCallback(() => {
    // Kill the dead session
    if (sessionKeyRef.current) {
      api().acpKill({ sessionKey: sessionKeyRef.current }).catch(() => {});
      sessionKeyRef.current = null;
    }
    innerTransportRef.current = null;
    // Reset state to trigger a fresh init
    setSessionKey(null);
    setSessionStatus('initializing');
    setSessionError(null);
    setRestartCount((c) => c + 1);
  }, []);

  return { transport, sessionStatus, sessionError, initialMessages, sessionKey, acpSessionId, modes, models, restartSession };
}
