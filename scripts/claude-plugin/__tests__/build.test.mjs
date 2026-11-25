import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PORTABLE_FRONTMATTER_KEYS,
  buildOutputs,
  toPortableSkill,
  validateSkill,
} from "../build.mjs";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "skills");

test("keeps the full frontmatter, including allowed-tools and metadata", () => {
  const input = [
    "---",
    "name: demo",
    'description: "Does things"',
    "allowed-tools: Bash(demo:*)",
    "version: 1.0.0",
    "metadata:",
    "  openclaw:",
    "    primaryEnv: X",
    "---",
    "# Body",
    "",
  ].join("\n");

  assert.equal(validateSkill(input), input);
});

test("throws when frontmatter is missing", () => {
  assert.throws(() => validateSkill("# No frontmatter\n"), /missing YAML frontmatter/);
});

test("throws when description is missing", () => {
  assert.throws(() => validateSkill("---\nname: demo\n---\nbody\n"), /description/);
});

test("the plugin copy keeps only name/description/license and the body", () => {
  const input = [
    "---",
    "name: demo",
    'description: "Does things"',
    "allowed-tools: Bash(demo:*)",
    "compatibility: needs a shell",
    "version: 1.0.0",
    "homepage: https://example.com",
    'emoji: "🤖"',
    "metadata:",
    "  openclaw:",
    "    primaryEnv: X",
    "---",
    "# Body",
    "version: not frontmatter",
    "",
  ].join("\n");

  assert.equal(
    toPortableSkill(input),
    [
      "---",
      "name: demo",
      'description: "Does things"',
      "---",
      "# Body",
      "version: not frontmatter",
      "",
    ].join("\n"),
  );
});

test("every generated file is its source in skills/ with portable frontmatter", () => {
  const outputs = buildOutputs();

  assert.ok([...outputs.keys()].filter((p) => p.endsWith("SKILL.md")).length >= 2);
  for (const [path, content] of outputs) {
    const source = readFileSync(join(SKILLS_DIR, path), "utf8");
    const expected = path.endsWith("SKILL.md") ? toPortableSkill(source) : source;
    assert.equal(content, expected, path);
  }
});

test("every generated SKILL.md uses only portable top-level frontmatter keys", () => {
  for (const [path, content] of buildOutputs()) {
    if (!path.endsWith("SKILL.md")) continue;
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/)[1];
    for (const line of frontmatter.split("\n")) {
      const key = line.match(/^([A-Za-z][\w-]*):/)?.[1];
      if (key) assert.ok(PORTABLE_FRONTMATTER_KEYS.has(key), `${path}: ${key}`);
    }
  }
});

test("skill-card.md is not shipped", () => {
  const paths = [...buildOutputs().keys()];
  assert.ok(!paths.some((p) => p.endsWith("skill-card.md")));
});
