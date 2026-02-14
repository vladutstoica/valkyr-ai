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

test('SESSION rename via dropdown - precise targeting', async () => {
  await page.screenshot({ path: 'e2e/screenshots/precise-initial.png' });

  // Find the session row container - it has class group/task
  const sessionRow = page.locator('.group\\/task').filter({ hasText: 'jolly-rabbits-hug' }).first();

  if (await sessionRow.isVisible()) {
    console.log('Found session row');

    // Hover to reveal the menu button
    await sessionRow.hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/precise-hover.png' });

    // Find the menu button WITHIN the session row
    const menuButton = sessionRow.locator('button').filter({ has: page.locator('svg.lucide-more-vertical') });
    const buttonCount = await menuButton.count();
    console.log(`Menu buttons in session row: ${buttonCount}`);

    if (buttonCount > 0) {
      await menuButton.first().click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'e2e/screenshots/precise-session-menu.png' });

      // Click Rename
      const renameOption = page.getByRole('menuitem', { name: 'Rename' });
      if (await renameOption.isVisible()) {
        console.log('Clicking Rename...');
        await renameOption.click();

        // Track the input
        for (let i = 0; i <= 20; i++) {
          await page.waitForTimeout(100);
          // Session input has class min-w-0
          const sessionInput = page.locator('input.min-w-0');
          const count = await sessionInput.count();
          const focused = count > 0 ? await sessionInput.first().evaluate(el => document.activeElement === el) : false;
          console.log(`${i * 100}ms: session inputs=${count}, focused=${focused}`);

          if (i % 5 === 0) {
            await page.screenshot({ path: `e2e/screenshots/precise-session-rename-${i * 100}ms.png` });
          }
        }
      }
    }
  } else {
    console.log('Session row not found');
  }
});

test('PROJECT rename via dropdown - precise targeting', async () => {
  await page.screenshot({ path: 'e2e/screenshots/precise-project-initial.png' });

  // Find the project card header
  const projectHeader = page.locator('text=simplu-workspace').first();

  if (await projectHeader.isVisible()) {
    console.log('Found project header');

    // The project card is a Card component - find its menu button
    const projectCard = projectHeader.locator('xpath=ancestor::*[contains(@class,"cursor-pointer")]').first();
    await projectCard.hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/precise-project-hover.png' });

    // Find menu button - should be in the card header area
    const menuButton = page.locator('button').filter({ has: page.locator('svg.lucide-more-vertical') }).first();
    await menuButton.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'e2e/screenshots/precise-project-menu.png' });

    // Click Rename
    const renameOption = page.getByRole('menuitem', { name: 'Rename' });
    if (await renameOption.isVisible()) {
      console.log('Clicking Rename...');
      await renameOption.click();

      // Track the input - project input has class w-full
      for (let i = 0; i <= 20; i++) {
        await page.waitForTimeout(100);
        const projectInput = page.locator('input.w-full');
        const count = await projectInput.count();
        const focused = count > 0 ? await projectInput.first().evaluate(el => document.activeElement === el) : false;
        console.log(`${i * 100}ms: project inputs=${count}, focused=${focused}`);

        if (i % 5 === 0) {
          await page.screenshot({ path: `e2e/screenshots/precise-project-rename-${i * 100}ms.png` });
        }
      }
    }
  }
});
