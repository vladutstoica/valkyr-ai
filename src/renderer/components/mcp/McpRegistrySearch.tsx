import React from 'react';
import { Search, X, Download, Loader2, ExternalLink } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useMcpRegistry } from '../../hooks/useMcpRegistry';
import type { McpServerInput } from '@shared/mcp/types';
import type { McpRegistryServer, McpRegistryPackage } from '../../types/electron-api';

interface McpRegistrySearchProps {
  onInstall: (prefill: McpServerInput) => void;
}

function buildPrefillFromPackage(server: McpRegistryServer): McpServerInput | null {
  const pkg: McpRegistryPackage | undefined = server.packages?.[0];
  if (!pkg) return null;

  const transportType = pkg.transport?.type;

  if (transportType === 'stdio' || pkg.runtimeHint === 'npx' || pkg.runtimeHint === 'uvx') {
    const runtime = pkg.runtimeHint ?? 'npx';
    const args: string[] = [];
    if (runtime === 'npx') args.push('-y');
    args.push(pkg.identifier);

    return {
      name: server.title ?? server.name,
      transport: 'stdio' as const,
      enabled: true,
      command: runtime,
      args,
      env: {},
    };
  }

  if (transportType === 'sse' || transportType === 'streamable-http') {
    return {
      name: server.title ?? server.name,
      transport: transportType === 'sse' ? ('sse' as const) : ('http' as const),
      enabled: true,
      url: '',
      headers: {},
    };
  }

  // Fallback: assume stdio with npx
  if (pkg.identifier) {
    return {
      name: server.title ?? server.name,
      transport: 'stdio' as const,
      enabled: true,
      command: pkg.runtimeHint ?? 'npx',
      args: pkg.runtimeHint === 'npx' ? ['-y', pkg.identifier] : [pkg.identifier],
      env: {},
    };
  }

  return null;
}

function getTransportLabel(pkg?: McpRegistryPackage): string {
  if (!pkg) return 'unknown';
  if (pkg.transport?.type) return pkg.transport.type;
  if (pkg.runtimeHint === 'npx' || pkg.runtimeHint === 'uvx') return 'stdio';
  return 'stdio';
}

function getTransportColor(transport: string): string {
  switch (transport) {
    case 'stdio':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'sse':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'streamable-http':
    case 'http':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export const McpRegistrySearch: React.FC<McpRegistrySearchProps> = ({ onInstall }) => {
  const { query, setQuery, results, isSearching, error, loadMore, nextCursor } = useMcpRegistry();

  const handleInstall = (server: McpRegistryServer) => {
    const prefill = buildPrefillFromPackage(server);
    if (prefill) onInstall(prefill);
  };

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search MCP servers (e.g. filesystem, github, postgres)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 pl-9 pr-8 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results */}
      {!query.trim() && (
        <div className="border-border/40 text-muted-foreground flex items-center justify-center rounded-lg border border-dashed py-6 text-xs">
          Type to search the official MCP server registry
        </div>
      )}

      {query.trim() && isSearching && results.length === 0 && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      )}

      {query.trim() && !isSearching && results.length === 0 && !error && (
        <div className="text-muted-foreground py-6 text-center text-xs">
          No servers found for &ldquo;{query}&rdquo;
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((server) => {
            const pkg = server.packages?.[0];
            const transport = getTransportLabel(pkg);
            const repoUrl = server.repository?.url;
            const shortRepo = repoUrl?.replace('https://github.com/', '');

            return (
              <div
                key={server.name}
                className="border-border/50 hover:border-border hover:bg-muted/30 flex items-start gap-3 rounded-lg border p-3 transition-colors"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {server.title ?? server.name}
                    </span>
                    <Badge variant="outline" className={`shrink-0 text-[10px] font-normal ${getTransportColor(transport)}`}>
                      {transport}
                    </Badge>
                    {pkg?.registryType && (
                      <Badge variant="outline" className="text-muted-foreground shrink-0 text-[10px] font-normal">
                        {pkg.registryType}
                      </Badge>
                    )}
                  </div>
                  {server.description && (
                    <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                      {server.description}
                    </p>
                  )}
                  {shortRepo && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground mt-0.5 flex items-center gap-1 text-[11px]"
                      onClick={() => window.electronAPI.openExternal(repoUrl!)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {shortRepo}
                    </button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 text-xs"
                  onClick={() => handleInstall(server)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Install
                </Button>
              </div>
            );
          })}

          {/* Load more */}
          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={loadMore}
                disabled={isSearching}
              >
                {isSearching ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
