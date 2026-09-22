import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  collectMcpSurface,
  main as collectSurfaceMain,
  parseArgs as parseSurfaceArgs,
  parseHelpCommands,
  collectCliSurface,
  runNpxHelp,
  toSnakeCase,
  extractDefaultTools,
} from "../surface.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseHelpCommands", () => {
  test("parses root help into top-level groups, no actions", () => {
    const { actions, groups } = parseHelpCommands(fixture("help-root.txt"));
    assert.equal(actions.length, 0);
    assert.ok(groups.includes("config"));
    assert.ok(groups.includes("contacts"));
    assert.ok(groups.includes("ai-agents"));
    // "appointment-external-calendars  commands" wraps across two lines —
    // must still parse as one group, not swallow the wrapped continuation
    // as a bogus command.
    assert.ok(groups.includes("appointment-external-calendars"));
    assert.equal(groups.length, 57);
  });

  test("parses contacts help into leaf actions and further subgroups", () => {
    const { actions, groups } = parseHelpCommands(fixture("help-contacts.txt"));
    assert.ok(actions.includes("contacts list"));
    assert.ok(actions.includes("contacts create"));
    assert.ok(actions.includes("contacts get"));
    // Wrapped description ("Get contact export file status and\ndownload URL")
    // must not spawn a spurious duplicate/garbled action entry.
    assert.ok(actions.includes("contacts find-by-export-files"));
    assert.ok(groups.includes("contacts tags"));
    assert.ok(groups.includes("contacts upsert"));
    assert.ok(!actions.some((a) => a.includes("commands")));
  });

  test("parses nested subgroup help (contacts tags) into leaf actions", () => {
    const { actions, groups } = parseHelpCommands(
      fixture("help-contacts-tags.txt"),
    );
    assert.deepEqual(groups, []);
    assert.ok(actions.includes("contacts tags list"));
    // "chatbotx contacts tags update             Replace all tags on contact\n<identifier>"
    // wraps the positional onto its own line — must not be misread as a
    // second command.
    assert.ok(actions.includes("contacts tags update"));
    assert.equal(actions.length, 2);
  });

  test("returns empty result when there is no Commands: block", () => {
    assert.deepEqual(parseHelpCommands("Options:\n  --help\n"), {
      actions: [],
      groups: [],
    });
  });

  test("reattaches a wrapped path tail (flush-left continuation) to the action, not the group", () => {
    // `chatbotx analytics` help: many rows wrap their long action name onto
    // a flush-left continuation line, e.g.
    //   "  chatbotx analytics                        Get contact counts per day"
    //   "  contact-counts-per-day"
    // A prior version of this parser misread the first line alone as the
    // bare action "analytics" (dropping the wrapped tail entirely).
    const { actions, groups } = parseHelpCommands(fixture("help-analytics.txt"));
    assert.deepEqual(groups, []);
    assert.ok(actions.includes("analytics contact-counts-per-day"));
    assert.ok(actions.includes("analytics new-contact-counts-per-day"));
    assert.ok(actions.includes("analytics bot-messages-by-result"));
    assert.ok(actions.includes("analytics conversation-assigned-by-admin"));
    // Never a bare "analytics" action — every row's path tail must be
    // reattached.
    assert.ok(!actions.includes("analytics"));
    // Positionals wrapping onto their own flush-left line must still be
    // stripped, not glued into the path as a literal token.
    assert.ok(actions.includes("analytics broadcasts-stats"));
    assert.ok(actions.includes("analytics sequences-steps-stats"));
  });

  test("splits a continuation line that wraps both the path tail and the description tail at once", () => {
    // `chatbotx integrations` help:
    //   "  chatbotx integrations                     List channel integrations with"
    //   "  status-token-errors                       failed token refresh"
    // The continuation line carries the wrapped path tail
    // ("status-token-errors") AND the wrapped description tail ("failed
    // token refresh") on the same physical line.
    const { actions, groups } = parseHelpCommands(
      fixture("help-integrations.txt"),
    );
    assert.deepEqual(groups, []);
    assert.ok(actions.includes("integrations list"));
    assert.ok(actions.includes("integrations get"));
    assert.ok(actions.includes("integrations status-token-errors"));
    assert.ok(actions.includes("integrations find-by-ai"));
    assert.ok(!actions.includes("integrations"));
  });

  test("strips two positionals wrapped together on one flush-left continuation, keeping the description tail separate", () => {
    // `chatbotx conversations attribute` help:
    //   "  chatbotx conversations attribute add      Change message liked/hidden"
    //   "  <conversationId> <messageId>              attributes"
    // The continuation's path-tail is itself two space-separated positionals
    // (only one space between them, not the 2+ that marks the description
    // gap), which must not swallow the trailing "attributes" description
    // word into the path.
    const { actions, groups } = parseHelpCommands(
      fixture("help-conversations-attribute.txt"),
    );
    assert.deepEqual(groups, []);
    assert.deepEqual(actions, ["conversations attribute add"]);
  });

  test("reattaches a one-word path tail plus a multi-word description tail from the same continuation line", () => {
    // `chatbotx messenger-channels tag-sync` help:
    //   "  chatbotx messenger-channels tag-sync      Enable or disable tag sync for"
    //   "  update <id>                               Messenger channel"
    const { actions, groups } = parseHelpCommands(
      fixture("help-messenger-channels-tag-sync.txt"),
    );
    assert.deepEqual(groups, []);
    assert.deepEqual(actions, ["messenger-channels tag-sync update"]);
  });

  test("handles a group whose subgroup listing itself wraps path and description", () => {
    // `chatbotx appointment-calendars` help mixes all three continuation
    // shapes in one block: plain positional wraps (`update`/`delete <id>`),
    // description-only wraps (`active`/`duplicate` -> "... commands"), and a
    // combined path+description wrap (`availability` group name split from
    // its own "commands" suffix).
    const { actions, groups } = parseHelpCommands(
      fixture("help-appointment-calendars.txt"),
    );
    assert.ok(actions.includes("appointment-calendars list"));
    assert.ok(actions.includes("appointment-calendars create"));
    assert.ok(actions.includes("appointment-calendars get"));
    assert.ok(actions.includes("appointment-calendars update"));
    assert.ok(actions.includes("appointment-calendars delete"));
    assert.deepEqual(groups.sort(), [
      "appointment-calendars active",
      "appointment-calendars availability",
      "appointment-calendars duplicate",
    ]);
  });
});

describe("collectCliSurface", () => {
  test("recursively walks groups and collects leaf commands + collisions", () => {
    const fixtures = {
      "": { stdout: fixture("help-root.txt"), stderr: fixture("help-root.stderr.txt") },
      contacts: { stdout: fixture("help-contacts.txt"), stderr: "" },
      "contacts tags": {
        stdout: fixture("help-contacts-tags.txt"),
        stderr: "",
      },
    };
    // Only recurse into the fixtures we actually captured; every other
    // group returns an empty help screen so the walk terminates cleanly.
    const runHelp = (pathTokens) => {
      const key = pathTokens.join(" ");
      return fixtures[key] ?? { stdout: "Commands:\n", stderr: "" };
    };

    const surface = collectCliSurface({
      version: "1.8.4",
      apiUrl: "https://app.chatbotx.io/api",
      runHelp,
    });

    assert.equal(surface.version, "1.8.4");
    assert.ok(surface.commands.includes("contacts list"));
    assert.ok(surface.commands.includes("contacts tags list"));
    assert.ok(surface.commands.includes("contacts tags update"));
    assert.ok(!surface.commands.some((c) => c === "contacts")); // group, not action

    assert.ok(surface.collisions.includes("ads:conversion-rules"));
    assert.ok(surface.collisions.includes("contacts:custom-fields:update"));
    // 15 warning lines on stderr, but some names repeat — collisions is a
    // deduped set of 13 unique names.
    assert.equal(surface.collisions.length, 13);
  });

  test("rejects root help without a Commands block", () => {
    assert.throws(
      () =>
        collectCliSurface({
          version: "1.8.4",
          apiUrl: "https://app.chatbotx.io/api",
          runHelp: () => ({ stdout: "Options:\n  --help\n", stderr: "" }),
        }),
      /root help.*Commands:/i,
    );
  });

  test("does not recurse past maxDepth", () => {
    let calls = 0;
    const runHelp = () => {
      calls++;
      return {
        stdout: "Commands:\n  chatbotx deep  deep commands\n",
        stderr: "",
      };
    };
    collectCliSurface({
      version: "x",
      apiUrl: "https://x",
      runHelp,
      maxDepth: 2,
    });
    // depth 0 (root) + depth 1 ("deep") + depth 2 ("deep deep") = 3 calls,
    // depth 3 never visited.
    assert.equal(calls, 3);
  });
});

describe("runNpxHelp", () => {
  test("throws with command output when npx exits non-zero", () => {
    assert.throws(
      () =>
        runNpxHelp({
          version: "1.8.4",
          apiUrl: "https://app.chatbotx.io/api",
          tmpHome: "/tmp/chatbotx-drift",
          pathTokens: [],
          spawnSyncImpl: () => ({
            status: 1,
            stdout: "npm notice",
            stderr: "package not found",
          }),
        }),
      /exit 1[\s\S]*npm notice[\s\S]*package not found/,
    );
  });
});

describe("toSnakeCase", () => {
  test("matches upstream operationId -> MCP tool name conversions", () => {
    assert.equal(toSnakeCase("aiAgents.create"), "ai_agents_create");
    assert.equal(toSnakeCase("aiAgents.list"), "ai_agents_list");
    assert.equal(
      toSnakeCase("analytics.newContactCountsPerDay"),
      "analytics_new_contact_counts_per_day",
    );
    assert.equal(toSnakeCase("schemas.flowSpec"), "schemas_flow_spec");
    assert.equal(toSnakeCase("tags.list"), "tags_list");
  });
});

describe("extractDefaultTools", () => {
  const spec = JSON.parse(fixture("spec-min.json"));

  test("includes only default-visible, non-deprecated operations", () => {
    const tools = extractDefaultTools(spec);
    assert.ok(tools.includes("ai_agents_list"));
    assert.ok(tools.includes("ai_agents_create"));
    assert.ok(tools.includes("analytics_new_contact_counts_per_day"));
    assert.ok(tools.includes("schemas_flow_spec"));
    // hidden visibility -> excluded
    assert.ok(!tools.includes("coupons_list"));
    // deprecated + default visibility -> still excluded
    assert.ok(!tools.includes("coupons_delete"));
  });

  test("is sorted", () => {
    const tools = extractDefaultTools(spec);
    assert.deepEqual(tools, [...tools].sort());
  });
});

describe("collectMcpSurface", () => {
  test("fetches spec and returns default tool surface", async () => {
    const spec = JSON.parse(fixture("spec-min.json"));
    const fetchImpl = async (url) => {
      assert.equal(url, "https://example.test/public-spec.json");
      return {
        ok: true,
        json: async () => spec,
      };
    };
    const result = await collectMcpSurface({
      specUrl: "https://example.test/public-spec.json",
      fetchImpl,
    });
    assert.equal(result.operationCount, 6);
    assert.ok(result.defaultTools.includes("ai_agents_list"));
    assert.ok(!Object.hasOwn(result, "defaultCount"));
  });

  test("throws a clear error on a non-ok response", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, statusText: "Boom" });
    await assert.rejects(
      () => collectMcpSurface({ specUrl: "https://x", fetchImpl }),
      /Failed to fetch OpenAPI spec.*500/,
    );
  });

  test("rejects specs without paths or operations", async () => {
    assert.throws(() => extractDefaultTools({}), /missing a paths object/i);
    await assert.rejects(
      () =>
        collectMcpSurface({
          specUrl: "https://x",
          fetchImpl: async () => ({ ok: true, json: async () => ({ paths: {} }) }),
        }),
      /contains no HTTP operations/i,
    );
  });
});

describe("surface CLI entrypoint", () => {
  test("parses collection flags and writes a validated surface", async () => {
    assert.deepEqual(
      parseSurfaceArgs(["--cli-version", "1.8.4", "--out", "surface.json"]),
      { cliVersion: "1.8.4", out: "surface.json" },
    );

    const directory = mkdtempSync(join(tmpdir(), "chatbotx-surface-test-"));
    const out = join(directory, "surface.json");
    try {
      const surface = await collectSurfaceMain(
        ["--cli-version", "1.8.4", "--mcp-version", "1.8.0", "--out", out],
        {
          collectCliSurfaceImpl: () => ({
            commands: ["contacts list"],
            collisions: ["contacts:custom-fields:update"],
          }),
          collectMcpSurfaceImpl: async ({ specUrl }) => ({
            specUrl,
            defaultTools: ["contacts_list"],
            operationCount: 1,
          }),
          resolveNpmVersionImpl: () => assert.fail("versions are supplied"),
        },
      );

      assert.deepEqual(surface.cli.commands, ["contacts list"]);
      assert.ok(!Object.hasOwn(surface.mcp, "defaultCount"));
      assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), surface);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
