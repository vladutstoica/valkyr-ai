import React, { useCallback, useEffect, useState } from 'react';
import { Check, Download, Loader2, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import type { AcpRegistryEntry, InstalledAcpAgent } from '@shared/acpRegistry';

type AgentRow = AcpRegistryEntry & { installed: boolean; installing: boolean };

export default function AcpAgentsList() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [regResult, instResult] = await Promise.all([
        window.electronAPI.acpRegistryFetch(),
        window.electronAPI.acpRegistryGetInstalled(),
      ]);

      const registry = regResult.data || [];
      const installed = instResult.data || [];
      const installedIds = new Set(installed.map((a: InstalledAcpAgent) => a.id));

      const rows: AgentRow[] = registry.map((entry: AcpRegistryEntry) => ({
        ...entry,
        installed: installedIds.has(entry.id),
        installing: false,
      }));

      // Sort: installed first, then alphabetical
      rows.sort((a, b) => {
        if (a.installed !== b.installed) return a.installed ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setAgents(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load ACP agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInstall = useCallback(async (agentId: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, installing: true } : a))
    );
    try {
      const result = await window.electronAPI.acpRegistryInstall({ agentId });
      if (result.success) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agentId ? { ...a, installed: true, installing: false } : a))
        );
      } else {
        setAgents((prev) =>
          prev.map((a) => (a.id === agentId ? { ...a, installing: false } : a))
        );
      }
    } catch {
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, installing: false } : a))
      );
    }
  }, []);

  const handleUninstall = useCallback(async (agentId: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, installing: true } : a))
    );
    try {
      const result = await window.electronAPI.acpRegistryUninstall({ agentId });
      if (result.success) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agentId ? { ...a, installed: false, installing: false } : a))
        );
      } else {
        setAgents((prev) =>
          prev.map((a) => (a.id === agentId ? { ...a, installing: false } : a))
        );
      }
    } catch {
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, installing: false } : a))
      );
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        Loading ACP agents...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-2 text-sm text-destructive">
        {error}
        <Button variant="link" size="sm" onClick={load} className="ml-2">
          Retry
        </Button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">No ACP agents found in registry.</p>
    );
  }

  return (
    <div className="min-w-0 w-full space-y-1">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="flex w-full items-center gap-3 overflow-hidden rounded-md border border-border/50 px-3 py-2"
        >
          {agent.icon ? (
            <img
              src={agent.icon}
              alt={agent.name}
              className="h-6 w-6 shrink-0 rounded object-contain"
            />
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
              {agent.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{agent.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">v{agent.version}</span>
              {agent.installed && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-500">
                  <Check size={10} /> Installed
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{agent.description}</p>
          </div>
          <div className="ml-2 shrink-0">
            {agent.installing ? (
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            ) : agent.installed ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleUninstall(agent.id)}
                title="Uninstall"
              >
                <Trash2 size={14} />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => handleInstall(agent.id)}
              >
                <Download size={12} /> Install
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
