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
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
});

test.afterAll(async () => {
  if (app) await app.close();
});

test('detailed session rename debug', async () => {
  const sessionItem = page.locator('text=jolly-rabbits-hug').first();

  // Log initial state
  console.log('=== INITIAL STATE ===');
  let inputCount = await page.locator('input[type="text"]').count();
  console.log(`Inputs before: ${inputCount}`);

  // Hover over session
  await sessionItem.hover();
  await page.waitForTimeout(200);

  // Find and click the 3-dot menu button
  const menuButton = page.locator('button:has(svg.lucide-more-vertical)').first();
  console.log(`Menu button visible: ${await menuButton.isVisible()}`);

  await menuButton.click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'e2e/screenshots/detailed-menu-open.png' });

  console.log('=== MENU OPENED ===');

  // Click Rename
  const renameOption = page.getByRole('menuitem', { name: 'Rename' });
  console.log(`Rename option visible: ${await renameOption.isVisible()}`);

  await renameOption.click();

  // Rapid fire screenshots to catch the exact moment
  for (let ms = 0; ms <= 500; ms += 25) {
    await page.waitForTimeout(25);
    const inputs = await page.locator('input[type="text"]').all();
    const inputVisible = inputs.length > 0 ? await inputs[0].isVisible() : false;
    const inputFocused = inputs.length > 0 ? await inputs[0].evaluate(el => document.activeElement === el) : false;
    console.log(`${ms}ms: inputs=${inputs.length}, visible=${inputVisible}, focused=${inputFocused}`);

    if (ms % 100 === 0) {
      await page.screenshot({ path: `e2e/screenshots/detailed-rename-${ms}ms.png` });
    }
  }

  // Check React state by looking at DOM
  const editingInput = page.locator('input.min-w-0');
  if (await editingInput.count() > 0) {
    console.log('=== INPUT FOUND ===');
    const value = await editingInput.inputValue();
    console.log(`Input value: ${value}`);
  } else {
    console.log('=== INPUT NOT FOUND ===');
  }
});

test('check for competing blur events', async () => {
  // Inject a listener to log all blur/focus events
  await page.evaluate(() => {
    (window as any).__blurLog = [];
    (window as any).__focusLog = [];

    document.addEventListener('blur', (e) => {
      (window as any).__blurLog.push({
        time: Date.now(),
        target: (e.target as HTMLElement).tagName,
        className: (e.target as HTMLElement).className,
      });
    }, true);

    document.addEventListener('focus', (e) => {
      (window as any).__focusLog.push({
        time: Date.now(),
        target: (e.target as HTMLElement).tagName,
        className: (e.target as HTMLElement).className,
      });
    }, true);
  });

  const sessionItem = page.locator('text=jolly-rabbits-hug').first();
  await sessionItem.hover();
  await page.waitForTimeout(200);

  const menuButton = page.locator('button:has(svg.lucide-more-vertical)').first();
  await menuButton.click();
  await page.waitForTimeout(100);

  const renameOption = page.getByRole('menuitem', { name: 'Rename' });
  await renameOption.click();
  await page.waitForTimeout(500);

  // Get the logs
  const blurLog = await page.evaluate(() => (window as any).__blurLog);
  const focusLog = await page.evaluate(() => (window as any).__focusLog);

  console.log('=== BLUR EVENTS ===');
  console.log(JSON.stringify(blurLog, null, 2));

  console.log('=== FOCUS EVENTS ===');
  console.log(JSON.stringify(focusLog, null, 2));
});
