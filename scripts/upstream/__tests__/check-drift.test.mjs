import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  diffSurface,
  parseArgs as parseCheckArgs,
  parseCollisionsDoc,
  parseCommandsDoc,
  parseMcpDefaultTools,
  renderReport,
} from "../check-drift.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

const realCommandsMd = () =>
  readFileSync(
    join(REPO_ROOT, "skills/chatbotx/references/commands.md"),
    "utf8",
  );
const realCliSkillMd = () =>
  readFileSync(join(REPO_ROOT, "skills/chatbotx/SKILL.md"), "utf8");
const realMcpSkillMd = () =>
  readFileSync(join(REPO_ROOT, "skills/chatbotx-mcp/SKILL.md"), "utf8");

describe("parseCommandsDoc", () => {
  test("reads a plain command line up to the first positional/flag", () => {
    const md = [
      "```bash",
      "chatbotx contacts get <identifier>",
      "chatbotx contacts create --email <email>",
      "```",
    ].join("\n");
    assert.deepEqual(parseCommandsDoc(md), [
      "contacts create",
      "contacts get",
    ]);
  });

  test("expands a slash-separated sibling-action shorthand line", () => {
    const md = [
      "```bash",
      "chatbotx sequences list / get / create / update / delete",
      "```",
    ].join("\n");
    assert.deepEqual(parseCommandsDoc(md), [
      "sequences create",
      "sequences delete",
      "sequences get",
      "sequences list",
      "sequences update",
    ]);
  });

  test("keeps each shorthand sibling's own positional separate from the group", () => {
    const md = [
      "```bash",
      "chatbotx ads campaigns-publish <id> / campaigns-pause <id> / campaigns-retry <id>",
      "```",
    ].join("\n");
    assert.deepEqual(parseCommandsDoc(md), [
      "ads campaigns-pause",
      "ads campaigns-publish",
      "ads campaigns-retry",
    ]);
  });

  test("strips a trailing comment without treating its '/' as shorthand", () => {
    const md = [
      "```bash",
      "chatbotx external-webhooks list / create / delete            # [--provider make|n8n]",
      "```",
    ].join("\n");
    assert.deepEqual(parseCommandsDoc(md), [
      "external-webhooks create",
      "external-webhooks delete",
      "external-webhooks list",
    ]);
  });

  test("does not produce a trailing-whitespace command when a comment follows extra spaces", () => {
    const md = [
      "```bash",
      "chatbotx ads conversion-rules                              # see collisions",
      "```",
    ].join("\n");
    assert.deepEqual(parseCommandsDoc(md), ["ads conversion-rules"]);
  });

  test("ignores non-command lines and non-bash fences", () => {
    const md = [
      "Some prose about `chatbotx contacts get` mentioned inline.",
      "```json",
      '{ "chatbotx": "not a command line" }',
      "```",
    ].join("\n");
    assert.deepEqual(parseCommandsDoc(md), []);
  });

  test("parses the real commands.md without throwing and finds known commands", () => {
    const commands = parseCommandsDoc(realCommandsMd());
    assert.ok(commands.length > 100);
    assert.ok(commands.includes("contacts list"));
    assert.ok(commands.includes("broadcasts create"));
    assert.ok(commands.includes("flows publish add"));
  });
});

describe("parseCollisionsDoc", () => {
  test("rejects a missing collision heading", () => {
    assert.throws(
      () => parseCollisionsDoc("# Nothing here"),
      /missing required heading.*Command-name collisions/i,
    );
  });
  test("normalizes a bare-word backtick span to group:action[:sub] form", () => {
    const md = [
      "## Command-name collisions",
      "",
      "- `bot-fields update <idOrName> --value <value>` is unreachable.",
      "- `ads conversion-rules`, `ads campaigns` collapse.",
      "",
      "## Notes",
      "- unrelated `foo bar` here must not be picked up.",
    ].join("\n");
    const result = parseCollisionsDoc(md);
    assert.ok(result.includes("bot-fields:update"));
    assert.ok(result.includes("ads:conversion-rules"));
    assert.ok(result.includes("ads:campaigns"));
    assert.ok(!result.includes("foo:bar"));
  });

  test("skips the illustrative stderr warning text and bare numbers", () => {
    const md = [
      "## Command-name collisions",
      "",
      'It prints `Warning: duplicate command name "..." — skipping` but exits `0`.',
      "",
      "## Notes",
    ].join("\n");
    assert.deepEqual(parseCollisionsDoc(md), []);
  });

  test("matches every collision the live CLI warns about", () => {
    const result = parseCollisionsDoc(realCliSkillMd());
    const liveCollisions = [
      ...readFileSync(join(__dirname, "fixtures", "help-root.stderr.txt"), "utf8")
        .matchAll(/duplicate command name "([^"]+)"/g),
    ]
      .map((match) => match[1])
      .filter((name, index, names) => names.indexOf(name) === index)
      .sort();
    assert.deepEqual(result, liveCollisions);
  });
});

describe("parseMcpDefaultTools", () => {
  test("reads tool names from table rows only, ignoring prose", () => {
    const md = [
      "## Discovery tools",
      "",
      "| Tool | Description |",
      "|---|---|",
      "| `token_get` | permission (`read_only`/`full`) |",
      "",
      "## Default tools",
      "",
      "| Category | Tools |",
      "|---|---|",
      "| Contacts | `contacts_create`, `contacts_get` |",
      "",
      "prose mentioning `not_a_tool` outside any table row",
      "",
      "## Scope and read-only behavior",
      "- A `read_only` token only sees read-only tools.",
    ].join("\n");
    const result = parseMcpDefaultTools(md);
    assert.deepEqual(result, ["contacts_create", "contacts_get", "token_get"]);
  });

  test("excludes the two meta-tools", () => {
    const md = [
      "## Discovery tools",
      "| `search_tools` | x |",
      "| `call_tool` | x |",
      "| `token_get` | x |",
      "## Scope and read-only behavior",
    ].join("\n");
    assert.deepEqual(parseMcpDefaultTools(md), ["token_get"]);
  });

  test("parses the real MCP SKILL.md to exactly the 43 live default tools", () => {
    const tools = parseMcpDefaultTools(realMcpSkillMd());
    assert.equal(tools.length, 43);
    assert.ok(tools.includes("contacts_create"));
    assert.ok(tools.includes("flows_publish"));
    assert.ok(!tools.includes("read_only"));
    assert.ok(!tools.includes("full"));
  });

  test("rejects missing MCP section boundaries", () => {
    assert.throws(
      () => parseMcpDefaultTools("## Default tools"),
      /missing required heading.*Discovery tools/i,
    );
    assert.throws(
      () => parseMcpDefaultTools("## Discovery tools\n| `token_get` | x |"),
      /missing required heading.*Scope and read-only behavior/i,
    );
  });
});

describe("diffSurface", () => {
  const basePins = { chatbotx: "1.8.4", "chatbotx-mcp": "1.8.0" };
  const baseSurface = {
    cli: { version: "1.8.4", commands: ["contacts list"], collisions: [] },
    mcp: { version: "1.8.0", defaultTools: ["contacts_create"] },
  };
  const baseDocs = {
    commands: ["contacts list"],
    collisions: [],
    mcpDefaultTools: ["contacts_create"],
  };

  test("reports no drift when everything matches", () => {
    const diff = diffSurface({ surface: baseSurface, docs: baseDocs, pins: basePins });
    assert.equal(diff.hasDrift, false);
    assert.equal(diff.versionsDrifted, false);
  });

  test("detects a version-only drift", () => {
    const diff = diffSurface({
      surface: baseSurface,
      docs: baseDocs,
      pins: { ...basePins, chatbotx: "1.8.3" },
    });
    assert.equal(diff.hasDrift, true);
    assert.equal(diff.versionsDrifted, true);
    assert.equal(diff.cli.added.length, 0);
  });

  test("treats undocumented CLI additions as informational", () => {
    const surface = {
      ...baseSurface,
      cli: { ...baseSurface.cli, commands: ["contacts list", "contacts delete"] },
    };
    const diff = diffSurface({ surface, docs: baseDocs, pins: basePins });
    assert.equal(diff.hasDrift, false);
    assert.equal(diff.surfaceChanged, false);
    assert.deepEqual(diff.cli.added, ["contacts delete"]);
    assert.deepEqual(diff.cli.removed, []);
  });

  test("detects a documented command no longer in the live CLI", () => {
    const docs = { ...baseDocs, commands: ["contacts list", "contacts archive"] };
    const diff = diffSurface({ surface: baseSurface, docs, pins: basePins });
    assert.deepEqual(diff.cli.removed, ["contacts archive"]);
  });

  test("detects new and stale MCP default tools independently", () => {
    const surface = {
      ...baseSurface,
      mcp: { ...baseSurface.mcp, defaultTools: ["contacts_get"] },
    };
    const diff = diffSurface({ surface, docs: baseDocs, pins: basePins });
    assert.deepEqual(diff.mcp.added, ["contacts_get"]);
    assert.deepEqual(diff.mcp.removed, ["contacts_create"]);
  });
});

describe("renderReport", () => {
  const surface = {
    collectedAt: "2026-09-22T00:00:00.000Z",
    specUrl: "https://app.chatbotx.io/api/public-spec.json",
    cli: { version: "1.8.4" },
    mcp: { version: "1.8.0" },
  };

  test("renders a clean report with the marker comment when there is no drift", () => {
    const diff = {
      hasDrift: false,
      versionsDrifted: false,
      versions: {},
      cli: { added: [], removed: [] },
      collisions: { added: [], removed: [] },
      mcp: { added: [], removed: [] },
    };
    const report = renderReport(diff, { surface });
    assert.ok(report.startsWith("<!-- upstream-drift -->"));
    assert.ok(report.includes("No drift detected"));
  });

  test("lists every drifted section with file pointers", () => {
    const diff = {
      hasDrift: true,
      versionsDrifted: true,
      versions: {
        cli: { pinned: "1.8.3", live: "1.8.4" },
        mcp: { pinned: "1.8.0", live: "1.8.0" },
      },
      cli: { added: ["contacts delete"], removed: [] },
      collisions: { added: ["ads:find-by-conversion-rules"], removed: [] },
      mcp: { added: [], removed: ["contacts_create"] },
    };
    const report = renderReport(diff, { surface });
    assert.ok(report.includes("commands.md"));
    assert.ok(report.includes("contacts delete"));
    assert.ok(report.includes("Command-name collisions"));
    assert.ok(report.includes("ads:find-by-conversion-rules"));
    assert.ok(report.includes("MCP default tools"));
    assert.ok(report.includes("contacts_create"));
    assert.ok(report.includes("How to resolve"));
  });

  test("marks a version-only change without reporting surface sections", () => {
    const diff = diffSurface({
      surface: {
        cli: { version: "1.8.5", commands: ["contacts list"], collisions: [] },
        mcp: { version: "1.8.0", defaultTools: ["contacts_create"] },
      },
      docs: {
        commands: ["contacts list"],
        collisions: [],
        mcpDefaultTools: ["contacts_create"],
      },
      pins: { chatbotx: "1.8.4", "chatbotx-mcp": "1.8.0" },
    });
    const report = renderReport(diff, { surface: { ...surface, cli: { version: "1.8.5" } } });
    assert.ok(report.includes("version-only bump"));
    assert.ok(!report.includes("## CLI commands"));
    assert.ok(!report.includes("## MCP default tools"));
  });

  test("renders only MCP details for an MCP-only surface change", () => {
    const diff = diffSurface({
      surface: {
        cli: { version: "1.8.4", commands: ["contacts list"], collisions: [] },
        mcp: { version: "1.8.0", defaultTools: ["contacts_get"] },
      },
      docs: {
        commands: ["contacts list"],
        collisions: [],
        mcpDefaultTools: ["contacts_create"],
      },
      pins: { chatbotx: "1.8.4", "chatbotx-mcp": "1.8.0" },
    });
    const report = renderReport(diff, { surface });
    assert.ok(report.includes("## MCP default tools"));
    assert.ok(!report.includes("## CLI commands"));
    assert.ok(!report.includes("## Command-name collisions"));
  });

  test("renders undocumented CLI additions as informational without drift", () => {
    const diff = {
      hasDrift: false,
      surfaceChanged: false,
      versionsDrifted: false,
      versions: {},
      cli: { added: ["config get"], removed: [], changed: true },
      collisions: { added: [], removed: [], changed: false },
      mcp: { added: [], removed: [], changed: false },
    };
    const report = renderReport(diff, { surface });
    assert.ok(report.includes("No drift detected"));
    assert.ok(report.includes("Informational CLI commands"));
    assert.ok(report.includes("config get"));
  });
});

describe("check-drift CLI entrypoint", () => {
  test("exits 0 for a matching surface, 1 for drift, and 2 for invalid input", () => {
    assert.deepEqual(
      parseCheckArgs(["--surface", "surface.json", "--report", "report.md"]),
      { surfaceArgs: [], surfacePath: "surface.json", report: "report.md" },
    );

    const directory = mkdtempSync(join(tmpdir(), "chatbotx-drift-test-"));
    const checker = join(REPO_ROOT, "scripts/upstream/check-drift.mjs");
    const pins = JSON.parse(readFileSync(join(REPO_ROOT, "upstream.json"), "utf8"));
    const matchingSurface = {
      collectedAt: "2026-09-22T00:00:00.000Z",
      specUrl: "https://app.chatbotx.io/api/public-spec.json",
      cli: {
        version: pins.chatbotx,
        commands: parseCommandsDoc(realCommandsMd()),
        collisions: parseCollisionsDoc(realCliSkillMd()),
      },
      mcp: {
        version: pins["chatbotx-mcp"],
        defaultTools: parseMcpDefaultTools(realMcpSkillMd()),
      },
    };

    try {
      const matchingPath = join(directory, "matching.json");
      const cleanReport = join(directory, "clean.md");
      writeFileSync(matchingPath, `${JSON.stringify(matchingSurface)}\n`);
      const clean = spawnSync(
        process.execPath,
        [checker, "--surface", matchingPath, "--report", cleanReport],
        { encoding: "utf8" },
      );
      assert.equal(clean.status, 0, clean.stderr);
      assert.ok(existsSync(cleanReport));

      const driftPath = join(directory, "drift.json");
      const driftReport = join(directory, "drift.md");
      writeFileSync(
        driftPath,
        `${JSON.stringify({
          ...matchingSurface,
          cli: { ...matchingSurface.cli, version: "1.8.5" },
        })}\n`,
      );
      const drift = spawnSync(
        process.execPath,
        [checker, "--surface", driftPath, "--report", driftReport],
        { encoding: "utf8" },
      );
      assert.equal(drift.status, 1, drift.stderr);
      assert.ok(existsSync(driftReport));

      const malformedPath = join(directory, "malformed.json");
      const malformedReport = join(directory, "malformed.md");
      writeFileSync(malformedPath, "{}\n");
      const malformed = spawnSync(
        process.execPath,
        [checker, "--surface", malformedPath, "--report", malformedReport],
        { encoding: "utf8" },
      );
      assert.equal(malformed.status, 2);
      assert.ok(!existsSync(malformedReport));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
