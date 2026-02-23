import React, { useState, useCallback } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Plus, ChevronLeft, Blocks } from 'lucide-react';
import { McpServerList } from './McpServerList';
import { McpServerForm } from './McpServerForm';
import { useMcpServers, type McpScope } from '../../hooks/useMcpServers';
import type { McpServerConfig, McpServerInput } from '@shared/mcp/types';

interface Props {
  projectPath?: string;
}

type ViewState = 'list' | 'create' | 'edit';

const McpScopeTab: React.FC<{
  scope: McpScope;
  projectPath?: string;
  viewState: ViewState;
  setViewState: (v: ViewState) => void;
  editingServer: McpServerConfig | null;
  setEditingServer: (s: McpServerConfig | null) => void;
}> = ({ scope, projectPath, viewState, setViewState, editingServer, setEditingServer }) => {
  const { servers, isLoading, error, addServer, updateServer, deleteServer, toggleServer } =
    useMcpServers(scope, projectPath);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEdit = useCallback(
    (server: McpServerConfig) => {
      setEditingServer(server);
      setViewState('edit');
    },
    [setEditingServer, setViewState]
  );

  const handleDelete = useCallback(
    async (server: McpServerConfig) => {
      await deleteServer(server.id);
    },
    [deleteServer]
  );

  const handleToggle = useCallback(
    async (server: McpServerConfig, enabled: boolean) => {
      await toggleServer(server.id, enabled);
    },
    [toggleServer]
  );

  const handleSubmit = useCallback(
    async (server: McpServerInput) => {
      setIsSubmitting(true);
      try {
        if (viewState === 'edit' && editingServer) {
          await updateServer(editingServer.id, server);
        } else {
          await addServer(server);
        }
        setViewState('list');
        setEditingServer(null);
      } catch (err) {
        console.error('Failed to save MCP server:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [viewState, editingServer, addServer, updateServer, setViewState, setEditingServer]
  );

  const handleCancel = useCallback(() => {
    setViewState('list');
    setEditingServer(null);
  }, [setViewState, setEditingServer]);

  if (scope === 'project' && !projectPath) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-8 text-sm">
        Open a project to configure project-level MCP servers
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (viewState !== 'list') {
    return (
      <div className="border-border bg-muted/20 rounded-lg border p-6">
        <h3 className="mb-4 text-sm font-medium">
          {viewState === 'edit' ? 'Edit Server' : 'New MCP Server'}
        </h3>
        <McpServerForm
          initialValues={editingServer ?? undefined}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      </div>
    );
  }

  return (
    <McpServerList
      servers={servers}
      isLoading={isLoading}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onToggle={handleToggle}
      onAddNew={() => setViewState('create')}
    />
  );
};

export const McpSettingsCard: React.FC<Props> = ({ projectPath }) => {
  const [scope, setScope] = useState<McpScope>('global');
  const [viewState, setViewState] = useState<ViewState>('list');
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);

  const handleScopeChange = useCallback((value: string) => {
    setScope(value as McpScope);
    setViewState('list');
    setEditingServer(null);
  }, []);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Blocks className="h-5 w-5" />
            MCP Servers
          </CardTitle>
          <CardDescription className="text-xs">
            Configure MCP servers injected into agent sessions
          </CardDescription>
        </div>

        {viewState === 'list' ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditingServer(null);
              setViewState('create');
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Server
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setViewState('list');
              setEditingServer(null);
            }}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        )}
      </CardHeader>

      <CardContent>
        <Tabs value={scope} onValueChange={handleScopeChange} className="mb-4">
          <TabsList className="h-8">
            <TabsTrigger value="global" className="text-xs">
              Global
            </TabsTrigger>
            <TabsTrigger value="project" className="text-xs" disabled={!projectPath}>
              Project
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <McpScopeTab
          scope={scope}
          projectPath={projectPath}
          viewState={viewState}
          setViewState={setViewState}
          editingServer={editingServer}
          setEditingServer={setEditingServer}
        />
      </CardContent>
    </Card>
  );
};

export default McpSettingsCard;
