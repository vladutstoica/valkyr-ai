import { useEffect, useState } from 'react';
import { unifiedStatusStore, type StatusDot } from '../lib/unifiedStatusStore';

const DEFAULT_DOT: StatusDot = { color: 'green', style: 'solid' };

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
