/**
 * Inspect the actual DOM structure of rendered diffs
 */
import { test, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const mainPath = path.join(process.cwd(), 'dist/main/main/entry.js');

  app = await electron.launch({
    args: [mainPath, '--dev'],
    env: { ...process.env, NODE_ENV: 'development' },
    cwd: process.cwd(),
    timeout: 30000,
  });

  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('Inspect diff DOM structure', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Navigate to valkyr-ai > thirty-flies-beg > Git tab
  await page.locator('text=valkyr-ai').first().click();
  await page.waitForTimeout(500);
  await page.locator('text=thirty-flies-beg').first().click();
  await page.waitForTimeout(1000);

  // Click Git tab (make sure we're on it)
  const gitTab = page.locator('button:has-text("Git")').first();
  await gitTab.click({ force: true });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'e2e/screenshots/inspect-git-tab.png' });

  // Look for file items in the Git Changes panel by finding the status badges
  const fileWithChanges = page.locator('[title="Modified"], [title="Added"]').first();
  const fileVisible = await fileWithChanges.isVisible().catch(() => false);
  console.log('File with changes visible:', fileVisible);

  if (!fileVisible) {
    console.log('No file changes visible - checking page state');
    const pageText = await page.locator('body').textContent();
    console.log('Page contains "Changes":', pageText?.includes('Changes'));
    console.log('Page contains "No changes":', pageText?.includes('No changes'));
    console.log('Page contains "Select a task":', pageText?.includes('Select a task'));
    return;
  }

  // Click on the parent row to expand
  const fileRow = fileWithChanges.locator('xpath=ancestor::div[contains(@class, "border-b")]');
  await fileRow.click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'e2e/screenshots/inspect-after-click.png' });

  // Look for specific diff elements
  const checks = await page.evaluate(() => {
    return {
      diffView: document.querySelectorAll('.diff-view').length,
      patchDiff: document.querySelectorAll('[class*="patch"]').length,
      pierre: document.querySelectorAll('[class*="pierre"]').length,
      pre: document.querySelectorAll('pre').length,
      table: document.querySelectorAll('table').length,
      maxH80: document.querySelectorAll('[class*="max-h-80"]').length,
      bgMuted: document.querySelectorAll('[class*="bg-muted"]').length,
      // Look for line content
      codeLines: document.querySelectorAll('code').length,
      divWithNumbers: document.querySelectorAll('div:has(> span)').length,
    };
  });

  console.log('=== ELEMENT COUNTS ===');
  console.log(JSON.stringify(checks, null, 2));

  // Get the diff area HTML
  const diffAreaHTML = await page.evaluate(() => {
    const diffArea = document.querySelector('[class*="max-h-80"]');
    if (diffArea) {
      return {
        html: diffArea.innerHTML.substring(0, 5000),
        className: diffArea.className,
      };
    }
    return null;
  });

  console.log('=== DIFF AREA ===');
  console.log('Class:', diffAreaHTML?.className);
  console.log('HTML (first 2000 chars):', diffAreaHTML?.html?.substring(0, 2000));

  // Check what component type is being used
  const componentInfo = await page.evaluate(() => {
    // Look for React fiber data
    const diffContainer = document.querySelector('[class*="max-h-80"]');
    if (!diffContainer) return { found: false };

    // Check for specific component markers
    return {
      found: true,
      hasSuspense: !!diffContainer.querySelector('[data-suspense]'),
      hasErrorBoundary: diffContainer.innerHTML.includes('Failed to render'),
      hasLoading: diffContainer.innerHTML.includes('Loading'),
      hasLineNumbers: /\d{2,}/.test(diffContainer.textContent || ''),
      innerText: (diffContainer.textContent || '').substring(0, 500),
    };
  });

  console.log('=== COMPONENT INFO ===');
  console.log(JSON.stringify(componentInfo, null, 2));

  await page.screenshot({ path: 'e2e/screenshots/inspect-diff.png' });
});
