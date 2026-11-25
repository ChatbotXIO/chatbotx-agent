# ChatbotX plugin for Claude Code

Generated directory. Do not edit `skills/` here: edit the top-level `skills/` folder, then run
`npm run build:claude-plugin`. CI fails if this copy is out of date.

This copy keeps only the `name`, `description` and `license` frontmatter keys (the Claude plugin
directory refuses `allowed-tools` beyond Read/Grep/Glob/LS from unverified organizations), and ships
Markdown and JSON only. The top-level `skills/` folder keeps the extra frontmatter that ClawHub reads.

The bundled MCP server is the ChatbotX Claude profile, `https://app.chatbotx.io/mcp/claude`: a
fixed set of ChatbotX tools for contacts, conversations, flows, sequences, broadcasts, pipelines,
and analytics, signed in with OAuth. Reads run without a prompt; every tool that changes data asks
first.

Install:

```
/plugin marketplace add ChatbotXIO/chatbotx-agent
/plugin install chatbotx@chatbotx-agent
```

See the [main README](https://github.com/ChatbotXIO/chatbotx-agent) for details.
