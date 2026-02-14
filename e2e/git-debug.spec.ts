/**
 * Comprehensive debugging test for Git tab
 * Captures detailed logs, errors, memory, and state
 */
import { test, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

let app: ElectronApplication;
let page: Page;
const logs: string[] = [];

function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  logs.push(line);
  console.log(line);
}

test.beforeAll(async () => {
  const mainPath = path.join(process.cwd(), 'dist/main/main/entry.js');

  log('Launching Electron app...');
  app = await electron.launch({
    args: [mainPath, '--dev'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_DISABLE_GPU: '1',
      ELECTRON_ENABLE_LOGGING: '1',
    },
    cwd: process.cwd(),
    timeout: 30000,
  });

  page = await app.firstWindow();

  // Capture ALL console messages
  page.on('console', msg => {
    log(`[Console ${msg.type()}] ${msg.text()}`);
  });

  // Capture page errors
  page.on('pageerror', error => {
    log(`[Page Error] ${error.message}`);
    log(`[Stack] ${error.stack}`);
  });

  // Capture crashes
  page.on('crash', () => {
    log('[CRASH] Page crashed!');
  });

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  log('App loaded');
});

test.afterAll(async () => {
  // Save all logs to file
  const logFile = path.join(process.cwd(), 'e2e/debug-output.log');
  fs.writeFileSync(logFile, logs.join('\n'));
  log(`Logs saved to ${logFile}`);

  if (app) {
    await app.close();
  }
});

test('Debug Git Expand All', async () => {
  // Close modals
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Get initial memory
  const initialMemory = await page.evaluate(() => {
    const perf = (performance as any).memory;
    return perf ? {
      usedJSHeapSize: Math.round(perf.usedJSHeapSize / 1024 / 1024),
      totalJSHeapSize: Math.round(perf.totalJSHeapSize / 1024 / 1024),
    } : null;
  });
  log(`Initial memory: ${JSON.stringify(initialMemory)}`);

  // Select valkyr-ai project
  log('Looking for valkyr-ai project...');
  const valkyrProject = page.locator('text=valkyr-ai').first();
  if (await valkyrProject.isVisible()) {
    await valkyrProject.click();
    await page.waitForTimeout(500);
    log('Clicked valkyr-ai project');
  }

  // Select thirty-flies-beg session
  log('Looking for thirty-flies-beg session...');
  const session = page.locator('text=thirty-flies-beg').first();
  if (await session.isVisible()) {
    await session.click();
    await page.waitForTimeout(1000);
    log('Clicked thirty-flies-beg session');
  }

  // Click Git tab
  log('Clicking Git tab...');
  const gitTab = page.locator('button:has-text("Git")').first();
  await gitTab.click({ force: true });
  await page.waitForTimeout(1000);

  // Get file count
  const fileCount = await page.locator('[title="Modified"], [title="Added"], [title="Deleted"]').count();
  log(`Files with changes: ${fileCount}`);

  // Get all file paths
  const filePaths = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="truncate"]');
    return Array.from(items).map(el => el.textContent).filter(t => t?.includes('.')).slice(0, 30);
  });
  log(`File paths: ${JSON.stringify(filePaths)}`);

  // Check for Expand All button
  const expandAllBtn = page.locator('button:has-text("Expand All")');
  const expandAllVisible = await expandAllBtn.isVisible().catch(() => false);
  log(`Expand All visible: ${expandAllVisible}`);

  if (!expandAllVisible) {
    log('No Expand All button - taking screenshot and exiting');
    await page.screenshot({ path: 'e2e/screenshots/debug-no-expand.png' });
    return;
  }

  // Take screenshot before expand
  await page.screenshot({ path: 'e2e/screenshots/debug-before-expand.png' });
  log('Screenshot: debug-before-expand.png');

  // Try expanding ONE file first to test Monaco DiffEditor
  log('Testing single file expand...');
  const firstFileRow = page.locator('div.border-b:has([title="Modified"], [title="Added"])').first();
  if (await firstFileRow.isVisible()) {
    await firstFileRow.click();
    await page.waitForTimeout(2000);

    // Check what rendered
    const diffView = await page.locator('.monaco-diff-editor').count();
    const errorMsg = await page.locator('text=Failed to render').count();
    const loading = await page.locator('text=Loading').count();

    log(`After single expand - monaco-diff-editor: ${diffView}, errors: ${errorMsg}, loading: ${loading}`);

    await page.screenshot({ path: 'e2e/screenshots/debug-single-expand.png' });

    // Get memory after single expand
    const memAfterOne = await page.evaluate(() => {
      const perf = (performance as any).memory;
      return perf ? Math.round(perf.usedJSHeapSize / 1024 / 1024) : null;
    });
    log(`Memory after 1 file: ${memAfterOne}MB`);

    // Collapse it
    await firstFileRow.click();
    await page.waitForTimeout(500);
  }

  // Now try Expand All with crash protection
  log('Attempting Expand All...');

  try {
    await expandAllBtn.click();

    // Check status at intervals
    for (let i = 1; i <= 10; i++) {
      await page.waitForTimeout(500);

      const expandedCount = await page.locator('svg.lucide-chevron-down').count();
      const diffViews = await page.locator('.monaco-diff-editor').count();
      const errors = await page.locator('text=Failed to render').count();
      const loading = await page.locator('text=Loading').count();

      const mem = await page.evaluate(() => {
        const perf = (performance as any).memory;
        return perf ? Math.round(perf.usedJSHeapSize / 1024 / 1024) : null;
      }).catch(() => null);

      log(`[${i * 500}ms] expanded: ${expandedCount}, diffs: ${diffViews}, errors: ${errors}, loading: ${loading}, mem: ${mem}MB`);

      // Take periodic screenshots
      if (i === 2 || i === 5 || i === 10) {
        await page.screenshot({ path: `e2e/screenshots/debug-expand-${i * 500}ms.png` }).catch(() => {
          log(`Screenshot failed at ${i * 500}ms`);
        });
      }
    }

    log('Expand All completed without crash');

  } catch (error: any) {
    log(`[ERROR] Expand All failed: ${error.message}`);
    log(`[Stack] ${error.stack}`);
  }

  // Final state
  await page.screenshot({ path: 'e2e/screenshots/debug-final.png' }).catch(() => {
    log('Final screenshot failed - page may have crashed');
  });

  // Final memory
  const finalMemory = await page.evaluate(() => {
    const perf = (performance as any).memory;
    return perf ? Math.round(perf.usedJSHeapSize / 1024 / 1024) : null;
  }).catch(() => null);
  log(`Final memory: ${finalMemory}MB`);
});
