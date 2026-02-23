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

test('debug with React DevTools state tracking', async () => {
  // Inject a MutationObserver to track DOM changes
  await page.evaluate(() => {
    (window as any).__domChanges = [];
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.removedNodes.forEach((node) => {
            if (node instanceof HTMLElement && node.tagName === 'INPUT') {
              (window as any).__domChanges.push({
                time: Date.now(),
                type: 'INPUT_REMOVED',
                className: node.className,
              });
            }
          });
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement && node.tagName === 'INPUT') {
              (window as any).__domChanges.push({
                time: Date.now(),
                type: 'INPUT_ADDED',
                className: node.className,
              });
            }
          });
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  const sessionItem = page.locator('text=jolly-rabbits-hug').first();
  await sessionItem.hover();
  await page.waitForTimeout(200);

  const menuButton = page.locator('button:has(svg.lucide-more-vertical)').first();
  await menuButton.click();
  await page.waitForTimeout(100);

  console.log('=== CLICKING RENAME ===');
  const startTime = Date.now();

  const renameOption = page.getByRole('menuitem', { name: 'Rename' });
  await renameOption.click();

  await page.waitForTimeout(500);

  const domChanges = await page.evaluate(() => (window as any).__domChanges);
  console.log('=== DOM CHANGES ===');
  domChanges.forEach((change: any) => {
    console.log(
      `${change.time - startTime}ms: ${change.type} - ${change.className.substring(0, 50)}`
    );
  });
});

test('test with menu kept open', async () => {
  // Try clicking Rename without closing the menu
  const sessionItem = page.locator('text=jolly-rabbits-hug').first();
  await sessionItem.hover();
  await page.waitForTimeout(200);

  // Right-click context menu instead of dropdown
  await sessionItem.click({ button: 'right' });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'e2e/screenshots/context-menu-test.png' });

  const renameOption = page.getByRole('menuitem', { name: 'Rename' });
  if (await renameOption.isVisible()) {
    await renameOption.click();

    for (let i = 0; i <= 10; i++) {
      await page.waitForTimeout(100);
      const sessionInput = page.locator('input.min-w-0');
      const count = await sessionInput.count();
      console.log(`${i * 100}ms: session input count = ${count}`);
      if (i % 2 === 0) {
        await page.screenshot({ path: `e2e/screenshots/context-rename-${i * 100}ms.png` });
      }
    }
  }
});

test('check if DropdownMenu onOpenChange resets state', async () => {
  // Inject console logging for React state changes
  await page.evaluate(() => {
    const originalSetState = (window as any).React?.useState;
    console.log('React available:', !!(window as any).React);
  });

  const sessionItem = page.locator('text=jolly-rabbits-hug').first();
  await sessionItem.hover();
  await page.waitForTimeout(200);

  // Use dropdown menu
  const menuButton = page.locator('button:has(svg.lucide-more-vertical)').first();
  await menuButton.click();
  await page.waitForTimeout(100);

  console.log('=== DROPDOWN MENU OPEN ===');
  await page.screenshot({ path: 'e2e/screenshots/dropdown-before-rename.png' });

  // Check the menu state
  const menuContent = page.locator('[role="menu"]');
  console.log(`Menu visible: ${await menuContent.isVisible()}`);

  const renameOption = page.getByRole('menuitem', { name: 'Rename' });
  await renameOption.click();

  // Immediately check
  console.log('=== IMMEDIATELY AFTER CLICK ===');
  await page.screenshot({ path: 'e2e/screenshots/dropdown-immediately-after.png' });

  const sessionInput = page.locator('input.min-w-0');
  console.log(`Input count immediately: ${await sessionInput.count()}`);

  await page.waitForTimeout(10);
  console.log(`Input count after 10ms: ${await sessionInput.count()}`);

  await page.waitForTimeout(20);
  console.log(`Input count after 30ms: ${await sessionInput.count()}`);
});
