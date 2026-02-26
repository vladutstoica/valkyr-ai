# Git Context

## Current Branch
`develop`

## Status
- Branch is ahead of `origin/develop` by 12 commits
- 1 file staged (OpenInMenu.tsx)
- 30 files modified (unstaged)
- 13 untracked files (new components, test files, screenshot PNGs)

## Changed Files (diff --stat)
```
 package.json                                       |   2 +-
 pnpm-lock.yaml                                     |  40 ++
 src/main/app/window.ts                             |   4 +-
 src/main/ipc/appIpc.ts                             |  39 ++
 src/main/ipc/githubIpc.ts                          |   2 -
 src/main/ipc/projectIpc.ts                         |  34 +-
 src/main/preload.ts                                |   5 +
 src/main/services/AcpSessionManager.ts             |  12 +
 src/renderer/App.tsx                               |  49 +-
 src/renderer/components/AcpChatPane.tsx            | 719 +++++++++++++++++----
 src/renderer/components/ChatInterface.tsx          |   3 +-
 src/renderer/components/ErrorBoundary.tsx          |  24 +
 src/renderer/components/ModelInfoCard.tsx          |   6 +-
 src/renderer/components/ai-elements/chain-of-thought.tsx |  70 +-
 src/renderer/components/ai-elements/code-block.tsx |  20 +-
 src/renderer/components/ai-elements/context.tsx    | 225 ++++---
 src/renderer/components/ai-elements/plan.tsx       | 114 +++-
 src/renderer/components/ai-elements/prompt-input.tsx |   4 +-
 src/renderer/components/ai-elements/reasoning.tsx  |  13 -
 src/renderer/components/ai-elements/sources.tsx    |   2 +-
 src/renderer/components/ai-elements/tool.tsx       | 106 ++-
 src/renderer/components/tabs/GitTab.tsx            |   3 +-
 src/renderer/hooks/useFileManager.ts               |   7 +-
 src/renderer/hooks/useProjectManagement.tsx        | 136 ++--
 src/renderer/hooks/useRemoteProject.ts             |   2 +
 src/renderer/hooks/useSshConnections.ts            |   2 +
 src/renderer/layouts/AppLayout.tsx                 |  74 ++-
 src/renderer/lib/acpChatTransport.ts               |  70 +-
 src/renderer/lib/toolRenderer.ts                   | 169 +++--
 src/renderer/types/electron-api.d.ts               |  16 +
30 files changed, 1545 insertions(+), 427 deletions(-)
```

## New/Untracked Files
- `src/renderer/components/KeyboardShortcutsDialog.tsx` — new keyboard shortcuts dialog
- `src/renderer/components/PrerequisiteModal.tsx` — new prerequisite check modal
- `src/test/main/GitService.test.ts` — new test
- `src/test/main/appIpc.test.ts` — new test
- `src/test/main/dbIpc.test.ts` — new test
- `src/test/main/gitIpc.test.ts` — new test
- `src/test/main/projectIpc.test.ts` — new test
- `after-fix-chat.png`, `after-fix.png`, `current-state.png`, `plan-collapsed-v2.png`, `plan-collapsed.png`, `state2.png` — screenshot PNGs (should NOT be committed)

## Recent Commits
```
88614ef4 feat(chat): use AI SDK Elements Attachments for inline message attachments
092d0672 feat(chat): add debug overlay for raw part data inspection (Ctrl+Shift+D)
890009ac docs(readme): refactor structure, add features section and Windows install
37f926a8 style: apply prettier formatting and minor code improvements
a7ba80c8 fix(lint): resolve no-this-alias error and suppress ESLint false positive
dcc49a13 ci(quality): add lint, test steps to CI and set up husky + lint-staged
c6f680e3 fix(security): harden shell execution, add CSP, and process crash handlers
07ad24a9 fix(chat): match resume checkpoint styling to turn checkpoints
284456ac feat(chat): add session resume checkpoint with context replay fallback
7bb73d59 perf(acp): share subprocess across multiple sessions via connection pooling
```

## Key Change Areas

### Main Process Changes
1. **package.json**: Fixed duplicate `prepare` script, added `tokenlens` dependency
2. **pnpm-lock.yaml**: Lockfile updated for `tokenlens` package
3. **window.ts**: CSP updated — added `blob:` to `img-src` and `connect-src`
4. **appIpc.ts**: New `app:checkPrerequisites` IPC handler (checks git + agent CLIs)
5. **githubIpc.ts**: Removed leftover TODO comment
6. **projectIpc.ts**: `detectSubRepos` now also returns `rootGitInfo` for the project root
7. **preload.ts**: Exposed `checkPrerequisites` via `contextBridge`
8. **AcpSessionManager.ts**: Fixed race condition — pre-registers stored session ID to avoid "Unroutable" events

### Renderer Changes
9. **App.tsx**: Wired `KeyboardShortcutsDialog` + `PrerequisiteModal`, prerequisite check on welcome dismiss, `handleBranchChange` callback, fixed `handleOpenKeyboardShortcuts` reference
10. **AcpChatPane.tsx**: Massive refactor — ACP error cards, Plan component overhaul (PlanHeader/Title/Description/Footer), tokenlens context health bar, client-side token estimation, ExitPlanMode approval flow, ACP content rendering (diffs/images), location pills, approval wording changes (Allow→Approve, Deny→Reject), arrow-up history fix, ScrollBridge
11. **ChatInterface.tsx**: Minor change
12. **ErrorBoundary.tsx**: Enhanced error boundary
13. **ModelInfoCard.tsx**: Added `modelDescription` prop
14. **ai-elements/**: Multiple components updated (chain-of-thought, code-block, context, plan, prompt-input, reasoning, sources, tool)
15. **tabs/GitTab.tsx**: Minor change
16. **hooks/**: useFileManager, useProjectManagement, useRemoteProject, useSshConnections — minor updates
17. **AppLayout.tsx**: Added `onBranchChange` prop
18. **acpChatTransport.ts**: Extended transport layer
19. **toolRenderer.ts**: Tool display label improvements
20. **electron-api.d.ts**: Added `checkPrerequisites` and `rootGitInfo` types
