import React, { useState, useCallback } from 'react';
import { Plus, Search, Blocks } from 'lucide-react';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { McpServerList } from './McpServerList';
import { McpServerForm } from './McpServerForm';
import { McpRegistrySearch } from './McpRegistrySearch';
import { useMcpServers } from '../../hooks/useMcpServers';
import type { McpServerConfig, McpServerInput } from '@shared/mcp/types';

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
          Configure Model Context Protocol servers injected into agent sessions.
          Search the official registry or add servers manually.
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
