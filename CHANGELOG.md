# Changelog

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
