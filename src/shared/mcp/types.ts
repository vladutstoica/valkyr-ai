export type McpServerTransport = 'stdio' | 'http' | 'sse';

export interface McpServerStdioConfig {
  id: string;
  name: string;
  transport: 'stdio';
  enabled: boolean;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface McpServerHttpConfig {
  id: string;
  name: string;
  transport: 'http';
  enabled: boolean;
  url: string;
  headers: Record<string, string>;
}

export interface McpServerSseConfig {
  id: string;
  name: string;
  transport: 'sse';
  enabled: boolean;
  url: string;
  headers: Record<string, string>;
}

export type McpServerConfig =
  | McpServerStdioConfig
  | McpServerHttpConfig
  | McpServerSseConfig;

/** McpServerConfig without the `id` field — used for creating new servers. */
export type McpServerInput =
  | Omit<McpServerStdioConfig, 'id'>
  | Omit<McpServerHttpConfig, 'id'>
  | Omit<McpServerSseConfig, 'id'>;
