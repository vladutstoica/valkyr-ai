import React, { useState, useCallback } from 'react';
import { Plus, Search, Blocks, Download, Check, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { McpServerList } from './McpServerList';
import { McpServerForm } from './McpServerForm';
import { McpRegistrySearch } from './McpRegistrySearch';
import { useMcpServers } from '../../hooks/useMcpServers';
import type { McpServerConfig, McpServerInput } from '@shared/mcp/types';
import type { AgentMcpDiscovery } from '../../types/electron-api';

interface McpViewProps {
  projectPath?: string;
}

type ViewState =
  | { mode: 'list' }
  | { mode: 'create'; scope: 'global' | 'project'; prefill?: McpServerInput }
  | { mode: 'edit'; scope: 'global' | 'project'; server: McpServerConfig };

export const McpView: React.FC<McpViewProps> = ({ projectPath }) => {
  const [viewState, setViewState] = useState<ViewState>({ mode: 'list' });

  const globalServers = useMcpServers('global');
  const projectServers = useMcpServers('project', projectPath);

  // Agent import state
  const [discoveries, setDiscoveries] = useState<AgentMcpDiscovery[] | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [importedNames, setImportedNames] = useState<Set<string>>(new Set());

  const existingNames = new Set([
    ...globalServers.servers.map((s) => s.name),
    ...projectServers.servers.map((s) => s.name),
  ]);

  const handleDetectAgents = useCallback(async () => {
    setIsDetecting(true);
    try {
      const res = await window.electronAPI.mcpDetectAgentServers({ projectPath });
      if (res.success && res.data) {
        setDiscoveries(res.data);
      }
    } catch (err) {
      console.error('Failed to detect agent servers:', err);
    } finally {
      setIsDetecting(false);
    }
  }, [projectPath]);

  const handleImportServer = useCallback(
    async (server: McpServerConfig, scope: 'global' | 'project') => {
      const hook = scope === 'global' ? globalServers : projectServers;
      const input: McpServerInput =
        server.transport === 'stdio'
          ? {
              name: server.name,
              transport: 'stdio',
              enabled: true,
              command: server.command,
              args: server.args,
              env: server.env,
            }
          : {
              name: server.name,
              transport: server.transport,
              enabled: true,
              url: server.url,
              headers: server.headers,
            };
      await hook.addServer(input);
      setImportedNames((prev) => new Set(prev).add(server.name));
    },
    [globalServers, projectServers]
  );

  const handleInstallFromRegistry = useCallback((prefill: McpServerInput) => {
    setViewState({ mode: 'create', scope: 'global', prefill });
  }, []);

  const handleAddManual = useCallback((scope: 'global' | 'project') => {
    setViewState({ mode: 'create', scope });
  }, []);

  const handleEdit = useCallback((server: McpServerConfig, scope: 'global' | 'project') => {
    setViewState({ mode: 'edit', scope, server });
  }, []);

  const handleCancel = useCallback(() => {
    setViewState({ mode: 'list' });
  }, []);

  const handleSubmit = useCallback(
    async (serverInput: McpServerInput) => {
      if (viewState.mode === 'edit') {
        const hook = viewState.scope === 'global' ? globalServers : projectServers;
        await hook.updateServer(viewState.server.id, serverInput as Partial<McpServerConfig>);
      } else if (viewState.mode === 'create') {
        const hook = viewState.scope === 'global' ? globalServers : projectServers;
        await hook.addServer(serverInput);
      }
      setViewState({ mode: 'list' });
    },
    [viewState, globalServers, projectServers]
  );

  const handleDelete = useCallback(
    async (server: McpServerConfig, scope: 'global' | 'project') => {
      const hook = scope === 'global' ? globalServers : projectServers;
      await hook.deleteServer(server.id);
    },
    [globalServers, projectServers]
  );

  const handleToggle = useCallback(
    async (server: McpServerConfig, enabled: boolean, scope: 'global' | 'project') => {
      const hook = scope === 'global' ? globalServers : projectServers;
      await hook.toggleServer(server.id, enabled);
    },
    [globalServers, projectServers]
  );

  // Show form
  if (viewState.mode !== 'list') {
    const scopeLabel = viewState.scope === 'global' ? 'Global' : 'Project';
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">
            {viewState.mode === 'edit' ? 'Edit Server' : 'Add MCP Server'}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {viewState.mode === 'edit'
              ? `Editing server in ${scopeLabel.toLowerCase()} scope`
              : `Adding to ${scopeLabel.toLowerCase()} servers`}
          </p>
        </div>
        <McpServerForm
          initialValues={viewState.mode === 'edit' ? viewState.server : undefined}
          prefill={viewState.mode === 'create' ? viewState.prefill : undefined}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Blocks className="text-muted-foreground h-5 w-5" />
          <h2 className="text-lg font-semibold">MCP Servers</h2>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure Model Context Protocol servers injected into agent sessions. Search the official
          registry or add servers manually.
        </p>
      </div>

      {/* Registry Search */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="text-muted-foreground h-4 w-4" />
          <h3 className="text-sm font-semibold">Browse Registry</h3>
        </div>
        <McpRegistrySearch onInstall={handleInstallFromRegistry} />
      </section>

      {/* Import from Agents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="text-muted-foreground h-4 w-4" />
            <h3 className="text-sm font-semibold">Import from Agents</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleDetectAgents}
            disabled={isDetecting}
          >
            {isDetecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            {discoveries === null ? 'Detect' : 'Rescan'}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Detect MCP servers configured in Claude Code, Cursor, and other agents.
        </p>

        {discoveries !== null && discoveries.length === 0 && (
          <div className="border-border/40 text-muted-foreground flex items-center justify-center rounded-lg border border-dashed py-4 text-xs">
            No MCP servers found in other agents
          </div>
        )}

        {discoveries !== null && discoveries.length > 0 && (
          <div className="space-y-3">
            {discoveries.map((discovery) => (
              <div key={`${discovery.agent}-${discovery.scope}`} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{discovery.agent}</span>
                  <Badge
                    variant="outline"
                    className="text-muted-foreground text-[10px] font-normal"
                  >
                    {discovery.scope}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {discovery.servers.map((server) => {
                    const alreadyExists = existingNames.has(server.name);
                    const justImported = importedNames.has(server.name);
                    return (
                      <div
                        key={server.name}
                        className="border-border/50 flex items-center justify-between gap-3 rounded-lg border p-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm">{server.name}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                            {server.transport}
                          </Badge>
                        </div>
                        {alreadyExists || justImported ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-500">
                            <Check className="h-3.5 w-3.5" />
                            {justImported ? 'Imported' : 'Already exists'}
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() =>
                              void handleImportServer(
                                server,
                                discovery.scope === 'project' ? 'project' : 'global'
                              )
                            }
                          >
                            <Download className="h-3 w-3" />
                            Import
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator className="border-border/60" />

      {/* Global Servers */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Global Servers</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => handleAddManual('global')}
          >
            <Plus className="h-3.5 w-3.5" />
            Add manually
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Available in all projects and agent sessions.
        </p>
        <McpServerList
          servers={globalServers.servers}
          isLoading={globalServers.isLoading}
          onEdit={(server) => handleEdit(server, 'global')}
          onDelete={(server) => void handleDelete(server, 'global')}
          onToggle={(server, enabled) => void handleToggle(server, enabled, 'global')}
          onAddNew={() => handleAddManual('global')}
        />
      </section>

      {/* Project Servers */}
      {projectPath && (
        <>
          <Separator className="border-border/60" />
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Project Servers</h3>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleAddManual('project')}
              >
                <Plus className="h-3.5 w-3.5" />
                Add manually
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Only available when working in this project.
            </p>
            <McpServerList
              servers={projectServers.servers}
              isLoading={projectServers.isLoading}
              onEdit={(server) => handleEdit(server, 'project')}
              onDelete={(server) => void handleDelete(server, 'project')}
              onToggle={(server, enabled) => void handleToggle(server, enabled, 'project')}
              onAddNew={() => handleAddManual('project')}
            />
          </section>
        </>
      )}
    </div>
  );
};
