#!/usr/bin/env node
// Compares the live upstream surface (scripts/upstream/surface.mjs) against
// this repo's hand-written docs (skills/chatbotx/references/commands.md,
// skills/chatbotx/SKILL.md's collision section, skills/chatbotx-mcp/SKILL.md's
// default-tool table) and against the version pinned in upstream.json.
// Exits 1 when anything has drifted so CI can act on it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { main as collectSurface } from "./surface.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

const COMMANDS_MD = join(
  REPO_ROOT,
  "skills/chatbotx/references/commands.md",
);
const CLI_SKILL_MD = join(REPO_ROOT, "skills/chatbotx/SKILL.md");
const MCP_SKILL_MD = join(REPO_ROOT, "skills/chatbotx-mcp/SKILL.md");
const UPSTREAM_JSON = join(REPO_ROOT, "upstream.json");

// --- doc parsers -------------------------------------------------------------

/**
 * Extract every `chatbotx <group> [<subgroup>] [<action>]` command path found
 * in fenced bash blocks of commands.md. A line is read up to (but not
 * including) the first token that is a positional (`<...>`), a flag (`--x`),
 * or a comment (`#`).
 *
 * commands.md also shorthands a run of sibling actions sharing one group on
 * a single line as `chatbotx <group> action1 [<param>] / action2 [<param>] /
 * action3` (e.g. `chatbotx sequences list / get / create / update / delete`,
 * or `chatbotx ads campaigns-publish <id> / campaigns-pause <id>`). Every
 * observed instance in this doc puts the group as the line's first bare
 * word and never shorthands a multi-word group/subgroup path, so splitting
 * the line on `/` and re-prefixing each `/`-separated segment with that
 * first word reconstructs every sibling's full command path.
 */
export function parseCommandsDoc(markdown) {
  const commands = new Set();
  const fenceRe = /```bash\n([\s\S]*?)```/g;
  let fenceMatch;
  while ((fenceMatch = fenceRe.exec(markdown))) {
    for (const rawLine of fenceMatch[1].split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("chatbotx ")) {
        continue;
      }
      // Strip a trailing `# ...` comment first, so a `/` appearing only in a
      // comment (e.g. an option like `make|n8n`) never reaches the
      // shorthand-splitting logic below.
      const withoutComment = line.split(/\s#/)[0].trim();
      const body = withoutComment.slice("chatbotx ".length);

      const segments = body.split("/").map((s) => s.trim());
      const group = segments[0].split(/\s+/)[0];

      for (let i = 0; i < segments.length; i++) {
        // Every segment after the first is a bare action (optionally with
        // its own positional/flags) that shares the first segment's group;
        // the first segment already starts with the group itself.
        const segment = i === 0 ? segments[0] : `${group} ${segments[i]}`;
        const pathTokens = [];
        for (const t of segment.split(/\s+/)) {
          if (t.startsWith("<") || t.startsWith("--")) {
            break;
          }
          pathTokens.push(t);
        }
        if (pathTokens.length > 0) {
          commands.add(pathTokens.join(" "));
        }
      }
    }
  }
  return [...commands].sort();
}

/**
 * Extract documented command-name collisions from SKILL.md's
 * `## Command-name collisions` section (up to the next `## ` heading).
 * Each backtick span there is a full CLI invocation, e.g.
 * `` `bot-fields update <idOrName> --value <value>` `` or
 * `` `chatbotx contacts message send` ``. This reads every span's leading
 * bare-word tokens (dropping an optional `chatbotx` prefix, stopping at the
 * first positional `<...>`, flag `--x`, or quoted string) and normalizes to
 * `group:sub:action` form to compare against the CLI's own
 * `group:sub:action` collision warnings.
 */
export function parseCollisionsDoc(markdown) {
  const heading = "## Command-name collisions";
  const start = markdown.indexOf(heading);
  if (start === -1) {
    return [];
  }
  const rest = markdown.slice(start + heading.length);
  const nextHeadingIdx = rest.search(/\n## /);
  const section = nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);

  const found = new Set();
  const backtickRe = /`([^`]+)`/g;
  let m;
  while ((m = backtickRe.exec(section))) {
    const raw = m[1].trim();
    // Skip prose examples like the literal stderr warning text quoted for
    // illustration — not a command path.
    if (raw.startsWith("Warning:") || /^\d+$/.test(raw)) {
      continue;
    }
    let tokens = raw.split(/\s+/);
    if (tokens[0] === "chatbotx") {
      tokens = tokens.slice(1);
    }
    const pathTokens = [];
    for (const t of tokens) {
      if (
        t.startsWith("<") ||
        t.startsWith("--") ||
        t.startsWith("'") ||
        t.startsWith('"')
      ) {
        break;
      }
      pathTokens.push(t);
    }
    // A bare colon-form name (e.g. `ads:campaigns`) also appears verbatim
    // in stderr warnings — accept it directly alongside the space-form.
    if (pathTokens.length === 1 && pathTokens[0].includes(":")) {
      found.add(pathTokens[0]);
    } else if (pathTokens.length >= 2) {
      found.add(pathTokens.join(":"));
    }
  }
  return [...found].sort();
}

/**
 * Extract documented default MCP tool names from SKILL.md, scanning from
 * `## Discovery tools` through (but not including) `## Scope and read-only
 * behavior`. Only backtick-quoted identifiers on markdown table rows
 * (lines starting with `|`) are read — both the discovery-tools table (one
 * tool name per row) and the default-tools category table (a comma-joined
 * list of tool names per category row) put tool names in backticks there.
 * Prose lines elsewhere in the section (e.g. "permission (`read_only`/`full`)")
 * are deliberately skipped, since they name token permission values, not
 * tools. The two meta-tools are excluded since they are not part of the
 * default-visible OpenAPI-derived set.
 */
export function parseMcpDefaultTools(markdown) {
  const startHeading = "## Discovery tools";
  const endHeading = "## Scope and read-only behavior";
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(endHeading);
  if (start === -1) {
    return [];
  }
  const section = markdown.slice(start, end === -1 ? undefined : end);

  // Non-tool snake_case identifiers that appear in backticks within this
  // section's prose/description cells (token permission values, not tool
  // names) and would otherwise be misread as documented default tools.
  const NON_TOOL_NAMES = new Set([
    "search_tools",
    "call_tool",
    "read_only",
    "full",
  ]);

  const tools = new Set();
  for (const line of section.split("\n")) {
    if (!line.trimStart().startsWith("|")) {
      continue;
    }
    const backtickRe = /`([a-z][a-z0-9_]*)`/g;
    let m;
    while ((m = backtickRe.exec(line))) {
      const name = m[1];
      if (NON_TOOL_NAMES.has(name)) {
        continue;
      }
      tools.add(name);
    }
  }
  return [...tools].sort();
}

// --- diff --------------------------------------------------------------------

function setDiff(upstreamList, docList) {
  const upstream = new Set(upstreamList);
  const docs = new Set(docList);
  const added = [...upstream].filter((x) => !docs.has(x)).sort();
  const removed = [...docs].filter((x) => !upstream.has(x)).sort();
  return { added, removed };
}

export function diffSurface({ surface, docs, pins }) {
  const versions = {
    cli: { pinned: pins.chatbotx, live: surface.cli.version },
    mcp: { pinned: pins["chatbotx-mcp"], live: surface.mcp.version },
  };
  const versionsDrifted =
    versions.cli.pinned !== versions.cli.live ||
    versions.mcp.pinned !== versions.mcp.live;

  const cli = setDiff(surface.cli.commands, docs.commands);
  const collisions = setDiff(surface.cli.collisions, docs.collisions);
  const mcp = setDiff(surface.mcp.defaultTools, docs.mcpDefaultTools);

  const hasDrift =
    versionsDrifted ||
    cli.added.length > 0 ||
    cli.removed.length > 0 ||
    collisions.added.length > 0 ||
    collisions.removed.length > 0 ||
    mcp.added.length > 0 ||
    mcp.removed.length > 0;

  return { hasDrift, versions, versionsDrifted, cli, collisions, mcp };
}

// --- report rendering ----------------------------------------------------------

function listOrNone(items) {
  return items.length === 0 ? "_none_" : items.map((i) => `- \`${i}\``).join("\n");
}

export function renderReport(diff, { surface }) {
  const lines = [];
  lines.push("<!-- upstream-drift -->");
  lines.push(
    `# Upstream drift: chatbotx@${surface.cli.version} / chatbotx-mcp@${surface.mcp.version}`,
  );
  lines.push("");
  lines.push(
    `Checked ${surface.collectedAt} against \`${surface.specUrl}\`.`,
  );
  lines.push("");

  if (!diff.hasDrift) {
    lines.push(
      "No drift detected. Docs in `skills/` match the live CLI help and MCP default tool set, and `upstream.json` matches npm `latest`.",
    );
    return lines.join("\n");
  }

  if (diff.versionsDrifted) {
    lines.push("## Version pin");
    lines.push("");
    lines.push(
      `- \`upstream.json\` pins \`chatbotx@${diff.versions.cli.pinned}\`, npm \`latest\` is \`${diff.versions.cli.live}\`.`,
    );
    lines.push(
      `- \`upstream.json\` pins \`chatbotx-mcp@${diff.versions.mcp.pinned}\`, npm \`latest\` is \`${diff.versions.mcp.live}\`.`,
    );
    if (
      diff.cli.added.length === 0 &&
      diff.cli.removed.length === 0 &&
      diff.collisions.added.length === 0 &&
      diff.collisions.removed.length === 0 &&
      diff.mcp.added.length === 0 &&
      diff.mcp.removed.length === 0
    ) {
      lines.push(
        "- Surface (commands, collisions, default tools) is otherwise unchanged — this is a version-only bump.",
      );
    }
    lines.push("");
  }

  if (diff.cli.added.length > 0 || diff.cli.removed.length > 0) {
    lines.push("## CLI commands (skills/chatbotx/references/commands.md)");
    lines.push("");
    lines.push("**In the live CLI but missing from docs:**");
    lines.push(listOrNone(diff.cli.added));
    lines.push("");
    lines.push("**In docs but no longer in the live CLI:**");
    lines.push(listOrNone(diff.cli.removed));
    lines.push("");
  }

  if (diff.collisions.added.length > 0 || diff.collisions.removed.length > 0) {
    lines.push(
      "## Command-name collisions (skills/chatbotx/SKILL.md § Command-name collisions)",
    );
    lines.push("");
    lines.push("**New collision warnings not yet documented:**");
    lines.push(listOrNone(diff.collisions.added));
    lines.push("");
    lines.push("**Documented collisions no longer reproduced by the live CLI:**");
    lines.push(listOrNone(diff.collisions.removed));
    lines.push("");
  }

  if (diff.mcp.added.length > 0 || diff.mcp.removed.length > 0) {
    lines.push(
      "## MCP default tools (skills/chatbotx-mcp/SKILL.md § Default tools)",
    );
    lines.push("");
    lines.push("**Default-visible tools missing from the docs table:**");
    lines.push(listOrNone(diff.mcp.added));
    lines.push("");
    lines.push("**Documented default tools no longer default-visible:**");
    lines.push(listOrNone(diff.mcp.removed));
    lines.push("");
  }

  lines.push("## How to resolve");
  lines.push("");
  lines.push(
    "1. Update the affected file(s) above to match the live surface.",
  );
  lines.push(
    "2. Bump `upstream.json` (and the `version:` field in the affected skill's `SKILL.md`, `.claude-plugin/plugin.json`, `.cursor-plugin` equivalents, `gemini-extension.json`) to the live npm version.",
  );
  lines.push("3. Add a `CHANGELOG.md` entry.");
  lines.push(
    "4. Merge — the next scheduled run closes this issue automatically once the surface matches.",
  );

  return lines.join("\n");
}

// --- CLI entrypoint ------------------------------------------------------------

function parseArgs(argv) {
  const out = { surfaceArgs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--report") out.report = argv[++i];
    else if (a === "--json") out.json = argv[++i];
    else if (a === "--surface") out.surfacePath = argv[++i];
    else if (a === "--cli-version" || a === "--mcp-version" || a === "--api-url" || a === "--spec-url") {
      out.surfaceArgs.push(a, argv[++i]);
    }
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);

  const surface = opts.surfacePath
    ? JSON.parse(readFileSync(opts.surfacePath, "utf8"))
    : await collectSurface(opts.surfaceArgs);

  const pins = JSON.parse(readFileSync(UPSTREAM_JSON, "utf8"));
  const docs = {
    commands: parseCommandsDoc(readFileSync(COMMANDS_MD, "utf8")),
    collisions: parseCollisionsDoc(readFileSync(CLI_SKILL_MD, "utf8")),
    mcpDefaultTools: parseMcpDefaultTools(readFileSync(MCP_SKILL_MD, "utf8")),
  };

  const diff = diffSurface({ surface, docs, pins });
  const report = renderReport(diff, { surface });

  process.stdout.write(`${report}\n`);

  if (opts.report) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(opts.report, `${report}\n`);
  }
  if (opts.json) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(opts.json, `${JSON.stringify(diff, null, 2)}\n`);
  }

  process.exitCode = diff.hasDrift ? 1 : 0;
  return diff;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err.message}\n`);
    process.exitCode = 1;
  });
}
