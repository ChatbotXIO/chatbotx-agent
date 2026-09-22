# Changelog

## 1.1.1

- Default MCP and CLI skill configuration to `https://app.chatbotx.io/api`; SaaS users now provide
  only an API key. Self-hosted instances still set their explicit `/api` URL.

## 1.1.0

- Removed the root `SKILL.md`. Skills now live only under `skills/`, so `npx skills add
  ChatbotXIO/chatbotx-agent` lists both `chatbotx` and `chatbotx-mcp`, installs only the skill folder,
  and no longer needs `--full-depth`.
- `chatbotx` skill is CLI-only: moved the command catalog to `skills/chatbotx/references/commands.md`,
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
