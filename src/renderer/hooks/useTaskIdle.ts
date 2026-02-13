import { useEffect, useState } from 'react';
import { activityStore } from '../lib/activityStore';

export function useTaskIdle(taskId: string) {
  const [idle, setIdle] = useState(false);
  useEffect(() => activityStore.subscribeIdle(taskId, setIdle), [taskId]);
  return idle;
}
