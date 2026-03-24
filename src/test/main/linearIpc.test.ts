import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();

const keytarMock = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
};

// Controls the response returned by the mocked global fetch
let fetchImpl: (url: string, opts: any) => Promise<any> = async () => ({
  ok: true,
  json: async () => ({ data: null }),
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
}));

vi.mock('keytar', () => keytarMock);

vi.mock('../../main/lib/logger', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

async function callHandler(channel: string, ...args: any[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`);
  return handler({}, ...args);
}

beforeEach(async () => {
  vi.clearAllMocks();
  ipcHandlers.clear();
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.mock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
  }));

  vi.mock('keytar', () => keytarMock);

  vi.mock('../../main/lib/logger', () => ({
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }));

  // Reset fetchImpl to a safe default
  fetchImpl = async () => ({
    ok: true,
    json: async () => ({ data: null }),
  });

  // Patch globalThis.fetch so the IPC handlers use our mock
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts: any) => fetchImpl(url, opts)));

  const mod = await import('../../main/ipc/linearIpc');
  mod.registerLinearIpc();
});

// ---------------------------------------------------------------------------
// linear:saveToken
// ---------------------------------------------------------------------------

describe('linear:saveToken', () => {
  it('stores the token in keychain and returns success', async () => {
    keytarMock.setPassword.mockResolvedValue(undefined);

    const result = await callHandler('linear:saveToken', 'lin_api_abc123');
    expect(result).toEqual({ success: true });
    expect(keytarMock.setPassword).toHaveBeenCalledWith(
      'valkyr-linear',
      'api-token',
      'lin_api_abc123'
    );
  });

  it('trims whitespace from the token before storing', async () => {
    keytarMock.setPassword.mockResolvedValue(undefined);

    await callHandler('linear:saveToken', '  lin_api_padded  ');
    expect(keytarMock.setPassword).toHaveBeenCalledWith(
      'valkyr-linear',
      'api-token',
      'lin_api_padded'
    );
  });

  it('returns error when token is empty string', async () => {
    const result = await callHandler('linear:saveToken', '');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(keytarMock.setPassword).not.toHaveBeenCalled();
  });

  it('returns error when token is missing (undefined)', async () => {
    const result = await callHandler('linear:saveToken', undefined);
    expect(result.success).toBe(false);
  });

  it('returns error when keytar throws', async () => {
    keytarMock.setPassword.mockRejectedValue(new Error('keychain locked'));

    const result = await callHandler('linear:saveToken', 'lin_token');
    expect(result.success).toBe(false);
    expect(result.error).toBe('keychain locked');
  });
});

// ---------------------------------------------------------------------------
// linear:clearToken
// ---------------------------------------------------------------------------

describe('linear:clearToken', () => {
  it('deletes the token from keychain and returns success', async () => {
    keytarMock.deletePassword.mockResolvedValue(true);

    const result = await callHandler('linear:clearToken');
    expect(result).toEqual({ success: true });
    expect(keytarMock.deletePassword).toHaveBeenCalledWith('valkyr-linear', 'api-token');
  });

  it('returns error when keytar deletePassword throws', async () => {
    keytarMock.deletePassword.mockRejectedValue(new Error('cannot access keychain'));

    const result = await callHandler('linear:clearToken');
    expect(result.success).toBe(false);
    expect(result.error).toBe('cannot access keychain');
  });
});

// ---------------------------------------------------------------------------
// linear:checkConnection
// ---------------------------------------------------------------------------

describe('linear:checkConnection', () => {
  it('returns connected: true with user name when token is valid', async () => {
    keytarMock.getPassword.mockResolvedValue('valid-token');
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        data: { viewer: { id: 'u1', name: 'Alice Dev', email: 'alice@example.com' } },
      }),
    });

    const result = await callHandler('linear:checkConnection');
    expect(result.connected).toBe(true);
    expect(result.taskName).toBe('Alice Dev');
  });

  it('returns connected: false with error when no token is stored', async () => {
    keytarMock.getPassword.mockResolvedValue(null);

    const result = await callHandler('linear:checkConnection');
    expect(result.connected).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns connected: false when the Linear API returns a non-ok status', async () => {
    keytarMock.getPassword.mockResolvedValue('bad-token');
    fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });

    const result = await callHandler('linear:checkConnection');
    expect(result.connected).toBe(false);
    expect(result.error).toMatch(/401/);
  });

  it('returns connected: false when GraphQL returns errors', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ errors: [{ message: 'Unauthorized' }] }),
    });

    const result = await callHandler('linear:checkConnection');
    expect(result.connected).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns connected: false when fetch throws (network error)', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    fetchImpl = async () => {
      throw new Error('network unreachable');
    };

    const result = await callHandler('linear:checkConnection');
    expect(result.connected).toBe(false);
    expect(result.error).toBe('network unreachable');
  });
});

// ---------------------------------------------------------------------------
// linear:initialFetch
// ---------------------------------------------------------------------------

describe('linear:initialFetch', () => {
  const sampleIssues = [
    { id: 'i1', identifier: 'VLK-1', title: 'Fix bug', state: { name: 'In Progress', color: '#ff0' }, priority: 2, url: 'https://linear.app/i/1', updatedAt: '2024-01-01' },
    { id: 'i2', identifier: 'VLK-2', title: 'New feature', state: { name: 'Todo', color: '#aaa' }, priority: 1, url: 'https://linear.app/i/2', updatedAt: '2024-01-02' },
  ];

  it('returns issues list on success', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ data: { issues: { nodes: sampleIssues } } }),
    });

    const result = await callHandler('linear:initialFetch', 10);
    expect(result.success).toBe(true);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].identifier).toBe('VLK-1');
  });

  it('uses default limit of 50 when not provided', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    let capturedBody: any;
    fetchImpl = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ data: { issues: { nodes: [] } } }) };
    };

    await callHandler('linear:initialFetch');
    expect(capturedBody.variables.limit).toBe(50);
  });

  it('caps limit at 250', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    let capturedBody: any;
    fetchImpl = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ data: { issues: { nodes: [] } } }) };
    };

    await callHandler('linear:initialFetch', 9999);
    expect(capturedBody.variables.limit).toBe(250);
  });

  it('returns empty array when no issues match', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [] } } }),
    });

    const result = await callHandler('linear:initialFetch');
    expect(result.success).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('returns error when no token is stored', async () => {
    keytarMock.getPassword.mockResolvedValue(null);

    const result = await callHandler('linear:initialFetch');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns error when API request fails', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });

    const result = await callHandler('linear:initialFetch');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/500/);
  });
});

// ---------------------------------------------------------------------------
// linear:searchIssues
// ---------------------------------------------------------------------------

describe('linear:searchIssues', () => {
  const searchResults = [
    { id: 's1', identifier: 'VLK-5', title: 'Auth refactor', state: { name: 'In Review', color: '#0f0' }, priority: 3, url: 'https://linear.app/i/5', updatedAt: '2024-03-01' },
  ];

  it('returns matching issues', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ data: { issueSearch: { nodes: searchResults } } }),
    });

    const result = await callHandler('linear:searchIssues', 'auth', 10);
    expect(result.success).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].identifier).toBe('VLK-5');
  });

  it('passes search term and limit in GraphQL variables', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    let capturedBody: any;
    fetchImpl = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ data: { issueSearch: { nodes: [] } } }) };
    };

    await callHandler('linear:searchIssues', 'refactor', 15);
    expect(capturedBody.variables.term).toBe('refactor');
    expect(capturedBody.variables.limit).toBe(15);
  });

  it('caps search limit at 100', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    let capturedBody: any;
    fetchImpl = async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ data: { issueSearch: { nodes: [] } } }) };
    };

    await callHandler('linear:searchIssues', 'bug', 500);
    expect(capturedBody.variables.limit).toBe(100);
  });

  it('returns error when search term is empty', async () => {
    keytarMock.getPassword.mockResolvedValue('token');

    const result = await callHandler('linear:searchIssues', '');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns error when search term is missing', async () => {
    keytarMock.getPassword.mockResolvedValue('token');

    const result = await callHandler('linear:searchIssues', undefined);
    expect(result.success).toBe(false);
  });

  it('returns error when no token is stored', async () => {
    keytarMock.getPassword.mockResolvedValue(null);

    const result = await callHandler('linear:searchIssues', 'bug');
    expect(result.success).toBe(false);
  });

  it('returns error when API request fails', async () => {
    keytarMock.getPassword.mockResolvedValue('token');
    fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });

    const result = await callHandler('linear:searchIssues', 'bug');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/403/);
  });
});
