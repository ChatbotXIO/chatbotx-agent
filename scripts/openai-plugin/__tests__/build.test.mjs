import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, collectPackage, createZip, readZip, sanitizeManifest, verifyReferences } from "../build.mjs";
import { checkPlugin } from "../check-manifest.mjs";
import { DEFERRED_V2_TOOLS, EXCLUDED_TOOLS, V1_TOOLS } from "../rules.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skillText = readFileSync(join(REPO_ROOT, "openai", "skills", "chatbotx-openai", "SKILL.md"), "utf8");

// A copy of the inputs the builder reads, so tests can add excluded files without touching the repo.
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "openai-build-"));
  cpSync(join(REPO_ROOT, "openai"), join(root, "openai"), { recursive: true });
  cpSync(join(REPO_ROOT, "LICENSE"), join(root, "LICENSE"));
  mkdirSync(join(root, "plugins", "chatbotx", ".claude-plugin"), { recursive: true });
  cpSync(
    join(REPO_ROOT, "plugins", "chatbotx", ".claude-plugin", "icon.png"),
    join(root, "plugins", "chatbotx", ".claude-plugin", "icon.png"),
  );
  return root;
}

test("builds, zips, extracts and verifies the package", () => {
  const root = makeRepo();
  const logs = [];
  const result = build({ repoRoot: root, log: (line) => logs.push(line) });
  assert.ok(existsSync(join(root, "dist", "openai.zip")));
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.version, "1.0.0");
  assert.ok(logs.some((line) => line.startsWith("sha256: ")));
  assert.deepEqual(checkPlugin(join(root, "dist", "openai"), { requireOAuth: true }), []);
});

test("the same input produces the same ZIP checksum", () => {
  const root = makeRepo();
  const first = build({ repoRoot: root, log: () => {} }).sha256;
  assert.equal(build({ repoRoot: root, log: () => {} }).sha256, first);
});

test("excludes the CLI and MCP skills, .app.json, hooks and app references", () => {
  const root = makeRepo();
  for (const name of ["chatbotx", "chatbotx-mcp"]) {
    mkdirSync(join(root, "openai", "skills", name), { recursive: true });
    writeFileSync(join(root, "openai", "skills", name, "SKILL.md"), "---\nname: x\ndescription: y\n---\nsearch_tools\n");
  }
  writeFileSync(join(root, "openai", ".app.json"), "{}");
  mkdirSync(join(root, "openai", "skills", "chatbotx-openai", "hooks"), { recursive: true });
  writeFileSync(join(root, "openai", "skills", "chatbotx-openai", "hooks", "h.sh"), "x");
  const manifestPath = join(root, "openai", "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.hooks = { Stop: [] };
  manifest.extensions["com.openai"].apps = { x: 1 };
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const paths = [...collectPackage({ repoRoot: root }).keys()].sort();
  assert.deepEqual(paths, ["LICENSE", "assets/icon.png", "mcp.json", "plugin.json", "skills/chatbotx-openai/SKILL.md"]);
  const shipped = JSON.parse(collectPackage({ repoRoot: root }).get("plugin.json"));
  assert.equal(shipped.hooks, undefined);
  assert.equal(shipped.extensions["com.openai"].apps, undefined);
});

test("sanitizeManifest does not mutate its input", () => {
  const input = { name: "x", hooks: {}, extensions: { "com.openai": { apps: {}, interface: {} } } };
  const output = sanitizeManifest(input);
  assert.ok("hooks" in input && "apps" in input.extensions["com.openai"]);
  assert.deepEqual(output, { name: "x", extensions: { "com.openai": { interface: {} } } });
});

test("the build fails when a shipped skill contains a forbidden instruction", () => {
  const root = makeRepo();
  const skill = join(root, "openai", "skills", "chatbotx-openai", "SKILL.md");
  writeFileSync(skill, `${readFileSync(skill, "utf8")}\nUse search_tools.\n`);
  assert.throws(() => build({ repoRoot: root, log: () => {} }), /skill_dynamic_executor/);
});

test("ZIP round-trips and rejects unsafe entries", () => {
  const files = new Map([["a/b.txt", Buffer.from("hello")], ["c.txt", Buffer.alloc(0)]]);
  const entries = readZip(createZip(files));
  assert.equal(entries.get("a/b.txt").toString(), "hello");
  assert.equal(entries.get("c.txt").length, 0);
  assert.throws(() => readZip(createZip(new Map([["../evil", Buffer.from("x")]]))), /unsafe ZIP entry/);
  assert.throws(() => readZip(Buffer.from("nope")), /not a ZIP/);
});

test("reports missing assets and broken skill links", () => {
  const root = makeRepo();
  build({ repoRoot: root, log: () => {} });
  const dist = join(root, "dist", "openai");
  assert.deepEqual(verifyReferences(dist), []);
  writeFileSync(join(dist, "skills", "chatbotx-openai", "SKILL.md"), "---\nname: a\ndescription: b\n---\n[x](references/none.md)\n");
  assert.match(verifyReferences(dist).join("\n"), /missing file: references\/none\.md/);
});

test("the OpenAI mcp.json targets /mcp/openai with OAuth and no client credentials", () => {
  const mcp = JSON.parse(readFileSync(join(REPO_ROOT, "openai", "mcp.json"), "utf8"));
  const server = mcp.mcpServers.chatbotx;
  assert.equal(server.url, "https://app.chatbotx.io/mcp/openai");
  assert.deepEqual(server.extensions["com.openai"].auth, { type: "oauth" });
});

test("the shared root mcp.json still uses /mcp/messages", () => {
  const mcp = JSON.parse(readFileSync(join(REPO_ROOT, "mcp.json"), "utf8"));
  assert.equal(mcp.mcpServers.chatbotx.url, "https://app.chatbotx.io/mcp/messages");
});

test("the OpenAI skill names only v1 tools and covers all of them", () => {
  for (const tool of V1_TOOLS.filter((name) => name !== "get_guide")) {
    assert.ok(skillText.includes(`\`${tool}\``), `skill is missing ${tool}`);
  }
  assert.ok(skillText.includes("get_guide"));
  for (const tool of [...DEFERRED_V2_TOOLS, ...EXCLUDED_TOOLS, "search_tools", "call_tool"]) {
    assert.ok(!skillText.includes(tool), `skill must not mention ${tool}`);
  }
});
