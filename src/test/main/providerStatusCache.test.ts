import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';

// ---- electron mock ----
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(os.tmpdir()),
  },
}));

// ---- logger mock ----
vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---- fs/promises mock ----
const readFileMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock('fs/promises', () => ({
  default: {
    readFile: (...args: any[]) => readFileMock(...args),
    writeFile: (...args: any[]) => writeFileMock(...args),
  },
  readFile: (...args: any[]) => readFileMock(...args),
  writeFile: (...args: any[]) => writeFileMock(...args),
}));

describe('ProviderStatusCache', () => {
  let ProviderStatusCache: typeof import('../../main/services/providerStatusCache').ProviderStatusCache;
  let cache: InstanceType<
    typeof import('../../main/services/providerStatusCache').ProviderStatusCache
  >;

  beforeEach(async () => {
    vi.resetModules();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);

    const mod = await import('../../main/services/providerStatusCache');
    ProviderStatusCache = mod.ProviderStatusCache;
    cache = new ProviderStatusCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // load()
  // -------------------------------------------------------------------------
  describe('load()', () => {
    it('populates cache from valid JSON file', async () => {
      const stored = {
        claude: { installed: true, path: '/usr/bin/claude', version: '1.0.0', lastChecked: 1000 },
        codex: { installed: false, path: null, version: null, lastChecked: 2000 },
      };
      readFileMock.mockResolvedValue(JSON.stringify(stored));

      await cache.load();

      expect(cache.get('claude')).toEqual(stored.claude);
      expect(cache.get('codex')).toEqual(stored.codex);
    });

    it('resets to empty cache when file does not exist (ENOENT)', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      readFileMock.mockRejectedValue(err);

      await cache.load();

      expect(cache.getAll()).toEqual({});
    });

    it('resets to empty cache when file contains invalid JSON', async () => {
      readFileMock.mockResolvedValue('this is not json {{{');

      await cache.load();

      expect(cache.getAll()).toEqual({});
    });

    it('resets to empty cache when file contains a non-object (null)', async () => {
      readFileMock.mockResolvedValue('null');

      await cache.load();

      expect(cache.getAll()).toEqual({});
    });

    it('resets to empty cache when file contains a JSON array', async () => {
      readFileMock.mockResolvedValue('[]');

      await cache.load();

      expect(cache.getAll()).toEqual({});
    });

    it('is callable multiple times without error', async () => {
      readFileMock.mockResolvedValue(JSON.stringify({ p: { installed: true, lastChecked: 1 } }));
      await cache.load();
      await cache.load();
      expect(cache.get('p')).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // get() / getAll()
  // -------------------------------------------------------------------------
  describe('get()', () => {
    it('returns undefined for an unknown provider', () => {
      expect(cache.get('unknown-provider')).toBeUndefined();
    });

    it('returns the stored status for a known provider', () => {
      const status = { installed: true, path: '/usr/bin/claude', version: '2.0', lastChecked: 42 };
      cache.set('claude', status);
      expect(cache.get('claude')).toEqual(status);
    });
  });

  describe('getAll()', () => {
    it('returns an empty object on a fresh cache', () => {
      expect(cache.getAll()).toEqual({});
    });

    it('returns all stored entries', () => {
      cache.set('a', { installed: true, lastChecked: 1 });
      cache.set('b', { installed: false, lastChecked: 2 });

      const all = cache.getAll();
      expect(all).toHaveProperty('a');
      expect(all).toHaveProperty('b');
      expect(Object.keys(all)).toHaveLength(2);
    });

    it('returns a shallow copy — mutating it does not affect the cache', () => {
      cache.set('x', { installed: true, lastChecked: 100 });

      const all = cache.getAll();
      (all as any)['injected'] = true;

      expect(cache.get('injected')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // set()
  // -------------------------------------------------------------------------
  describe('set()', () => {
    it('stores a new entry and makes it retrievable', () => {
      const status = { installed: true, path: '/bin/codex', version: '0.1', lastChecked: 999 };
      cache.set('codex', status);
      expect(cache.get('codex')).toEqual(status);
    });

    it('overwrites an existing entry', () => {
      cache.set('claude', { installed: false, path: null, version: null, lastChecked: 1 });
      cache.set('claude', { installed: true, path: '/usr/bin/claude', version: '2.0', lastChecked: 2 });

      const entry = cache.get('claude');
      expect(entry?.installed).toBe(true);
      expect(entry?.version).toBe('2.0');
    });

    it('does not affect other entries when overwriting one', () => {
      cache.set('a', { installed: true, lastChecked: 1 });
      cache.set('b', { installed: false, lastChecked: 2 });
      cache.set('a', { installed: false, lastChecked: 3 });

      expect(cache.get('b')?.installed).toBe(false);
      expect(cache.get('b')?.lastChecked).toBe(2);
    });

    it('triggers a persist (writeFile called)', async () => {
      cache.set('claude', { installed: true, lastChecked: Date.now() });
      await new Promise((r) => setTimeout(r, 20));
      expect(writeFileMock).toHaveBeenCalled();
    });

    it('persists the correct serialized JSON', async () => {
      writeFileMock.mockClear();
      const status = { installed: true, path: '/usr/bin/amp', version: '3.0', lastChecked: 1234 };
      cache.set('amp', status);
      await new Promise((r) => setTimeout(r, 20));

      expect(writeFileMock).toHaveBeenCalled();
      // writeFile(filePath, payload, encoding) — payload is second arg
      const callArgs = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1];
      const payload = callArgs[1];
      const parsed = JSON.parse(payload as string);
      expect(parsed.amp).toEqual(status);
    });

    it('the persisted filePath contains provider-status-cache.json', async () => {
      writeFileMock.mockClear();
      cache.set('test', { installed: false, lastChecked: 0 });
      await new Promise((r) => setTimeout(r, 20));

      const [filePath] = writeFileMock.mock.calls[0];
      expect(filePath).toContain('provider-status-cache.json');
    });
  });

  // -------------------------------------------------------------------------
  // persist() — write failure handling
  // -------------------------------------------------------------------------
  describe('persist() error handling', () => {
    it('logs a warning when writeFile fails', async () => {
      const { log } = await import('../../main/lib/logger');
      writeFileMock.mockReset();
      writeFileMock.mockRejectedValue(new Error('disk full'));

      cache.set('fail-provider', { installed: false, lastChecked: 0 });
      await new Promise((r) => setTimeout(r, 50));

      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining('providerStatusCache:persist failed'),
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('does not throw when writeFile rejects', async () => {
      writeFileMock.mockReset();
      writeFileMock.mockRejectedValue(new Error('permission denied'));

      expect(() =>
        cache.set('safe', { installed: true, lastChecked: Date.now() })
      ).not.toThrow();

      // Allow the rejection handler to run
      await new Promise((r) => setTimeout(r, 20));
    });
  });

  // -------------------------------------------------------------------------
  // persist() — rapid writes stability
  // -------------------------------------------------------------------------
  describe('persist() rapid writes', () => {
    it('handles many rapid set() calls without throwing', async () => {
      writeFileMock.mockClear();
      writeFileMock.mockResolvedValue(undefined);

      for (let i = 0; i < 10; i++) {
        cache.set(`provider-${i}`, { installed: i % 2 === 0, lastChecked: i });
      }

      await new Promise((r) => setTimeout(r, 400));

      // At least one write should have occurred
      expect(writeFileMock.mock.calls.length).toBeGreaterThanOrEqual(1);
      // Final state in cache should have all 10 providers
      const all = cache.getAll();
      expect(Object.keys(all)).toHaveLength(10);
    });
  });

  // -------------------------------------------------------------------------
  // Module-level singleton
  // -------------------------------------------------------------------------
  describe('providerStatusCache singleton', () => {
    it('exports a singleton instance of ProviderStatusCache', async () => {
      vi.resetModules();
      readFileMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      const mod = await import('../../main/services/providerStatusCache');
      expect(mod.providerStatusCache).toBeInstanceOf(mod.ProviderStatusCache);
    });
  });

  // -------------------------------------------------------------------------
  // ProviderStatus interface shape
  // -------------------------------------------------------------------------
  describe('ProviderStatus shape', () => {
    it('accepts minimal status with only required fields', () => {
      const status = { installed: false, lastChecked: Date.now() };
      expect(() => cache.set('minimal', status)).not.toThrow();
      expect(cache.get('minimal')).toMatchObject({ installed: false });
    });

    it('accepts full status with all optional fields', () => {
      const status = {
        installed: true,
        path: '/usr/local/bin/claude',
        version: '1.2.3',
        lastChecked: 1700000000,
      };
      cache.set('full', status);
      expect(cache.get('full')).toEqual(status);
    });

    it('preserves null values for path and version', () => {
      const status = { installed: false, path: null, version: null, lastChecked: 0 };
      cache.set('nulls', status);
      const retrieved = cache.get('nulls');
      expect(retrieved?.path).toBeNull();
      expect(retrieved?.version).toBeNull();
    });
  });
});
