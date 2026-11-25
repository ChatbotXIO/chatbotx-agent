// Writes SUMMARY and DESCRIPTION from brand.mjs into every hand-maintained plugin manifest.
//
// Generated copies are not listed here: plugins/chatbotx/plugin.json is copied from the root
// plugin.json by scripts/claude-plugin/build.mjs, plugins/openclaw/ is written by
// scripts/openclaw-plugin/build.mjs, and dist/openai/ by scripts/openai-plugin/build.mjs. Each of
// those builds reads the synced sources, and the test in __tests__/sync.test.mjs checks them all.
//
// Usage: node scripts/manifest/sync.mjs          rewrite the manifests
//        node scripts/manifest/sync.mjs --check  exit 1 when a manifest differs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DESCRIPTION, DESCRIPTION_MAX, SUMMARY, SUMMARY_MAX } from "./brand.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const description = (...path) => ({ path, value: DESCRIPTION });
const summary = (...path) => ({ path, value: SUMMARY });

// file -> fields it must carry. A path segment that is a number indexes an array.
export const SOURCE_TARGETS = Object.freeze({
  "plugin.json": [description("description")],
  ".claude-plugin/marketplace.json": [
    description("metadata", "description"),
    description("plugins", 0, "description"),
  ],
  "plugins/chatbotx/.claude-plugin/plugin.json": [description("description")],
  ".cursor-plugin/plugin.json": [description("description")],
  ".cursor-plugin/marketplace.json": [
    description("metadata", "description"),
    description("plugins", 0, "description"),
  ],
  ".grok-plugin/plugin.json": [description("description")],
  ".grok-plugin/marketplace.json": [
    description("metadata", "description"),
    description("plugins", 0, "description"),
  ],
  "gemini-extension.json": [description("description")],
  ".antigravity-plugin/plugin.json": [description("description")],
  "openai/plugin.json": [
    description("description"),
    summary("extensions", "com.openai", "interface", "shortDescription"),
  ],
});

export function assertCopyFits() {
  if (SUMMARY.length > SUMMARY_MAX) {
    throw new Error(`SUMMARY is ${SUMMARY.length} characters; the limit is ${SUMMARY_MAX}`);
  }
  if (DESCRIPTION.length > DESCRIPTION_MAX) {
    throw new Error(`DESCRIPTION is ${DESCRIPTION.length} characters; the limit is ${DESCRIPTION_MAX}`);
  }
}

export function getAt(value, path) {
  return path.reduce((node, key) => (node == null ? undefined : node[key]), value);
}

// Returns a copy of `value` with `next` at `path`. Throws when the path does not already exist, so
// a renamed or removed manifest field fails loudly instead of growing a new key.
export function setAt(value, path, next, label = "manifest", fullPath = path) {
  if (path.length === 0) return next;
  const [key, ...rest] = path;
  if (value == null || typeof value !== "object" || !(key in value)) {
    throw new Error(`${label}: missing field ${fullPath.join(".")}`);
  }
  const child = setAt(value[key], rest, next, label, fullPath);
  if (Array.isArray(value)) return value.map((item, index) => (index === key ? child : item));
  return { ...value, [key]: child };
}

export function syncManifest(manifest, targets, label) {
  return targets.reduce((acc, { path, value }) => setAt(acc, path, value, label), manifest);
}

export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// Returns [{ file, current, expected }] for every source manifest.
export function planSync(repoRoot = REPO_ROOT) {
  assertCopyFits();
  return Object.entries(SOURCE_TARGETS).map(([file, targets]) => {
    const current = readFileSync(join(repoRoot, file), "utf8");
    const expected = formatJson(syncManifest(JSON.parse(current), targets, file));
    return { file, current, expected };
  });
}

function main() {
  const plan = planSync();
  const stale = plan.filter(({ current, expected }) => current !== expected);
  if (process.argv.includes("--check")) {
    if (stale.length > 0) {
      console.error("Plugin manifests differ from scripts/manifest/brand.mjs:");
      stale.forEach(({ file }) => console.error(`  ${file}`));
      console.error("Run: npm run sync:manifests");
      process.exit(1);
    }
    return;
  }
  for (const { file, expected } of stale) writeFileSync(join(REPO_ROOT, file), expected, "utf8");
  console.log(stale.length ? `updated ${stale.map(({ file }) => file).join(", ")}` : "manifests already in sync");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (cause) {
    console.error(cause.message);
    process.exit(1);
  }
}
