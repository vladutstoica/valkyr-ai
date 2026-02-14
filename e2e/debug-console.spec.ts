import { test, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const mainPath = path.join(__dirname, '../dist/main/main/entry.js');
  app = await electron.launch({
    args: [mainPath],
    env: { ...process.env, NODE_ENV: 'development' },
  });
  page = await app.firstWindow();

  // Capture console messages
  page.on('console', (msg) => {
    if (msg.text().includes('[TaskItem')) {
      console.log(`RENDERER: ${msg.text()}`);
    }
  });

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('debug session rename with console logs', async () => {
  console.log('=== STARTING TEST ===');

  // Find the session row container
  const sessionRow = page.locator('.group\\/task').filter({ hasText: 'jolly-rabbits-hug' }).first();

  await sessionRow.hover();
  await page.waitForTimeout(300);

  // Find the menu button WITHIN the session row
  const menuButton = sessionRow.locator('button').filter({ has: page.locator('svg.lucide-more-vertical') });
  await menuButton.first().click();
  await page.waitForTimeout(200);

  console.log('=== CLICKING RENAME ===');

  // Click Rename
  const renameOption = page.getByRole('menuitem', { name: 'Rename' });
  await renameOption.click();

  // Wait and collect logs
  for (let i = 0; i <= 10; i++) {
    await page.waitForTimeout(100);
    console.log(`--- ${i * 100}ms ---`);
  }

  console.log('=== TEST COMPLETE ===');
});
