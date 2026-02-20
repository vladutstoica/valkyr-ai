# AI Test Scenarios — Playwright MCP Playbook

Structured test scenarios for Claude Code to execute interactively via `mcp__playwright-electron__*` tools against the running Valkyr dev app.

## Prerequisites

1. Start dev server with remote debugging:
   ```bash
   ELECTRON_EXTRA_LAUNCH_ARGS="--remote-debugging-port=9222" pnpm run dev
   ```
2. Verify connection:
   ```
   mcp__playwright-electron__browser_snapshot
   ```
   Expected: DOM snapshot showing the Valkyr UI (titlebar, sidebar, main content area).

---

## Scenario 1: App Launch & Layout

**Goal:** Verify the app renders its core layout regions.

1. `browser_snapshot` — capture full DOM
2. Verify these regions exist in the snapshot:
   - Titlebar / window controls
   - Left sidebar (project list)
   - Tab bar (AI Agents, Editor, Git, Preview, etc.)
   - Main content area
   - Status bar at bottom
3. `browser_take_screenshot` — save as `e2e/screenshots/layout.png` for visual check

**Pass:** All regions present. **Fail:** Missing region or blank screen.

---

## Scenario 2: Project Selection

**Goal:** Clicking a project in the sidebar loads it.

1. `browser_snapshot` — identify project items in sidebar
2. `browser_click` — click a project name
3. `browser_snapshot` — verify:
   - Sidebar highlights the selected project
   - Tab content updates (e.g., tab bar or main area reflects the project)
4. `browser_evaluate` — run `document.querySelector('[data-testid]')` or inspect store state if needed

**Pass:** Project loads, UI updates. **Fail:** No change or error in console.

---

## Scenario 3: Tab Navigation

**Goal:** Each tab shows its own content when clicked.

For each tab (AI Agents, Editor, Git, Preview):

1. `browser_click` — click the tab
2. `browser_snapshot` — verify tab content changed
3. Check no console errors via `browser_console_messages`

**Pass:** Each tab renders distinct content. **Fail:** Tab content doesn't switch or throws error.

---

## Scenario 4: Git Tab — File Changes

**Goal:** Git tab shows file changes with status indicators.

1. Navigate to Git tab via `browser_click`
2. `browser_snapshot` — look for:
   - File list with change indicators (M, A, D, etc.)
   - Staged / unstaged sections
   - Commit message input area
3. `browser_console_messages` — check for errors

**Pass:** File list renders with correct indicators. **Fail:** Empty list when changes exist, or render errors.

---

## Scenario 5: Git Tab — File Selection & Diff

**Goal:** Clicking a changed file shows its diff in the DiffViewer.

1. From Git tab, `browser_snapshot` to find a file in the changes list
2. `browser_click` — click the file
3. Wait briefly for diff to load
4. `browser_snapshot` — verify:
   - DiffViewer area shows diff content (Monaco editor present)
   - File path displayed somewhere in the diff header
5. `browser_console_messages` — no "TextModel disposed" errors

**Pass:** Diff renders cleanly. **Fail:** Blank diff, crash, or disposed model error.

---

## Scenario 6: Git Tab — Stage/Unstage

**Goal:** Staging a file moves it to the staged section.

1. From Git tab with file changes visible
2. `browser_snapshot` — identify an unstaged file and its stage button/checkbox
3. `browser_click` — click to stage the file
4. `browser_snapshot` — verify file moved to staged section
5. `browser_click` — unstage it
6. `browser_snapshot` — verify file returned to unstaged section

**Pass:** File moves between sections. **Fail:** File doesn't move, or UI doesn't update.

---

## Scenario 7: Git Tab — Multi-Repo Commit (Regression for DiffEditor crash)

**Goal:** Committing in multi-repo mode does NOT crash the app.

1. Open a project that has multiple sub-repos (or the root repo + nested repos)
2. Navigate to Git tab
3. `browser_snapshot` — verify multi-repo selector/sections visible
4. Stage files across different repos
5. Type a commit message via `browser_click` on the input + `browser_type`
6. `browser_click` — click the Commit button
7. Wait 2-3 seconds for commit to complete
8. `browser_snapshot` — verify:
   - App is still running (no white screen / error boundary)
   - File list refreshed (committed files removed or status changed)
   - No "TextModel disposed" error
9. `browser_console_messages` — search for "disposed", "crash", "error"

**Pass:** Commit succeeds, app alive, no DiffEditor crash. **Fail:** App crashes, error boundary shown, or disposed model error in console.

---

## Scenario 8: Status Bar — Branch Info

**Goal:** Status bar shows current branch and responds to clicks.

1. `browser_snapshot` — find branch name in the status bar area (bottom of window)
2. Verify branch name is non-empty and looks like a git branch
3. `browser_click` — click the branch name
4. `browser_snapshot` — verify a popover/dropdown appears with branch options

**Pass:** Branch displays and popover opens. **Fail:** No branch shown or click does nothing.

---

## Scenario 9: Status Bar — Changes Count

**Goal:** Status bar shows change count matching the Git tab file list.

1. `browser_snapshot` — note the changes count in the status bar
2. Navigate to Git tab
3. `browser_snapshot` — count files in the changes list
4. Compare the two counts
5. `browser_click` — click the changes count in the status bar
6. `browser_snapshot` — verify it navigated to the Git tab

**Pass:** Counts match, click navigates to Git tab. **Fail:** Mismatch or no navigation.

---

## Scenario 10: Task Creation

**Goal:** Creating a new task adds it to the sidebar.

1. `browser_snapshot` — find the "new task" button or use command palette
2. `browser_click` — open the task creation UI
3. `browser_snapshot` — verify modal/form appeared
4. Fill in task fields:
   - `browser_click` on title input + `browser_type` with a test title
   - Select a provider if needed
5. `browser_click` — submit/create
6. `browser_snapshot` — verify new task appears in sidebar task list

**Pass:** Task created and visible. **Fail:** Modal doesn't open, creation fails, or task doesn't appear.

---

## Scenario 11: Error Recovery

**Goal:** App recovers gracefully from component errors.

1. `browser_evaluate` — inject an error in a non-critical component:
   ```js
   // Example: trigger error boundary by corrupting a prop
   console.log('Testing error recovery...');
   ```
2. `browser_snapshot` — check if error boundary catches it (shows fallback UI)
3. Navigate away and back to verify the errored component recovers
4. `browser_console_messages` — check that error was logged but app continues

**Pass:** Error boundary catches, app remains functional. **Fail:** Unhandled crash or white screen.

---

## Notes

- Always run `browser_console_messages` after key actions to catch silent errors
- If a scenario fails, capture a screenshot (`browser_take_screenshot`) for debugging
- These are interactive scenarios, not automated scripts — adapt steps as the UI evolves
- After executing scenarios, clean up any test commits or staged files
