<p align="center">
  <img src="assets/logo.svg" alt="ChatbotX" width="96" />
</p>

# ChatbotX Agent

Agent-facing distribution for ChatbotX. This repository publishes two public skills plus the plugin
manifests that connect AI coding agents to a ChatbotX workspace:

- `skills/chatbotx` — drive the `chatbotx` CLI from an agent's shell. Terminal agents, bulk work,
  scripted pipelines.
- `skills/chatbotx-mcp` — use the ChatbotX MCP server's tools from MCP-capable agents and IDEs.

IDE/ADE plugins ship **both** skills together with the MCP server: MCP provides the connection,
the skills teach the agent the workflow (discover → resolve ids → act → verify) and when to fall back
to the CLI. This mirrors how Stripe, Sentry, Supabase, and Cloudflare distribute their agent plugins.

The ChatbotX product source stays in [`ChatbotXIO/ChatbotX`](https://github.com/ChatbotXIO/ChatbotX).
This repository intentionally excludes internal development skills.

## Prerequisites

- A ChatbotX account that is an **owner or super admin** of the workspace you want to connect.
  The hosted MCP server signs in with OAuth in the browser and binds the connection to the
  workspace you pick on the consent screen. To switch workspaces, disconnect and connect again.
- Only for the CLI or the local stdio MCP server: a workspace API key (ChatbotX → Settings →
  Developer → API Keys; prefer a read-only key for discovery and analytics) and Node.js 24+.

## MCP endpoints

| Transport | URL | Use for |
|---|---|---|
| Streamable HTTP | `https://app.chatbotx.io/mcp/messages` | every modern MCP client (default in all manifests here) |
| SSE (legacy) | `https://app.chatbotx.io/mcp/sse` | ChatGPT connectors and clients that only speak SSE |
| stdio | `npx -y chatbotx-mcp` + `CHATBOTX_API_KEY` | self-hosted instances, CI, headless agents |

Grants can be revoked in ChatbotX → Settings → Integrations → ChatbotX MCP.

## Install

| Agent | Skills | MCP server | Sign in |
|---|---|---|---|
| Claude Code | plugin (below) | bundled in the plugin | `/mcp` → chatbotx → Authenticate |
| Claude.ai / Claude Desktop | upload or `npx skills add` | Settings → Connectors → Add custom connector | browser |
| ChatGPT | — | Settings → Connectors → custom connector, `…/mcp/sse` | browser |
| Cursor | plugin (below) | bundled in the plugin | Cursor prompts on first use |
| Codex | plugin (root `plugin.json`) or `npx skills add` | bundled, or `config.toml` below | `codex mcp login chatbotx` |
| VS Code / GitHub Copilot | `npx skills add` | `.vscode/mcp.json` below | browser on first connect |
| Gemini CLI | `npx skills add` | `gemini extensions install` (below) | `/mcp auth chatbotx` |
| Antigravity | plugin (`.antigravity-plugin/`) | bundled (root `mcp_config.json`) | browser on first use |
| Windsurf | `npx skills add` | `mcp_config.json` below | Cascade prompts on first use |
| OpenCode | `npx skills add` | `opencode.json` below | `opencode mcp auth chatbotx` |
| Grok | `.grok-plugin/` manifest | bundled in the manifest | browser on first use |

### Skills (any agent that reads `SKILL.md`)

```bash
# Pick one or both skills interactively
npx skills add ChatbotXIO/chatbotx-agent

# Or install a specific one
npx skills add ChatbotXIO/chatbotx-agent --skill chatbotx
npx skills add ChatbotXIO/chatbotx-agent --skill chatbotx-mcp

# List what this repo publishes
npx skills add ChatbotXIO/chatbotx-agent --list
```

Installing the `chatbotx` skill does not install the `chatbotx` binary. The skill tells the agent to
run `npm install -g chatbotx` on first use if the command is missing.

### Claude Code

```bash
/plugin marketplace add ChatbotXIO/chatbotx-agent
/plugin install chatbotx@chatbotx-agent
```

The plugin loads both skills and connects to the hosted MCP server. Run `/mcp`, pick `chatbotx`,
and authenticate in the browser. No API key is stored. Without the plugin:

```bash
claude mcp add chatbotx -t http -s user https://app.chatbotx.io/mcp/messages
```

### Claude.ai, Claude Desktop, ChatGPT

Add a custom connector in the app's settings. Use `https://app.chatbotx.io/mcp/messages` for Claude
and `https://app.chatbotx.io/mcp/sse` for ChatGPT. The app completes OAuth in the browser.

### Cursor

This repo ships a Cursor plugin at `.cursor-plugin/` (skills + hosted MCP server). Local install:

```bash
git clone https://github.com/ChatbotXIO/chatbotx-agent.git
mkdir -p ~/.cursor/plugins/local
ln -s "$(pwd)/chatbotx-agent" ~/.cursor/plugins/local/chatbotx
```

Restart Cursor or run **Developer: Reload Window**, then sign in when Cursor asks. MCP only, in
`~/.cursor/mcp.json`:

```json
{ "mcpServers": { "chatbotx": { "url": "https://app.chatbotx.io/mcp/messages" } } }
```

### Codex

The repository root is a portable plugin (`plugin.json`, `mcp.json`, `skills/`), and Codex also
reads `.claude-plugin/marketplace.json`:

```bash
codex plugin marketplace add ChatbotXIO/chatbotx-agent
```

Or configure the server directly in `~/.codex/config.toml` and install the skills with
`npx skills add`:

```toml
[mcp_servers.chatbotx]
url = "https://app.chatbotx.io/mcp/messages"
```

```bash
codex mcp login chatbotx
```

### VS Code / GitHub Copilot

`.vscode/mcp.json` (or run `code --add-mcp '{"name":"chatbotx","type":"http","url":"https://app.chatbotx.io/mcp/messages"}'`):

```json
{ "servers": { "chatbotx": { "type": "http", "url": "https://app.chatbotx.io/mcp/messages" } } }
```

### Gemini CLI

```bash
gemini extensions install https://github.com/ChatbotXIO/chatbotx-agent
```

`gemini-extension.json` registers the server with `httpUrl` (Gemini treats `url` as SSE). Run
`/mcp auth chatbotx` to sign in.

### Antigravity

```bash
agy plugin install https://github.com/ChatbotXIO/chatbotx-agent
```

Antigravity reads `.antigravity-plugin/plugin.json` (it takes precedence over the root `plugin.json`,
which stays the Agent Plugins manifest for Codex), loads `skills/`, and registers the hosted server
from the root `mcp_config.json` (`serverUrl`, Streamable HTTP).

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{ "mcpServers": { "chatbotx": { "serverUrl": "https://app.chatbotx.io/mcp/messages" } } }
```

### OpenCode

`opencode.json`:

```json
{ "mcp": { "chatbotx": { "type": "remote", "url": "https://app.chatbotx.io/mcp/messages" } } }
```

### Self-hosted, CI, or API key (stdio)

Use the local server when the hosted endpoint is not an option: a self-hosted ChatbotX, a headless
agent, or CI. It needs Node.js 24+ and a workspace API key. Replace the URL for a self-hosted
instance (keep the `/api` suffix).

```json
{
  "mcpServers": {
    "chatbotx": {
      "command": "npx",
      "args": ["-y", "chatbotx-mcp"],
      "env": {
        "CHATBOTX_API_KEY": "<your-workspace-token>",
        "CHATBOTX_API_URL": "https://app.chatbotx.io/api",
        "CHATBOTX_MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

```bash
claude mcp add chatbotx \
  -e CHATBOTX_API_KEY=<your-token> \
  -e CHATBOTX_API_URL=https://app.chatbotx.io/api \
  -e CHATBOTX_MCP_TRANSPORT=stdio \
  -s user \
  -- npx -y chatbotx-mcp
```

### CLI only

```bash
npm install -g chatbotx
chatbotx config set --apiKey <your-workspace-token> --apiUrl https://app.chatbotx.io/api
chatbotx capabilities list
```

## Repository layout

```
skills/
  chatbotx/               CLI skill: SKILL.md, references/commands.md, skill-card.md
  chatbotx-mcp/           MCP skill: SKILL.md, skill-card.md
plugin.json, mcp.json     Portable Agent Plugins manifest + hosted MCP server (Codex and compatible hosts)
.claude-plugin/           Claude Code plugin + marketplace (skills + hosted MCP server)
.cursor-plugin/           Cursor plugin + marketplace + mcp.json
.grok-plugin/             Grok plugin + marketplace + mcp.json
gemini-extension.json     Gemini CLI extension (hosted MCP server)
.antigravity-plugin/      Antigravity plugin manifest (uses root mcp_config.json + skills/)
mcp_config.json           Antigravity hosted MCP server
upstream.json             Pinned chatbotx / chatbotx-mcp npm versions the skills are documented against
scripts/upstream/         Upstream drift check (see "Keeping in sync with upstream" below)
.github/workflows/        Scheduled drift check (upstream-drift.yml)
```

There is deliberately no `SKILL.md` at the repository root: a root skill would shadow `skills/` for
`npx skills add` and make the whole repository install as one skill.

## Keeping in sync with upstream

The `chatbotx` CLI and `chatbotx-mcp` server (both in
[`ChatbotXIO/ChatbotX`](https://github.com/ChatbotXIO/ChatbotX)) generate their command/tool surface
at runtime from the live `GET {API_URL}/public-spec.json`. That means this repo's docs can drift from
what an agent actually sees in two independent ways:

1. **The public API changes** — an operation is added, removed, renamed, or its
   `x-mcp.visibility` flips — and the live surface changes immediately, with no npm publish.
2. **The `chatbotx` / `chatbotx-mcp` packages publish a new version** — global flags, Node version
   requirements, or the command-name-collision logic change.

`upstream.json` pins the npm versions the docs in `skills/` are currently written against.
`.github/workflows/upstream-drift.yml` runs daily (and on demand via `workflow_dispatch`), and:

- collects the *actual* CLI surface by running the published `chatbotx` binary's `--help` recursively
  and reading `duplicate command name` warnings off stderr, and the *actual* MCP default tool set by
  fetching `public-spec.json` directly and filtering `x-mcp.visibility: "default"` operations;
- compares that live surface against `skills/chatbotx/references/commands.md`, the
  `## Command-name collisions` section of `skills/chatbotx/SKILL.md`, and the default-tools table in
  `skills/chatbotx-mcp/SKILL.md`, plus the version pinned in `upstream.json`;
- opens or updates a single GitHub issue labeled `upstream-drift` describing exactly what changed,
  and closes it automatically once a later run finds the docs match again.

This repo is pull-only with respect to `ChatbotXIO/ChatbotX` — it has no push access there and no
cross-repo token, so it never edits that repo. A `repository_dispatch` trigger (`upstream-published`)
is wired up so that repo could push an immediate check instead of waiting for the next scheduled run,
but nothing there calls it yet.

Run the check locally:

```bash
npm test                 # parser unit tests (scripts/upstream/__tests__/)
npm run check:upstream   # full check against the live CLI + MCP spec; prints a report, exits 1 on drift
```

When the check finds drift, resolve it by:

1. Updating the affected file(s) the report names.
2. Bumping `upstream.json` (and the `version:` field in the affected skill's `SKILL.md`,
   `.claude-plugin/plugin.json`, root `plugin.json`, the `plugins[].version` fields in `.cursor-plugin/marketplace.json`
   and `.grok-plugin/marketplace.json`, `gemini-extension.json`, and `.antigravity-plugin/plugin.json`) to the live npm version.
3. Adding a `CHANGELOG.md` entry.
4. Merging — the next scheduled run closes the drift issue automatically.

## Publishing

### skills.sh

No publish step. Push this public repository; `npx skills add ChatbotXIO/chatbotx-agent` reads `skills/`.

### ClawHub

```bash
clawhub skill publish skills/chatbotx --version 1.2.0 --dry-run --json
clawhub skill publish skills/chatbotx-mcp --version 1.2.0 --dry-run --json

clawhub skill publish skills/chatbotx --version 1.2.0 --changelog "Hosted MCP server with OAuth by default; CLI 1.17 catalog"
clawhub skill publish skills/chatbotx-mcp --version 1.2.0 --changelog "Hosted MCP server with OAuth by default; CLI 1.17 catalog"
```

### Cursor Marketplace

Submit this repository at <https://cursor.com/marketplace/publish>. Cursor reads
`.cursor-plugin/plugin.json`, `.cursor-plugin/marketplace.json`, and `.cursor-plugin/mcp.json`.

### Before announcing a release

Every manifest connects to the hosted server, so check it is up and advertises HTTPS metadata:

```bash
curl -si -X POST https://app.chatbotx.io/mcp/messages | grep -i www-authenticate
curl -s https://app.chatbotx.io/.well-known/oauth-protected-resource/mcp/messages
```

The stdio fallback still uses `npx -y chatbotx-mcp`; `npm view chatbotx-mcp version` should match
`upstream.json`.

## Safety

ChatbotX agents can mutate live workspace data and send messages to real contacts. Use
least-privilege workspace API keys, verify recipient/audience counts before writes, and prefer
read-only tokens for discovery tasks.
