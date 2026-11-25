import { test } from "node:test";
import assert from "node:assert/strict";
import { DESCRIPTION } from "../../manifest/brand.mjs";
import { MCP_URL, PACKAGE_NAME, collectPackage, findDrift, verifyPackage } from "../build.mjs";

const MARKER = ".claude-plugin/plugin.json";
const json = (files, path) => JSON.parse(files.get(path).toString("utf8"));
const withJson = (files, path, value) => new Map([...files, [path, Buffer.from(JSON.stringify(value))]]);

test("the built package passes its own checks", () => {
  assert.deepEqual(verifyPackage(collectPackage()), []);
});

test("ships one Claude marker, package.json, icon, README and both skills", () => {
  const files = collectPackage();
  for (const path of [MARKER, "package.json", "README.md", "LICENSE", "assets/icon.png", "skills/chatbotx/SKILL.md", "skills/chatbotx-mcp/SKILL.md", "skills/chatbotx/references/commands.md"]) {
    assert.ok(files.has(path), path);
  }
  assert.ok(![...files.keys()].some((path) => path.endsWith("skill-card.md")));
  assert.ok(!files.has("openclaw.plugin.json"));
  assert.ok(!files.has("plugin.json"));
});

test("declares the hosted MCP server with OAuth", () => {
  const marker = json(collectPackage(), MARKER);
  assert.deepEqual(marker.mcpServers, { chatbotx: { type: "http", url: MCP_URL, auth: "oauth" } });
});

test("package.json and marker share name, version and description", () => {
  const files = collectPackage();
  const pkg = json(files, "package.json");
  const marker = json(files, MARKER);
  assert.equal(pkg.name, PACKAGE_NAME);
  assert.equal(pkg.displayName, "ChatbotX");
  assert.equal(pkg.description, DESCRIPTION);
  assert.equal(marker.description, DESCRIPTION);
  assert.equal(pkg.version, marker.version);
  assert.equal(pkg.openclaw, undefined);
});

test("skills are copied byte for byte, keeping the OpenClaw metadata", () => {
  const skill = collectPackage().get("skills/chatbotx/SKILL.md").toString("utf8");
  assert.match(skill, /metadata:\n {2}openclaw:/);
});

test("rejects a second bundle marker", () => {
  const files = new Map([...collectPackage(), [".cursor-plugin/plugin.json", Buffer.from('{"name":"x"}')]]);
  assert.ok(verifyPackage(files).some((p) => p.includes("exactly one bundle marker")));
});

test("rejects an MCP server without OAuth", () => {
  const files = collectPackage();
  const marker = json(files, MARKER);
  const broken = withJson(files, MARKER, { ...marker, mcpServers: { chatbotx: { type: "http", url: MCP_URL } } });
  assert.ok(verifyPackage(broken).some((p) => p.includes('auth must be "oauth"')));
});

test("rejects openclaw.plugin.json and a drifting description", () => {
  const files = collectPackage();
  const pkg = json(files, "package.json");
  const broken = withJson(withJson(files, "openclaw.plugin.json", { id: "x" }), "package.json", { ...pkg, description: "other" });
  const problems = verifyPackage(broken);
  assert.ok(problems.some((p) => p.startsWith("openclaw.plugin.json")));
  assert.ok(problems.some((p) => p.includes("package.json: description")));
});

test("findDrift reports changed, missing and extra files", () => {
  const expected = new Map([["a", Buffer.from("1")], ["b", Buffer.from("2")]]);
  const actual = new Map([["a", Buffer.from("1")], ["b", Buffer.from("x")], ["c", Buffer.from("3")]]);
  assert.deepEqual(findDrift(expected, actual), ["b", "c"]);
  assert.deepEqual(findDrift(expected, new Map()), ["a", "b"]);
});
