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

- A ChatbotX workspace API key (ChatbotX → Settings → Developer → API Keys). Prefer a read-only key
  for discovery and analytics tasks.
- A base API URL only for a self-hosted instance. SaaS defaults to `https://app.chatbotx.io/api`.
- Node.js (the CLI documents Node 24+, the MCP server requires Node 18+).

## Install

| Agent | Skills | MCP server |
|---|---|---|
| Claude Code | plugin (below) — installs both skills | started by the plugin; prompts only for the key |
| Cursor | plugin (below) — installs both skills | started by the plugin; prompts only for the key |
| Codex | `npx skills add ChatbotXIO/chatbotx-agent` → `.agents/skills/` | `~/.codex/config.toml` block below |
| Windsurf, Gemini CLI, Copilot, others | `npx skills add ChatbotXIO/chatbotx-agent` | generic `mcp.json` block below |
| Grok | `.grok-plugin/` manifest | included in the manifest |
| Gemini CLI extension | — | `gemini-extension.json` |

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

The plugin loads both skills and starts the ChatbotX MCP server. Claude Code asks only for the API
key when the plugin is enabled (`userConfig`); the key is stored in secure storage. The server uses
the SaaS URL by default. To use the MCP server without the plugin:

```bash
claude mcp add chatbotx \
  -e CHATBOTX_API_KEY=<your-token> \
  -e CHATBOTX_API_URL=https://app.chatbotx.io/api \
  -e CHATBOTX_MCP_TRANSPORT=stdio \
  -s user \
  -- npx -y chatbotx-mcp
```

### Cursor

This repo ships a Cursor plugin at `.cursor-plugin/` (skills + MCP server + variables). Local install:

```bash
git clone https://github.com/ChatbotXIO/chatbotx-agent.git
mkdir -p ~/.cursor/plugins/local
ln -s "$(pwd)/chatbotx-agent" ~/.cursor/plugins/local/chatbotx
```

Restart Cursor or run **Developer: Reload Window**, then set `CHATBOTX_API_KEY` in the plugin
configuration UI. For a self-hosted instance, replace the API URL in `.cursor-plugin/mcp.json`.

### Codex

```bash
npx skills add ChatbotXIO/chatbotx-agent   # skills → .agents/skills/
```

Then add the MCP server to `~/.codex/config.toml`:

```toml
[mcp_servers.chatbotx]
command = "npx"
args = ["-y", "chatbotx-mcp"]
env = { CHATBOTX_API_KEY = "<your-token>", CHATBOTX_API_URL = "https://app.chatbotx.io/api", CHATBOTX_MCP_TRANSPORT = "stdio" }
```

### Generic MCP clients (Windsurf, Gemini CLI, Copilot, ...)

Install the skills with `npx skills add` as above, then register the stdio server. `mcp.json` at the
repository root holds this block:

```json
{
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
  chatbotx/            CLI skill: SKILL.md, references/commands.md, skill-card.md
  chatbotx-mcp/        MCP skill: SKILL.md, skill-card.md
.claude-plugin/        Claude Code plugin + marketplace (skills + mcpServers + userConfig)
.cursor-plugin/        Cursor plugin + marketplace + mcp.json
.grok-plugin/          Grok plugin + marketplace + mcp.json
gemini-extension.json  Gemini CLI extension (MCP server)
mcp.json               Generic stdio MCP config
```

There is deliberately no `SKILL.md` at the repository root: a root skill would shadow `skills/` for
`npx skills add` and make the whole repository install as one skill.

## Publishing

### skills.sh

No publish step. Push this public repository; `npx skills add ChatbotXIO/chatbotx-agent` reads `skills/`.

### ClawHub

```bash
clawhub skill publish skills/chatbotx --version 1.1.1 --dry-run --json
clawhub skill publish skills/chatbotx-mcp --version 1.1.1 --dry-run --json

clawhub skill publish skills/chatbotx --version 1.1.1 --changelog "Default SaaS API URL; only prompt for the API key"
clawhub skill publish skills/chatbotx-mcp --version 1.1.1 --changelog "Default SaaS API URL; only prompt for the API key"
```

### Cursor Marketplace

Submit this repository at <https://cursor.com/marketplace/publish>. Cursor reads
`.cursor-plugin/plugin.json`, `.cursor-plugin/marketplace.json`, and `.cursor-plugin/mcp.json`.

### npm prerequisite

Every manifest starts the server with `npx -y chatbotx-mcp`, so `chatbotx-mcp` must be published to
npm before marketplace submission:

```bash
npm view chatbotx-mcp version
```

## Safety

ChatbotX agents can mutate live workspace data and send messages to real contacts. Use
least-privilege workspace API keys, verify recipient/audience counts before writes, and prefer
read-only tokens for discovery tasks.
