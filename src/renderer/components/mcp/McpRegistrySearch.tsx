import React from 'react';
import { Search, X, Download, Loader2, ExternalLink } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useMcpRegistry } from '../../hooks/useMcpRegistry';
import type { McpServerInput } from '@shared/mcp/types';
import type {
  McpRegistryServer,
  McpRegistryPackage,
  McpRegistryRemote,
} from '../../types/electron-api';

interface McpRegistrySearchProps {
  onInstall: (prefill: McpServerInput) => void;
}

function buildPrefillFromPackage(server: McpRegistryServer): McpServerInput | null {
  const displayName = server.title ?? server.name.split('/').pop() ?? server.name;

  // Try packages first (npm/pypi/etc.)
  const pkg: McpRegistryPackage | undefined = server.packages?.[0];
  if (pkg) {
    const transportType = pkg.transport?.type;

    if (transportType === 'stdio' || pkg.registryType === 'npm' || pkg.registryType === 'pypi') {
      const runtime = pkg.registryType === 'pypi' ? 'uvx' : 'npx';
      const args: string[] = [];
      if (runtime === 'npx') args.push('-y');
      args.push(pkg.identifier);

      // Build env from environmentVariables
      const env: Record<string, string> = {};
      for (const v of pkg.environmentVariables ?? []) {
        env[v.name] = v.default ?? '';
      }

      return {
        name: displayName,
        transport: 'stdio' as const,
        enabled: true,
        command: runtime,
        args,
        env,
      };
    }

    if (transportType === 'sse' || transportType === 'streamable-http') {
      return {
        name: displayName,
        transport: transportType === 'sse' ? ('sse' as const) : ('http' as const),
        enabled: true,
        url: '',
        headers: {},
      };
    }

    // Fallback for package with identifier
    if (pkg.identifier) {
      return {
        name: displayName,
        transport: 'stdio' as const,
        enabled: true,
        command: 'npx',
        args: ['-y', pkg.identifier],
        env: {},
      };
    }
  }

  // Try remotes (cloud-hosted servers like Linear, Sentry)
  const remote: McpRegistryRemote | undefined = server.remotes?.[0];
  if (remote) {
    const transport = remote.type === 'sse' ? ('sse' as const) : ('http' as const);
    return {
      name: displayName,
      transport,
      enabled: true,
      url: remote.url,
      headers: {},
    };
  }

  return null;
}

function getTransportLabel(server: McpRegistryServer): string {
  const pkg = server.packages?.[0];
  if (pkg) {
    if (pkg.transport?.type) return pkg.transport.type;
    if (pkg.registryType === 'npm' || pkg.registryType === 'pypi') return 'stdio';
    return 'stdio';
  }
  const remote = server.remotes?.[0];
  if (remote) return remote.type;
  return 'unknown';
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
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search MCP servers (e.g. filesystem, github, postgres)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 pr-8 pl-9 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
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
          {results.map((server, idx) => {
            const pkg = server.packages?.[0];
            const transport = getTransportLabel(server);
            const repoUrl = server.repository?.url;
            const shortRepo = repoUrl?.replace('https://github.com/', '');

            return (
              <div
                key={`${server.name}-${server.version ?? idx}`}
                className="border-border/50 hover:border-border hover:bg-muted/30 flex items-start gap-3 rounded-lg border p-3 transition-colors"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {server.title ?? server.name.split('/').pop() ?? server.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] font-normal ${getTransportColor(transport)}`}
                    >
                      {transport}
                    </Badge>
                    {pkg?.registryType && (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground shrink-0 text-[10px] font-normal"
                      >
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
                {isSearching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
