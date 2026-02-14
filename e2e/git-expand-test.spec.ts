/**
 * Focused test for Git tab expand all with PatchDiff
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const mainPath = path.join(process.cwd(), 'dist/main/main/entry.js');

  app = await electron.launch({
    args: [mainPath, '--dev'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_DISABLE_GPU: '1',
    },
    cwd: process.cwd(),
    timeout: 30000,
  });

  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  // Enable console logging
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });

  page.on('pageerror', error => {
    console.log(`[Browser Error] ${error.message}`);
  });
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

test('Git Tab - Expand All with PatchDiff', async () => {
  // Close any modals
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Take initial screenshot
  await page.screenshot({ path: 'e2e/screenshots/expand-test-initial.png' });

  // First expand the valkyr-ai project to see its sessions
  const valkyrProject = page.locator('text=valkyr-ai').first();
  if (await valkyrProject.isVisible()) {
    console.log('Found valkyr-ai project');
    // Click to expand if needed
    await valkyrProject.click();
    await page.waitForTimeout(500);
  }

  // Now click on the session (thirty-flies-beg) to select it
  const session = page.locator('text=thirty-flies-beg').first();
  if (await session.isVisible()) {
    console.log('Found thirty-flies-beg session, clicking...');
    await session.click();
    await page.waitForTimeout(1000);
  } else {
    console.log('Session not found, looking for any session...');
    // Try to find any session in the sidebar
    const anySession = page.locator('[class*="session"], [class*="task"]').first();
    if (await anySession.isVisible()) {
      await anySession.click();
      await page.waitForTimeout(1000);
    }
  }

  await page.screenshot({ path: 'e2e/screenshots/expand-test-session-selected.png' });

  // Click on Git tab
  const gitTab = page.locator('button:has-text("Git")').first();
  if (await gitTab.isVisible()) {
    await gitTab.click({ force: true });
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: 'e2e/screenshots/expand-test-git-tab.png' });

  // Check if there are any file changes displayed
  const changesText = await page.locator('text=Changes').first().textContent();
  console.log(`Changes header: ${changesText}`);

  // Look for file items with status badges
  const statusBadges = await page.locator('[title="Modified"], [title="Added"], [title="Deleted"]').count();
  console.log(`Found ${statusBadges} files with changes`);

  // Check for "No changes detected" or "Select a task"
  const noChanges = await page.locator('text=No changes detected').count();
  const selectTask = await page.locator('text=Select a task').count();
  console.log(`No changes detected: ${noChanges > 0}`);
  console.log(`Select a task message: ${selectTask > 0}`);

  // Look for Expand All button
  const expandAllBtn = page.locator('button:has-text("Expand All")');
  const expandAllVisible = await expandAllBtn.isVisible().catch(() => false);
  console.log(`Expand All button visible: ${expandAllVisible}`);

  if (expandAllVisible) {
    console.log('Clicking Expand All...');
    await expandAllBtn.click();
    await page.waitForTimeout(3000); // Wait for diffs to load

    await page.screenshot({ path: 'e2e/screenshots/expand-test-after-expand.png' });

    // Check for PatchDiff elements
    const diffViews = await page.locator('.diff-view').count();
    console.log(`PatchDiff .diff-view elements: ${diffViews}`);

    // Check for any fallback (SimpleDiffView used pre.overflow-x-auto.p-2.font-mono)
    const fallbackViews = await page.locator('pre.overflow-x-auto.p-2.font-mono').count();
    console.log(`Fallback SimpleDiffView elements: ${fallbackViews}`);

    // Check for loading spinners
    const loadingSpinners = await page.locator('text=Loading diff').count();
    console.log(`Loading spinners: ${loadingSpinners}`);

    // Check for error messages
    const errorMessages = await page.locator('text=Failed to render diff').count();
    console.log(`Error messages: ${errorMessages}`);

    // Verify no fallback
    expect(fallbackViews).toBe(0);
  } else {
    console.log('Expand All button not visible - checking why...');

    // Get the git panel content
    const gitPanelText = await page.locator('[class*="flex-col"]').first().textContent();
    console.log(`Git panel content: ${gitPanelText?.substring(0, 200)}`);
  }

  // Get any console errors from the page
  const errors = await page.evaluate(() => {
    return (window as any).__PLAYWRIGHT_ERRORS__ || [];
  });
  console.log(`Page errors: ${JSON.stringify(errors)}`);

  // Take final screenshot
  await page.screenshot({ path: 'e2e/screenshots/expand-test-final.png' });
});

test('Inspect DOM structure', async () => {
  // Close any modals
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Get the current page structure
  const bodyHTML = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    return main.innerHTML.substring(0, 5000);
  });

  console.log('=== PAGE STRUCTURE ===');
  console.log(bodyHTML.substring(0, 2000));
  console.log('=== END ===');

  // Check what's in the sidebar
  const sidebarItems = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="sidebar"] button, nav button');
    return Array.from(items).map(el => el.textContent?.trim()).filter(Boolean).slice(0, 20);
  });
  console.log('Sidebar items:', sidebarItems);

  // Check what tabs exist
  const tabs = await page.evaluate(() => {
    const tabButtons = document.querySelectorAll('button');
    return Array.from(tabButtons)
      .map(el => el.textContent?.trim())
      .filter(text => text && ['Git', 'Editor', 'AI Agents', 'Preview'].some(t => text.includes(t)));
  });
  console.log('Tab buttons:', tabs);
});
