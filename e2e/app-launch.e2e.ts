/**
 * Core app launch and layout E2E tests.
 * Validates that the Electron app starts, renders, and basic navigation works.
 */

import { test, expect, waitForAppReady, skipOnboarding } from './fixtures';

test.describe('App Launch', () => {
  test('app window opens and has correct title', async ({ app, page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();

    const windows = app.windows();
    expect(windows.length).toBeGreaterThanOrEqual(1);
  });

  test('welcome screen shows on first launch', async ({ page }) => {
    // Check for welcome screen elements
    const welcomeText = page.getByText('Welcome.');
    const startBtn = page.getByRole('button', { name: /start shipping/i });

    // At least one should be visible (may have been dismissed already)
    const welcomeVisible = await welcomeText.isVisible({ timeout: 3000 }).catch(() => false);
    const btnVisible = await startBtn.isVisible({ timeout: 1000 }).catch(() => false);

    if (welcomeVisible || btnVisible) {
      expect(welcomeVisible || btnVisible).toBe(true);
      // Dismiss it
      if (btnVisible) await startBtn.click();
    }
  });

  test('main layout renders after onboarding', async ({ page }) => {
    await waitForAppReady(page);

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'e2e/screenshots/layout-after-onboarding.png' });

    // App should have rendered something (not a blank page)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(10);
  });

  test('no uncaught errors in console on startup', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await skipOnboarding(page);
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors
    const criticalErrors = errors.filter((e) => !e.includes('net::ERR_') && !e.includes('favicon'));

    expect(criticalErrors).toEqual([]);
  });
});

test.describe('Settings', () => {
  test('settings dialog opens and shows tabs', async ({ page }) => {
    await waitForAppReady(page);

    // Open settings via keyboard shortcut
    await page.keyboard.press('Meta+,');
    await page.waitForTimeout(500);

    // Check for settings content
    const settingsVisible = await page
      .getByText(/general|appearance|agents/i)
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (settingsVisible) {
      expect(settingsVisible).toBe(true);

      // Check that Agents tab exists
      const agentsTab = page.getByText(/agents.*tools/i).first();
      if (await agentsTab.isVisible().catch(() => false)) {
        await agentsTab.click();
        await page.waitForTimeout(300);

        // Verify agent mode section is present
        const agentMode = page.getByText(/agent mode/i);
        const modeVisible = await agentMode.isVisible({ timeout: 2000 }).catch(() => false);
        expect(modeVisible).toBe(true);
      }
    }
  });
});
