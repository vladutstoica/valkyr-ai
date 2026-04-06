# Changelog

## [0.4.0](https://github.com/vladutstoica/valkyr-ai/compare/valkyr-v0.3.1...valkyr-v0.4.0) (2026-04-06)


### Features

* add connections, Jira, Linear IPC handlers and provider status cache tests ([e6df7b4](https://github.com/vladutstoica/valkyr-ai/commit/e6df7b43220182c00467c5dd093a59d7909a39f5))
* **notifications:** add native desktop notifications for agent status ([428a3cf](https://github.com/vladutstoica/valkyr-ai/commit/428a3cf1ae936f12165dd0f779c70748f56745d5))
* **notifications:** smart triggers, deep-nav, toasts, batching, mute ([3f53ec3](https://github.com/vladutstoica/valkyr-ai/commit/3f53ec35515c03578c52bce7a4cfb64896b402d1))
* **onboarding:** improve setup modal with agent install guide ([ce76bf3](https://github.com/vladutstoica/valkyr-ai/commit/ce76bf382a41f93daffde39012af69da0961d662))
* **scripts:** add custom scripts support with CRUD and per-folder cwd ([4fa5007](https://github.com/vladutstoica/valkyr-ai/commit/4fa500792d8a3f6a0f8a4749c570942baf5055b2))
* **settings:** add per-agent ACP/CLI mode toggle in settings ([ad97033](https://github.com/vladutstoica/valkyr-ai/commit/ad970336bf72544a1e7fd61940e41c96c9681294))
* **status:** add Claude Code hook-based status detection ([47efaf9](https://github.com/vladutstoica/valkyr-ai/commit/47efaf94191e16779fd89144b9b27184d6801b13))
* **ui:** add resource usage monitor in status bar ([e6ba7db](https://github.com/vladutstoica/valkyr-ai/commit/e6ba7dbe120394b9d974e716a2c9696717e697ae))
* **ui:** add unread indicator for tasks with unseen status changes ([72ffd9d](https://github.com/vladutstoica/valkyr-ai/commit/72ffd9de810834de0aebca55c02eb5e53ab19295))
* **ui:** per-conversation status dots in sidebar (dot/pill layout) ([e498cc8](https://github.com/vladutstoica/valkyr-ai/commit/e498cc84dea7ea2c166ca74ebdb5ce765c19ec45))
* **ui:** UI/UX polish with Nova theme, surface hierarchy, and layout improvements ([332b00f](https://github.com/vladutstoica/valkyr-ai/commit/332b00fc35819ae7f90d5ede5f208b0f9f934c0e))
* **ui:** warn before archiving session with running processes ([b1a5216](https://github.com/vladutstoica/valkyr-ai/commit/b1a521695a6120dcf6605727c5de5efc0d7b0a5a))


### Bug Fixes

* **build:** use Map for hookEventMapper (ES2020 compat, prototype-safe) ([f3715c4](https://github.com/vladutstoica/valkyr-ai/commit/f3715c4e6426f6f79d61bf3938d4e004e6082702))
* **chat:** allow deleting any chat when multiple exist ([54af278](https://github.com/vladutstoica/valkyr-ai/commit/54af2786a3386b9d40e72ea8f19e57982a64f41d))
* **chat:** backfill claudeSessionId so each chat resumes its own session ([9ac8943](https://github.com/vladutstoica/valkyr-ai/commit/9ac894352eeb713b192cab8def5e0847a9d5eef9))
* **editor:** stabilize editor tab with file loading, state sync, and layout fixes ([922fdbd](https://github.com/vladutstoica/valkyr-ai/commit/922fdbdcacd0258d244957e29f576318897b683a))
* **pty:** auto-retry as fresh session when Claude resume fails ([2687986](https://github.com/vladutstoica/valkyr-ai/commit/2687986f429979b0a7a3bcf8f3ac7907e38c1b59))
* **pty:** move resume retry to ptyIpc so terminal display re-wires ([9f5292b](https://github.com/vladutstoica/valkyr-ai/commit/9f5292b94e237421021f73f42ac9aaff19d18a97))
* **pty:** skip resume when session file missing, fix status dot timing ([17c410b](https://github.com/vladutstoica/valkyr-ai/commit/17c410bc60dbe07141f13d5485d4e35588c7c48c))
* **pty:** use generic resume for Claude instead of Valkyr-generated session IDs ([871631b](https://github.com/vladutstoica/valkyr-ai/commit/871631bc9bc3e8aed7b914aecce83dd2def3db11))
* **pty:** validate Claude session file before resume by ID, fallback to generic ([8357ac0](https://github.com/vladutstoica/valkyr-ai/commit/8357ac05933fc6aaca578e762ff75feeb420fbb4))
* **sessions:** default to CLI mode, pass autoApprove to terminal ([19fc382](https://github.com/vladutstoica/valkyr-ai/commit/19fc3824670d59cb77ed3a240d478b68811ea578))
* **sessions:** resume specific Claude session per chat instead of latest ([4e5ad06](https://github.com/vladutstoica/valkyr-ai/commit/4e5ad06361fc7763f81c70cf7ab770ac6c64663d))
* **status:** add idle timeout, fix routing for multi-chat sessions ([e656c4b](https://github.com/vladutstoica/valkyr-ai/commit/e656c4b19be5031aed42bbc1087ad752c91ec779))
* **status:** auto-parse taskId from hook sessionId, no registration needed ([8520d40](https://github.com/vladutstoica/valkyr-ai/commit/8520d40aaa96402766923ed2f5f1fa0f8549fb28))
* **status:** fix hook commands being commented out, add UserPromptSubmit ([400d896](https://github.com/vladutstoica/valkyr-ai/commit/400d89630a118d3a30bc4fc5d34955e954e14232))
* **status:** fix hook status dots with poll-based IPC and task ID keying ([ada9fe4](https://github.com/vladutstoica/valkyr-ai/commit/ada9fe4618757b73b7318cdc3b47ffbd0486bf2c))
* **status:** per-conversation pill colors and order matching UI tabs ([cdf085a](https://github.com/vladutstoica/valkyr-ai/commit/cdf085a04efa6d9744789badc53e0f080233bbb8))
* **status:** preserve pill colors on conversation reorder ([7a5d921](https://github.com/vladutstoica/valkyr-ai/commit/7a5d921d55229bff52addd2f4126608b34922080))
* **status:** register per-conversation entries so pill shows correct count ([0d192ab](https://github.com/vladutstoica/valkyr-ai/commit/0d192ab34b414ea70d3c3226bfaeeed73ab23fb2))
* **status:** register PTY task mode on hook session so status dots update ([39e1ba6](https://github.com/vladutstoica/valkyr-ai/commit/39e1ba66000da97a40d76e28e36a77f41b96671b))
* **status:** use indexOf for hyphen-safe parsing, remove dangerous fallback ([d148066](https://github.com/vladutstoica/valkyr-ai/commit/d148066f6ee8721ac2bfc7b4b4e6ff0a87bdb576))
* **terminal:** stabilize PTY resize, view mounting, and terminal repaint ([0e2eccd](https://github.com/vladutstoica/valkyr-ai/commit/0e2eccd303a6cc2a660d0215b3cc6d975c75c3d1))
* **test:** mock native modules for CI where electron/keytar are unavailable ([d56b221](https://github.com/vladutstoica/valkyr-ai/commit/d56b22190f920ca36ba2346e319c1d69a179b25b))
* **ui:** add pill divider, update pill on chat add/delete ([9e42667](https://github.com/vladutstoica/valkyr-ai/commit/9e426678da56fa01159d5e34fba6c1dc999b09e4))


### Performance

* **build:** exclude remaining renderer-only transitive deps from ASAR ([dab3930](https://github.com/vladutstoica/valkyr-ai/commit/dab3930cee0bb64642eb94943d29d1d687b6325e))
* **build:** exclude renderer-only packages from ASAR (-163MB) ([546e58b](https://github.com/vladutstoica/valkyr-ai/commit/546e58b6636016fd9eeb6a3a3537531f2d9e31ce))


### Code Refactoring

* **branding:** replace emdash assets with Hotshot logomark, reduce bundle size ([a443ff0](https://github.com/vladutstoica/valkyr-ai/commit/a443ff01b003ca8baa781dc50f4fc1fa88c3fe11))
* decompose AcpSessionManager and fsIpc into focused modules ([813b170](https://github.com/vladutstoica/valkyr-ai/commit/813b1709b69ff48a61e33e615d48a7ab425aac50))
* decompose god classes, fix security issues, and improve UX ([e1d1faa](https://github.com/vladutstoica/valkyr-ai/commit/e1d1faa4672a86492c56c1c8c147f8662bbd815e))

## [0.4.0](https://github.com/vladutstoica/valkyr-ai/compare/valkyr-v0.3.1...valkyr-v0.4.0) (2026-03-25)


### Features

* **branding:** replace all emdash assets with Hotshot logomark — new app icon following Apple HIG, welcome screen, home view, docs, favicon
* **status:** hook-based status detection for Claude Code via lifecycle hooks (Stop, PostToolUse, PermissionRequest) replacing fragile regex parsing
* **status:** per-conversation status dots in sidebar — single dot for 1 chat, pill shape for 2+ chats with independent colors matching tab order
* **notifications:** native desktop notifications when agents finish or need input — smart triggers based on active view, deep-navigate on click, 3-second batching, per-project mute
* **notifications:** in-app toasts for cross-task/cross-project events with auto-dismiss
* **settings:** per-agent ACP/CLI mode toggle in settings UI
* **settings:** per-project notification mute via right-click menu
* **onboarding:** improved setup modal with agent install guide and ACP badge indicators
* **ui:** resource usage monitor in status bar with CPU/memory popover breakdown
* **build:** Windows .ico and Linux icon for cross-platform builds


### Performance

* **build:** app bundle 723MB → 376MB (48% reduction), DMG 208MB → 132MB — excluded 20+ renderer-only packages from ASAR
* **acp:** O(1) session lookup via reverse index in AcpConnectionPool (was O(n) linear scan)
* **acp:** cached terminal output in AcpTerminalManager (eliminates repeated Buffer.byteLength and .join calls)
* **fs:** worker pool for file listing (eliminates ~50-100ms worker spawn per call)
* **fs:** RegExp with i-flag for search (avoids toLowerCase full-string copy)


### Code Refactoring

* **acp:** decompose AcpSessionManager (1749 → 837 lines) into 7 focused modules: AcpConnectionPool, AcpTerminalManager, AcpEventBuffer, AcpClientFactory, AcpSdkLoader, acpTypes
* **fs:** decompose fsIpc (840 → 303 lines) into 6 focused modules: FsService, FsSearchService, FsListService, FsConfigService, fsConstants
* **status:** DRY session-routing boilerplate (9x duplication eliminated), gracefulKill helper, wrapIpcHandler utility


### Bug Fixes

* **status:** fix hook status dots — store per-conversation (not per-task), preserve colors on reorder, idle timeout auto-reset to green after 5s
* **chat:** backfill claudeSessionId so each chat resumes its own Claude session on restart
* **build:** use Map for hookEventMapper (ES2020 compat, prototype-safe)


### Tests

* 286 → 1268 unit tests across 51 files (all passing)
* Coverage: 18% → 39% statements, 78% branches, 73% functions
* Test infrastructure: shared mock helpers, Playwright E2E fixtures, vitest coverage config
* Testing conventions documented in CLAUDE.md


## [0.3.1](https://github.com/vladutstoica/valkyr-ai/compare/valkyr-v0.3.0...valkyr-v0.3.1) (2026-03-08)


### Performance

* **build:** add manual chunk splitting for Monaco and xterm ([657ecc9](https://github.com/vladutstoica/valkyr-ai/commit/657ecc9f297db0453bf009abf6e8fad1205e91f2))
* **db:** add missing indexes on tasks.archivedAt and kanbanColumns.taskId ([ab778b6](https://github.com/vladutstoica/valkyr-ai/commit/ab778b678876a6e23e0f62fe3d5f97ef72446218))
* **renderer:** lazy-load all modal components in App.tsx ([f205c18](https://github.com/vladutstoica/valkyr-ai/commit/f205c180def11dfa176dd09fe595b1b606d4ea85))
* **renderer:** lazy-load Monaco diff components ([469e90c](https://github.com/vladutstoica/valkyr-ai/commit/469e90cc762379d18347eeb74cdfa3fb8b2643f8))
* **renderer:** lazy-load UpdateProjectModal in ProjectMainView ([4769581](https://github.com/vladutstoica/valkyr-ai/commit/47695811f3a38eb5f365d0318395c81deac2f0fa))
* **renderer:** memoize KeyboardSettingsContext value ([0de0531](https://github.com/vladutstoica/valkyr-ai/commit/0de05316e04c7d1533ddae94dd8f82dca80f3604))
* **startup:** convert shell PATH discovery from sync to async ([50cd175](https://github.com/vladutstoica/valkyr-ai/commit/50cd1755ae53277547b64b5671de2f48725ee9f9))
* **startup:** make SSH_AUTH_SOCK detection async ([dd16126](https://github.com/vladutstoica/valkyr-ai/commit/dd161264582fe7e7673c769c92fe6bfed7aa9c8c))
* **startup:** reorder app bootstrap to show window sooner ([bad6d8a](https://github.com/vladutstoica/valkyr-ai/commit/bad6d8a085a35037592b646a77a523135c891463))


### Code Refactoring

* **app:** remove integrations, redesign session modal, expand Open In apps, add provider detection and workspace all-view ([d28a75d](https://github.com/vladutstoica/valkyr-ai/commit/d28a75d0a72eb5b5df14842fd89cea33d0f6a18b))
* **renderer:** decompose god components, delete dead code, extract services and hooks ([1c9b842](https://github.com/vladutstoica/valkyr-ai/commit/1c9b842f16ebb51f55a4a19a4510a4f1820b95f0))
* **renderer:** group components into feature dirs, delete orphans, extract services and DRY hooks ([d8ff43a](https://github.com/vladutstoica/valkyr-ai/commit/d8ff43ac7dbab896f59bc5e4f1fccd042c644f37))

## [0.3.0](https://github.com/vladutstoica/valkyr-ai/compare/valkyr-v0.2.0...valkyr-v0.3.0) (2026-02-27)


### Features

* ACP terminal output optimization, branch caching, async MCP config, and UI refinements ([d86170c](https://github.com/vladutstoica/valkyr-ai/commit/d86170c4ee664e68f9cb634a0f6339d89a1eac2e))
* **acp:** add ACP backend services, IPC handlers, and schema migration ([39125e7](https://github.com/vladutstoica/valkyr-ai/commit/39125e7dfa264bc5b7806a082c96b80c13894bcb))
* **acp:** add ACP frontend components, hooks, and transport layer ([4eca4a9](https://github.com/vladutstoica/valkyr-ai/commit/4eca4a91b3d68b4ec818c737c966b395290a67e1))
* **acp:** improve ACP session management and chat UI ([bd50def](https://github.com/vladutstoica/valkyr-ai/commit/bd50defee3fccede7ff22cfc4e690bd5c9c2d74a))
* **acp:** session detach/reattach lifecycle and side-channel event buffering ([a1b7e4d](https://github.com/vladutstoica/valkyr-ai/commit/a1b7e4d1224701a6dee32818dea0f0af4e8ae1a5))
* **chat:** ACP plan overhaul, tokenlens context health, prerequisite check ([506302c](https://github.com/vladutstoica/valkyr-ai/commit/506302caf97f4d693a6b7400fbf276579d75c4eb))
* **chat:** ACP plan overhaul, tokenlens context health, prerequisite check ([b12d62c](https://github.com/vladutstoica/valkyr-ai/commit/b12d62c89b8204c7e628cf4181d8c64ca22a5922))
* **chat:** ACP terminal protocol, permission optionId, prompt queue, and message navigation ([1c67b63](https://github.com/vladutstoica/valkyr-ai/commit/1c67b6377eea06c16fc74cf867e781b210a6c0aa))
* **chat:** add Context hover card for token usage display ([04d63af](https://github.com/vladutstoica/valkyr-ai/commit/04d63afcfa45290b48714124568f9caf74bffc25))
* **chat:** add ConversationDownload and markdown export to conversation ([cdc6648](https://github.com/vladutstoica/valkyr-ai/commit/cdc664833ae74811be9d6705ef75c1970d947c40))
* **chat:** add debug overlay for raw part data inspection (Ctrl+Shift+D) ([092d067](https://github.com/vladutstoica/valkyr-ai/commit/092d0672017ffa148c7ca7c0f59f882766c7b116))
* **chat:** add opt-in voice-to-text using local Whisper model ([b6b2477](https://github.com/vladutstoica/valkyr-ai/commit/b6b24771013cc77459d61c73e76fb0594eb35b18))
* **chat:** add session history to resume past ACP conversations ([8eeb91b](https://github.com/vladutstoica/valkyr-ai/commit/8eeb91b736f893d98adbc7a198f6602fc6364a74))
* **chat:** add session resume checkpoint with context replay fallback ([284456a](https://github.com/vladutstoica/valkyr-ai/commit/284456ac4c58dc3423c77bc00f770b3a81019b81))
* **chat:** add toolbar, multi-pane split view, and inline plan display ([e5768e5](https://github.com/vladutstoica/valkyr-ai/commit/e5768e5b88f6aa9897af38ad8945d9f692996d3c))
* **chat:** editable conversation title with auto-generation from first message ([6ebe573](https://github.com/vladutstoica/valkyr-ai/commit/6ebe57361150bbc935391a4b444d4d2ee0fae142))
* **chat:** inline plan preview in switch_mode confirmation with keyboard shortcuts ([c78e1b5](https://github.com/vladutstoica/valkyr-ai/commit/c78e1b5e36f9b48a74056eaa4a167ffd8950ccd8))
* **chat:** make checkpoint triggers interactive for conversation restore ([bf05855](https://github.com/vladutstoica/valkyr-ai/commit/bf0585510551778be4f2fad6de14e5baceee4e8c))
* **chat:** parse markdown sources into dedicated Sources component ([7a0faa2](https://github.com/vladutstoica/valkyr-ai/commit/7a0faa2e08f334dd92de6febb6aaaaad39125d32))
* **chat:** plan approval card with content preview, collapse toggle, and prompt queueing ([d42a56c](https://github.com/vladutstoica/valkyr-ai/commit/d42a56c7c96bdd9f2cdf196b9e01f4d197184cbf))
* **chat:** progressive collapse for streaming tool groups ([b2041e2](https://github.com/vladutstoica/valkyr-ai/commit/b2041e276614e82cca251c01354ae7ca3abf943a))
* **chat:** replace ModelPicker with ModelSelector and wire Queue for pending messages ([e4a91d7](https://github.com/vladutstoica/valkyr-ai/commit/e4a91d75af3afc42f004b4526e4d9431eb0c4c52))
* **chat:** replace ToolGroup with ChainOfThought for grouped tool sequences ([469a469](https://github.com/vladutstoica/valkyr-ai/commit/469a4699cf6dd51c496b8eee4f85f5c9490e7b02))
* **chat:** restore model hover card and fix uptime accuracy ([5a684c7](https://github.com/vladutstoica/valkyr-ai/commit/5a684c74fb29f21f969a8bf2be15ca1b508e315e))
* **chat:** show target mode in switch_mode confirmation dialog ([92d67c4](https://github.com/vladutstoica/valkyr-ai/commit/92d67c4bb35d89e70a709307e00a4ff0db76a94a))
* **chat:** stream incremental tool output with stop button for long-running commands ([55dce28](https://github.com/vladutstoica/valkyr-ai/commit/55dce286545691e6ac6623fc5aa5465e53180940))
* **chat:** use AI SDK Elements Attachments for inline message attachments ([88614ef](https://github.com/vladutstoica/valkyr-ai/commit/88614ef4c9641cf3d9fad9bcfbbaad1136dd7642))
* **chat:** use full Confirmation lifecycle for tool approval states ([e795366](https://github.com/vladutstoica/valkyr-ai/commit/e7953662ce99f1c540b7e5cd7b21ca37e962afe8))
* **chat:** wire AI Elements into tool rendering pipeline ([df77a16](https://github.com/vladutstoica/valkyr-ai/commit/df77a16e166f1f554539b86972b592d767e6aef4))
* **chat:** wire Download Chat to conversation menu with native Save As ([aaed7c8](https://github.com/vladutstoica/valkyr-ai/commit/aaed7c8b3358d90bd70449a344b367fa391b7fe7))
* **db:** migrate localStorage state to SQLite and improve terminal UX ([4d32d8d](https://github.com/vladutstoica/valkyr-ai/commit/4d32d8dd6b00587f2b1fb0b81a0cddb776cef286))
* **file-explorer:** add visual distinction for gitignored files ([daab823](https://github.com/vladutstoica/valkyr-ai/commit/daab823f55703755cf0811f8f6d299d1cb58e93a))
* **git:** add push IPC handler and rework StatusBar branch switcher ([75d40a3](https://github.com/vladutstoica/valkyr-ai/commit/75d40a3c63c6f85be0a8f8cfed8c39ecf5dfdacc))
* **git:** detect nested git repos inside git-root projects ([856b5eb](https://github.com/vladutstoica/valkyr-ai/commit/856b5eb898bc053fa285bd96eab01221f2bdedd5))
* **git:** remove diff fallback and add Playwright e2e tests ([cf6853c](https://github.com/vladutstoica/valkyr-ai/commit/cf6853cc7d397ac6908eb2ad518b090a5898913a))
* **logger:** add AI-friendly structured debug logging across app ([9bcb656](https://github.com/vladutstoica/valkyr-ai/commit/9bcb656fa86fd276616be375025a07623e28a72f))
* **mcp:** add central MCP server management with ACP session injection ([fac5ae9](https://github.com/vladutstoica/valkyr-ai/commit/fac5ae9403199b7cc7d8729229deee7ea8ac2179))
* **mcp:** fix registry search and add agent MCP import ([32384fa](https://github.com/vladutstoica/valkyr-ai/commit/32384fa1abf0dce7d1923e76cbb85d7d0d3b8360))
* **sessions:** remember last active task per project ([566ba6f](https://github.com/vladutstoica/valkyr-ai/commit/566ba6f5811139a2fb4077356184be54e1a4826f))
* **settings:** convert settings from modal to full-page view with MCP registry ([7d51946](https://github.com/vladutstoica/valkyr-ai/commit/7d5194699cc918ebf081a79b71a5a0a7b500f205))
* **sidebar:** add project grouping with collapsible section headers and standardize buttons ([9b86e93](https://github.com/vladutstoica/valkyr-ai/commit/9b86e93be89737a1ba38b3daa1dba7e74c14383e))
* **statusbar:** add inline branch switcher with search and pull ([6fc6dd1](https://github.com/vladutstoica/valkyr-ai/commit/6fc6dd130f35233324d242e9d7b02b904ef71134))
* **status:** unified worst-wins status aggregation and tool UI redesign ([5c7bbe6](https://github.com/vladutstoica/valkyr-ai/commit/5c7bbe6f18fdeb727f0dbc21394461ead31c12c9))
* **status:** unified worst-wins status aggregation and tool UI redesign ([60a0132](https://github.com/vladutstoica/valkyr-ai/commit/60a0132246eb700b9d8ad9d0cdc2c3212cc4d812))
* sync upstream changes from v0.4.9 ([cdacbe0](https://github.com/vladutstoica/valkyr-ai/commit/cdacbe06e36a6c1219cb1a043331abd709b46625))
* sync upstream changes from v0.4.9 ([f5dd20f](https://github.com/vladutstoica/valkyr-ai/commit/f5dd20f0de9ea3399b48bb6dee2f6ff6b1b19f01))
* **ui:** add AI Elements components and update existing primitives ([11e799e](https://github.com/vladutstoica/valkyr-ai/commit/11e799eb1295a4d12160aded0210933c80ddf305))
* **ui:** add AI Elements components and update existing primitives ([6134efd](https://github.com/vladutstoica/valkyr-ai/commit/6134efd3bffd29600a1b55465419871d2e9391b6))
* **ui:** add subtle focus ring highlight to panels ([16ee1b1](https://github.com/vladutstoica/valkyr-ai/commit/16ee1b1d5a88b9fbfff14a72e92ff93c450a9aaf))
* **ui:** add subtle focus ring highlight to panels ([fd1d502](https://github.com/vladutstoica/valkyr-ai/commit/fd1d5029020e35d93bf773c8d58b0fed3c436f72))
* **ui:** add tab navigation system and fix layout issues ([ae06a31](https://github.com/vladutstoica/valkyr-ai/commit/ae06a31ff4954ff4631e16efc358c773bd1eca27))
* **ui:** add tab navigation system and fix layout issues ([b627f58](https://github.com/vladutstoica/valkyr-ai/commit/b627f58ca05379f378a07fd32ff8699bba32b498))
* **usage:** add Claude Code plan usage limits display ([cb41ac4](https://github.com/vladutstoica/valkyr-ai/commit/cb41ac4e70d4b690a62e189171c06807ca437abf))
* **workspaces:** add Arc-style workspace switching in sidebar ([ca9dfa6](https://github.com/vladutstoica/valkyr-ai/commit/ca9dfa61c039914a72401348f0eb76a8916a952b))
* **workspaces:** add Arc-style workspace switching in sidebar ([14db60c](https://github.com/vladutstoica/valkyr-ai/commit/14db60cbf7da2f3bc3993514f50dc77c413225c0))
* **workspaces:** add two-finger swipe to switch workspaces in sidebar ([832fc7d](https://github.com/vladutstoica/valkyr-ai/commit/832fc7d500467c67804efdd217b3eda869ab755f))


### Bug Fixes

* **chat:** configure Streamdown for full markdown rendering ([26e5dbb](https://github.com/vladutstoica/valkyr-ai/commit/26e5dbb93250ab64d36ec4ffa4c348e8eba4be03))
* **chat:** improve AI chat output readability and tool labels ([4a8ced1](https://github.com/vladutstoica/valkyr-ai/commit/4a8ced170a8b2572f4ab8e667a953e67e2cd3292))
* **chat:** improve voice input UX with recording indicator and red mic button ([4fbb923](https://github.com/vladutstoica/valkyr-ai/commit/4fbb9234bb4c7cecf03d94dc6ec099ee836e7ab9))
* **chat:** match resume checkpoint styling to turn checkpoints ([07ad24a](https://github.com/vladutstoica/valkyr-ai/commit/07ad24a9eb4ee6f57e44db98746fc702ba40b485))
* **chat:** persist ACP sessions across session/project/workspace switches ([69884da](https://github.com/vladutstoica/valkyr-ai/commit/69884daff0d734ac500598ba4de1511b987421a1))
* **chat:** preserve streaming sessions when navigating to Settings ([cdf4781](https://github.com/vladutstoica/valkyr-ai/commit/cdf478130bf96f82a5fc1c7cbe0fb607d0f955f0))
* **chat:** restore conversation history when resuming ACP sessions ([e6133ae](https://github.com/vladutstoica/valkyr-ai/commit/e6133aee6bbd012d47ea7bd22268cd8ecdd9e05b))
* **chat:** show exact tool details in approval dialogs and tool labels ([55db6e5](https://github.com/vladutstoica/valkyr-ai/commit/55db6e54396d07b04e57bdf7edafe742cf88c75e))
* **chat:** use ACP title in rich tool renderers (CodeBlock, Terminal) ([4db81e3](https://github.com/vladutstoica/valkyr-ai/commit/4db81e3798bbc89026976d4eb762831a4a5e0706))
* **db:** guard updateAppState against empty partial objects ([9819f59](https://github.com/vladutstoica/valkyr-ai/commit/9819f59b44fc5e89f51895bbbbe08eb4355430b9))
* **editor:** restore persisted files after app restart ([1e35391](https://github.com/vladutstoica/valkyr-ai/commit/1e35391138525536a23b7e3f848ccc7244c3bbee))
* **editor:** restore persisted files after app restart ([66299e8](https://github.com/vladutstoica/valkyr-ai/commit/66299e800869a9ce805c3ce451946424aa7d23e7))
* fix project drag ui ([d381564](https://github.com/vladutstoica/valkyr-ai/commit/d38156445996851abcc9a6cf3ad41a5e3ae988c6))
* fix project drag ui ([eabeebc](https://github.com/vladutstoica/valkyr-ai/commit/eabeebcc171c7c7fd362aa58b41e8a68a8609f8c))
* **git:** clear diff cache on refresh and fix post-commit selection ([f11df7f](https://github.com/vladutstoica/valkyr-ai/commit/f11df7fd912d6d2e14f42ac5a0066cd5ac43fc54))
* **git:** resolve diff rendering crash and improve performance ([cfc4c0e](https://github.com/vladutstoica/valkyr-ai/commit/cfc4c0e6561e85eb2e7bcca6db48749b31ab983e))
* **git:** serialize git operations, clean stale locks, fix terminal CWD and diff theme ([ad0e380](https://github.com/vladutstoica/valkyr-ai/commit/ad0e380a27a41d66f51950c93659212d8009422d))
* **ipc:** standardize error handling and harden IPC handlers ([c38fb81](https://github.com/vladutstoica/valkyr-ai/commit/c38fb818d8765a25b9bc9093807bd779435ebdd2))
* **lint:** resolve no-this-alias error and suppress ESLint false positive ([a7ba80c](https://github.com/vladutstoica/valkyr-ai/commit/a7ba80c8be300b898b75c2cca8627c56acd4d3dc))
* **pty:** prefer homedir over cwd for PTY fallback path ([9dabbba](https://github.com/vladutstoica/valkyr-ai/commit/9dabbbad750a8833c36944942c22d82a1a542309))
* **release:** remove bump-patch-for-minor-pre-major to allow minor bu… ([9b18f68](https://github.com/vladutstoica/valkyr-ai/commit/9b18f68bfb04b165fe8f47271c6857d752d54810))
* **release:** remove bump-patch-for-minor-pre-major to allow minor bumps on feat commits ([d581172](https://github.com/vladutstoica/valkyr-ai/commit/d5811729ae6b5d264567dfa1c9eb7a438455e2e0))
* **renderer:** fix agent restore, diff viewer disposal, and workspace routing ([61a407d](https://github.com/vladutstoica/valkyr-ai/commit/61a407d61c7721281d439015c66732be16b6cf5b))
* **security:** harden shell execution, add CSP, and process crash handlers ([c6f680e](https://github.com/vladutstoica/valkyr-ai/commit/c6f680e3dd2f127a7643f541647d0d520c6d880d))
* **services:** improve error handling, resource cleanup, and logging ([f8e6aef](https://github.com/vladutstoica/valkyr-ai/commit/f8e6aef31ac7f30ffde714525324258948cee651))
* **sessions:** filter session history by project cwd ([1dfa315](https://github.com/vladutstoica/valkyr-ai/commit/1dfa3159a7ca67fcba487d6bcf006bb9db2e70cf))
* **sessions:** require worktrees for multiple sessions and add worktree icon ([f751ef3](https://github.com/vladutstoica/valkyr-ai/commit/f751ef31c09a1c50e9bbdc3cd46f187541a8cb4f))
* **sessions:** use projectPath for ACP session history filtering ([b55f6df](https://github.com/vladutstoica/valkyr-ai/commit/b55f6df394de42a686fbd04bb22fab5bc9c19b72))
* **status:** prevent stale status dots and reduce redundant notifications ([31b68d2](https://github.com/vladutstoica/valkyr-ai/commit/31b68d2daa1bc49b76125372a253e5eeefefb22b))
* **terminal:** prevent blank terminals when no cwd is available ([08a2d69](https://github.com/vladutstoica/valkyr-ai/commit/08a2d69e1927f5d2a49f45b51484c73d02dc37f6))
* **test:** stabilize flaky tests under husky pre-commit hooks ([c62c76f](https://github.com/vladutstoica/valkyr-ai/commit/c62c76ff78bdab07fe742a2571b147787b5a60ab))
* **ui:** apply shiki dark theme colors in dark-black mode ([6b21453](https://github.com/vladutstoica/valkyr-ai/commit/6b21453292aed0824672ca065d2a023516418a88))
* **ui:** improve swipe cooldown and assistant message readability ([5e69220](https://github.com/vladutstoica/valkyr-ai/commit/5e6922012542126f097b8f65fbfb21ded86fc7b8))
* **ui:** normalize border widths to 1px and remove overlapping borders ([b1ca021](https://github.com/vladutstoica/valkyr-ai/commit/b1ca0211f2200d1b5043e1e892f2965738b20728))
* **ui:** remove slide animation from dialogs causing top-left entry ([32d715d](https://github.com/vladutstoica/valkyr-ai/commit/32d715d39009e9b0c2ffd05cbd0064ebd9655952))
* **ui:** wrap Tooltip in TooltipProvider in CheckpointTrigger ([6c9a6c4](https://github.com/vladutstoica/valkyr-ai/commit/6c9a6c4ca33c736be7dc53a6a109efecc98634c1))
* **usage:** resolve intermittent plan usage display by targeting correct keychain entry ([636a2e8](https://github.com/vladutstoica/valkyr-ai/commit/636a2e88eb094581410972d05cc77f5889a50ce4))
* **workspaces:** auto-select default workspace on initial load ([7bcc2cb](https://github.com/vladutstoica/valkyr-ai/commit/7bcc2cb1f6b69a9f0b21b538bfe69d11b2fcc558))


### Performance

* **acp:** optimize session startup with lazy transport and instant UI ([50562ab](https://github.com/vladutstoica/valkyr-ai/commit/50562ab385ceba6978b2c42edb499a2b62f95287))
* **acp:** share subprocess across multiple sessions via connection pooling ([7bb73d5](https://github.com/vladutstoica/valkyr-ai/commit/7bb73d59731fe70779d29dfbac98d8171a248e52))
* **db:** add WAL mode, FK enforcement, batch transactions, and parameterized queries ([189d004](https://github.com/vladutstoica/valkyr-ai/commit/189d00475fa20e47caab96151448dc1baa14fce8))
* **workspace:** optimize workspace switching with caching and deferred loads ([3d7ed4d](https://github.com/vladutstoica/valkyr-ai/commit/3d7ed4d58e6f8cfc328a35dca5dbf0020cc93911))


### Code Refactoring

* **chat:** redesign plan component to compact inline style ([d3b29e8](https://github.com/vladutstoica/valkyr-ai/commit/d3b29e8d6aa737cb5297ff17ea1ccfbf1442ccd5))
* **editor:** remove redundant refresh button from explorer header ([fa422df](https://github.com/vladutstoica/valkyr-ai/commit/fa422df66d8d296b991f98eaf3f86407bee8d512))
* **git:** redesign git diff view with two-column layout and UX improvements ([5662ced](https://github.com/vladutstoica/valkyr-ai/commit/5662ced2075bb7c5042406b4294eeff1856f674d))
* **git:** replace @pierre/diffs with Monaco DiffEditor and fix IPC lifecycle ([610a0d4](https://github.com/vladutstoica/valkyr-ai/commit/610a0d48ff81d701bef5d96bb78aeab819fcd27d))
* move browser from titlebar to Preview tab view ([8a733e5](https://github.com/vladutstoica/valkyr-ai/commit/8a733e5e30ed9070b69065239c8264e04692d326))
* **renderer:** integrate ACP into existing app components ([aae4165](https://github.com/vladutstoica/valkyr-ai/commit/aae416530da2c611614015ba22285632c933b9bd))
* **settings:** restructure settings modal tabs and fix workspace alignment ([2e24b21](https://github.com/vladutstoica/valkyr-ai/commit/2e24b2137c83e45369846e3be50ebde8e1336fdd))
* **ui:** simplify titlebar and remove unused sidebar toggles ([19ba599](https://github.com/vladutstoica/valkyr-ai/commit/19ba59960167acdbb178104cd2a404518668cdd7))
* **ui:** upgrade and add UI primitive components ([ee8d9bf](https://github.com/vladutstoica/valkyr-ai/commit/ee8d9bfa85e28583089846222a1cd70c04aded4c))
* update Editor ([2061887](https://github.com/vladutstoica/valkyr-ai/commit/20618873bd84567b5fc0cba01e51a7645d335102))


### Documentation

* add playwright-electron MCP debugging workflow to CLAUDE.md ([2ce03e1](https://github.com/vladutstoica/valkyr-ai/commit/2ce03e1ea51e01c7c1f49ca482eb4cfdbac264fc))
* **git:** document GitHub hosting, CI/CD, and release workflow ([445a267](https://github.com/vladutstoica/valkyr-ai/commit/445a267ab05d129d284a48d59b17ce1f20899baf))
* **readme:** refactor structure, add features section and Windows install ([890009a](https://github.com/vladutstoica/valkyr-ai/commit/890009ac1aa42002f07a8b5c7040ff7ca11411f6))

## [0.2.0](https://github.com/vladutstoica/valkyr-ai/compare/valkyr-v0.1.0...valkyr-v0.2.0) (2026-02-23)


### Features

* **acp:** add ACP backend services, IPC handlers, and schema migration ([39125e7](https://github.com/vladutstoica/valkyr-ai/commit/39125e7dfa264bc5b7806a082c96b80c13894bcb))
* **acp:** add ACP frontend components, hooks, and transport layer ([4eca4a9](https://github.com/vladutstoica/valkyr-ai/commit/4eca4a91b3d68b4ec818c737c966b395290a67e1))
* **acp:** improve ACP session management and chat UI ([bd50def](https://github.com/vladutstoica/valkyr-ai/commit/bd50defee3fccede7ff22cfc4e690bd5c9c2d74a))
* **acp:** session detach/reattach lifecycle and side-channel event buffering ([a1b7e4d](https://github.com/vladutstoica/valkyr-ai/commit/a1b7e4d1224701a6dee32818dea0f0af4e8ae1a5))
* **chat:** add Context hover card for token usage display ([04d63af](https://github.com/vladutstoica/valkyr-ai/commit/04d63afcfa45290b48714124568f9caf74bffc25))
* **chat:** add ConversationDownload and markdown export to conversation ([cdc6648](https://github.com/vladutstoica/valkyr-ai/commit/cdc664833ae74811be9d6705ef75c1970d947c40))
* **chat:** add toolbar, multi-pane split view, and inline plan display ([e5768e5](https://github.com/vladutstoica/valkyr-ai/commit/e5768e5b88f6aa9897af38ad8945d9f692996d3c))
* **chat:** inline plan preview in switch_mode confirmation with keyboard shortcuts ([c78e1b5](https://github.com/vladutstoica/valkyr-ai/commit/c78e1b5e36f9b48a74056eaa4a167ffd8950ccd8))
* **chat:** make checkpoint triggers interactive for conversation restore ([bf05855](https://github.com/vladutstoica/valkyr-ai/commit/bf0585510551778be4f2fad6de14e5baceee4e8c))
* **chat:** parse markdown sources into dedicated Sources component ([7a0faa2](https://github.com/vladutstoica/valkyr-ai/commit/7a0faa2e08f334dd92de6febb6aaaaad39125d32))
* **chat:** progressive collapse for streaming tool groups ([b2041e2](https://github.com/vladutstoica/valkyr-ai/commit/b2041e276614e82cca251c01354ae7ca3abf943a))
* **chat:** replace ModelPicker with ModelSelector and wire Queue for pending messages ([e4a91d7](https://github.com/vladutstoica/valkyr-ai/commit/e4a91d75af3afc42f004b4526e4d9431eb0c4c52))
* **chat:** replace ToolGroup with ChainOfThought for grouped tool sequences ([469a469](https://github.com/vladutstoica/valkyr-ai/commit/469a4699cf6dd51c496b8eee4f85f5c9490e7b02))
* **chat:** restore model hover card and fix uptime accuracy ([5a684c7](https://github.com/vladutstoica/valkyr-ai/commit/5a684c74fb29f21f969a8bf2be15ca1b508e315e))
* **chat:** show target mode in switch_mode confirmation dialog ([92d67c4](https://github.com/vladutstoica/valkyr-ai/commit/92d67c4bb35d89e70a709307e00a4ff0db76a94a))
* **chat:** stream incremental tool output with stop button for long-running commands ([55dce28](https://github.com/vladutstoica/valkyr-ai/commit/55dce286545691e6ac6623fc5aa5465e53180940))
* **chat:** use full Confirmation lifecycle for tool approval states ([e795366](https://github.com/vladutstoica/valkyr-ai/commit/e7953662ce99f1c540b7e5cd7b21ca37e962afe8))
* **chat:** wire AI Elements into tool rendering pipeline ([df77a16](https://github.com/vladutstoica/valkyr-ai/commit/df77a16e166f1f554539b86972b592d767e6aef4))
* **chat:** wire Download Chat to conversation menu with native Save As ([aaed7c8](https://github.com/vladutstoica/valkyr-ai/commit/aaed7c8b3358d90bd70449a344b367fa391b7fe7))
* **db:** migrate localStorage state to SQLite and improve terminal UX ([4d32d8d](https://github.com/vladutstoica/valkyr-ai/commit/4d32d8dd6b00587f2b1fb0b81a0cddb776cef286))
* **file-explorer:** add visual distinction for gitignored files ([daab823](https://github.com/vladutstoica/valkyr-ai/commit/daab823f55703755cf0811f8f6d299d1cb58e93a))
* **git:** detect nested git repos inside git-root projects ([856b5eb](https://github.com/vladutstoica/valkyr-ai/commit/856b5eb898bc053fa285bd96eab01221f2bdedd5))
* **git:** remove diff fallback and add Playwright e2e tests ([cf6853c](https://github.com/vladutstoica/valkyr-ai/commit/cf6853cc7d397ac6908eb2ad518b090a5898913a))
* **sidebar:** add project grouping with collapsible section headers and standardize buttons ([9b86e93](https://github.com/vladutstoica/valkyr-ai/commit/9b86e93be89737a1ba38b3daa1dba7e74c14383e))
* **statusbar:** add inline branch switcher with search and pull ([6fc6dd1](https://github.com/vladutstoica/valkyr-ai/commit/6fc6dd130f35233324d242e9d7b02b904ef71134))
* **status:** unified worst-wins status aggregation and tool UI redesign ([5c7bbe6](https://github.com/vladutstoica/valkyr-ai/commit/5c7bbe6f18fdeb727f0dbc21394461ead31c12c9))
* **status:** unified worst-wins status aggregation and tool UI redesign ([60a0132](https://github.com/vladutstoica/valkyr-ai/commit/60a0132246eb700b9d8ad9d0cdc2c3212cc4d812))
* sync upstream changes from v0.4.9 ([cdacbe0](https://github.com/vladutstoica/valkyr-ai/commit/cdacbe06e36a6c1219cb1a043331abd709b46625))
* sync upstream changes from v0.4.9 ([f5dd20f](https://github.com/vladutstoica/valkyr-ai/commit/f5dd20f0de9ea3399b48bb6dee2f6ff6b1b19f01))
* **ui:** add AI Elements components and update existing primitives ([11e799e](https://github.com/vladutstoica/valkyr-ai/commit/11e799eb1295a4d12160aded0210933c80ddf305))
* **ui:** add AI Elements components and update existing primitives ([6134efd](https://github.com/vladutstoica/valkyr-ai/commit/6134efd3bffd29600a1b55465419871d2e9391b6))
* **ui:** add subtle focus ring highlight to panels ([16ee1b1](https://github.com/vladutstoica/valkyr-ai/commit/16ee1b1d5a88b9fbfff14a72e92ff93c450a9aaf))
* **ui:** add subtle focus ring highlight to panels ([fd1d502](https://github.com/vladutstoica/valkyr-ai/commit/fd1d5029020e35d93bf773c8d58b0fed3c436f72))
* **ui:** add tab navigation system and fix layout issues ([ae06a31](https://github.com/vladutstoica/valkyr-ai/commit/ae06a31ff4954ff4631e16efc358c773bd1eca27))
* **ui:** add tab navigation system and fix layout issues ([b627f58](https://github.com/vladutstoica/valkyr-ai/commit/b627f58ca05379f378a07fd32ff8699bba32b498))
* **workspaces:** add Arc-style workspace switching in sidebar ([ca9dfa6](https://github.com/vladutstoica/valkyr-ai/commit/ca9dfa61c039914a72401348f0eb76a8916a952b))
* **workspaces:** add Arc-style workspace switching in sidebar ([14db60c](https://github.com/vladutstoica/valkyr-ai/commit/14db60cbf7da2f3bc3993514f50dc77c413225c0))
* **workspaces:** add two-finger swipe to switch workspaces in sidebar ([832fc7d](https://github.com/vladutstoica/valkyr-ai/commit/832fc7d500467c67804efdd217b3eda869ab755f))


### Bug Fixes

* **chat:** persist ACP sessions across session/project/workspace switches ([69884da](https://github.com/vladutstoica/valkyr-ai/commit/69884daff0d734ac500598ba4de1511b987421a1))
* **db:** guard updateAppState against empty partial objects ([9819f59](https://github.com/vladutstoica/valkyr-ai/commit/9819f59b44fc5e89f51895bbbbe08eb4355430b9))
* **editor:** restore persisted files after app restart ([1e35391](https://github.com/vladutstoica/valkyr-ai/commit/1e35391138525536a23b7e3f848ccc7244c3bbee))
* **editor:** restore persisted files after app restart ([66299e8](https://github.com/vladutstoica/valkyr-ai/commit/66299e800869a9ce805c3ce451946424aa7d23e7))
* fix project drag ui ([d381564](https://github.com/vladutstoica/valkyr-ai/commit/d38156445996851abcc9a6cf3ad41a5e3ae988c6))
* fix project drag ui ([eabeebc](https://github.com/vladutstoica/valkyr-ai/commit/eabeebcc171c7c7fd362aa58b41e8a68a8609f8c))
* **git:** clear diff cache on refresh and fix post-commit selection ([f11df7f](https://github.com/vladutstoica/valkyr-ai/commit/f11df7fd912d6d2e14f42ac5a0066cd5ac43fc54))
* **git:** resolve diff rendering crash and improve performance ([cfc4c0e](https://github.com/vladutstoica/valkyr-ai/commit/cfc4c0e6561e85eb2e7bcca6db48749b31ab983e))
* **git:** serialize git operations, clean stale locks, fix terminal CWD and diff theme ([ad0e380](https://github.com/vladutstoica/valkyr-ai/commit/ad0e380a27a41d66f51950c93659212d8009422d))
* **ipc:** standardize error handling and harden IPC handlers ([c38fb81](https://github.com/vladutstoica/valkyr-ai/commit/c38fb818d8765a25b9bc9093807bd779435ebdd2))
* **pty:** prefer homedir over cwd for PTY fallback path ([9dabbba](https://github.com/vladutstoica/valkyr-ai/commit/9dabbbad750a8833c36944942c22d82a1a542309))
* **release:** remove bump-patch-for-minor-pre-major to allow minor bumps on feat commits ([d581172](https://github.com/vladutstoica/valkyr-ai/commit/d5811729ae6b5d264567dfa1c9eb7a438455e2e0))
* **renderer:** fix agent restore, diff viewer disposal, and workspace routing ([61a407d](https://github.com/vladutstoica/valkyr-ai/commit/61a407d61c7721281d439015c66732be16b6cf5b))
* **services:** improve error handling, resource cleanup, and logging ([f8e6aef](https://github.com/vladutstoica/valkyr-ai/commit/f8e6aef31ac7f30ffde714525324258948cee651))
* **sessions:** require worktrees for multiple sessions and add worktree icon ([f751ef3](https://github.com/vladutstoica/valkyr-ai/commit/f751ef31c09a1c50e9bbdc3cd46f187541a8cb4f))
* **terminal:** prevent blank terminals when no cwd is available ([08a2d69](https://github.com/vladutstoica/valkyr-ai/commit/08a2d69e1927f5d2a49f45b51484c73d02dc37f6))
* **ui:** apply shiki dark theme colors in dark-black mode ([6b21453](https://github.com/vladutstoica/valkyr-ai/commit/6b21453292aed0824672ca065d2a023516418a88))
* **ui:** improve swipe cooldown and assistant message readability ([5e69220](https://github.com/vladutstoica/valkyr-ai/commit/5e6922012542126f097b8f65fbfb21ded86fc7b8))
* **ui:** normalize border widths to 1px and remove overlapping borders ([b1ca021](https://github.com/vladutstoica/valkyr-ai/commit/b1ca0211f2200d1b5043e1e892f2965738b20728))
* **ui:** remove slide animation from dialogs causing top-left entry ([32d715d](https://github.com/vladutstoica/valkyr-ai/commit/32d715d39009e9b0c2ffd05cbd0064ebd9655952))
* **ui:** wrap Tooltip in TooltipProvider in CheckpointTrigger ([6c9a6c4](https://github.com/vladutstoica/valkyr-ai/commit/6c9a6c4ca33c736be7dc53a6a109efecc98634c1))
* **workspaces:** auto-select default workspace on initial load ([7bcc2cb](https://github.com/vladutstoica/valkyr-ai/commit/7bcc2cb1f6b69a9f0b21b538bfe69d11b2fcc558))


### Performance

* **acp:** optimize session startup with lazy transport and instant UI ([50562ab](https://github.com/vladutstoica/valkyr-ai/commit/50562ab385ceba6978b2c42edb499a2b62f95287))
* **db:** add WAL mode, FK enforcement, batch transactions, and parameterized queries ([189d004](https://github.com/vladutstoica/valkyr-ai/commit/189d00475fa20e47caab96151448dc1baa14fce8))


### Code Refactoring

* **chat:** redesign plan component to compact inline style ([d3b29e8](https://github.com/vladutstoica/valkyr-ai/commit/d3b29e8d6aa737cb5297ff17ea1ccfbf1442ccd5))
* **editor:** remove redundant refresh button from explorer header ([fa422df](https://github.com/vladutstoica/valkyr-ai/commit/fa422df66d8d296b991f98eaf3f86407bee8d512))
* **git:** redesign git diff view with two-column layout and UX improvements ([5662ced](https://github.com/vladutstoica/valkyr-ai/commit/5662ced2075bb7c5042406b4294eeff1856f674d))
* **git:** replace @pierre/diffs with Monaco DiffEditor and fix IPC lifecycle ([610a0d4](https://github.com/vladutstoica/valkyr-ai/commit/610a0d48ff81d701bef5d96bb78aeab819fcd27d))
* move browser from titlebar to Preview tab view ([8a733e5](https://github.com/vladutstoica/valkyr-ai/commit/8a733e5e30ed9070b69065239c8264e04692d326))
* **renderer:** integrate ACP into existing app components ([aae4165](https://github.com/vladutstoica/valkyr-ai/commit/aae416530da2c611614015ba22285632c933b9bd))
* **settings:** restructure settings modal tabs and fix workspace alignment ([2e24b21](https://github.com/vladutstoica/valkyr-ai/commit/2e24b2137c83e45369846e3be50ebde8e1336fdd))
* **ui:** simplify titlebar and remove unused sidebar toggles ([19ba599](https://github.com/vladutstoica/valkyr-ai/commit/19ba59960167acdbb178104cd2a404518668cdd7))
* **ui:** upgrade and add UI primitive components ([ee8d9bf](https://github.com/vladutstoica/valkyr-ai/commit/ee8d9bfa85e28583089846222a1cd70c04aded4c))
* update Editor ([2061887](https://github.com/vladutstoica/valkyr-ai/commit/20618873bd84567b5fc0cba01e51a7645d335102))


### Documentation

* add playwright-electron MCP debugging workflow to CLAUDE.md ([2ce03e1](https://github.com/vladutstoica/valkyr-ai/commit/2ce03e1ea51e01c7c1f49ca482eb4cfdbac264fc))
* **git:** document GitHub hosting, CI/CD, and release workflow ([445a267](https://github.com/vladutstoica/valkyr-ai/commit/445a267ab05d129d284a48d59b17ce1f20899baf))
