// The one place to edit the plugin listing copy. Every plugin manifest in this repository carries
// these exact strings; `npm run sync:manifests` writes them and `npm run check:manifests` (CI)
// fails when a manifest drifts.
//
// SUMMARY is the short line. It must fit OpenAI's final `interface.shortDescription` limit
// (30 characters). DESCRIPTION is the one-sentence description every manifest's `description`
// field uses. It names no client-specific surface (CLI, MCP, ChatGPT) so it is true for every
// plugin. Skill descriptions (SKILL.md) are trigger text for one skill each and are not synced.

export const SUMMARY = "Run your ChatbotX workspace";

export const DESCRIPTION =
  "Operate a ChatbotX omnichannel chatbot workspace from your AI agent: contacts, conversations, flows, broadcasts, sequences, pipelines, and analytics.";

export const SUMMARY_MAX = 30;
export const DESCRIPTION_MAX = 1024;
