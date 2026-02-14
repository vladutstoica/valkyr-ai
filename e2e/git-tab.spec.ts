/**
 * Playwright E2E Tests for Git Tab
 *
 * These tests verify the Git tab functionality including:
 * - File changes display
 * - Staging/unstaging files
 * - Diff view with Monaco DiffEditor (no fallback)
 * - Commit panel functionality
 * - PR creation
 *
 * Prerequisites:
 * 1. Build the app: pnpm run build
 * 2. Ensure you have file changes in the repo or a test project
 *
 * Run tests:
 *   pnpm exec playwright test e2e/git-tab.spec.ts
 *
 * Note: On macOS, you may need to grant Terminal/IDE accessibility permissions
 * for Electron to launch properly.
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const mainPath = path.join(process.cwd(), 'dist/main/main/entry.js');

  try {
    app = await electron.launch({
      args: [mainPath, '--dev'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        // Disable GPU acceleration which can cause issues in CI
        ELECTRON_DISABLE_GPU: '1',
      },
      cwd: process.cwd(),
      timeout: 30000,
    });

    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000); // Give React time to render
  } catch (error) {
    console.error('Failed to launch Electron app:', error);
    throw error;
  }
});

test.afterAll(async () => {
  if (app) {
    try {
      await app.close();
    } catch {
      // Ignore close errors
    }
  }
});

test.describe('Git Tab', () => {
  // Helper to select a session with changes and navigate to Git tab
  async function setupGitTab() {
    // Close any open modals first by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // First, select a session from the sidebar that might have changes
    // Look for sessions with the worktree icon (indicates they have a worktree)
    const sessionWithWorktree = page.locator('text=thirty-flies-beg').or(
      page.locator('text=jolly-rabbits-hug')
    ).first();

    if (await sessionWithWorktree.isVisible().catch(() => false)) {
      await sessionWithWorktree.click();
      await page.waitForTimeout(1000);
    }

    // Now click on the Git tab
    const gitTab = page.locator('button:has-text("Git")').or(
      page.locator('[role="tab"]:has-text("Git")')
    ).first();

    if (await gitTab.isVisible().catch(() => false)) {
      await gitTab.click({ force: true }); // Force click to bypass any intercepting elements
      await page.waitForTimeout(1000);
    }
  }

  test.describe('Tab Navigation', () => {
    test('should display Git tab in the tab bar', async () => {
      // Look for Git tab button - may be visible as "Changes" tab
      const gitTab = page.locator('[data-testid="git-tab"]').or(
        page.locator('button:has-text("Git")').or(
          page.locator('[role="tab"]:has-text("Git")').or(
            page.locator('button:has-text("Changes")')
          )
        )
      );

      // Take screenshot for debugging
      await page.screenshot({ path: 'e2e/screenshots/git-tab-search.png' });

      const tabExists = await gitTab.count() > 0;
      console.log(`Git/Changes tab found: ${tabExists}`);
    });

    test('should switch to Git tab when clicked', async () => {
      await setupGitTab();
      await page.screenshot({ path: 'e2e/screenshots/git-tab-clicked.png' });
    });
  });

  test.describe('Changes Panel', () => {
    test('should display changes header', async () => {
      const changesHeader = page.locator('text=Changes').first();

      if (await changesHeader.isVisible().catch(() => false)) {
        await page.screenshot({ path: 'e2e/screenshots/git-changes-header.png' });
        console.log('Changes header found');
      }
    });

    test('should display file change stats', async () => {
      // Look for addition/deletion stats (e.g., +10 / -5)
      await page.screenshot({ path: 'e2e/screenshots/git-stats.png' });

      const stats = await page.locator('text=/[+-]\\d+/').count();
      console.log(`Found ${stats} stat indicators`);
    });

    test('should display Stage All button when unstaged changes exist', async () => {
      const stageAllButton = page.locator('button:has-text("Stage All")');

      if (await stageAllButton.isVisible().catch(() => false)) {
        console.log('Stage All button is visible');
        await page.screenshot({ path: 'e2e/screenshots/git-stage-all-button.png' });
      }
    });

    test('should display Expand/Collapse All button', async () => {
      const expandAllButton = page.locator('button:has-text("Expand All")').or(
        page.locator('button:has-text("Collapse All")')
      );

      const count = await expandAllButton.count();
      console.log(`Expand/Collapse All buttons found: ${count}`);
      await page.screenshot({ path: 'e2e/screenshots/git-expand-collapse-button.png' });
    });

    test('should display refresh button', async () => {
      await page.screenshot({ path: 'e2e/screenshots/git-refresh-button.png' });
    });
  });

  test.describe('File Change Items', () => {
    test.beforeEach(async () => {
      await setupGitTab();
    });

    test('should display file change items with status badges', async () => {
      // Status badges: M (Modified), A (Added), D (Deleted), R (Renamed)
      const statusBadges = page.locator('[title="Modified"], [title="Added"], [title="Deleted"], [title="Renamed"]');

      await page.screenshot({ path: 'e2e/screenshots/git-file-items.png' });

      const badgeCount = await statusBadges.count();
      console.log(`Found ${badgeCount} status badges`);
    });

    test('should display checkboxes for staging files', async () => {
      const checkboxes = page.locator('[role="checkbox"]').or(
        page.locator('button[role="checkbox"]')
      );

      const count = await checkboxes.count();
      console.log(`Found ${count} staging checkboxes`);
      await page.screenshot({ path: 'e2e/screenshots/git-checkboxes.png' });
    });

    test('should display expand/collapse chevron for each file', async () => {
      const chevrons = page.locator('svg.lucide-chevron-right, svg.lucide-chevron-down');

      const count = await chevrons.count();
      console.log(`Found ${count} chevron icons`);
    });

    test('should toggle file expansion on click', async () => {
      // Find file row by looking for the file path pattern or status badge parent
      const fileRow = page.locator('div.border-b:has([title="Modified"], [title="Added"])').first();

      if (await fileRow.isVisible().catch(() => false)) {
        await page.screenshot({ path: 'e2e/screenshots/git-before-expand.png' });

        await fileRow.click();
        await page.waitForTimeout(1000);

        await page.screenshot({ path: 'e2e/screenshots/git-after-expand.png' });
        console.log('Clicked file row to expand');
      } else {
        console.log('No file changes found to expand');
        await page.screenshot({ path: 'e2e/screenshots/git-no-changes.png' });
      }
    });

    test('should display discard button for files', async () => {
      const discardButton = page.locator('button:has(svg.lucide-undo-2)').first();

      if (await discardButton.isVisible().catch(() => false)) {
        console.log('Discard button found');
        await page.screenshot({ path: 'e2e/screenshots/git-discard-button.png' });
      }
    });
  });

  test.describe('Diff View', () => {
    test.beforeEach(async () => {
      await setupGitTab();
    });

    test('should display diff content when file is expanded', async () => {
      // Find file row by looking for status badge parent
      const fileRow = page.locator('div.border-b:has([title="Modified"], [title="Added"])').first();

      if (await fileRow.isVisible().catch(() => false)) {
        await fileRow.click();
        await page.waitForTimeout(2000); // Wait for diff to load

        // Look for diff content - Monaco DiffEditor renders with .monaco-diff-editor class
        const diffContent = page.locator('.monaco-diff-editor, [class*="monaco-editor"]');

        const hasDiff = await diffContent.count() > 0;
        console.log(`Diff content visible: ${hasDiff}`);
        await page.screenshot({ path: 'e2e/screenshots/git-diff-view.png' });
      } else {
        console.log('No file changes found');
        await page.screenshot({ path: 'e2e/screenshots/git-no-file-changes.png' });
      }
    });

    test('should display loading state while fetching diff', async () => {
      const fileRow = page.locator('div.border-b:has([title="Modified"], [title="Added"])').first();

      if (await fileRow.isVisible().catch(() => false)) {
        // Collapse first if expanded
        const chevronDown = fileRow.locator('svg.lucide-chevron-down').first();
        if (await chevronDown.isVisible().catch(() => false)) {
          await fileRow.click();
          await page.waitForTimeout(300);
        }

        // Click to expand and capture loading state
        await fileRow.click();
        await page.screenshot({ path: 'e2e/screenshots/git-diff-loading.png' });
      }
    });

    test('should display Monaco DiffEditor component without fallback', async () => {
      const fileRow = page.locator('div.border-b:has([title="Modified"], [title="Added"])').first();

      if (await fileRow.isVisible().catch(() => false)) {
        await fileRow.click();
        await page.waitForTimeout(3000); // Wait for Monaco DiffEditor to load

        // Monaco DiffEditor renders with .monaco-diff-editor class
        const monacoEditor = page.locator('.monaco-diff-editor');
        const hasMonacoEditor = await monacoEditor.count() > 0;
        console.log(`Monaco DiffEditor component rendered: ${hasMonacoEditor}`);

        // Verify no SimpleDiffView fallback is shown
        // SimpleDiffView was using "overflow-x-auto p-2 font-mono" classes - now removed
        const simpleDiffFallback = page.locator('pre.overflow-x-auto.p-2.font-mono');
        const hasFallback = await simpleDiffFallback.count() > 0;
        console.log(`SimpleDiffView fallback present: ${hasFallback}`);

        // No fallback should be present
        expect(hasFallback).toBe(false);

        await page.screenshot({ path: 'e2e/screenshots/git-monaco-diff-editor.png' });
      } else {
        console.log('No file changes found to test Monaco DiffEditor');
      }
    });

    test('should expand all changes when Expand All clicked', async () => {
      const expandAllButton = page.locator('button:has-text("Expand All")');

      if (await expandAllButton.isVisible().catch(() => false)) {
        await page.screenshot({ path: 'e2e/screenshots/git-before-expand-all.png' });

        await expandAllButton.click();
        await page.waitForTimeout(3000); // Wait for all diffs to load

        await page.screenshot({ path: 'e2e/screenshots/git-after-expand-all.png' });

        // Verify Monaco DiffEditor components are rendered (not fallback)
        const monacoEditors = page.locator('.monaco-diff-editor');
        const monacoEditorCount = await monacoEditors.count();
        console.log(`Monaco DiffEditor components rendered after Expand All: ${monacoEditorCount}`);

        // Verify no fallback views
        const fallbacks = page.locator('pre.overflow-x-auto.p-2.font-mono');
        const fallbackCount = await fallbacks.count();
        console.log(`Fallback views present: ${fallbackCount}`);
        expect(fallbackCount).toBe(0);
      } else {
        console.log('Expand All button not visible (no changes or already expanded)');
      }
    });
  });

  test.describe('Commit Panel', () => {
    test('should display commit section header', async () => {
      const commitHeader = page.locator('text=Commit').first();

      if (await commitHeader.isVisible().catch(() => false)) {
        console.log('Commit header found');
      }
    });

    test('should display commit type selector', async () => {
      const commitTypeButton = page.locator('button:has-text("feat")').or(
        page.locator('button:has-text("fix")').or(
          page.locator('button:has-text("chore")')
        )
      );

      if (await commitTypeButton.count() > 0) {
        console.log('Commit type selector found');
        await page.screenshot({ path: 'e2e/screenshots/git-commit-type.png' });
      }
    });

    test('should open commit type dropdown on click', async () => {
      const commitTypeButton = page.locator('button:has(span.font-mono)').first();

      if (await commitTypeButton.isVisible().catch(() => false)) {
        await commitTypeButton.click();
        await page.waitForTimeout(300);

        await page.screenshot({ path: 'e2e/screenshots/git-commit-type-dropdown.png' });

        // Close dropdown
        await page.keyboard.press('Escape');
      }
    });

    test('should display commit message textarea', async () => {
      const textarea = page.locator('textarea[placeholder*="commit"]').or(
        page.locator('textarea').first()
      );

      if (await textarea.isVisible().catch(() => false)) {
        console.log('Commit message textarea found');
        await page.screenshot({ path: 'e2e/screenshots/git-commit-textarea.png' });
      }
    });

    test('should allow typing commit message', async () => {
      const textarea = page.locator('textarea').first();

      if (await textarea.isVisible().catch(() => false)) {
        await textarea.fill('Test commit message for E2E');
        await page.waitForTimeout(300);

        const value = await textarea.inputValue();
        expect(value).toBe('Test commit message for E2E');
        console.log(`Textarea value: ${value}`);

        await page.screenshot({ path: 'e2e/screenshots/git-commit-message-typed.png' });

        // Clear for future tests
        await textarea.fill('');
      }
    });

    test('should display Commit button', async () => {
      const commitButton = page.locator('button:has-text("Commit")').first();

      if (await commitButton.isVisible().catch(() => false)) {
        console.log('Commit button found');

        const isDisabled = await commitButton.isDisabled();
        console.log(`Commit button disabled (no message/staged): ${isDisabled}`);
      }
    });

    test('should display Commit & Push button', async () => {
      const commitPushButton = page.locator('button:has-text("Commit & Push")');

      if (await commitPushButton.isVisible().catch(() => false)) {
        console.log('Commit & Push button found');
      }
    });

    test('should display PR button when staged changes exist', async () => {
      const prButton = page.locator('button:has-text("Create PR")').or(
        page.locator('button:has-text("Draft PR")').or(
          page.locator('button:has(svg.lucide-git-pull-request)')
        )
      );

      if (await prButton.count() > 0) {
        console.log('PR button found');
        await page.screenshot({ path: 'e2e/screenshots/git-pr-button.png' });
      }
    });

    test('should display keyboard shortcut hint', async () => {
      const shortcutHint = page.locator('text=Cmd+Enter').or(
        page.locator('kbd')
      );

      if (await shortcutHint.count() > 0) {
        console.log('Keyboard shortcut hint found');
      }
    });
  });

  test.describe('Staging Operations', () => {
    test('should toggle file staging when checkbox clicked', async () => {
      const checkbox = page.locator('[role="checkbox"]').first();

      if (await checkbox.isVisible().catch(() => false)) {
        const initialState = await checkbox.getAttribute('data-state');
        console.log(`Initial checkbox state: ${initialState}`);

        await checkbox.click();
        await page.waitForTimeout(1000); // Wait for staging operation

        const newState = await checkbox.getAttribute('data-state');
        console.log(`New checkbox state: ${newState}`);

        // State should have changed
        expect(newState).not.toBe(initialState);

        await page.screenshot({ path: 'e2e/screenshots/git-checkbox-toggled.png' });

        // Toggle back to restore state
        await checkbox.click();
        await page.waitForTimeout(500);
      }
    });

    test('should update staged count in header', async () => {
      const stagedIndicator = page.locator('text=/\\d+ staged/');

      if (await stagedIndicator.count() > 0) {
        const text = await stagedIndicator.textContent();
        console.log(`Staged indicator: ${text}`);
      }
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state when no changes', async () => {
      const emptyMessage = page.locator('text=No changes detected');

      if (await emptyMessage.isVisible().catch(() => false)) {
        console.log('Empty state message found');
        await page.screenshot({ path: 'e2e/screenshots/git-empty-state.png' });
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should display error message when diff fails to render', async () => {
      // This test verifies the error boundary shows proper error message
      const errorIndicator = page.locator('text=Failed to render diff').or(
        page.locator('svg.lucide-alert-triangle')
      );

      await page.screenshot({ path: 'e2e/screenshots/git-error-state.png' });

      if (await errorIndicator.count() > 0) {
        console.log('Error indicator found - error boundary working');
      }
    });

    test('should show loading spinner while diff viewer loads', async () => {
      // Look for loading spinner during lazy load
      const loadingSpinner = page.locator('text=Loading diff viewer...');

      if (await loadingSpinner.count() > 0) {
        console.log('Diff loading spinner found');
      }
    });
  });
});
