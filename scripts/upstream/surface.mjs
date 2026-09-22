#!/usr/bin/env node
// Collects the *actual* runtime surface of the published `chatbotx` CLI and
// the live `chatbotx-mcp` default tool set, so check-drift.mjs can compare it
// against the hand-written docs in skills/. Ground truth is the published
// binary + the live OpenAPI spec — never a re-implementation of upstream's
// command-name derivation logic (that would just be a second place to drift).

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DUPLICATE_COMMAND_RE = /duplicate command name "([^"]+)"/g;

// yargs right-pads every row's path column to the width of the block's
// longest path before printing the description, so the description always
// starts at the same column on every non-wrapped row. A row whose path OR
// description overflows the terminal width wraps its tail onto the next
// line; that continuation line is otherwise indistinguishable from a new
// command row (same 2-space left margin, no `chatbotx ` prefix either way).
// The two kinds of continuation are told apart by *where* their text starts:
//  - a wrapped description tail is printed starting at the description
//    column (many leading spaces, e.g. "appointment-external-calendars"
//    pushing "commands" onto its own indented line);
//  - a wrapped path tail is printed flush against the block's normal 2-space
//    margin (e.g. "analytics" pushing "contact-counts-per-day" onto its own
//    line with no extra indent), because the path column has no padding to
//    wrap into — it's the first column.
// A wrapped positional (e.g. `<fileId>`) uses the same flush-left form and
// is handled identically: reattached to the path, then stripped like any
// other positional. A single continuation line can carry a wrapped path tail
// AND a wrapped description tail at once (e.g. `chatbotx integrations` /
// `status-token-errors` splits across two lines while `failed token refresh`
// runs alongside `status-token-errors` on the second), so a flush-left
// continuation is itself re-split on its first 2+-space gap the same way the
// original row was.
const MARGIN_INDENT = 2;

// A description column reading exactly "<name> commands" marks a yargs group
// or subgroup rather than a leaf action (see registerGroupCommand /
// registerActionsOnCli in ChatbotX's apps/cli/src/index.ts).
const GROUP_DESC_RE = /^(\S+) commands$/;

/**
 * Parse one `--help` screen's `Commands:` block into leaf action lines and
 * group/subgroup names.
 */
export function parseHelpCommands(helpText) {
  const lines = helpText.split("\n");
  const startIdx = lines.findIndex((l) => l.trim() === "Commands:");
  if (startIdx === -1) {
    return { actions: [], groups: [] };
  }

  const actions = [];
  const groups = [];

  const isContinuation = (line) =>
    line !== undefined &&
    line.trim() !== "" &&
    !line.startsWith("  chatbotx ");

  const indentOf = (line) => line.length - line.trimStart().length;

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim() === "Options:") {
      break;
    }
    if (!line.startsWith("  chatbotx ")) {
      // Continuation of the previous row — already consumed when that row
      // was processed below.
      continue;
    }
    const rest = line.slice("  chatbotx ".length);
    // Command path is every token up to the first token that looks like a
    // yargs positional (`<...>`) or the start of the description column
    // (two+ spaces). Description columns are aligned, so split on the first
    // run of 2+ spaces.
    const splitMatch = rest.match(/^(.+?)\s{2,}(.*)$/);
    let pathPart = splitMatch ? splitMatch[1] : rest.trim();
    let descPart = splitMatch ? splitMatch[2] : "";

    // Consume every wrapped continuation line belonging to this row before
    // classifying it — a row can wrap more than once.
    while (isContinuation(lines[i + 1])) {
      const next = lines[i + 1];
      if (indentOf(next) <= MARGIN_INDENT) {
        // Flush-left continuation: tail of the path (or a wrapped
        // positional, which is dropped along with every other `<...>`
        // token below). Both columns can wrap onto the SAME continuation
        // line at once (e.g. "  status-token-errors     failed token
        // refresh", or "  <conversationId> <messageId>    attributes" where
        // the path tail is itself two space-separated positionals), so
        // re-split it with the same lazy-multi-token pattern used for the
        // original row instead of assuming the path tail is one token.
        const nextRest = next.slice(MARGIN_INDENT);
        const nextSplit = nextRest.match(/^(.+?)\s{2,}(.*)$/);
        if (nextSplit) {
          pathPart = `${pathPart} ${nextSplit[1]}`;
          descPart = `${descPart} ${nextSplit[2]}`.trim();
        } else {
          pathPart = `${pathPart} ${nextRest.trim()}`;
        }
      } else {
        // Indented continuation: tail of the description.
        descPart = `${descPart} ${next.trim()}`.trim();
      }
      i++;
    }

    // Strip positional args like `<identifier>` from the path to get the
    // pure command path (space-separated group/subgroup/action tokens).
    const tokens = pathPart
      .split(/\s+/)
      .filter((t) => t && !t.startsWith("<"));

    const groupMatch = descPart.match(GROUP_DESC_RE);
    if (groupMatch) {
      groups.push(tokens.join(" "));
    } else {
      actions.push(tokens.join(" "));
    }
  }

  return { actions, groups };
}

/**
 * Recursively walk `chatbotx <path> --help` for every discovered subgroup,
 * collecting the full set of leaf action command paths (e.g.
 * "contacts tags update") and every `duplicate command name` warning seen on
 * stderr along the way.
 *
 * `runHelp` is injectable so tests can stub the CLI invocation with fixture
 * text instead of shelling out to npx.
 */
export function collectCliSurface({
  version,
  apiUrl,
  runHelp,
  maxDepth = 4,
}) {
  const collisions = new Set();
  const commands = new Set();

  // `parseHelpCommands` returns full command paths as printed by yargs —
  // e.g. running `runHelp(["contacts"])` yields groups like
  // "contacts tags" and actions like "contacts list", already rooted from
  // the top level, not relative to `pathTokens`. So each discovered group's
  // own path tokens (not `[...pathTokens, group]`) are what the next
  // `runHelp` call needs.
  const visit = (pathTokens, depth) => {
    if (depth > maxDepth) {
      return;
    }
    const { stdout, stderr } = runHelp(pathTokens);
    for (const m of stderr.matchAll(DUPLICATE_COMMAND_RE)) {
      collisions.add(m[1]);
    }
    const { actions, groups } = parseHelpCommands(stdout);
    for (const action of actions) {
      commands.add(action);
    }
    for (const group of groups) {
      visit(group.split(" "), depth + 1);
    }
  };

  visit([], 0);

  return {
    version,
    apiUrl,
    commands: [...commands].sort(),
    collisions: [...collisions].sort(),
  };
}

/**
 * Real `runHelp` implementation: shells out to the published CLI via npx,
 * capturing stdout (the help screen) and stderr (collision warnings)
 * separately. yargs' `--help` exits 0, so a non-zero exit here means the
 * CLI itself failed — that propagates as a script failure rather than being
 * swallowed as empty output.
 */
export function runNpxHelp({ version, apiUrl, tmpHome, pathTokens }) {
  const args = [
    "-y",
    `chatbotx@${version}`,
    "--apiKey",
    "upstream-drift-check",
    "--apiUrl",
    apiUrl,
    ...pathTokens,
    "--help",
  ];
  const result = spawnSync("npx", args, {
    encoding: "utf8",
    env: { ...process.env, HOME: tmpHome },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 && result.error) {
    throw result.error;
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

// --- MCP default-tool surface ---------------------------------------------

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/**
 * Verbatim copy of ChatbotX's apps/mcp-server/src/openapi-loader.ts
 * `toSnakeCase` — MCP tool names are `toSnakeCase(operationId)`. Kept here
 * only to reproduce the *documented* tool name from the live spec's
 * `operationId`, not as a reimplementation of loader logic.
 */
export function toSnakeCase(str) {
  return str
    .replace(/([A-Z]{2,})(?=[A-Z][a-z]|$)/g, "_$1")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[.\-\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Extract the default-visible MCP tool names from a parsed OpenAPI spec object. */
export function extractDefaultTools(spec) {
  const tools = [];
  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }
      if (!operation.operationId || operation.deprecated) {
        continue;
      }
      if (operation["x-mcp"]?.visibility !== "default") {
        continue;
      }
      tools.push(toSnakeCase(operation.operationId));
    }
  }
  return tools.sort();
}

export async function collectMcpSurface({ specUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(specUrl, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenAPI spec from ${specUrl}: ${response.status} ${response.statusText}`,
    );
  }
  const spec = await response.json();
  const defaultTools = extractDefaultTools(spec);
  const operationCount = Object.values(spec.paths ?? {}).reduce(
    (n, pathItem) =>
      n +
      Object.keys(pathItem).filter((m) => HTTP_METHODS.has(m)).length,
    0,
  );
  return { specUrl, defaultTools, operationCount, defaultCount: defaultTools.length };
}

// --- npm version resolution -------------------------------------------------

export function resolveNpmVersion(packageName) {
  return execFileSync("npm", ["view", packageName, "version"], {
    encoding: "utf8",
  }).trim();
}

// --- CLI entrypoint ----------------------------------------------------------

function parseArgs(argv) {
  const out = { out: ".upstream/surface.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cli-version") out.cliVersion = argv[++i];
    else if (a === "--mcp-version") out.mcpVersion = argv[++i];
    else if (a === "--api-url") out.apiUrl = argv[++i];
    else if (a === "--spec-url") out.specUrl = argv[++i];
    else if (a === "--out") out.out = argv[++i];
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const apiUrl = opts.apiUrl ?? "https://app.chatbotx.io/api";
  const specUrl = opts.specUrl ?? `${apiUrl}/public-spec.json`;

  const cliVersion = opts.cliVersion ?? resolveNpmVersion("chatbotx");
  const mcpVersion = opts.mcpVersion ?? resolveNpmVersion("chatbotx-mcp");

  const tmpHome = mkdtempSync(join(tmpdir(), "chatbotx-drift-home-"));
  try {
    const runHelp = (pathTokens) =>
      runNpxHelp({ version: cliVersion, apiUrl, tmpHome, pathTokens });

    const cli = collectCliSurface({ version: cliVersion, apiUrl, runHelp });
    const mcp = await collectMcpSurface({ specUrl });

    const surface = {
      collectedAt: new Date().toISOString(),
      apiUrl,
      specUrl,
      cli: { version: cliVersion, commands: cli.commands, collisions: cli.collisions },
      mcp: {
        version: mcpVersion,
        defaultTools: mcp.defaultTools,
        operationCount: mcp.operationCount,
        defaultCount: mcp.defaultCount,
      },
    };

    mkdirSync(join(opts.out, ".."), { recursive: true });
    writeFileSync(opts.out, `${JSON.stringify(surface, null, 2)}\n`);
    process.stdout.write(`Wrote ${opts.out}\n`);
    return surface;
  } finally {
    rmSync(tmpHome, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err.message}\n`);
    process.exitCode = 1;
  });
}
