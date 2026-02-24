import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { UIMessage } from 'ai';
import { AcpChatTransport, LazyAcpChatTransport } from '../lib/acpChatTransport';
import type {
  AcpSessionStatus,
  AcpSessionModes,
  AcpSessionModels,
  AcpUpdateEvent,
} from '../types/electron-api';
import { createLogger } from '../lib/logger';

const log = createLogger('hook:useAcpSession');
const api = () => window.electronAPI;

export type UseAcpSessionOptions = {
  conversationId: string;
  providerId: string;
  cwd: string;
  projectPath?: string;
};

export type UseAcpSessionReturn = {
  transport: LazyAcpChatTransport | null;
  sessionStatus: AcpSessionStatus;
  sessionError: Error | null;
  initialMessages: UIMessage[];
  sessionKey: string | null;
  acpSessionId: string | null;
  resumed: boolean | null;
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
 * Convert ACP history events (streamed back from loadSession) into UIMessage[].
 *
 * The event stream contains interleaved user_message_chunk and assistant events
 * (agent_message_chunk, agent_thought_chunk, tool_call, tool_call_update).
 * We group them into alternating user/assistant messages.
 */
function convertHistoryToMessages(events: AcpUpdateEvent[]): UIMessage[] {
  const messages: UIMessage[] = [];
  let currentRole: 'user' | 'assistant' | null = null;
  let currentParts: UIMessage['parts'] = [];
  let textAccumulator = '';
  let reasoningAccumulator = '';
  let msgCounter = 0;

  function flushText() {
    if (textAccumulator) {
      currentParts.push({ type: 'text', text: textAccumulator });
      textAccumulator = '';
    }
  }

  function flushReasoning() {
    if (reasoningAccumulator) {
      currentParts.push({ type: 'reasoning', text: reasoningAccumulator } as any);
      reasoningAccumulator = '';
    }
  }

  function flushMessage() {
    flushText();
    flushReasoning();
    if (currentRole && currentParts.length > 0) {
      messages.push({
        id: `history-${msgCounter++}`,
        role: currentRole,
        parts: currentParts,
      });
    }
    currentParts = [];
    currentRole = null;
  }

  function ensureRole(role: 'user' | 'assistant') {
    if (currentRole !== role) {
      flushMessage();
      currentRole = role;
    }
  }

  for (const event of events) {
    if (event.type !== 'session_update') continue;
    const update = event.data?.update;
    const updateType = update?.sessionUpdate;
    if (!updateType) continue;

    switch (updateType) {
      case 'user_message_chunk': {
        const content = update?.content;
        if (content?.type === 'text' && content.text) {
          ensureRole('user');
          textAccumulator += content.text;
        }
        break;
      }

      case 'agent_message_chunk': {
        const content = update?.content;
        if (content?.type === 'text' && content.text) {
          ensureRole('assistant');
          flushReasoning();
          textAccumulator += content.text;
        }
        break;
      }

      case 'agent_thought_chunk': {
        const content = update?.content;
        if (content?.type === 'text' && content.text) {
          ensureRole('assistant');
          flushText();
          reasoningAccumulator += content.text;
        }
        break;
      }

      case 'tool_call': {
        ensureRole('assistant');
        flushText();
        flushReasoning();
        const toolCallId = update.toolCallId || `tool-${msgCounter}-${Date.now()}`;
        const toolName = update.kind || update.title?.split(/\s/)[0] || 'tool';
        currentParts.push({
          type: `tool-${toolName}`,
          toolCallId,
          toolName,
          state: 'input-available',
          input: update.rawInput ?? { title: update.title },
        } as any);
        break;
      }

      case 'tool_call_update': {
        const toolCallId = update.toolCallId;
        if (!toolCallId) break;
        if (update.status === 'completed' || update.status === 'failed') {
          // Find the matching tool part and update its state
          const toolPart = currentParts.find((p: any) => p.toolCallId === toolCallId) as any;
          if (toolPart) {
            toolPart.state = 'output-available';
            toolPart.output =
              update.rawOutput ??
              extractToolContent(update.content) ??
              (update.status === 'failed' ? 'Tool execution failed' : '');
          }
        }
        break;
      }

      // Skip side-channel events
      default:
        break;
    }
  }

  // Flush any remaining message
  flushMessage();

  return messages;
}

/** Extract displayable text from ToolCallContent array (same logic as ChunkMapper). */
function extractToolContent(content: any[] | undefined | null): string | undefined {
  if (!content || !Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const item of content) {
    if (item.type === 'content' && item.content?.type === 'text' && item.content.text) {
      parts.push(item.content.text);
    } else if (item.type === 'diff' && item.diff) {
      parts.push(item.diff);
    } else if (item.type === 'terminal' && item.output) {
      parts.push(item.output);
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * Manages ACP session lifecycle (init, cleanup) separately from useChat.
 * Returns a lazy transport immediately so the UI can render without waiting
 * for the ACP subprocess to start.
 */
export function useAcpSession(options: UseAcpSessionOptions): UseAcpSessionReturn {
  const { conversationId, providerId, cwd, projectPath } = options;

  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<AcpSessionStatus>('initializing');
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [resumed, setResumed] = useState<boolean | null>(null);
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
      const tInit0 = performance.now();
      log.debug('Init started', { conversationId, providerId, cwd, projectPath });

      // Run message loading and session creation in parallel
      const [msgResult, sessionResult] = await Promise.all([
        api()
          .getMessages(conversationId)
          .catch(() => ({ success: false as const })),
        api().acpStart({ conversationId, providerId, cwd, projectPath }),
      ]);
      const tIpcDone = performance.now();

      if (cancelled) return;

      log.debug('Parallel init completed', {
        messagesLoaded: msgResult.success,
        sessionSuccess: sessionResult.success,
        historyEventCount: sessionResult.historyEvents?.length ?? 0,
        resumed: sessionResult.resumed ?? null,
      });

      // Surface resume status
      if (sessionResult.success) {
        const wasResumed = sessionResult.resumed ?? false;
        setResumed(wasResumed);
        if (wasResumed) {
          log.info('[RESUME CHECKPOINT] Session RESUMED successfully');
        } else {
          log.warn(
            '[RESUME CHECKPOINT] Session NOT resumed — new session created, agent has no prior context'
          );
        }
      }

      // Prefer ACP history events (from loadSession) over DB messages,
      // since they include the full conversation including user messages.
      if (sessionResult.historyEvents && sessionResult.historyEvents.length > 0) {
        const historyMessages = convertHistoryToMessages(sessionResult.historyEvents);
        log.debug('Restored messages from ACP history', { count: historyMessages.length });
        if (historyMessages.length > 0) {
          setInitialMessages(historyMessages);
        }
      } else if (msgResult.success && (msgResult as any).messages) {
        // Fallback: restore from DB (may be missing user messages)
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
        log.warn('Session creation failed', { error: err.message, providerId, conversationId });
        setSessionStatus('error');
        setSessionError(err);
        transportRef.current?.setError(err);
        return;
      }

      const tMsgParsed = performance.now();

      const key = sessionResult.sessionKey;
      log.debug('Session created', {
        sessionKey: key,
        acpSessionId: sessionResult.acpSessionId,
        modes: sessionResult.modes,
        models: sessionResult.models,
      });
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
        log.debug('Status changed', { sessionKey: key, newStatus });
        setSessionStatus(newStatus);
      });

      const tReady = performance.now();
      console.info(
        `[PERF useAcpSession] ipc(getMessages+acpStart)=${(tIpcDone - tInit0).toFixed(0)}ms msgParse=${(tMsgParsed - tIpcDone).toFixed(0)}ms wireTransport=${(tReady - tMsgParsed).toFixed(0)}ms total=${(tReady - tInit0).toFixed(0)}ms provider=${providerId} resumed=${sessionResult.resumed ?? 'n/a'}`
      );
    }

    init();

    return () => {
      cancelled = true;
      cleanupStatus?.();
      log.debug('Cleanup running', { sessionKey: sessionKeyRef.current });

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
    log.debug('Restart requested', { sessionKey: sessionKeyRef.current });
    // Kill the dead session
    if (sessionKeyRef.current) {
      api()
        .acpKill({ sessionKey: sessionKeyRef.current })
        .catch(() => {});
      sessionKeyRef.current = null;
    }
    innerTransportRef.current = null;
    // Reset state to trigger a fresh init
    setSessionKey(null);
    setSessionStatus('initializing');
    setSessionError(null);
    setRestartCount((c) => c + 1);
  }, []);

  return {
    transport,
    sessionStatus,
    sessionError,
    initialMessages,
    sessionKey,
    acpSessionId,
    resumed,
    modes,
    models,
    restartSession,
  };
}
