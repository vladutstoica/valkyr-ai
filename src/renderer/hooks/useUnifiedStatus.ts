import { useEffect, useState } from 'react';
import { unifiedStatusStore, type StatusDot } from '../lib/unifiedStatusStore';

/**
 * Subscribe to unified status dot for a task (works for both ACP and PTY modes).
 */
export function useUnifiedStatus(taskId: string): StatusDot {
  const [dot, setDot] = useState<StatusDot>(() => unifiedStatusStore.getDot(taskId));

  useEffect(() => {
    return unifiedStatusStore.subscribe(taskId, setDot);
  }, [taskId]);

  return dot;
}

/**
 * Subscribe to per-conversation status dots for a task.
 * Returns an array of dots (one per chat/conversation).
 */
export function useConversationDots(taskId: string): StatusDot[] {
  const [dots, setDots] = useState<StatusDot[]>(() =>
    unifiedStatusStore.getConversationDots(taskId)
  );

  useEffect(() => {
    return unifiedStatusStore.subscribe(taskId, () => {
      setDots(unifiedStatusStore.getConversationDots(taskId));
    });
  }, [taskId]);

  return dots;
}
