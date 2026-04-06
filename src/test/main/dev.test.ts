import { beforeEach, describe, expect, it, vi } from 'vitest';

// Store original values to restore after each test
const originalNodeEnv = process.env.NODE_ENV;
const originalArgv = process.argv;

beforeEach(() => {
  vi.resetModules();
  process.env.NODE_ENV = originalNodeEnv;
  process.argv = [...originalArgv];
});

describe('dev', () => {
  describe('isDev', () => {
    it('is true when NODE_ENV is "development"', async () => {
      process.env.NODE_ENV = 'development';
      process.argv = ['node', 'entry.js'];

      const { isDev } = await import('../../main/utils/dev');
      expect(isDev).toBe(true);
    });

    it('is false when NODE_ENV is "production" and --dev flag is absent', async () => {
      process.env.NODE_ENV = 'production';
      process.argv = ['node', 'entry.js'];

      const { isDev } = await import('../../main/utils/dev');
      expect(isDev).toBe(false);
    });

    it('is true when --dev flag is present regardless of NODE_ENV', async () => {
      process.env.NODE_ENV = 'production';
      process.argv = ['node', 'entry.js', '--dev'];

      const { isDev } = await import('../../main/utils/dev');
      expect(isDev).toBe(true);
    });

    it('is true when --dev flag is present and NODE_ENV is development', async () => {
      process.env.NODE_ENV = 'development';
      process.argv = ['node', 'entry.js', '--dev'];

      const { isDev } = await import('../../main/utils/dev');
      expect(isDev).toBe(true);
    });

    it('is false when NODE_ENV is "test" and --dev flag is absent', async () => {
      process.env.NODE_ENV = 'test';
      process.argv = ['node', 'entry.js'];

      const { isDev } = await import('../../main/utils/dev');
      expect(isDev).toBe(false);
    });

    it('is false when NODE_ENV is undefined and --dev flag is absent', async () => {
      delete process.env.NODE_ENV;
      process.argv = ['node', 'entry.js'];

      const { isDev } = await import('../../main/utils/dev');
      expect(isDev).toBe(false);
    });

    it('is false when argv contains a different flag but not --dev', async () => {
      process.env.NODE_ENV = 'production';
      process.argv = ['node', 'entry.js', '--verbose', '--headless'];

      const { isDev } = await import('../../main/utils/dev');
      expect(isDev).toBe(false);
    });

    it('is true when --dev appears anywhere in argv (not just last)', async () => {
      process.env.NODE_ENV = 'production';
      process.argv = ['node', 'entry.js', '--dev', '--remote-debugging-port=9222'];

      const { isDev } = await import('../../main/utils/dev');
      expect(isDev).toBe(true);
    });
  });
});
