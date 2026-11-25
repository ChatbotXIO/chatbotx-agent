import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DESCRIPTION, SUMMARY, SUMMARY_MAX } from "../brand.mjs";
import { SOURCE_TARGETS, getAt, planSync, setAt, syncManifest } from "../sync.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Generated copies, checked here as well so a stale build cannot ship a different description.
const GENERATED_TARGETS = {
  "plugins/chatbotx/plugin.json": [["description"]],
  "plugins/openclaw/.claude-plugin/plugin.json": [["description"]],
  "plugins/openclaw/package.json": [["description"]],
};

const readJson = (file) => JSON.parse(readFileSync(join(REPO_ROOT, file), "utf8"));

test("summary fits OpenAI's final short-description limit", () => {
  assert.ok(SUMMARY.length <= SUMMARY_MAX, `${SUMMARY.length} > ${SUMMARY_MAX}`);
});

test("every source manifest carries the shared summary and description", () => {
  for (const [file, targets] of Object.entries(SOURCE_TARGETS)) {
    const manifest = readJson(file);
    for (const { path, value } of targets) {
      assert.equal(getAt(manifest, path), value, `${file}: ${path.join(".")}`);
    }
  }
});

test("every generated manifest carries the shared description", () => {
  for (const [file, paths] of Object.entries(GENERATED_TARGETS)) {
    assert.ok(existsSync(join(REPO_ROOT, file)), `${file} missing; run the plugin builds`);
    const manifest = readJson(file);
    for (const path of paths) assert.equal(getAt(manifest, path), DESCRIPTION, `${file}: ${path.join(".")}`);
  }
});

test("no top-level plugin description in the repo differs from the shared one", () => {
  const files = [...Object.keys(SOURCE_TARGETS), ...Object.keys(GENERATED_TARGETS)];
  const descriptions = new Set(files.map((file) => readJson(file).description ?? readJson(file).metadata?.description));
  assert.deepEqual([...descriptions], [DESCRIPTION]);
});

test("the manifests on disk are already synced", () => {
  const stale = planSync(REPO_ROOT).filter(({ current, expected }) => current !== expected);
  assert.deepEqual(stale.map(({ file }) => file), []);
});

test("setAt returns a copy and leaves the input untouched", () => {
  const input = { plugins: [{ description: "old", name: "x" }], other: 1 };
  const output = setAt(input, ["plugins", 0, "description"], "new");
  assert.equal(output.plugins[0].description, "new");
  assert.equal(output.plugins[0].name, "x");
  assert.equal(input.plugins[0].description, "old");
  assert.ok(Array.isArray(output.plugins));
});

test("setAt throws on a missing field instead of adding it", () => {
  assert.throws(() => setAt({ metadata: {} }, ["metadata", "description"], "x", "m.json"), /m.json: missing field metadata.description/);
});

test("syncManifest applies every target", () => {
  const out = syncManifest({ description: "a", extensions: { "com.openai": { interface: { shortDescription: "b" } } } }, SOURCE_TARGETS["openai/plugin.json"]);
  assert.equal(out.description, DESCRIPTION);
  assert.equal(out.extensions["com.openai"].interface.shortDescription, SUMMARY);
});
