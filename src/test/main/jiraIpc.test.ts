import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();

const keytarMock = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
};

// Holds the fetch implementation tests can override
let fetchImpl: (url: string, opts: any) => Promise<any> = async () => ({
  ok: true,
  json: async () => ({}),
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

/** Set up keytar to return valid stored credentials. */
function mockStoredCreds(
  siteUrl = 'https://myorg.atlassian.net',
  email = 'user@example.com',
  token = 'jira-api-token'
) {
  keytarMock.getPassword.mockImplementation((_svc: string, account: string) => {
    if (account === 'api-token') return Promise.resolve(token);
    if (account === 'email') return Promise.resolve(email);
    if (account === 'site-url') return Promise.resolve(siteUrl);
    return Promise.resolve(null);
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  ipcHandlers.clear();
  vi.resetModules();

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

  fetchImpl = async () => ({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts: any) => fetchImpl(url, opts)));

  const mod = await import('../../main/ipc/jiraIpc');
  mod.registerJiraIpc();
});

// ---------------------------------------------------------------------------
// jira:saveCredentials
// ---------------------------------------------------------------------------

describe('jira:saveCredentials', () => {
  it('saves credentials and returns displayName on success', async () => {
    keytarMock.setPassword.mockResolvedValue(undefined);
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ displayName: 'Alice Dev', accountId: 'u1' }),
    });

    const result = await callHandler('jira:saveCredentials', {
      siteUrl: 'https://myorg.atlassian.net',
      email: 'alice@example.com',
      token: 'secret123',
    });

    expect(result.success).toBe(true);
    expect(result.displayName).toBe('Alice Dev');
    expect(keytarMock.setPassword).toHaveBeenCalledTimes(3);
  });

  it('stores siteUrl, email and token in separate keychain entries', async () => {
    keytarMock.setPassword.mockResolvedValue(undefined);
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ displayName: 'Bob' }),
    });

    await callHandler('jira:saveCredentials', {
      siteUrl: 'https://acme.atlassian.net',
      email: 'bob@acme.com',
      token: 'tok-xyz',
    });

    const calls = keytarMock.setPassword.mock.calls;
    expect(calls.some((c: any[]) => c[1] === 'api-token' && c[2] === 'tok-xyz')).toBe(true);
    expect(calls.some((c: any[]) => c[1] === 'email' && c[2] === 'bob@acme.com')).toBe(true);
    expect(calls.some((c: any[]) => c[1] === 'site-url' && c[2] === 'https://acme.atlassian.net')).toBe(true);
  });

  it('returns error when siteUrl is missing', async () => {
    const result = await callHandler('jira:saveCredentials', {
      email: 'alice@example.com',
      token: 'tok',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(keytarMock.setPassword).not.toHaveBeenCalled();
  });

  it('returns error when email is missing', async () => {
    const result = await callHandler('jira:saveCredentials', {
      siteUrl: 'https://x.atlassian.net',
      token: 'tok',
    });
    expect(result.success).toBe(false);
  });

  it('returns error when token is missing', async () => {
    const result = await callHandler('jira:saveCredentials', {
      siteUrl: 'https://x.atlassian.net',
      email: 'a@b.com',
    });
    expect(result.success).toBe(false);
  });

  it('returns error when Jira API rejects the credentials (non-ok response)', async () => {
    keytarMock.setPassword.mockResolvedValue(undefined);
    fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });

    const result = await callHandler('jira:saveCredentials', {
      siteUrl: 'https://myorg.atlassian.net',
      email: 'a@b.com',
      token: 'bad-token',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/401/);
  });

  it('returns error when keytar throws', async () => {
    keytarMock.setPassword.mockRejectedValue(new Error('keychain busy'));

    const result = await callHandler('jira:saveCredentials', {
      siteUrl: 'https://x.atlassian.net',
      email: 'a@b.com',
      token: 'tok',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('keychain busy');
  });

  it('falls back to email as displayName when API does not return one', async () => {
    keytarMock.setPassword.mockResolvedValue(undefined);
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ accountId: 'u1' }), // no displayName
    });

    const result = await callHandler('jira:saveCredentials', {
      siteUrl: 'https://myorg.atlassian.net',
      email: 'fallback@example.com',
      token: 'tok',
    });
    expect(result.success).toBe(true);
    expect(result.displayName).toBe('fallback@example.com');
  });
});

// ---------------------------------------------------------------------------
// jira:clearCredentials
// ---------------------------------------------------------------------------

describe('jira:clearCredentials', () => {
  it('deletes all three keychain entries and returns success', async () => {
    keytarMock.deletePassword.mockResolvedValue(true);

    const result = await callHandler('jira:clearCredentials');
    expect(result).toEqual({ success: true });
    expect(keytarMock.deletePassword).toHaveBeenCalledTimes(3);
  });

  it('returns error when keytar throws', async () => {
    keytarMock.deletePassword.mockRejectedValue(new Error('access denied'));

    const result = await callHandler('jira:clearCredentials');
    expect(result.success).toBe(false);
    expect(result.error).toBe('access denied');
  });
});

// ---------------------------------------------------------------------------
// jira:checkConnection
// ---------------------------------------------------------------------------

describe('jira:checkConnection', () => {
  it('returns connected: true with displayName and siteUrl', async () => {
    mockStoredCreds();
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ displayName: 'Alice Dev', accountId: 'u1' }),
    });

    const result = await callHandler('jira:checkConnection');
    expect(result.connected).toBe(true);
    expect(result.displayName).toBe('Alice Dev');
    expect(result.siteUrl).toBe('https://myorg.atlassian.net');
  });

  it('returns connected: false when no credentials are stored', async () => {
    keytarMock.getPassword.mockResolvedValue(null);

    const result = await callHandler('jira:checkConnection');
    expect(result.connected).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns connected: false when Jira API returns 401', async () => {
    mockStoredCreds();
    fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });

    const result = await callHandler('jira:checkConnection');
    expect(result.connected).toBe(false);
    expect(result.error).toMatch(/401/);
  });

  it('returns connected: false when fetch throws (network error)', async () => {
    mockStoredCreds();
    fetchImpl = async () => { throw new Error('ECONNREFUSED'); };

    const result = await callHandler('jira:checkConnection');
    expect(result.connected).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('calls the /myself Jira API endpoint', async () => {
    mockStoredCreds('https://acme.atlassian.net');
    let calledUrl = '';
    fetchImpl = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ displayName: 'Dev' }) };
    };

    await callHandler('jira:checkConnection');
    expect(calledUrl).toContain('/myself');
    expect(calledUrl).toContain('acme.atlassian.net');
  });
});

// ---------------------------------------------------------------------------
// jira:initialFetch
// ---------------------------------------------------------------------------

describe('jira:initialFetch', () => {
  const rawIssues = [
    {
      id: '10001',
      key: 'PROJ-1',
      fields: {
        summary: 'Fix login bug',
        status: { name: 'In Progress' },
        priority: { name: 'High' },
        updated: '2024-01-15T10:00:00.000Z',
      },
    },
    {
      id: '10002',
      key: 'PROJ-2',
      fields: {
        summary: 'Add dark mode',
        status: { name: 'Todo' },
        priority: { name: 'Medium' },
        updated: '2024-01-14T09:00:00.000Z',
      },
    },
  ];

  it('returns formatted issues on success', async () => {
    mockStoredCreds();
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({ issues: rawIssues, total: 2 }),
    });

    const result = await callHandler('jira:initialFetch', 10);
    expect(result.success).toBe(true);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].key).toBe('PROJ-1');
    expect(result.issues[0].title).toBe('Fix login bug');
    expect(result.issues[0].url).toContain('PROJ-1');
  });

  it('uses default limit of 50 when not provided', async () => {
    mockStoredCreds();
    let calledUrl = '';
    fetchImpl = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ issues: [] }) };
    };

    await callHandler('jira:initialFetch');
    expect(calledUrl).toContain('maxResults=50');
  });

  it('caps limit at 100', async () => {
    mockStoredCreds();
    let calledUrl = '';
    fetchImpl = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ issues: [] }) };
    };

    await callHandler('jira:initialFetch', 5000);
    expect(calledUrl).toContain('maxResults=100');
  });

  it('returns empty array when no issues found', async () => {
    mockStoredCreds();
    fetchImpl = async () => ({ ok: true, json: async () => ({ issues: [] }) });

    const result = await callHandler('jira:initialFetch');
    expect(result.success).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('returns error when no credentials are stored', async () => {
    keytarMock.getPassword.mockResolvedValue(null);

    const result = await callHandler('jira:initialFetch');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns error when API request fails', async () => {
    mockStoredCreds();
    fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });

    const result = await callHandler('jira:initialFetch');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/403/);
  });

  it('builds issue URL correctly from siteUrl and key', async () => {
    mockStoredCreds('https://myorg.atlassian.net/');
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        issues: [
          {
            id: '1',
            key: 'MYP-42',
            fields: {
              summary: 'Test',
              status: { name: 'Done' },
              priority: { name: 'Low' },
              updated: null,
            },
          },
        ],
      }),
    });

    const result = await callHandler('jira:initialFetch', 5);
    // Trailing slash on siteUrl should be normalised
    expect(result.issues[0].url).toBe('https://myorg.atlassian.net/browse/MYP-42');
  });
});

// ---------------------------------------------------------------------------
// jira:searchIssues
// ---------------------------------------------------------------------------

describe('jira:searchIssues', () => {
  it('returns matching issues on success', async () => {
    mockStoredCreds();
    const issues = [
      {
        id: '20001',
        key: 'PROJ-5',
        fields: {
          summary: 'Auth refactor',
          status: { name: 'In Review' },
          priority: { name: 'High' },
          updated: '2024-03-01T00:00:00.000Z',
        },
      },
    ];
    fetchImpl = async () => ({ ok: true, json: async () => ({ issues }) });

    const result = await callHandler('jira:searchIssues', 'auth refactor', 10);
    expect(result.success).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].key).toBe('PROJ-5');
  });

  it('returns error when search term is empty string', async () => {
    mockStoredCreds();

    const result = await callHandler('jira:searchIssues', '');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns error when search term is undefined', async () => {
    mockStoredCreds();

    const result = await callHandler('jira:searchIssues', undefined);
    expect(result.success).toBe(false);
  });

  it('caps search limit at 100', async () => {
    mockStoredCreds();
    let calledUrl = '';
    fetchImpl = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ issues: [] }) };
    };

    await callHandler('jira:searchIssues', 'bug', 999);
    expect(calledUrl).toContain('maxResults=100');
  });

  it('returns error when no credentials stored', async () => {
    keytarMock.getPassword.mockResolvedValue(null);

    const result = await callHandler('jira:searchIssues', 'login');
    expect(result.success).toBe(false);
  });

  it('returns error when API returns non-ok', async () => {
    mockStoredCreds();
    fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });

    const result = await callHandler('jira:searchIssues', 'bug');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/500/);
  });

  it('encodes search term in the JQL query', async () => {
    mockStoredCreds();
    let calledUrl = '';
    fetchImpl = async (url) => {
      calledUrl = url;
      return { ok: true, json: async () => ({ issues: [] }) };
    };

    await callHandler('jira:searchIssues', 'login bug', 5);
    // URL should contain the JQL search term (URL-encoded)
    expect(calledUrl).toContain('jql=');
    expect(calledUrl).toMatch(/login/);
  });
});
