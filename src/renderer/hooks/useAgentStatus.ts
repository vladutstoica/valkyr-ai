import { useEffect, useMemo, useState } from 'react';

type AgentStatusEntry = {
  installed?: boolean;
  path?: string | null;
  version?: string | null;
  lastChecked?: number;
};

/**
 * Manages agent/provider installation status detection.
 * Loads cached statuses, refreshes stale entries, and subscribes to live updates.
 */
export function useAgentStatus(agent: string, taskId: string, activated: boolean) {
  const [isAgentInstalled, setIsAgentInstalled] = useState<boolean | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatusEntry>>({});

  const currentAgentStatus = agentStatuses[agent];

  // Sync installed flag when agent or its status changes
  useEffect(() => {
    const installed = currentAgentStatus?.installed === true;
    setIsAgentInstalled(installed);
  }, [agent, currentAgentStatus]);

  // Load, refresh, and subscribe to agent statuses
  useEffect(() => {
    if (!activated) return;
    let cancelled = false;
    let refreshCheckRequested = false;
    const api: any = (window as any).electronAPI;

    const applyStatuses = (statuses: Record<string, any> | undefined | null) => {
      if (!statuses) return;
      setAgentStatuses(statuses);
      if (cancelled) return;
      const installed = statuses?.[agent]?.installed === true;
      setIsAgentInstalled(installed);
    };

    const maybeRefreshAgentStatus = async (statuses?: Record<string, any> | undefined | null) => {
      if (cancelled || refreshCheckRequested) return;
      if (!api?.getProviderStatuses) return;

      const status = statuses?.[agent];
      const hasEntry = Boolean(status);
      const isInstalled = status?.installed === true;
      const lastChecked =
        typeof status?.lastChecked === 'number' && Number.isFinite(status.lastChecked)
          ? status.lastChecked
          : 0;
      const isStale = !lastChecked || Date.now() - lastChecked > 5 * 60 * 1000;

      if (hasEntry && isInstalled && !isStale) return;

      refreshCheckRequested = true;
      try {
        const refreshed = await api.getProviderStatuses({ refresh: true, providers: [agent] });
        if (cancelled) return;
        if (refreshed?.success) {
          applyStatuses(refreshed.statuses ?? {});
        }
      } catch (error) {
        console.error('Agent status refresh failed', error);
      }
    };

    const load = async () => {
      if (!api?.getProviderStatuses) {
        setIsAgentInstalled(false);
        return;
      }
      try {
        const res = await api.getProviderStatuses();
        if (cancelled) return;
        if (res?.success) {
          applyStatuses(res.statuses ?? {});
          void maybeRefreshAgentStatus(res.statuses);
        } else {
          setIsAgentInstalled(false);
        }
      } catch (error) {
        if (!cancelled) setIsAgentInstalled(false);
        console.error('Agent status load failed', error);
      }
    };

    const off =
      api?.onProviderStatusUpdated?.((payload: { providerId: string; status: any }) => {
        if (!payload?.providerId) return;
        setAgentStatuses((prev) => {
          const next = { ...prev, [payload.providerId]: payload.status };
          return next;
        });
        if (payload.providerId === agent) {
          setIsAgentInstalled(payload.status?.installed === true);
        }
      }) || null;

    void load();

    return () => {
      cancelled = true;
      off?.();
    };
  }, [agent, taskId, activated]);

  const installedAgents = useMemo(
    () =>
      Object.entries(agentStatuses)
        .filter(([, status]) => status.installed === true)
        .map(([id]) => id),
    [agentStatuses]
  );

  return { isAgentInstalled, setIsAgentInstalled, agentStatuses, installedAgents };
}
