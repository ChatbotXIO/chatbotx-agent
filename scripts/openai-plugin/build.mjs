// Builds the OpenAI submission package from openai/ into dist/openai/ and dist/openai.zip.
//
// 1. Copies the dedicated OpenAI sources (plugin.json, mcp.json, skills/) and reuses the repository
//    LICENSE and the Claude plugin icon.
// 2. Leaves out the CLI and generic MCP skills, .app.json, app references and lifecycle hooks.
// 3. Zips the directory (deterministically), extracts the ZIP into a clean temp dir, runs the strict
//    checker there, verifies every referenced asset and skill exists, and prints the SHA-256.
//
// Usage: node scripts/openai-plugin/build.mjs

import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { checkPlugin, formatIssues } from "./check-manifest.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const EXCLUDED_SKILLS = Object.freeze(["chatbotx", "chatbotx-mcp"]);
const EXCLUDED_FILES = Object.freeze([".app.json", "skill-card.md", ".DS_Store"]);
const EXCLUDED_DIRS = Object.freeze(["hooks"]);
const STRIPPED_MANIFEST_KEYS = Object.freeze(["hooks", "apps", "app"]);
const STRIPPED_EXTENSION_KEYS = Object.freeze(["hooks", "apps", "app"]);
const ICON_SOURCE = join("plugins", "chatbotx", ".claude-plugin", "icon.png");
const ICON_TARGET = join("assets", "icon.png");
// 1980-01-01 00:00:00 in DOS time, so the same input always gives the same ZIP bytes.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

// Returns the manifest without hooks, apps and app references.
export function sanitizeManifest(manifest) {
  const openai = manifest.extensions?.["com.openai"];
  const cleanedOpenai =
    openai && Object.fromEntries(Object.entries(openai).filter(([key]) => !STRIPPED_EXTENSION_KEYS.includes(key)));
  const base = Object.fromEntries(Object.entries(manifest).filter(([key]) => !STRIPPED_MANIFEST_KEYS.includes(key)));
  return cleanedOpenai
    ? { ...base, extensions: { ...manifest.extensions, "com.openai": cleanedOpenai } }
    : base;
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return EXCLUDED_DIRS.includes(entry.name) ? [] : listFiles(full);
      return EXCLUDED_FILES.includes(entry.name) ? [] : [full];
    });
}

// Collects the package as a Map of POSIX relative path -> Buffer.
export function collectPackage({ repoRoot = REPO_ROOT, sourceDir = join(repoRoot, "openai") } = {}) {
  const files = new Map();
  files.set("plugin.json", Buffer.from(`${JSON.stringify(sanitizeManifest(JSON.parse(readFileSync(join(sourceDir, "plugin.json"), "utf8"))), null, 2)}\n`));
  files.set("mcp.json", readFileSync(join(sourceDir, "mcp.json")));
  const skillsDir = join(sourceDir, "skills");
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || EXCLUDED_SKILLS.includes(entry.name)) continue;
    for (const file of listFiles(join(skillsDir, entry.name))) {
      files.set(relative(sourceDir, file).split(sep).join("/"), readFileSync(file));
    }
  }
  files.set("LICENSE", readFileSync(join(repoRoot, "LICENSE")));
  files.set(ICON_TARGET.split(sep).join("/"), readFileSync(join(repoRoot, ICON_SOURCE)));
  return files;
}

export function writePackage(files, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  for (const [path, content] of files) {
    const target = join(outDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

// Minimal ZIP writer (deflate, fixed timestamps, sorted entries).
export function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const path of [...files.keys()].sort()) {
    const name = Buffer.from(path, "utf8");
    const data = files.get(path);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0o100644 << 16 >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

// Reads every entry of a ZIP made by createZip, rejecting paths that escape the extraction root.
export function readZip(buffer) {
  const endAt = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error("not a ZIP file: end of central directory not found");
  const count = buffer.readUInt16LE(endAt + 10);
  let cursor = buffer.readUInt32LE(endAt + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("corrupt ZIP central directory");
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const packedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localAt = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (name.startsWith("/") || name.split("/").includes("..")) throw new Error(`unsafe ZIP entry: ${name}`);
    const dataAt = localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28);
    const packed = buffer.subarray(dataAt, dataAt + packedSize);
    const data = method === 8 ? inflateRawSync(packed) : packed;
    if (method !== 0 && method !== 8) throw new Error(`unsupported ZIP method ${method} for ${name}`);
    if (crc32(data) !== crc) throw new Error(`ZIP checksum mismatch for ${name}`);
    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readManifest(root) {
  return JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));
}

// Verifies every file the package refers to exists inside the root: interface assets,
// the onboarding skill, and relative Markdown links in the shipped skills. Returns problems.
export function verifyReferences(root) {
  const problems = [];
  const manifest = readManifest(root);
  const iface = manifest.extensions?.["com.openai"]?.interface ?? {};
  const declared = ["logo", "logoDark", "composerIcon", "composerIconDark"]
    .filter((field) => iface[field] !== undefined)
    .map((field) => [`interface.${field}`, iface[field]]);
  const onboarding = manifest.extensions?.["com.openai"]?.onboardingSkill;
  if (onboarding !== undefined) declared.push(["onboardingSkill", onboarding]);
  for (const [label, value] of declared) {
    const absolute = resolve(root, value);
    if (relative(root, absolute).startsWith("..") || !existsSync(absolute)) problems.push(`${label} missing: ${value}`);
  }
  const skillsDir = join(root, "skills");
  const skills = existsSync(skillsDir) ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()) : [];
  if (skills.length === 0) problems.push("no skill shipped");
  for (const skill of skills) {
    const skillFile = join(skillsDir, skill.name, "SKILL.md");
    if (!existsSync(skillFile)) {
      problems.push(`skills/${skill.name}/SKILL.md missing`);
      continue;
    }
    for (const [, target] of readFileSync(skillFile, "utf8").matchAll(/\]\((?!https?:|mailto:|#)([^)#\s]+)/g)) {
      const absolute = resolve(skillsDir, skill.name, target);
      if (relative(root, absolute).startsWith("..") || !existsSync(absolute)) {
        problems.push(`skills/${skill.name}/SKILL.md links to missing file: ${target}`);
      }
    }
  }
  return problems;
}

// Strict checker + reference check on a package root. Returns { ok, lines }.
export function verifyPackage(root) {
  const issues = checkPlugin(root, { requireOAuth: true });
  const references = verifyReferences(root);
  return {
    ok: issues.length === 0 && references.length === 0,
    lines: [...formatIssues(issues), ...references.map((p) => `ERROR reference: ${p}`)],
  };
}

export function build({ repoRoot = REPO_ROOT, log = console.log } = {}) {
  const distDir = join(repoRoot, "dist");
  const outDir = join(distDir, "openai");
  const zipPath = join(distDir, "openai.zip");
  const files = collectPackage({ repoRoot });
  writePackage(files, outDir);

  const built = verifyPackage(outDir);
  if (!built.ok) throw new Error(`dist/openai failed the strict check:\n${built.lines.join("\n")}`);

  const zip = createZip(files);
  writeFileSync(zipPath, zip);

  const tempRoot = mkdtempSync(join(tmpdir(), "openai-plugin-"));
  try {
    for (const [path, content] of readZip(readFileSync(zipPath))) {
      const target = join(tempRoot, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    const extracted = verifyPackage(tempRoot);
    if (!extracted.ok) throw new Error(`extracted ZIP failed the strict check:\n${extracted.lines.join("\n")}`);
    const extractedFiles = listFiles(tempRoot).map((f) => relative(tempRoot, f).split(sep).join("/")).sort();
    if (JSON.stringify(extractedFiles) !== JSON.stringify([...files.keys()].sort())) {
      throw new Error("extracted ZIP does not match dist/openai");
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  const sha256 = createHash("sha256").update(zip).digest("hex");
  const version = readManifest(outDir).version;
  log(`dist/openai: ${files.size} files`);
  log(`dist/openai.zip: ${statSync(zipPath).size} bytes`);
  log(`version: ${version}`);
  log(`sha256: ${sha256}`);
  return { version, sha256, zipPath, outDir };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    build();
  } catch (cause) {
    console.error(cause.message);
    process.exit(1);
  }
}
