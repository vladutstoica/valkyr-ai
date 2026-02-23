import React from 'react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Pencil, Trash2, Plus, Server } from 'lucide-react';
import type { McpServerConfig } from '@shared/mcp/types';

interface Props {
  servers: McpServerConfig[];
  isLoading: boolean;
  onEdit: (server: McpServerConfig) => void;
  onDelete: (server: McpServerConfig) => void;
  onToggle: (server: McpServerConfig, enabled: boolean) => void;
  onAddNew: () => void;
}

function getConfigSummary(server: McpServerConfig): string {
  if (server.transport === 'stdio') {
    const args = server.args.length > 0 ? ` ${server.args.join(' ')}` : '';
    return `${server.command}${args}`;
  }
  return server.url;
}

const transportColors: Record<string, string> = {
  stdio: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  http: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  sse: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

export const McpServerList: React.FC<Props> = ({
  servers,
  isLoading,
  onEdit,
  onDelete,
  onToggle,
  onAddNew,
}) => {
  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-8 text-sm">
        Loading...
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-8 text-sm">
        <Server className="h-8 w-8 opacity-40" />
        <p>No MCP servers configured</p>
        <Button type="button" size="sm" onClick={onAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Server
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {servers.map((server) => (
        <div
          key={server.id}
          className="border-border/50 flex items-center gap-3 rounded-md border px-3 py-2"
        >
          <Switch
            checked={server.enabled}
            onCheckedChange={(checked) => onToggle(server, checked)}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{server.name}</span>
              <Badge
                variant="outline"
                className={`px-1.5 py-0 text-[10px] ${transportColors[server.transport] || ''}`}
              >
                {server.transport}
              </Badge>
            </div>
            <span className="text-muted-foreground truncate text-xs">
              {getConfigSummary(server)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onEdit(server)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onDelete(server)}>
              <Trash2 className="text-destructive h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};
