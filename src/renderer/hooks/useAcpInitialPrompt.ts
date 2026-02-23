import { useEffect, useRef } from 'react';
import { initialPromptSentKey } from '../lib/keys';

type AppendFn = ((msg: { content: string }) => Promise<void>) | null;

/**
 * Injects an initial prompt into an ACP chat session once it's ready.
 * One-shot per task+provider. Waits for the append function to become available.
 */
export function useAcpInitialPrompt(opts: {
  taskId: string;
  providerId: string;
  prompt: string | null | undefined;
  appendFn: AppendFn;
  chatStatus: string;
  enabled?: boolean;
}) {
  const { taskId, providerId, prompt, appendFn, chatStatus, enabled = true } = opts;
  const sentRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const trimmed = (prompt || '').trim();
    if (!trimmed) return;
    if (sentRef.current) return;

    const sentKey = initialPromptSentKey(taskId, providerId);
    if (localStorage.getItem(sentKey) === '1') {
      sentRef.current = true;
      return;
    }

    // Wait for chat to be ready and append function to be available
    if (chatStatus !== 'ready' || !appendFn) return;

    sentRef.current = true;
    localStorage.setItem(sentKey, '1');
    try {
      window.electronAPI?.setTaskInitialPromptSent?.({ taskId, sent: true });
    } catch {}
    appendFn({ content: trimmed }).catch(() => {});
  }, [enabled, taskId, providerId, prompt, appendFn, chatStatus]);
}
