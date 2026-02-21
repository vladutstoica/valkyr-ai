import { useState, useEffect, useRef, useMemo } from 'react';
import type { UIMessage } from 'ai';
import { AcpChatTransport } from '../lib/acpChatTransport';
import type { AcpSessionStatus, AcpSessionModes, AcpSessionModels } from '../types/electron-api';

const api = () => window.electronAPI;

export type UseAcpSessionOptions = {
  conversationId: string;
  providerId: string;
  cwd: string;
};

export type UseAcpSessionReturn = {
  transport: AcpChatTransport | null;
  sessionStatus: AcpSessionStatus;
  sessionError: Error | null;
  initialMessages: UIMessage[];
  sessionKey: string | null;
  modes: AcpSessionModes;
  models: AcpSessionModels;
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
    }
  }

  return result;
}

/**
 * Manages ACP session lifecycle (init, cleanup) separately from useChat.
 * Returns the transport instance once the session is ready.
 */
export function useAcpSession(options: UseAcpSessionOptions): UseAcpSessionReturn {
  const { conversationId, providerId, cwd } = options;

  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<AcpSessionStatus>('initializing');
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [modes, setModes] = useState<AcpSessionModes>(null);
  const [models, setModels] = useState<AcpSessionModels>(null);

  const mountedRef = useRef(true);
  const sessionKeyRef = useRef<string | null>(null);

  // Create transport once session key is available
  const transport = useMemo(() => {
    if (!sessionKey) return null;
    return new AcpChatTransport({ sessionKey, conversationId });
  }, [sessionKey, conversationId]);

  useEffect(() => {
    mountedRef.current = true;
    let cleanupStatus: (() => void) | null = null;

    async function init() {
      // Load existing messages from DB and convert to UIMessage format
      try {
        const msgResult = await api().getMessages(conversationId);
        if (msgResult.success && msgResult.messages && mountedRef.current) {
          const restored: UIMessage[] = msgResult.messages.map((m: any) => ({
            id: m.id,
            role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
            parts: m.parts
              ? convertStoredParts(JSON.parse(m.parts))
              : [{ type: 'text' as const, text: m.content }],
          }));
          setInitialMessages(restored);
        }
      } catch {
        // Non-fatal: proceed without restored messages
      }

      // Start the ACP session
      const result = await api().acpStart({
        conversationId,
        providerId,
        cwd,
      });

      if (!mountedRef.current) return;

      if (!result.success || !result.sessionKey) {
        setSessionStatus('error');
        setSessionError(new Error(result.error || 'Failed to start ACP session'));
        return;
      }

      const key = result.sessionKey;
      sessionKeyRef.current = key;
      setSessionKey(key);
      setModes(result.modes ?? null);
      setModels(result.models ?? null);
      setSessionStatus('ready');

      // Subscribe to ACP status changes
      cleanupStatus = api().onAcpStatus(key, (newStatus: AcpSessionStatus) => {
        if (!mountedRef.current) return;
        if (sessionKeyRef.current !== key) return;
        setSessionStatus(newStatus);
      });
    }

    init();

    return () => {
      mountedRef.current = false;
      cleanupStatus?.();

      if (sessionKeyRef.current) {
        api().acpKill({ sessionKey: sessionKeyRef.current });
      }
      sessionKeyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, providerId, cwd]);

  return { transport, sessionStatus, sessionError, initialMessages, sessionKey, modes, models };
}
