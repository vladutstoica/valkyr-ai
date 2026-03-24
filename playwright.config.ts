import { defineConfig } from '@playwright/test';

/**
 * Playwright config for Valkyr Electron E2E tests.
 *
 * Usage:
 *   pnpm run e2e          # run all E2E tests
 *   pnpm run e2e:debug    # headed mode, no timeout
 *   pnpm run e2e:ui       # Playwright UI mode
 *
 * Tests use fixtures from e2e/fixtures.ts which auto-launch/close Electron.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  retries: 0,
  workers: 1, // Electron tests must run serially
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
});
