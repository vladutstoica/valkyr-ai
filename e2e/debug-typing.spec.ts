import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
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
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('can type in session rename field after clicking Rename', async () => {
  const sessionRow = page.locator('.group\\/task').filter({ hasText: 'jolly-rabbits-hug' }).first();
  await sessionRow.hover();
  await page.waitForTimeout(300);

  const menuButton = sessionRow
    .locator('button')
    .filter({ has: page.locator('svg.lucide-more-vertical') });
  await menuButton.first().click();
  await page.waitForTimeout(200);

  const renameOption = page.getByRole('menuitem', { name: 'Rename' });
  await renameOption.click();
  await page.waitForTimeout(300);

  // Try typing immediately
  await page.keyboard.type('test-rename');
  await page.waitForTimeout(200);

  // Check the input value
  const sessionInput = page.locator('input.min-w-0').first();
  const value = await sessionInput.inputValue();
  console.log(`Input value after typing: "${value}"`);

  await page.screenshot({ path: 'e2e/screenshots/typing-test-session.png' });

  // Press Escape to cancel
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  expect(value).toContain('test-rename');
});

test('can type in project rename field after clicking Rename', async () => {
  const projectHeader = page.locator('text=simplu-workspace').first();
  const projectCard = projectHeader
    .locator('xpath=ancestor::*[contains(@class,"cursor-pointer")]')
    .first();
  await projectCard.hover();
  await page.waitForTimeout(300);

  const menuButton = page
    .locator('button')
    .filter({ has: page.locator('svg.lucide-more-vertical') })
    .first();
  await menuButton.click();
  await page.waitForTimeout(200);

  const renameOption = page.getByRole('menuitem', { name: 'Rename' });
  await renameOption.click();
  await page.waitForTimeout(300);

  // Try typing immediately
  await page.keyboard.type('test-project');
  await page.waitForTimeout(200);

  // Check the input value
  const projectInput = page.locator('input.w-full').first();
  const value = await projectInput.inputValue();
  console.log(`Input value after typing: "${value}"`);

  await page.screenshot({ path: 'e2e/screenshots/typing-test-project.png' });

  // Press Escape to cancel
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  expect(value).toContain('test-project');
});
