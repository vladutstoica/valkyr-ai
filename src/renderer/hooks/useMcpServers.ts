import { useState, useEffect, useCallback } from 'react';
import type { McpServerConfig, McpServerInput } from '@shared/mcp/types';

const api = () => window.electronAPI;

export type McpScope = 'global' | 'project';

export function useMcpServers(scope: McpScope, projectPath?: string) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res =
        scope === 'global'
          ? await api().mcpGetGlobalServers()
          : await api().mcpGetProjectServers(projectPath!);
      if (res.success && res.data) {
        setServers(res.data);
      } else {
        setError(res.error || 'Failed to load MCP servers');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [scope, projectPath]);

  const save = useCallback(
    async (updated: McpServerConfig[]) => {
      try {
        const res =
          scope === 'global'
            ? await api().mcpSaveGlobalServers(updated)
            : await api().mcpSaveProjectServers(projectPath!, updated);
        if (res.success && res.data) {
          setServers(res.data);
        } else {
          setError(res.error || 'Failed to save MCP servers');
        }
      } catch (err: any) {
        setError(err.message);
      }
    },
    [scope, projectPath]
  );

  const addServer = useCallback(
    async (server: McpServerInput) => {
      const withId = { ...server, id: crypto.randomUUID() } as McpServerConfig;
      await save([...servers, withId]);
    },
    [save, servers]
  );

  const updateServer = useCallback(
    async (id: string, updates: Partial<McpServerConfig>) => {
      const updated = servers.map((s) =>
        s.id === id ? ({ ...s, ...updates } as McpServerConfig) : s
      );
      await save(updated);
    },
    [save, servers]
  );

  const deleteServer = useCallback(
    async (id: string) => {
      await save(servers.filter((s) => s.id !== id));
    },
    [save, servers]
  );

  const toggleServer = useCallback(
    async (id: string, enabled: boolean) => {
      await updateServer(id, { enabled });
    },
    [updateServer]
  );

  useEffect(() => {
    if (scope === 'project' && !projectPath) return;
    void refresh();
  }, [refresh, scope, projectPath]);

  return {
    servers,
    isLoading,
    error,
    refresh,
    addServer,
    updateServer,
    deleteServer,
    toggleServer,
  };
}
