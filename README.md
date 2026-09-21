<p align="center">
  <img src="assets/logo.svg" alt="ChatbotX" width="96" />
</p>

# ChatbotX Agent

Agent-facing distribution for ChatbotX. This repository publishes only two public skills and the IDE/ADE plugin manifests needed to connect AI agents to ChatbotX:

- `chatbotx-cli` — use the `chatbotx` CLI from an agent terminal.
- `chatbotx-mcp` — use ChatbotX MCP tools from MCP-capable agents and IDEs.

The ChatbotX product source stays in [`ChatbotXIO/ChatbotX`](https://github.com/ChatbotXIO/ChatbotX). This repository intentionally excludes internal development skills.

## Install as skills

```bash
npx skills add ChatbotXIO/chatbotx-agent --skill chatbotx-cli
npx skills add ChatbotXIO/chatbotx-agent --skill chatbotx-mcp

# List what this repo publishes
npx skills add ChatbotXIO/chatbotx-agent --list
```

Expected list: `chatbotx-cli` and `chatbotx-mcp` only.

## Claude Code plugin

```bash
/plugin marketplace add ChatbotXIO/chatbotx-agent
/plugin install chatbotx@chatbotx-agent
```

## Cursor plugin

This repo ships a Cursor plugin manifest at `.cursor-plugin/plugin.json`.

Local development install:

```bash
git clone https://github.com/ChatbotXIO/chatbotx-agent.git
mkdir -p ~/.cursor/plugins/local
ln -s "$(pwd)/chatbotx-agent" ~/.cursor/plugins/local/chatbotx
```

Then restart Cursor or run **Developer: Reload Window**. Configure `CHATBOTX_API_KEY` and `CHATBOTX_API_URL` from Cursor's plugin configuration UI.

## CLI

```bash
npm install -g chatbotx
chatbotx config set --apiKey <your-workspace-token> --apiUrl https://app.chatbotx.io/api
chatbotx capabilities list
```

## MCP server

The plugin starts the local stdio MCP server through npm:

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

For generic MCP clients, use `mcp.json` at the repository root.

Prerequisite: `chatbotx-mcp` must be published to npm before public marketplace submission. In the product repository, run the MCP npm publish workflow first, then verify:

```bash
npm view chatbotx-mcp version
```

## Publishing

### skills.sh

No separate publish command is required. Push this public repository and install with `npx skills add`.

### ClawHub

```bash
clawhub skill publish skills/chatbotx-cli --version 1.0.0 --dry-run --json
clawhub skill publish skills/chatbotx-mcp --version 1.0.0 --dry-run --json

clawhub skill publish skills/chatbotx-cli --version 1.0.0 --changelog "Initial ChatbotX CLI skill"
clawhub skill publish skills/chatbotx-mcp --version 1.0.0 --changelog "Initial ChatbotX MCP skill"
```

### Cursor Marketplace

Submit this repository at <https://cursor.com/marketplace/publish>. Cursor reads `.cursor-plugin/plugin.json`, `.cursor-plugin/marketplace.json`, and `.cursor-plugin/mcp.json`.

## Safety

ChatbotX agents can mutate live workspace data and send messages to real contacts. Use least-privilege workspace API keys, verify recipient/audience counts before writes, and prefer read-only tokens for discovery tasks.
