/**
 * Shared Playwright fixtures for Valkyr Electron E2E tests.
 *
 * Usage in test files:
 *   import { test, expect } from './fixtures';
 *
 * Provides:
 *   - `app`  — ElectronApplication instance (auto-launched, auto-closed)
 *   - `page` — The first renderer window (ready for interaction)
 *
 * The app is built before tests run via `pnpm run build:main`.
 * Make sure `dist/main/main/entry.js` exists.
 */

import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';

type ValkyrFixtures = {
  app: ElectronApplication;
  page: Page;
};

export const test = base.extend<ValkyrFixtures>({
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    const mainPath = path.join(__dirname, '../dist/main/main/entry.js');
    const app = await electron.launch({
      args: [mainPath, '--dev'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        // Disable telemetry in tests
        TELEMETRY_ENABLED: 'false',
      },
    });
    await use(app);
    await app.close();
  },

  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Wait for app initialization (React render + data load)
    await page.waitForTimeout(3000);
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Helper: dismiss the welcome screen if visible.
 */
export async function dismissWelcome(page: Page): Promise<void> {
  const startBtn = page.getByRole('button', { name: /start shipping/i });
  if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await startBtn.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Helper: dismiss the prerequisite modal if visible.
 */
export async function dismissPrerequisites(page: Page): Promise<void> {
  const continueBtn = page.getByRole('button', { name: /continue|i understand|i'll install/i });
  if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await continueBtn.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Helper: get past onboarding (welcome + prerequisites).
 */
export async function skipOnboarding(page: Page): Promise<void> {
  await dismissWelcome(page);
  await dismissPrerequisites(page);
}

/**
 * Helper: wait for the app to be in a ready state (sidebar visible).
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await skipOnboarding(page);
  // Wait for sidebar to render (indicates app is fully loaded)
  await page.waitForSelector('[data-testid="sidebar"], nav, aside', { timeout: 10000 }).catch(() => {
    // Fallback: just wait
  });
}

/**
 * Helper: collect console errors from the page.
 */
export async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}
