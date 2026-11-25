// Builds the Claude plugin directory (plugins/chatbotx/skills) from the canonical skills/ tree.
//
// Each skill's Markdown body is copied as is, apart from the manual MCP setup sections (see
// toBundledServerSkill), so skills/ stays the only place to edit skills.
// The SKILL.md frontmatter keeps only name, description and license (claude.ai, Cowork and the
// plugin directory reject or refuse other keys); ClawHub-only keys stay in skills/. ClawHub listing files (skill-card.md) are left out.
//
// It also copies the root portable manifest (plugin.json, mcp.json) and LICENSE, so hosts that read
// .claude-plugin/marketplace.json as a portable plugin (Codex) still find the MCP server.
//
// Usage: node scripts/claude-plugin/build.mjs          write the generated files
//        node scripts/claude-plugin/build.mjs --check  exit 1 if the output is out of date

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE_DIR = join(REPO_ROOT, "skills");
const PLUGIN_DIR = join(REPO_ROOT, "plugins", "chatbotx");
const OUTPUT_DIR = join(PLUGIN_DIR, "skills");
const COPIED_ROOT_FILES = ["plugin.json", "mcp.json", "LICENSE"];
const REQUIRED_FRONTMATTER_KEYS = ["name", "description"];
// https://code.claude.com/docs/en/skills.md: the portable SKILL.md frontmatter.
// Kept to the minimum the Claude plugin directory accepts from unverified organizations: it refuses
// `allowed-tools` beyond Read/Grep/Glob/LS, so that key (and the extras) stay in skills/ only.
export const PORTABLE_FRONTMATTER_KEYS = new Set(["name", "description", "license"]);
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const TOP_LEVEL_KEY = /^([A-Za-z][\w-]*):/;
// skill-card.md is ClawHub listing copy, not something the agent loads.
const EXCLUDED_FILES = new Set(["skill-card.md"]);

// The plugin declares the ChatbotX MCP server itself (plugins/chatbotx/.claude-plugin/plugin.json),
// so its skills must not tell anyone to add a server by hand: the directory review rejects text that
// points at an MCP server the plugin does not declare (a `claude mcp add` URL, a local stdio server).
const BUNDLED_SERVER_SECTIONS = new Map([
  [
    "Setup",
    [
      "## Setup",
      "",
      "This plugin already declares the ChatbotX MCP server, so there is nothing to add or install.",
      "On first use the client opens a browser:",
      "",
      "1. Sign in to ChatbotX.",
      "2. Pick the workspace on the consent screen. Only workspace owners and super admins can authorize.",
      "3. Every token acts on that one workspace. To switch workspaces, disconnect the server and connect again.",
      "",
      "If the tools are not connected yet, run `/mcp` in Claude Code and sign in to `chatbotx`.",
      "",
      "",
    ].join("\n"),
  ],
  [
    "MCP alternative",
    [
      "## MCP alternative",
      "",
      "The ChatbotX MCP tools bundled with this plugin expose the same workspace API as the CLI,",
      "signed in with OAuth in the browser, so no API key is needed. Prefer the CLI for bulk work,",
      "scripts, and pipelines.",
      "",
      "",
    ].join("\n"),
  ],
]);
const STDIO_LINE = /^- stdio .*(?:\n {2}.*)*\n?/gm;

// Replaces the manual-setup sections of a skill body with the bundled-server wording.
// `Setup` is replaced only in the MCP skill: the CLI skill's Setup installs the `chatbotx` CLI.
export function toBundledServerSkill(markdown) {
  let out = markdown;
  const isMcpSkill = /^name: chatbotx-mcp$/m.test(markdown);
  for (const [heading, replacement] of BUNDLED_SERVER_SECTIONS) {
    if (heading === "Setup" && !isMcpSkill) continue;
    const section = new RegExp(`^## ${heading}\\r?\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m");
    out = out.replace(section, () => replacement);
  }
  return out.replace(STDIO_LINE, "");
}

// Returns the SKILL.md unchanged after checking it has the keys every host requires.
export function validateSkill(markdown, sourceLabel = "SKILL.md") {
  const match = markdown.match(FRONTMATTER);
  if (!match) {
    throw new Error(`${sourceLabel}: missing YAML frontmatter`);
  }
  const lines = match[1].split(/\r?\n/);
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (!lines.some((line) => line.startsWith(`${key}:`))) {
      throw new Error(`${sourceLabel}: frontmatter has no \`${key}:\``);
    }
  }
  return markdown;
}

// Drops every top-level frontmatter key outside PORTABLE_FRONTMATTER_KEYS, together with its
// indented or continuation lines. The body after the closing --- is untouched.
export function toPortableSkill(markdown, sourceLabel = "SKILL.md") {
  const match = validateSkill(markdown, sourceLabel).match(FRONTMATTER);
  const kept = [];
  let keepCurrent = false;
  for (const line of match[1].split(/\r?\n/)) {
    const key = line.match(TOP_LEVEL_KEY)?.[1];
    if (key) keepCurrent = PORTABLE_FRONTMATTER_KEYS.has(key);
    if (keepCurrent) kept.push(line);
  }
  return `---\n${kept.join("\n")}\n---\n${markdown.slice(match[0].length)}`;
}

function listMarkdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(fullPath);
    if (!entry.name.endsWith(".md") || EXCLUDED_FILES.has(entry.name)) return [];
    return [fullPath];
  });
}

export function buildOutputs() {
  const outputs = new Map();
  for (const sourcePath of listMarkdownFiles(SOURCE_DIR)) {
    const relPath = relative(SOURCE_DIR, sourcePath);
    const content = readFileSync(sourcePath, "utf8");
    const isSkillFile = relPath.endsWith("SKILL.md");
    outputs.set(relPath, isSkillFile ? toBundledServerSkill(toPortableSkill(content, `skills/${relPath}`)) : content);
  }
  return outputs;
}

export function buildRootCopies() {
  return new Map(
    COPIED_ROOT_FILES.map((name) => [name, readFileSync(join(REPO_ROOT, name), "utf8")]),
  );
}

function readExistingOutputs() {
  if (!existsSync(OUTPUT_DIR)) return new Map();
  return new Map(
    listMarkdownFiles(OUTPUT_DIR).map((p) => [relative(OUTPUT_DIR, p), readFileSync(p, "utf8")]),
  );
}

function readExistingRootCopies() {
  return new Map(
    COPIED_ROOT_FILES.filter((name) => existsSync(join(PLUGIN_DIR, name))).map((name) => [
      name,
      readFileSync(join(PLUGIN_DIR, name), "utf8"),
    ]),
  );
}

function findDrift(expected, actual) {
  const paths = new Set([...expected.keys(), ...actual.keys()]);
  return [...paths].filter((p) => expected.get(p) !== actual.get(p)).sort();
}

function main() {
  const expected = buildOutputs();
  const rootCopies = buildRootCopies();
  if (process.argv.includes("--check")) {
    const drift = [
      ...findDrift(expected, readExistingOutputs()).map((p) => `skills/${p}`),
      ...findDrift(rootCopies, readExistingRootCopies()),
    ];
    if (drift.length > 0) {
      console.error("plugins/chatbotx is out of date with the repository root:");
      drift.forEach((p) => console.error(`  ${p}`));
      console.error("Run: npm run build:claude-plugin");
      process.exit(1);
    }
    return;
  }
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  for (const [relPath, content] of expected) {
    const outPath = join(OUTPUT_DIR, relPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, content, "utf8");
  }
  for (const [name, content] of rootCopies) {
    writeFileSync(join(PLUGIN_DIR, name), content, "utf8");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
