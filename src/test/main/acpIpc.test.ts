import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();

const acpSessionManagerMock = {
  setEventSender: vi.fn(),
  createSession: vi.fn(),
  sendPrompt: vi.fn(),
  cancelSession: vi.fn(),
  detachSession: vi.fn(),
  reattachSession: vi.fn(),
  killSession: vi.fn(),
  approvePermission: vi.fn(),
  setMode: vi.fn(),
  setModel: vi.fn(),
  setConfigOption: vi.fn(),
  listSessions: vi.fn(),
  forkSession: vi.fn(),
  extMethod: vi.fn(),
};

const mcpConfigServiceMock = {
  getMergedServersForSession: vi.fn(),
};

const claudeUsageServiceMock = {
  getUsageLimits: vi.fn(),
};

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue('/tmp'),
  },
}));

vi.mock('../../main/services/AcpSessionManager', () => ({
  acpSessionManager: acpSessionManagerMock,
}));

vi.mock('../../main/services/McpConfigService', () => ({
  mcpConfigService: mcpConfigServiceMock,
}));

vi.mock('../../main/services/ClaudeUsageService', () => ({
  claudeUsageService: claudeUsageServiceMock,
}));

vi.mock('../../main/lib/logger', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Fake WebContents that is not destroyed
function makeSender(id = 1) {
  return {
    id,
    isDestroyed: vi.fn().mockReturnValue(false),
    send: vi.fn(),
    once: vi.fn(),
  };
}

async function callHandler(channel: string, event: any, ...args: any[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`);
  return handler(event, ...args);
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
    app: {
      isPackaged: false,
      getPath: vi.fn().mockReturnValue('/tmp'),
    },
  }));

  vi.mock('../../main/services/AcpSessionManager', () => ({
    acpSessionManager: acpSessionManagerMock,
  }));

  vi.mock('../../main/services/McpConfigService', () => ({
    mcpConfigService: mcpConfigServiceMock,
  }));

  vi.mock('../../main/services/ClaudeUsageService', () => ({
    claudeUsageService: claudeUsageServiceMock,
  }));

  vi.mock('../../main/lib/logger', () => ({
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }));

  const mod = await import('../../main/ipc/acpIpc');
  mod.registerAcpIpc();
});

// ---------------------------------------------------------------------------
// acp:start
// ---------------------------------------------------------------------------

describe('acp:start', () => {
  const validArgs = {
    conversationId: 'conv-1',
    providerId: 'claude-code',
    cwd: '/project',
  };

  it('creates a session and registers ownership on success', async () => {
    mcpConfigServiceMock.getMergedServersForSession.mockResolvedValue([]);
    acpSessionManagerMock.createSession.mockResolvedValue({
      success: true,
      sessionKey: 'sk-abc',
    });

    const sender = makeSender();
    const result = await callHandler('acp:start', { sender }, validArgs);

    expect(result.success).toBe(true);
    expect(result.sessionKey).toBe('sk-abc');
    expect(acpSessionManagerMock.createSession).toHaveBeenCalledWith(
      'conv-1',
      'claude-code',
      '/project',
      undefined,
      undefined,
      []
    );
    expect(acpSessionManagerMock.reattachSession).toHaveBeenCalledWith('sk-abc');
  });

  it('passes optional env and acpSessionId to createSession', async () => {
    const args = {
      ...validArgs,
      env: { MY_VAR: 'hello' },
      acpSessionId: 'existing-session',
      projectPath: '/project',
    };
    mcpConfigServiceMock.getMergedServersForSession.mockResolvedValue([]);
    acpSessionManagerMock.createSession.mockResolvedValue({
      success: true,
      sessionKey: 'sk-xyz',
    });

    const result = await callHandler('acp:start', { sender: makeSender() }, args);

    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.createSession).toHaveBeenCalledWith(
      'conv-1',
      'claude-code',
      '/project',
      { MY_VAR: 'hello' },
      'existing-session',
      []
    );
  });

  it('does not reattach if createSession returns success: false', async () => {
    mcpConfigServiceMock.getMergedServersForSession.mockResolvedValue([]);
    acpSessionManagerMock.createSession.mockResolvedValue({
      success: false,
      error: 'Provider not found',
    });

    const result = await callHandler('acp:start', { sender: makeSender() }, validArgs);

    expect(result.success).toBe(false);
    expect(acpSessionManagerMock.reattachSession).not.toHaveBeenCalled();
  });

  it('returns validation error when conversationId is missing', async () => {
    const result = await callHandler(
      'acp:start',
      { sender: makeSender() },
      { providerId: 'claude-code', cwd: '/project' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });

  it('returns validation error when providerId is empty string', async () => {
    const result = await callHandler(
      'acp:start',
      { sender: makeSender() },
      { conversationId: 'conv-1', providerId: '', cwd: '/project' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });

  it('returns error when createSession throws', async () => {
    mcpConfigServiceMock.getMergedServersForSession.mockResolvedValue([]);
    acpSessionManagerMock.createSession.mockRejectedValue(new Error('spawn failed'));

    const result = await callHandler('acp:start', { sender: makeSender() }, validArgs);

    expect(result.success).toBe(false);
    expect(result.error).toBe('spawn failed');
  });

  it('does not register destroyed listener twice for the same WebContents id', async () => {
    mcpConfigServiceMock.getMergedServersForSession.mockResolvedValue([]);
    acpSessionManagerMock.createSession.mockResolvedValue({
      success: true,
      sessionKey: 'sk-dup',
    });

    const sender = makeSender(99);
    await callHandler('acp:start', { sender }, validArgs);
    await callHandler('acp:start', { sender }, { ...validArgs, conversationId: 'conv-2' });

    // once() should only have been called once for the same sender id
    expect(sender.once).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// acp:prompt
// ---------------------------------------------------------------------------

describe('acp:prompt', () => {
  it('forwards message to acpSessionManager.sendPrompt', async () => {
    acpSessionManagerMock.sendPrompt.mockResolvedValue({ success: true });

    const result = await callHandler('acp:prompt', {}, { sessionKey: 'sk-1', message: 'Hello' });

    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.sendPrompt).toHaveBeenCalledWith('sk-1', 'Hello', undefined);
  });

  it('forwards files array when provided', async () => {
    acpSessionManagerMock.sendPrompt.mockResolvedValue({ success: true });
    const files = [{ url: 'data:text/plain;base64,aGk=', mediaType: 'text/plain' }];

    await callHandler('acp:prompt', {}, { sessionKey: 'sk-1', message: 'check this', files });

    expect(acpSessionManagerMock.sendPrompt).toHaveBeenCalledWith('sk-1', 'check this', files);
  });

  it('returns validation error when sessionKey is missing', async () => {
    const result = await callHandler('acp:prompt', {}, { message: 'hi' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });

  it('returns error when sendPrompt throws', async () => {
    acpSessionManagerMock.sendPrompt.mockRejectedValue(new Error('session dead'));

    const result = await callHandler('acp:prompt', {}, { sessionKey: 'sk-dead', message: 'hello' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('session dead');
  });
});

// ---------------------------------------------------------------------------
// acp:cancel
// ---------------------------------------------------------------------------

describe('acp:cancel', () => {
  it('cancels a session by key', async () => {
    acpSessionManagerMock.cancelSession.mockResolvedValue({ success: true });

    const result = await callHandler('acp:cancel', {}, { sessionKey: 'sk-c' });
    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.cancelSession).toHaveBeenCalledWith('sk-c');
  });

  it('returns validation error when sessionKey is missing', async () => {
    const result = await callHandler('acp:cancel', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });
});

// ---------------------------------------------------------------------------
// acp:detach
// ---------------------------------------------------------------------------

describe('acp:detach', () => {
  it('detaches a session and returns success', async () => {
    const result = await callHandler('acp:detach', {}, { sessionKey: 'sk-d' });
    expect(result).toEqual({ success: true });
    expect(acpSessionManagerMock.detachSession).toHaveBeenCalledWith('sk-d');
  });

  it('returns validation error when sessionKey is missing', async () => {
    const result = await callHandler('acp:detach', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });
});

// ---------------------------------------------------------------------------
// acp:kill
// ---------------------------------------------------------------------------

describe('acp:kill', () => {
  it('kills a session and returns success', async () => {
    const result = await callHandler('acp:kill', {}, { sessionKey: 'sk-k' });
    expect(result).toEqual({ success: true });
    expect(acpSessionManagerMock.killSession).toHaveBeenCalledWith('sk-k');
  });

  it('returns validation error when sessionKey is missing', async () => {
    const result = await callHandler('acp:kill', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });

  it('returns error when killSession throws', async () => {
    acpSessionManagerMock.killSession.mockImplementation(() => {
      throw new Error('kill failed');
    });

    const result = await callHandler('acp:kill', {}, { sessionKey: 'sk-k' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('kill failed');
  });
});

// ---------------------------------------------------------------------------
// acp:approve
// ---------------------------------------------------------------------------

describe('acp:approve', () => {
  it('approves a permission request', async () => {
    acpSessionManagerMock.approvePermission.mockResolvedValue({ success: true });

    const result = await callHandler(
      'acp:approve',
      {},
      {
        sessionKey: 'sk-a',
        toolCallId: 'tc-1',
        optionId: 'allow',
      }
    );

    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.approvePermission).toHaveBeenCalledWith('sk-a', 'tc-1', 'allow');
  });

  it('accepts null optionId (deny/dismiss)', async () => {
    acpSessionManagerMock.approvePermission.mockResolvedValue({ success: true });

    const result = await callHandler(
      'acp:approve',
      {},
      {
        sessionKey: 'sk-a',
        toolCallId: 'tc-2',
        optionId: null,
      }
    );

    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.approvePermission).toHaveBeenCalledWith('sk-a', 'tc-2', null);
  });

  it('returns validation error when toolCallId is missing', async () => {
    const result = await callHandler(
      'acp:approve',
      {},
      {
        sessionKey: 'sk-a',
        optionId: 'allow',
      }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });
});

// ---------------------------------------------------------------------------
// acp:setMode
// ---------------------------------------------------------------------------

describe('acp:setMode', () => {
  it('sets the session mode', async () => {
    acpSessionManagerMock.setMode.mockResolvedValue({ success: true });

    const result = await callHandler(
      'acp:setMode',
      {},
      {
        sessionKey: 'sk-m',
        mode: 'auto',
      }
    );

    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.setMode).toHaveBeenCalledWith('sk-m', 'auto');
  });

  it('returns validation error when mode is empty', async () => {
    const result = await callHandler('acp:setMode', {}, { sessionKey: 'sk-m', mode: '' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });
});

// ---------------------------------------------------------------------------
// acp:setModel
// ---------------------------------------------------------------------------

describe('acp:setModel', () => {
  it('sets the session model', async () => {
    acpSessionManagerMock.setModel.mockResolvedValue({ success: true });

    const result = await callHandler(
      'acp:setModel',
      {},
      {
        sessionKey: 'sk-m',
        modelId: 'claude-opus-4-5',
      }
    );

    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.setModel).toHaveBeenCalledWith('sk-m', 'claude-opus-4-5');
  });

  it('returns validation error when modelId is missing', async () => {
    const result = await callHandler('acp:setModel', {}, { sessionKey: 'sk-m' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });
});

// ---------------------------------------------------------------------------
// acp:setConfigOption
// ---------------------------------------------------------------------------

describe('acp:setConfigOption', () => {
  it('sets a config option on the session', async () => {
    acpSessionManagerMock.setConfigOption.mockResolvedValue({ success: true });

    const result = await callHandler(
      'acp:setConfigOption',
      {},
      {
        sessionKey: 'sk-cfg',
        optionId: 'verbosity',
        value: 'high',
      }
    );

    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.setConfigOption).toHaveBeenCalledWith(
      'sk-cfg',
      'verbosity',
      'high'
    );
  });

  it('returns validation error when optionId is empty', async () => {
    const result = await callHandler(
      'acp:setConfigOption',
      {},
      {
        sessionKey: 'sk-cfg',
        optionId: '',
        value: 'x',
      }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });
});

// ---------------------------------------------------------------------------
// acp:listSessions
// ---------------------------------------------------------------------------

describe('acp:listSessions', () => {
  it('returns session list from manager', async () => {
    const sessions = [{ id: 's1' }, { id: 's2' }];
    acpSessionManagerMock.listSessions.mockResolvedValue({ success: true, data: sessions });

    const result = await callHandler('acp:listSessions', {}, { sessionKey: 'sk-ls' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(sessions);
  });

  it('returns validation error when sessionKey is missing', async () => {
    const result = await callHandler('acp:listSessions', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });
});

// ---------------------------------------------------------------------------
// acp:forkSession
// ---------------------------------------------------------------------------

describe('acp:forkSession', () => {
  it('forks a session', async () => {
    acpSessionManagerMock.forkSession.mockResolvedValue({ success: true, sessionKey: 'sk-fork' });

    const result = await callHandler('acp:forkSession', {}, { sessionKey: 'sk-orig' });
    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.forkSession).toHaveBeenCalledWith('sk-orig');
  });

  it('returns validation error when sessionKey is missing', async () => {
    const result = await callHandler('acp:forkSession', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });
});

// ---------------------------------------------------------------------------
// acp:extMethod
// ---------------------------------------------------------------------------

describe('acp:extMethod', () => {
  it('calls an extension method with params', async () => {
    acpSessionManagerMock.extMethod.mockResolvedValue({ success: true, data: 'pong' });

    const result = await callHandler(
      'acp:extMethod',
      {},
      {
        sessionKey: 'sk-e',
        method: 'ping',
        params: { timeout: 5000 },
      }
    );

    expect(result.success).toBe(true);
    expect(acpSessionManagerMock.extMethod).toHaveBeenCalledWith('sk-e', 'ping', { timeout: 5000 });
  });

  it('defaults params to empty object when omitted', async () => {
    acpSessionManagerMock.extMethod.mockResolvedValue({ success: true });

    await callHandler('acp:extMethod', {}, { sessionKey: 'sk-e', method: 'noop' });

    expect(acpSessionManagerMock.extMethod).toHaveBeenCalledWith('sk-e', 'noop', {});
  });

  it('returns validation error when method is missing', async () => {
    const result = await callHandler('acp:extMethod', {}, { sessionKey: 'sk-e' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation error/);
  });
});

// ---------------------------------------------------------------------------
// acp:getClaudeUsageLimits
// ---------------------------------------------------------------------------

describe('acp:getClaudeUsageLimits', () => {
  it('returns usage limits from the service', async () => {
    const limits = {
      fiveHour: { utilization: 0.4, resets_at: null },
      sevenDay: { utilization: 0.2, resets_at: null },
      sevenDayOpus: null,
      sevenDaySonnet: null,
      extraUsage: null,
    };
    claudeUsageServiceMock.getUsageLimits.mockResolvedValue(limits);

    const result = await callHandler('acp:getClaudeUsageLimits', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(limits);
  });

  it('returns null data when no token is available', async () => {
    claudeUsageServiceMock.getUsageLimits.mockResolvedValue(null);

    const result = await callHandler('acp:getClaudeUsageLimits', {});
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it('returns error when service throws', async () => {
    claudeUsageServiceMock.getUsageLimits.mockRejectedValue(new Error('keychain unavailable'));

    const result = await callHandler('acp:getClaudeUsageLimits', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('keychain unavailable');
  });
});
