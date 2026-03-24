import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();

const getAppSettingsMock = vi.fn();
const updateAppSettingsMock = vi.fn();
const logErrorMock = vi.fn();

const keytarSetPasswordMock = vi.fn();
const keytarGetPasswordMock = vi.fn();
const keytarDeletePasswordMock = vi.fn();
const keytarFindCredentialsMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
}));

vi.mock('../../main/settings', () => ({
  getAppSettings: getAppSettingsMock,
  updateAppSettings: updateAppSettingsMock,
}));

vi.mock('../../main/lib/logger', () => ({
  log: { error: logErrorMock, info: vi.fn(), warn: vi.fn() },
}));

// keytar is dynamically imported inside each handler, so we mock the module
vi.mock('keytar', () => ({
  setPassword: keytarSetPasswordMock,
  getPassword: keytarGetPasswordMock,
  deletePassword: keytarDeletePasswordMock,
  findCredentials: keytarFindCredentialsMock,
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

  vi.mock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
  }));

  vi.mock('../../main/settings', () => ({
    getAppSettings: getAppSettingsMock,
    updateAppSettings: updateAppSettingsMock,
  }));

  vi.mock('../../main/lib/logger', () => ({
    log: { error: logErrorMock, info: vi.fn(), warn: vi.fn() },
  }));

  vi.mock('keytar', () => ({
    setPassword: keytarSetPasswordMock,
    getPassword: keytarGetPasswordMock,
    deletePassword: keytarDeletePasswordMock,
    findCredentials: keytarFindCredentialsMock,
  }));

  const mod = await import('../../main/ipc/settingsIpc');
  mod.registerSettingsIpc();
});

describe('settingsIpc', () => {
  describe('settings:get', () => {
    it('returns current settings on success', async () => {
      const mockSettings = { repository: { branchPrefix: 'feat', pushOnCreate: true } };
      getAppSettingsMock.mockReturnValue(mockSettings);

      const result = await callHandler('settings:get');

      expect(result.success).toBe(true);
      expect(result.settings).toEqual(mockSettings);
    });

    it('returns error when getAppSettings throws', async () => {
      getAppSettingsMock.mockImplementation(() => {
        throw new Error('Disk read failure');
      });

      const result = await callHandler('settings:get');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Disk read failure');
    });
  });

  describe('settings:update', () => {
    it('returns updated settings on success', async () => {
      const updatedSettings = { repository: { branchPrefix: 'fix', pushOnCreate: false } };
      updateAppSettingsMock.mockReturnValue(updatedSettings);

      const result = await callHandler('settings:update', {
        repository: { branchPrefix: 'fix' },
      });

      expect(result.success).toBe(true);
      expect(result.settings).toEqual(updatedSettings);
      expect(updateAppSettingsMock).toHaveBeenCalledWith({ repository: { branchPrefix: 'fix' } });
    });

    it('passes empty object when partial is null/undefined', async () => {
      updateAppSettingsMock.mockReturnValue({});

      await callHandler('settings:update', null);

      expect(updateAppSettingsMock).toHaveBeenCalledWith({});
    });

    it('returns error when updateAppSettings throws', async () => {
      updateAppSettingsMock.mockImplementation(() => {
        throw new Error('Write permission denied');
      });

      const result = await callHandler('settings:update', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Write permission denied');
    });
  });

  describe('providerKeys:set', () => {
    it('stores a key successfully', async () => {
      keytarSetPasswordMock.mockResolvedValue(undefined);

      const result = await callHandler('providerKeys:set', {
        envVar: 'OPENAI_API_KEY',
        value: 'sk-test-123',
      });

      expect(result.success).toBe(true);
      expect(keytarSetPasswordMock).toHaveBeenCalledWith(
        'valkyr-provider-keys',
        'OPENAI_API_KEY',
        'sk-test-123'
      );
    });

    it('returns error when keytar throws', async () => {
      keytarSetPasswordMock.mockRejectedValue(new Error('Keychain locked'));

      const result = await callHandler('providerKeys:set', {
        envVar: 'OPENAI_API_KEY',
        value: 'sk-test-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Keychain locked');
      expect(logErrorMock).toHaveBeenCalled();
    });
  });

  describe('providerKeys:get', () => {
    it('returns hasKey true when a password is stored', async () => {
      keytarGetPasswordMock.mockResolvedValue('sk-stored-value');

      const result = await callHandler('providerKeys:get', { envVar: 'ANTHROPIC_API_KEY' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ hasKey: true });
      expect(keytarGetPasswordMock).toHaveBeenCalledWith(
        'valkyr-provider-keys',
        'ANTHROPIC_API_KEY'
      );
    });

    it('returns hasKey false when no password is stored', async () => {
      keytarGetPasswordMock.mockResolvedValue(null);

      const result = await callHandler('providerKeys:get', { envVar: 'ANTHROPIC_API_KEY' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ hasKey: false });
    });

    it('returns hasKey false when stored value is empty string', async () => {
      keytarGetPasswordMock.mockResolvedValue('');

      const result = await callHandler('providerKeys:get', { envVar: 'ANTHROPIC_API_KEY' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ hasKey: false });
    });

    it('returns error when keytar throws', async () => {
      keytarGetPasswordMock.mockRejectedValue(new Error('Access denied'));

      const result = await callHandler('providerKeys:get', { envVar: 'ANTHROPIC_API_KEY' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Access denied');
      expect(logErrorMock).toHaveBeenCalled();
    });
  });

  describe('providerKeys:delete', () => {
    it('deletes a key successfully', async () => {
      keytarDeletePasswordMock.mockResolvedValue(true);

      const result = await callHandler('providerKeys:delete', { envVar: 'OPENAI_API_KEY' });

      expect(result.success).toBe(true);
      expect(keytarDeletePasswordMock).toHaveBeenCalledWith(
        'valkyr-provider-keys',
        'OPENAI_API_KEY'
      );
    });

    it('returns error when keytar throws', async () => {
      keytarDeletePasswordMock.mockRejectedValue(new Error('Delete failed'));

      const result = await callHandler('providerKeys:delete', { envVar: 'OPENAI_API_KEY' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Delete failed');
      expect(logErrorMock).toHaveBeenCalled();
    });
  });

  describe('providerKeys:list', () => {
    it('returns a list of stored key names', async () => {
      keytarFindCredentialsMock.mockResolvedValue([
        { account: 'OPENAI_API_KEY', password: 'sk-xxx' },
        { account: 'ANTHROPIC_API_KEY', password: 'sk-yyy' },
      ]);

      const result = await callHandler('providerKeys:list');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']);
      expect(keytarFindCredentialsMock).toHaveBeenCalledWith('valkyr-provider-keys');
    });

    it('returns an empty list when no keys are stored', async () => {
      keytarFindCredentialsMock.mockResolvedValue([]);

      const result = await callHandler('providerKeys:list');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('returns error when keytar throws', async () => {
      keytarFindCredentialsMock.mockRejectedValue(new Error('List failed'));

      const result = await callHandler('providerKeys:list');

      expect(result.success).toBe(false);
      expect(result.error).toBe('List failed');
      expect(logErrorMock).toHaveBeenCalled();
    });
  });

  describe('getStoredProviderKeys', () => {
    it('returns a record of envVar -> value pairs', async () => {
      keytarFindCredentialsMock.mockResolvedValue([
        { account: 'OPENAI_API_KEY', password: 'sk-open-1' },
        { account: 'ANTHROPIC_API_KEY', password: 'sk-ant-2' },
      ]);

      const { getStoredProviderKeys } = await import('../../main/ipc/settingsIpc');
      const result = await getStoredProviderKeys();

      expect(result).toEqual({
        OPENAI_API_KEY: 'sk-open-1',
        ANTHROPIC_API_KEY: 'sk-ant-2',
      });
    });

    it('returns empty object when keytar throws', async () => {
      keytarFindCredentialsMock.mockRejectedValue(new Error('Keychain unavailable'));

      const { getStoredProviderKeys } = await import('../../main/ipc/settingsIpc');
      const result = await getStoredProviderKeys();

      expect(result).toEqual({});
    });

    it('returns empty object when no credentials are stored', async () => {
      keytarFindCredentialsMock.mockResolvedValue([]);

      const { getStoredProviderKeys } = await import('../../main/ipc/settingsIpc');
      const result = await getStoredProviderKeys();

      expect(result).toEqual({});
    });
  });
});
