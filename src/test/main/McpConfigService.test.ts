import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron before any imports that might pull it in transitively
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
    getName: vi.fn().mockReturnValue('valkyr-test'),
    getVersion: vi.fn().mockReturnValue('0.0.0-test'),
  },
}));

// Mock fs (sync)
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

// Mock fs/promises (async)
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock os
vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}));

// Mock settings module
vi.mock('../../main/settings', () => ({
  getAppSettings: vi.fn(),
  updateAppSettings: vi.fn(),
}));

// Mock logger
vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { getAppSettings, updateAppSettings } from '../../main/settings';
import { McpConfigService } from '../../main/services/McpConfigService';
import type { McpServerConfig } from '@shared/mcp/types';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockGetAppSettings = vi.mocked(getAppSettings);
const mockUpdateAppSettings = vi.mocked(updateAppSettings);

// Factory helpers
function makeStdioServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'test-id',
    name: 'my-stdio-server',
    transport: 'stdio',
    enabled: true,
    command: 'node',
    args: ['server.js'],
    env: { TOKEN: 'abc' },
    ...overrides,
  } as McpServerConfig;
}

function makeHttpServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'test-http-id',
    name: 'my-http-server',
    transport: 'http',
    enabled: true,
    url: 'https://example.com/mcp',
    headers: { Authorization: 'Bearer token' },
    ...overrides,
  } as McpServerConfig;
}

function makeSseServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'test-sse-id',
    name: 'my-sse-server',
    transport: 'sse',
    enabled: true,
    url: 'https://example.com/sse',
    headers: {},
    ...overrides,
  } as McpServerConfig;
}

// ---------------------------------------------------------------------------
// getGlobalServers
// ---------------------------------------------------------------------------

describe('McpConfigService.getGlobalServers', () => {
  let service: McpConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new McpConfigService();
  });

  it('returns the mcp servers array from app settings', () => {
    const servers = [makeStdioServer()];
    mockGetAppSettings.mockReturnValue({ mcp: { servers } } as any);
    expect(service.getGlobalServers()).toEqual(servers);
  });

  it('returns an empty array when mcp is undefined in settings', () => {
    mockGetAppSettings.mockReturnValue({} as any);
    expect(service.getGlobalServers()).toEqual([]);
  });

  it('returns an empty array when mcp.servers is undefined', () => {
    mockGetAppSettings.mockReturnValue({ mcp: {} } as any);
    expect(service.getGlobalServers()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// saveGlobalServers
// ---------------------------------------------------------------------------

describe('McpConfigService.saveGlobalServers', () => {
  let service: McpConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new McpConfigService();
  });

  it('calls updateAppSettings with the servers array and returns saved servers', () => {
    const servers = [makeStdioServer()];
    mockGetAppSettings.mockReturnValue({ mcp: {} } as any);
    mockUpdateAppSettings.mockReturnValue({ mcp: { servers } } as any);

    const result = service.saveGlobalServers(servers);
    expect(mockUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mcp: expect.objectContaining({ servers }) })
    );
    expect(result).toEqual(servers);
  });

  it('merges existing mcp settings when saving', () => {
    const existingMcp = { someOtherField: true, servers: [] };
    mockGetAppSettings.mockReturnValue({ mcp: existingMcp } as any);
    const newServers = [makeStdioServer()];
    mockUpdateAppSettings.mockReturnValue({ mcp: { ...existingMcp, servers: newServers } } as any);

    service.saveGlobalServers(newServers);
    const callArg = mockUpdateAppSettings.mock.calls[0][0] as any;
    expect(callArg.mcp.someOtherField).toBe(true);
    expect(callArg.mcp.servers).toEqual(newServers);
  });

  it('returns empty array when updateAppSettings returns no mcp.servers', () => {
    mockGetAppSettings.mockReturnValue({} as any);
    mockUpdateAppSettings.mockReturnValue({} as any);
    const result = service.saveGlobalServers([]);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getProjectServers
// ---------------------------------------------------------------------------

describe('McpConfigService.getProjectServers', () => {
  let service: McpConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new McpConfigService();
  });

  it('returns an empty array when .valkyr.json does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const result = await service.getProjectServers('/some/project');
    expect(result).toEqual([]);
  });

  it('parses mcpServers array from .valkyr.json', async () => {
    const servers = [makeStdioServer()];
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({ mcpServers: servers }) as any);

    const result = await service.getProjectServers('/some/project');
    expect(result).toEqual(servers);
  });

  it('returns empty array when mcpServers is not an array', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({ mcpServers: {} }) as any);
    const result = await service.getProjectServers('/some/project');
    expect(result).toEqual([]);
  });

  it('returns empty array when mcpServers key is absent', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({ otherKey: 'value' }) as any);
    const result = await service.getProjectServers('/some/project');
    expect(result).toEqual([]);
  });

  it('returns empty array and does not throw when JSON is malformed', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('{ invalid json }' as any);
    const result = await service.getProjectServers('/some/project');
    expect(result).toEqual([]);
  });

  it('returns empty array when readFile throws', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockRejectedValue(new Error('Permission denied'));
    const result = await service.getProjectServers('/some/project');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// saveProjectServers
// ---------------------------------------------------------------------------

describe('McpConfigService.saveProjectServers', () => {
  let service: McpConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new McpConfigService();
    mockWriteFile.mockResolvedValue(undefined as any);
  });

  it('creates .valkyr.json when it does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const servers = [makeStdioServer()];
    const result = await service.saveProjectServers('/some/project', servers);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.valkyr.json'),
      expect.stringContaining('"mcpServers"'),
      'utf8'
    );
    expect(result).toEqual(servers);
  });

  it('merges with existing .valkyr.json content', async () => {
    mockExistsSync.mockReturnValue(true);
    const existing = { someField: 'kept', mcpServers: [] };
    mockReadFile.mockResolvedValue(JSON.stringify(existing) as any);
    const servers = [makeHttpServer()];
    await service.saveProjectServers('/some/project', servers);

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written.someField).toBe('kept');
    expect(written.mcpServers).toEqual(servers);
  });

  it('starts fresh (empty object) when existing .valkyr.json is malformed', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('{ bad json }' as any);
    const servers = [makeStdioServer()];
    await service.saveProjectServers('/some/project', servers);

    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written.mcpServers).toEqual(servers);
  });

  it('writes formatted JSON (indented with 2 spaces)', async () => {
    mockExistsSync.mockReturnValue(false);
    await service.saveProjectServers('/some/project', []);
    const writtenContent = mockWriteFile.mock.calls[0][1] as string;
    expect(writtenContent).toContain('\n');
    expect(JSON.parse(writtenContent)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getMergedServersForSession
// ---------------------------------------------------------------------------

describe('McpConfigService.getMergedServersForSession', () => {
  let service: McpConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new McpConfigService();
    mockExistsSync.mockReturnValue(false);
    mockGetAppSettings.mockReturnValue({ mcp: { servers: [] } } as any);
  });

  it('returns empty array when no global or project servers exist', async () => {
    const result = await service.getMergedServersForSession();
    expect(result).toEqual([]);
  });

  it('filters out disabled global servers', async () => {
    mockGetAppSettings.mockReturnValue({
      mcp: {
        servers: [
          makeStdioServer({ name: 'enabled-server', enabled: true }),
          makeStdioServer({ name: 'disabled-server', enabled: false }),
        ],
      },
    } as any);
    const result = await service.getMergedServersForSession();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('enabled-server');
  });

  it('converts stdio servers to ACP format with env as array', async () => {
    mockGetAppSettings.mockReturnValue({
      mcp: {
        servers: [
          makeStdioServer({ name: 'srv', env: { FOO: 'bar', BAZ: 'qux' } }),
        ],
      },
    } as any);
    const result = await service.getMergedServersForSession();
    expect(result).toHaveLength(1);
    const srv = result[0] as any;
    expect(srv.command).toBe('node');
    expect(srv.args).toEqual(['server.js']);
    expect(srv.env).toEqual(
      expect.arrayContaining([
        { name: 'FOO', value: 'bar' },
        { name: 'BAZ', value: 'qux' },
      ])
    );
  });

  it('converts http servers to ACP format with headers as array', async () => {
    mockGetAppSettings.mockReturnValue({
      mcp: {
        servers: [makeHttpServer({ headers: { Authorization: 'Bearer token' } })],
      },
    } as any);
    const result = await service.getMergedServersForSession();
    expect(result).toHaveLength(1);
    const srv = result[0] as any;
    expect(srv.type).toBe('http');
    expect(srv.url).toBe('https://example.com/mcp');
    expect(srv.headers).toEqual([{ name: 'Authorization', value: 'Bearer token' }]);
  });

  it('converts sse servers to ACP format', async () => {
    mockGetAppSettings.mockReturnValue({
      mcp: {
        servers: [makeSseServer()],
      },
    } as any);
    const result = await service.getMergedServersForSession();
    const srv = result[0] as any;
    expect(srv.type).toBe('sse');
    expect(srv.url).toBe('https://example.com/sse');
  });

  it('project servers override global servers with the same name', async () => {
    const globalServer = makeStdioServer({ name: 'shared', command: 'global-cmd' });
    const projectServer = makeStdioServer({ name: 'shared', command: 'project-cmd' });

    mockGetAppSettings.mockReturnValue({ mcp: { servers: [globalServer] } } as any);
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(
      JSON.stringify({ mcpServers: [projectServer] }) as any
    );

    const result = await service.getMergedServersForSession('/my/project');
    expect(result).toHaveLength(1);
    expect((result[0] as any).command).toBe('project-cmd');
  });

  it('adds project servers that have unique names', async () => {
    const globalServer = makeStdioServer({ name: 'global-only' });
    const projectServer = makeStdioServer({ name: 'project-only', command: 'proj' });

    mockGetAppSettings.mockReturnValue({ mcp: { servers: [globalServer] } } as any);
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(
      JSON.stringify({ mcpServers: [projectServer] }) as any
    );

    const result = await service.getMergedServersForSession('/my/project');
    expect(result).toHaveLength(2);
  });

  it('does not include project servers when projectPath is undefined', async () => {
    mockGetAppSettings.mockReturnValue({
      mcp: { servers: [makeStdioServer({ name: 'global' })] },
    } as any);
    const result = await service.getMergedServersForSession(undefined);
    expect(result).toHaveLength(1);
  });

  it('filters out disabled project servers', async () => {
    mockGetAppSettings.mockReturnValue({ mcp: { servers: [] } } as any);
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: [
          makeStdioServer({ name: 'enabled', enabled: true }),
          makeStdioServer({ name: 'disabled', enabled: false }),
        ],
      }) as any
    );

    const result = await service.getMergedServersForSession('/my/project');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('enabled');
  });
});

// ---------------------------------------------------------------------------
// detectAgentServers
// ---------------------------------------------------------------------------

describe('McpConfigService.detectAgentServers', () => {
  let service: McpConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new McpConfigService();
    mockExistsSync.mockReturnValue(false);
  });

  it('returns empty array when no agent config files exist', async () => {
    const result = await service.detectAgentServers();
    expect(result).toEqual([]);
  });

  it('discovers Claude Code global config', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'my-server': { command: 'node', args: ['srv.js'], env: {} },
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    expect(result).toHaveLength(1);
    expect(result[0].agent).toBe('Claude Code');
    expect(result[0].scope).toBe('global');
    expect(result[0].servers).toHaveLength(1);
    expect(result[0].servers[0].name).toBe('my-server');
    expect(result[0].servers[0].transport).toBe('stdio');
    expect((result[0].servers[0] as any).command).toBe('node');
  });

  it('discovers Cursor global config', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.cursor/mcp.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'cursor-server': { type: 'http', url: 'https://cursor.example.com/mcp', headers: {} },
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    expect(result).toHaveLength(1);
    expect(result[0].agent).toBe('Cursor');
    expect(result[0].servers[0].transport).toBe('http');
  });

  it('discovers Windsurf global config', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('windsurf')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'windsurf-server': { command: 'python', args: ['-m', 'mcp_server'], env: { KEY: 'val' } },
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    expect(result).toHaveLength(1);
    expect(result[0].agent).toBe('Windsurf');
  });

  it('discovers project-level Claude Code config when projectPath is provided', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.mcp.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'project-server': { command: 'ruby', args: ['srv.rb'], env: {} },
        },
      }) as any
    );

    const result = await service.detectAgentServers('/my/project');
    const claudeProjectResult = result.find((r) => r.agent === 'Claude Code' && r.scope === 'project');
    expect(claudeProjectResult).toBeDefined();
    expect(claudeProjectResult!.servers[0].name).toBe('project-server');
  });

  it('skips agent config files with missing or invalid mcpServers field', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(JSON.stringify({ someOtherKey: {} }) as any);

    const result = await service.detectAgentServers();
    expect(result).toEqual([]);
  });

  it('skips agent config file entries when mcpServers is not an object', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(JSON.stringify({ mcpServers: [] }) as any);

    const result = await service.detectAgentServers();
    expect(result).toEqual([]);
  });

  it('gracefully skips malformed agent config files', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue('{ bad json }' as any);

    const result = await service.detectAgentServers();
    expect(result).toEqual([]);
  });

  it('converts http type agent server entries', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'http-srv': { type: 'http', url: 'https://example.com', headers: { 'X-Token': 'abc' } },
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    expect(result[0].servers[0].transport).toBe('http');
    expect((result[0].servers[0] as any).url).toBe('https://example.com');
  });

  it('converts streamable-http type agent server entries as http transport', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'sh-srv': { type: 'streamable-http', url: 'https://example.com/sh', headers: {} },
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    expect(result[0].servers[0].transport).toBe('http');
  });

  it('converts sse type agent server entries', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'sse-srv': { type: 'sse', url: 'https://example.com/sse', headers: {} },
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    expect(result[0].servers[0].transport).toBe('sse');
  });

  it('returns null (skips) for unrecognized server types', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'weird-srv': { type: 'grpc', url: 'grpc://example.com' },
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    // unrecognized type results in no servers discovered
    expect(result).toEqual([]);
  });

  it('defaults to stdio when server type is not specified', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'default-srv': { command: 'uvx', args: ['mcp-server-git'] },
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    expect(result[0].servers[0].transport).toBe('stdio');
  });

  it('defaults to empty strings/arrays/objects for missing stdio fields', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'sparse-srv': {},
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    const srv = result[0].servers[0] as any;
    expect(srv.transport).toBe('stdio');
    expect(srv.command).toBe('');
    expect(srv.args).toEqual([]);
    expect(srv.env).toEqual({});
  });

  it('skips null/non-object server config entries', async () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.endsWith('.claude.json')
    );
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'null-srv': null,
          'string-srv': 'not-an-object',
          'valid-srv': { command: 'node', args: [], env: {} },
        },
      }) as any
    );

    const result = await service.detectAgentServers();
    expect(result[0].servers).toHaveLength(1);
    expect(result[0].servers[0].name).toBe('valid-srv');
  });
});
