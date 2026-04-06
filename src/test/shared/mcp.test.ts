import { describe, it, expect } from 'vitest';
import type {
  McpServerTransport,
  McpServerStdioConfig,
  McpServerHttpConfig,
  McpServerSseConfig,
  McpServerConfig,
  McpServerInput,
} from '../../shared/mcp/types';

// ─── Type structure tests via runtime value construction ──────────────────────
// The types.ts file contains only type/interface declarations — no runtime
// logic to execute. We validate structural constraints by constructing valid
// objects and confirming that TypeScript would accept them, using type
// assertions and runtime shape checks.

describe('MCP types', () => {
  // ─── McpServerTransport ──────────────────────────────────────────────────

  describe('McpServerTransport', () => {
    it('accepts "stdio" as a valid transport value', () => {
      const t: McpServerTransport = 'stdio';
      expect(t).toBe('stdio');
    });

    it('accepts "http" as a valid transport value', () => {
      const t: McpServerTransport = 'http';
      expect(t).toBe('http');
    });

    it('accepts "sse" as a valid transport value', () => {
      const t: McpServerTransport = 'sse';
      expect(t).toBe('sse');
    });

    it('covers all three valid transport literals', () => {
      const transports: McpServerTransport[] = ['stdio', 'http', 'sse'];
      expect(transports).toHaveLength(3);
      expect(new Set(transports).size).toBe(3);
    });
  });

  // ─── McpServerStdioConfig ────────────────────────────────────────────────

  describe('McpServerStdioConfig', () => {
    const base: McpServerStdioConfig = {
      id: 'server-1',
      name: 'My Stdio Server',
      transport: 'stdio',
      enabled: true,
      command: '/usr/bin/node',
      args: ['server.js', '--port', '3000'],
      env: { NODE_ENV: 'production' },
    };

    it('has the expected shape with all required fields', () => {
      expect(base.id).toBe('server-1');
      expect(base.name).toBe('My Stdio Server');
      expect(base.transport).toBe('stdio');
      expect(base.enabled).toBe(true);
      expect(base.command).toBe('/usr/bin/node');
      expect(base.args).toEqual(['server.js', '--port', '3000']);
      expect(base.env).toEqual({ NODE_ENV: 'production' });
    });

    it('allows an empty args array', () => {
      const config: McpServerStdioConfig = { ...base, args: [] };
      expect(config.args).toHaveLength(0);
    });

    it('allows an empty env record', () => {
      const config: McpServerStdioConfig = { ...base, env: {} };
      expect(config.env).toEqual({});
    });

    it('allows disabled=false', () => {
      const config: McpServerStdioConfig = { ...base, enabled: false };
      expect(config.enabled).toBe(false);
    });

    it('transport field is always "stdio" (discriminant)', () => {
      expect(base.transport).toBe('stdio');
    });
  });

  // ─── McpServerHttpConfig ────────────────────────────────────────────────

  describe('McpServerHttpConfig', () => {
    const base: McpServerHttpConfig = {
      id: 'server-2',
      name: 'My HTTP Server',
      transport: 'http',
      enabled: true,
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer token123' },
    };

    it('has the expected shape with all required fields', () => {
      expect(base.id).toBe('server-2');
      expect(base.name).toBe('My HTTP Server');
      expect(base.transport).toBe('http');
      expect(base.enabled).toBe(true);
      expect(base.url).toBe('https://api.example.com/mcp');
      expect(base.headers).toEqual({ Authorization: 'Bearer token123' });
    });

    it('allows an empty headers record', () => {
      const config: McpServerHttpConfig = { ...base, headers: {} };
      expect(config.headers).toEqual({});
    });

    it('allows multiple headers', () => {
      const config: McpServerHttpConfig = {
        ...base,
        headers: { Authorization: 'Bearer x', 'X-Custom': 'value' },
      };
      expect(Object.keys(config.headers)).toHaveLength(2);
    });

    it('transport field is always "http" (discriminant)', () => {
      expect(base.transport).toBe('http');
    });
  });

  // ─── McpServerSseConfig ─────────────────────────────────────────────────

  describe('McpServerSseConfig', () => {
    const base: McpServerSseConfig = {
      id: 'server-3',
      name: 'My SSE Server',
      transport: 'sse',
      enabled: false,
      url: 'https://events.example.com/mcp/sse',
      headers: {},
    };

    it('has the expected shape with all required fields', () => {
      expect(base.id).toBe('server-3');
      expect(base.name).toBe('My SSE Server');
      expect(base.transport).toBe('sse');
      expect(base.enabled).toBe(false);
      expect(base.url).toBe('https://events.example.com/mcp/sse');
      expect(base.headers).toEqual({});
    });

    it('transport field is always "sse" (discriminant)', () => {
      expect(base.transport).toBe('sse');
    });
  });

  // ─── McpServerConfig (discriminated union) ───────────────────────────────

  describe('McpServerConfig discriminated union', () => {
    const configs: McpServerConfig[] = [
      {
        id: 'a',
        name: 'stdio server',
        transport: 'stdio',
        enabled: true,
        command: 'node',
        args: [],
        env: {},
      },
      {
        id: 'b',
        name: 'http server',
        transport: 'http',
        enabled: true,
        url: 'https://example.com',
        headers: {},
      },
      {
        id: 'c',
        name: 'sse server',
        transport: 'sse',
        enabled: false,
        url: 'https://example.com/sse',
        headers: {},
      },
    ];

    it('discriminates by transport field', () => {
      for (const config of configs) {
        expect(['stdio', 'http', 'sse']).toContain(config.transport);
      }
    });

    it('all configs have id, name, transport, enabled', () => {
      for (const config of configs) {
        expect(typeof config.id).toBe('string');
        expect(typeof config.name).toBe('string');
        expect(typeof config.transport).toBe('string');
        expect(typeof config.enabled).toBe('boolean');
      }
    });

    it('narrows correctly based on transport in a switch', () => {
      const results: string[] = [];
      for (const config of configs) {
        switch (config.transport) {
          case 'stdio':
            results.push(`stdio:${config.command}`);
            break;
          case 'http':
            results.push(`http:${config.url}`);
            break;
          case 'sse':
            results.push(`sse:${config.url}`);
            break;
        }
      }
      expect(results).toEqual([
        'stdio:node',
        'http:https://example.com',
        'sse:https://example.com/sse',
      ]);
    });
  });

  // ─── McpServerInput (id-less variants) ──────────────────────────────────

  describe('McpServerInput (Omit<…, "id"> variants)', () => {
    it('accepts a valid stdio input without id', () => {
      const input: McpServerInput = {
        name: 'New Stdio',
        transport: 'stdio',
        enabled: true,
        command: 'npx',
        args: ['-y', 'my-mcp-server'],
        env: { API_KEY: 'secret' },
      };
      expect(input.transport).toBe('stdio');
      // TypeScript would error if `id` were required — this compiles without it.
      expect('id' in input).toBe(false);
    });

    it('accepts a valid http input without id', () => {
      const input: McpServerInput = {
        name: 'New HTTP',
        transport: 'http',
        enabled: false,
        url: 'https://mcp.example.com',
        headers: {},
      };
      expect(input.transport).toBe('http');
      expect('id' in input).toBe(false);
    });

    it('accepts a valid sse input without id', () => {
      const input: McpServerInput = {
        name: 'New SSE',
        transport: 'sse',
        enabled: true,
        url: 'https://events.example.com/mcp',
        headers: { Authorization: 'Bearer abc' },
      };
      expect(input.transport).toBe('sse');
      expect('id' in input).toBe(false);
    });

    it('McpServerInput is assignable to McpServerConfig once id is added', () => {
      const input: McpServerInput = {
        name: 'Promoted',
        transport: 'stdio',
        enabled: true,
        command: 'node',
        args: [],
        env: {},
      };

      // Simulating the service assigning an id to produce a full config
      const config: McpServerConfig = { ...input, id: 'generated-id-42' } as McpServerConfig;
      expect(config.id).toBe('generated-id-42');
      expect(config.transport).toBe('stdio');
    });
  });

  // ─── Edge cases for config field values ──────────────────────────────────

  describe('config field edge cases', () => {
    it('allows id to be an empty string (no runtime constraint)', () => {
      const config: McpServerStdioConfig = {
        id: '',
        name: '',
        transport: 'stdio',
        enabled: false,
        command: '',
        args: [],
        env: {},
      };
      expect(config.id).toBe('');
    });

    it('allows url to be any string including non-http schemes', () => {
      const config: McpServerHttpConfig = {
        id: 'x',
        name: 'unusual url',
        transport: 'http',
        enabled: true,
        url: 'http://localhost:9000/mcp',
        headers: {},
      };
      expect(config.url).toBe('http://localhost:9000/mcp');
    });

    it('headers record accepts arbitrary string keys', () => {
      const config: McpServerSseConfig = {
        id: 'y',
        name: 'headers test',
        transport: 'sse',
        enabled: true,
        url: 'https://x.com',
        headers: {
          'X-Trace-Id': 'abc123',
          'X-Request-Id': 'xyz',
          Cookie: 'session=1',
        },
      };
      expect(Object.keys(config.headers)).toHaveLength(3);
    });
  });
});
