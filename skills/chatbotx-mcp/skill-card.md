# Skill Card

## Description

ChatbotX MCP exposes ChatbotX workspace operations as Model Context Protocol tools so AI agents and IDEs can manage contacts, conversations, flows, broadcasts, sequences, analytics, and workspace automation with scope-aware API access.

This skill is ready for commercial/non-commercial use.

## Owner

ChatbotXIO — ChatbotX agent distribution maintainers (github.com/ChatbotXIO/chatbotx-agent).

## License/Terms of Use

This skill package (SKILL.md, skill-card.md, and this folder) is published to ClawHub under MIT-0, per ClawHub's publishing policy. The underlying `chatbotx-mcp` npm package and the ChatbotX platform it talks to are licensed separately. Using this skill requires a ChatbotX workspace and API key subject to ChatbotX's own terms of service.

## Use Case

External developers and AI agents that already hold a ChatbotX workspace API key and want MCP-native access to workspace discovery, contact management, messaging, flows, sequences, broadcasts, analytics, and related automation.

## Deployment Geography for Use

Global — the MCP server talks to whatever `CHATBOTX_API_URL` is configured (ChatbotX SaaS or a self-hosted instance); it has no built-in geographic restriction.

### Requirements / Dependencies

Requires API Key or External Credential: Yes
Credential Type(s): API key (ChatbotX workspace API key, `CHATBOTX_API_KEY`)

Runtime dependency: Node.js and the `chatbotx-mcp` npm package. The plugin manifests start it with `npx -y chatbotx-mcp`.

Do not include secrets in prompts/logs/output; use a least-privilege workspace API key; rotate keys as appropriate.

## Known Risks and Mitigations

Risk: MCP tools can send real messages, trigger flows/sequences, and affect live contacts.
Mitigation: Resolve exact contact/audience/inbox IDs first, inspect `token_get`, and verify mutations with a follow-up read.

Risk: `search_tools` + `call_tool` can reach non-default tools including destructive operations.
Mitigation: Fetch the current resource first, verify the ID, and prefer read-only tokens unless a write is required.

Risk: Flow publishing can alter production automation behavior.
Mitigation: Call `schemas_flow_spec` before generating specs and `flows_validate` before `flows_publish`.

Risk: Credentials are passed through environment variables to the local MCP server.
Mitigation: Use the host IDE/plugin secret configuration, avoid committing `mcp.json` with real values, and scope API keys to the minimum necessary permissions.

## References

- This skill's `SKILL.md` — setup, default tool list, and MCP workflow.
- Source MCP server: https://github.com/ChatbotXIO/ChatbotX/tree/main/apps/mcp-server
- ChatbotX agent distribution: https://github.com/ChatbotXIO/chatbotx-agent

## Skill Output

Output type(s): MCP tool calls, structured JSON API data, Markdown guidance.

Output format: MCP tool results contain JSON/text content returned from ChatbotX API operations. Errors surface through MCP tool error responses or ChatbotX API status payloads.

Other properties: Write tools mutate live workspace data and some trigger outbound messages to real users; there is no universal dry-run mode.

## Ethical Considerations

ChatbotXIO treats safe customer-messaging automation as a shared responsibility. Agents operating this skill should confirm authorization, comply with messaging and anti-spam rules, avoid production broadcasts without human review, and protect workspace credentials.
