<img alt="Valkyr banner" src="https://github.com/user-attachments/assets/a2ecaf3c-9d84-40ca-9a8e-d4f612cc1c6f" />

<div align="center">

<br />

[![MIT License](https://img.shields.io/badge/License-MIT-555555.svg?labelColor=333333&color=666666)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/generalaction/valkyr-ai/total?labelColor=333333&color=666666)](https://github.com/generalaction/valkyr-ai/releases)
[![GitHub Stars](https://img.shields.io/github/stars/generalaction/valkyr-ai?labelColor=333333&color=666666)](https://github.com/generalaction/valkyr-ai)
[![Last Commit](https://img.shields.io/github/last-commit/generalaction/valkyr-ai?labelColor=333333&color=666666)](https://github.com/generalaction/valkyr-ai/commits/main)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/generalaction/valkyr-ai?labelColor=333333&color=666666)](https://github.com/generalaction/valkyr-ai/graphs/commit-activity)
<br>
[![Discord](https://img.shields.io/badge/Discord-join-%235462eb?labelColor=%235462eb&logo=discord&logoColor=%23f5f5f5)](https://discord.gg/f2fv7YxuR2)
<a href="https://www.ycombinator.com"><img src="https://img.shields.io/badge/Y%20Combinator-W26-orange" alt="Y Combinator W26"></a>
[![Follow @valkyr_ai on X](https://img.shields.io/twitter/follow/valkyr_ai?logo=X&color=%23f5f5f5)](https://twitter.com/intent/follow?screen_name=valkyr_ai)

<br />

Run multiple coding agents in parallel. Provider-agnostic, Git-isolated, local-first.

<br />

<a href="https://github.com/generalaction/valkyr-ai/releases">
  <img src="./docs/public/media/downloadformacos.png" alt="Download app for macOS" height="40">
</a>

<br />

[Installation](#installation) · [Features](#features) · [Providers](#providers) · [Contributing](#contributing) · [FAQ](#faq)

</div>

---

## What is Valkyr?

Valkyr is a desktop app that orchestrates multiple CLI coding agents (Claude Code, Codex, Qwen Code, Amp, and 15+ more) in parallel. Each agent runs in its own Git worktree so changes stay isolated. Hand off Linear, GitHub, or Jira tickets to an agent and review diffs side-by-side.

## Installation

### macOS

| Architecture | Download |
| --- | --- |
| Apple Silicon (arm64) | [valkyr-arm64.dmg](https://github.com/generalaction/valkyr-ai/releases/latest/download/valkyr-arm64.dmg) |
| Intel (x64) | [valkyr-x64.dmg](https://github.com/generalaction/valkyr-ai/releases/latest/download/valkyr-x64.dmg) |

Or install via Homebrew:

```bash
brew install --cask valkyr
```

### Linux

| Format | Download |
| --- | --- |
| AppImage (x64) | [valkyr-x64.AppImage](https://github.com/generalaction/valkyr-ai/releases/latest/download/valkyr-x64.AppImage) |
| Debian (x64) | [valkyr-x64.deb](https://github.com/generalaction/valkyr-ai/releases/latest/download/valkyr-x64.deb) |

### Windows

| Format | Download |
| --- | --- |
| Installer (x64) | [valkyr-x64.exe](https://github.com/generalaction/valkyr-ai/releases/latest/download/valkyr-x64.exe) |
| Portable (x64) | [valkyr-x64-portable.exe](https://github.com/generalaction/valkyr-ai/releases/latest/download/valkyr-x64-portable.exe) |

> **[All releases](https://github.com/generalaction/valkyr-ai/releases/latest)**

## Features

**Parallel agent execution** — Run multiple coding agents simultaneously, each in its own Git worktree. Changes stay isolated until you review and merge.

**20+ CLI providers** — Claude Code, Codex, Amp, Gemini, Qwen Code, Goose, Copilot, and more. Bring whichever agents you already use.

**Issue tracker integration** — Pass Linear, GitHub, or Jira tickets directly to an agent as context.

**Side-by-side diff review** — Review file changes across agents, approve or discard per-file, and open PRs from the app.

**Remote development via SSH** — Connect to remote servers with SSH agent, key, or password auth. Credentials stored securely in your OS keychain.

**Built-in code editor and terminal** — Monaco editor and xterm.js terminal for quick edits and debugging without leaving the app.

## Providers

<img alt="Providers banner" src="https://github.com/user-attachments/assets/c7b32a3e-452c-4209-91ef-71bcd895e2df" />

Valkyr supports 20 CLI providers. If yours is missing, [open an issue](https://github.com/generalaction/valkyr-ai/issues) or submit a PR.

| Provider | Install |
| --- | --- |
| [Amp](https://ampcode.com/manual) | `npm install -g @sourcegraph/amp@latest` |
| [Auggie](https://docs.augmentcode.com/cli/overview) | `npm install -g @augmentcode/auggie` |
| [Charm](https://github.com/charmbracelet/crush) | `npm install -g @charmland/crush` |
| [Claude Code](https://docs.anthropic.com/claude/docs/claude-code) | `curl -fsSL https://claude.ai/install.sh \| bash` |
| [Cline](https://docs.cline.bot/cline-cli/overview) | `npm install -g cline` |
| [Codebuff](https://www.codebuff.com/docs/help/getting-started) | `npm install -g codebuff` |
| [Codex](https://developers.openai.com/codex/cli/) | `npm install -g @openai/codex` |
| [Continue](https://docs.continue.dev/guides/cli) | `npm i -g @continuedev/cli` |
| [Cursor](https://cursor.com/cli) | `curl https://cursor.com/install -fsS \| bash` |
| [Droid](https://docs.factory.ai/cli/getting-started/quickstart) | `curl -fsSL https://app.factory.ai/cli \| sh` |
| [Gemini](https://github.com/google-gemini/gemini-cli) | `npm install -g @google/gemini-cli` |
| [GitHub Copilot](https://docs.github.com/en/copilot/how-tos/set-up/installing-github-copilot-in-the-cli) | `npm install -g @github/copilot` |
| [Goose](https://github.com/block/goose) | `curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh \| bash` |
| [Kilocode](https://kilo.ai/docs/cli) | `npm install -g @kilocode/cli` |
| [Kimi](https://www.kimi.com/coding/docs/en/kimi-cli.html) | `uv tool install --python 3.13 kimi-cli` |
| [Kiro](https://kiro.dev/docs/cli/) | `curl -fsSL https://cli.kiro.dev/install \| bash` |
| [Mistral Vibe](https://github.com/mistralai/mistral-vibe) | `curl -LsSf https://mistral.ai/vibe/install.sh \| bash` |
| [OpenCode](https://opencode.ai/docs/) | `npm install -g opencode-ai` |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `npm install -g @qwen-code/qwen-code` |
| [Rovo Dev](https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/) | `acli rovodev auth login` |

### Issue trackers

| Tool | Authentication |
| --- | --- |
| [Linear](https://linear.app) | Connect with a Linear API key |
| [Jira](https://www.atlassian.com/software/jira) | Site URL, email, and Atlassian API token |
| [GitHub Issues](https://docs.github.com/en/issues) | GitHub CLI (`gh auth login`) |

## Contributing

Contributions welcome! See the [Contributing Guide](CONTRIBUTING.md) to get started, and join our [Discord](https://discord.gg/f2fv7YxuR2) to discuss.

## FAQ

<details>
<summary><b>What telemetry do you collect and can I disable it?</b></summary>

> We send **anonymous, allow-listed events** (app start/close, feature usage names, app/platform versions) to PostHog.
> We **do not** send code, file paths, repo names, prompts, or PII.
>
> **Disable telemetry:**
>
> - In the app: **Settings > General > Privacy & Telemetry** (toggle off)
> - Or via env var before launch:
>
> ```bash
> TELEMETRY_ENABLED=false
> ```
>
> Full details: see `docs/telemetry.md`.
</details>

<details>
<summary><b>Where is my data stored?</b></summary>

> **App data is local-first.** State is stored in a local SQLite database:
>
> | Platform | Path |
> | --- | --- |
> | macOS | `~/Library/Application Support/valkyr/valkyr.db` |
> | Linux | `~/.config/valkyr/valkyr.db` |
> | Windows | `%APPDATA%\valkyr\valkyr.db` |
>
> **Privacy note:** Valkyr itself stores data locally, but when you use a coding agent (Claude Code, Codex, etc.), your code and prompts are sent to that provider's API servers. Each provider has their own data handling policies.
>
> You can reset the local DB by deleting the file (quit the app first). It is recreated on next launch.
</details>

<details>
<summary><b>Do I need GitHub CLI?</b></summary>

> Only if you want GitHub features (open PRs, fetch repo info, GitHub Issues integration).
>
> ```bash
> gh auth login
> ```
>
> If you don't use GitHub features, you can skip it.
</details>

<details>
<summary><b>How do I add a new provider?</b></summary>

> Valkyr is provider-agnostic and built to add CLIs quickly.
>
> 1. Open a PR following the [Contributing Guide](CONTRIBUTING.md).
> 2. Include: provider name, CLI command, auth notes, and setup steps.
> 3. We'll add it to the providers table and wire up selection in the UI.
>
> If you're unsure where to start, open an issue with the CLI's link and typical commands.
</details>

<details>
<summary><b>Native module crash (sqlite3 / node-pty / keytar)?</b></summary>

> This usually happens after switching Node or Electron versions.
>
> ```bash
> # Rebuild native modules
> pnpm run rebuild
>
> # If that fails, clean reinstall
> pnpm run reset
> ```
</details>

<details>
<summary><b>What permissions does Valkyr need?</b></summary>

> - **Filesystem/Git** — read/write your repo and create Git worktrees for isolation
> - **Network** — only for provider CLIs you choose to use and optional GitHub/Linear/Jira integration
> - **Local DB** — app state in SQLite on your machine
>
> Valkyr itself does **not** send your code or chats to any servers. Third-party CLIs may transmit data per their policies.
</details>

<details>
<summary><b>Can I work with remote projects over SSH?</b></summary>

> Yes. Go to **Settings > SSH Connections** and add your server details.
>
> **Authentication options:** SSH agent (recommended), private key, or password.
>
> **Requirements:**
> - SSH access to the remote server
> - Git installed on the remote server
> - For agent auth: SSH agent running with your key loaded (`ssh-add -l`)
>
> See [docs/ssh-setup.md](./docs/ssh-setup.md) for detailed setup and [docs/ssh-architecture.md](./docs/ssh-architecture.md) for technical details.
</details>

---

<div align="center">

[![Follow @rabanspiegel](https://img.shields.io/twitter/follow/rabanspiegel?style=social&label=Follow%20%40rabanspiegel)](https://x.com/rabanspiegel)
[![Follow @arnestrickmann](https://img.shields.io/twitter/follow/arnestrickmann?style=social&label=Follow%20%40arnestrickmann)](https://x.com/arnestrickmann)

</div>
