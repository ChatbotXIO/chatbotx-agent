# Changelog

## Unreleased

## 1.2.0

- Plugins now connect to the hosted ChatbotX MCP server (`https://app.chatbotx.io/mcp/messages`,
  Streamable HTTP) and sign in with OAuth in the browser. No API key prompt and no local Node.js.
  The Claude Code `userConfig.api_key` and the Cursor `CHATBOTX_API_KEY` variable are removed.
  Gemini uses `httpUrl`; Cursor's `mcp.json` now uses the `mcpServers` wrapper.
- Added a portable root `plugin.json` + `mcp.json` (Agent Plugins schema) so Codex and compatible
  hosts can install the repo as a plugin. The root `mcp.json` is no longer a stdio snippet.
- The stdio server (`npx -y chatbotx-mcp` + API key, Node.js 24+) is documented as the fallback for
  self-hosted instances, CI, and headless agents.
- `chatbotx-mcp` skill: OAuth setup and workspace binding, the `CONFIRMATION_REQUIRED` /
  `_confirm: true` approval flow, the `get_guide` meta-tool, and the Connections, Mini Apps, and
  Pipelines default tools (52 total).
- `chatbotx` skill: documented against CLI 1.17.1. Updated the renamed commands (`appointments
  cancel add`, `coupon-topics archive add`, `questionnaires duplicate add`), the new bot-field,
  contact custom-field, flow-stats reset, and ads conversion-rule/campaign commands, and trimmed
  the collision list to the five that still exist.
- README install table covers Claude Code, Claude.ai/Desktop, ChatGPT, Cursor, Codex, VS Code,
  Gemini CLI, Windsurf, OpenCode, and Grok.
- Claude plugin: added `privacyPolicyUrl`; `assets/logo.svg` no longer uses a `<style>` block, so
  the plugin directory accepts it as an icon.

- Added an upstream drift check (`scripts/upstream/`, `.github/workflows/upstream-drift.yml`,
  `upstream.json`): a daily job compares the live, published `chatbotx` CLI and the live
  `chatbotx-mcp` default tool set against the docs in `skills/`, and opens/closes a single
  `upstream-drift`-labeled issue when they disagree. Run locally with `npm run check:upstream`.
  This is tooling only — it does not change any skill's published content or `version:`.

## 1.1.1

- `chatbotx` skill: moved the per-command catalog to `skills/chatbotx/references/commands.md` and
  kept a one-line-per-group index in `SKILL.md`. The 1.1.0 note below announced this move, but the
  file did not ship until now.
- Default MCP and CLI skill configuration to `https://app.chatbotx.io/api`; SaaS users now provide
  only an API key. Self-hosted instances still set their explicit `/api` URL.

## 1.1.0

- Removed the root `SKILL.md`. Skills now live only under `skills/`, so `npx skills add
  ChatbotXIO/chatbotx-agent` lists both `chatbotx` and `chatbotx-mcp`, installs only the skill folder,
  and no longer needs `--full-depth`.
- `chatbotx` skill is CLI-only: the command catalog stays in `SKILL.md` (moved to `references/` in 1.1.1),
  agents discover flags with `--help`, and the skill auto-installs the CLI when it is missing.
- Both skills state when to switch to the other transport (MCP tools connected vs bulk/CLI work).
- Claude Code plugin now starts the ChatbotX MCP server and prompts for the API key and URL via
  `userConfig`, matching the Cursor, Grok, and Gemini manifests.
- README documents installs per agent (Claude Code, Cursor, Codex, Windsurf, Gemini CLI, Grok).
- Ignore local `npx skills add .` artifacts (`.agents/`, `.claude/`, `skills-lock.json`).

## 1.0.0

- Initial ChatbotX agent distribution repository.
- Published public `chatbotx` and `chatbotx-mcp` skills.
- Added a root `SKILL.md` (copy of `skills/chatbotx/SKILL.md`) so `npx skills add ChatbotXIO/chatbotx-agent` installs the CLI skill directly.
- Added Cursor, Claude Code, Grok, Gemini, and generic MCP manifests.
