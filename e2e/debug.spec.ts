import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const mainPath = path.join(__dirname, '../dist/main/main/entry.js');

  app = await electron.launch({
    args: [mainPath],
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });

  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000); // Give React time to render
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

test('capture initial state', async () => {
  await page.screenshot({ path: 'e2e/screenshots/initial-state.png', fullPage: true });
  console.log('Initial state captured');
});

test('debug project rename', async () => {
  // Find project headers by looking for the project names we see in sidebar
  const projectHeaders = page.locator('text=simplu-workspace').first();

  if (await projectHeaders.isVisible()) {
    await page.screenshot({ path: 'e2e/screenshots/before-rename.png' });

    // Right-click to open context menu
    await projectHeaders.click({ button: 'right' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/context-menu-open.png' });

    // Look for Rename option
    const renameOption = page.getByRole('menuitem', { name: 'Rename' });
    if (await renameOption.isVisible()) {
      console.log('Found Rename option in context menu');
      await renameOption.click();

      // Take screenshots at different intervals
      await page.waitForTimeout(50);
      await page.screenshot({ path: 'e2e/screenshots/rename-50ms.png' });

      await page.waitForTimeout(100);
      await page.screenshot({ path: 'e2e/screenshots/rename-150ms.png' });

      await page.waitForTimeout(200);
      await page.screenshot({ path: 'e2e/screenshots/rename-350ms.png' });

      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/screenshots/rename-850ms.png' });

      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/screenshots/rename-1350ms.png' });

      // Check if input is still visible
      const input = page.locator('input[type="text"]').first();
      const isInputVisible = await input.isVisible();
      console.log(`Input visible after 1350ms: ${isInputVisible}`);
    } else {
      console.log('Rename option not found');
    }
  } else {
    console.log('Project header not visible');
  }
});

test('debug project rename via dropdown', async () => {
  // First, hover over a project card to reveal the 3-dot menu
  const projectCard = page.locator('text=simplu-workspace').first();

  if (await projectCard.isVisible()) {
    // Hover to reveal menu button
    await projectCard.hover();
    await page.waitForTimeout(300);

    // Find the MoreVertical button (3 dots)
    const moreButton = page.locator('button:has(svg)').filter({ hasText: '' }).nth(0);

    // Try to find any button near the project name
    const buttonsNearProject = await projectCard.locator('..').locator('button').all();
    console.log(`Found ${buttonsNearProject.length} buttons near project`);

    await page.screenshot({ path: 'e2e/screenshots/hover-project.png' });

    // Click the menu button (MoreVertical icon)
    const menuTrigger = projectCard.locator('xpath=ancestor::*[contains(@class,"Card")]//button[last()-1]');
    if (await menuTrigger.count() > 0) {
      await menuTrigger.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/screenshots/dropdown-open.png' });

      const renameOption = page.getByRole('menuitem', { name: 'Rename' });
      if (await renameOption.isVisible()) {
        await renameOption.click();

        for (let i = 0; i < 10; i++) {
          await page.waitForTimeout(200);
          await page.screenshot({ path: `e2e/screenshots/dropdown-rename-${i * 200}ms.png` });

          const input = page.locator('input[type="text"]');
          const inputCount = await input.count();
          console.log(`${i * 200}ms: Found ${inputCount} input(s)`);
        }
      }
    }
  }
});

test('debug session rename', async () => {
  // Find a session item
  const sessionItem = page.locator('text=jolly-rabbits-hug').first();

  if (await sessionItem.isVisible()) {
    await page.screenshot({ path: 'e2e/screenshots/before-session-rename.png' });

    // Right-click to open context menu
    await sessionItem.click({ button: 'right' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/session-context-menu.png' });

    const renameOption = page.getByRole('menuitem', { name: 'Rename' });
    if (await renameOption.isVisible()) {
      console.log('Found Rename option for session');
      await renameOption.click();

      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(200);
        await page.screenshot({ path: `e2e/screenshots/session-rename-${i * 200}ms.png` });

        const input = page.locator('input[type="text"]');
        const inputCount = await input.count();
        console.log(`${i * 200}ms: Found ${inputCount} input(s)`);
      }
    }
  } else {
    console.log('Session item not visible');
  }
});

test('inspect sidebar structure', async () => {
  // Get all text content from sidebar
  const sidebar = page.locator('nav, aside, [role="navigation"]').first();
  if (await sidebar.isVisible()) {
    const html = await sidebar.innerHTML();
    console.log('Sidebar structure (first 3000 chars):');
    console.log(html.substring(0, 3000));
  }

  // Find all interactive elements
  const buttons = await page.locator('button').count();
  const inputs = await page.locator('input').count();
  console.log(`Page has ${buttons} buttons and ${inputs} inputs`);
});
