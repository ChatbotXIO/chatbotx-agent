// Checks a plugin package against OpenAI's plugin submission rules before uploading it to the
// ChatGPT / Codex plugin submission portal. It runs offline: it reads plugin.json, mcp.json,
// skills/ and the branding images, and reports the same error codes the portal uses.
//
// It cannot check what only the portal sees: tool annotations, domain verification, the
// MCP scan, or review test cases. Run the server in ChatGPT developer mode for those.
//
// Usage: node scripts/openai-plugin/check-manifest.mjs [plugin-dir] [--strict] [--require-oauth]
//        plugin-dir defaults to dist/openai (run `npm run build:openai-plugin` first).
//        --strict also fails on warnings.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INTERFACE_ASSET_FIELDS,
  checkDeclaredPath,
  checkImage,
  checkInterface,
  checkMcpConfig,
  checkRootManifest,
  checkSkill,
  checkSkillContent,
  error,
  warning,
} from "./rules.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT_MANIFEST = "plugin.json";
const CODEX_MANIFEST = join(".codex-plugin", "plugin.json");
export const DEFAULT_PLUGIN_DIR = join(REPO_ROOT, "dist", "openai");

// Resolves the plugin directory from the CLI argument, falling back to the built package.
export function resolvePluginDir(target) {
  return resolve(target ?? DEFAULT_PLUGIN_DIR);
}

// Reads and parses a JSON file, turning failures into portal-style issues.
export function readJson(path, codePrefix) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    return { issues: [error(`${codePrefix}_unreadable`, `${path}: ${cause.message}`)] };
  }
  try {
    return { value: JSON.parse(text), issues: [] };
  } catch (cause) {
    return { issues: [error(`${codePrefix}_json_malformed`, `${path}: ${cause.message}`)] };
  }
}

// Finds the manifest: portable root plugin.json first, Codex .codex-plugin/plugin.json second.
function locateManifest(pluginDir) {
  if (existsSync(join(pluginDir, ROOT_MANIFEST))) return { path: join(pluginDir, ROOT_MANIFEST), isCodex: false };
  if (existsSync(join(pluginDir, CODEX_MANIFEST))) return { path: join(pluginDir, CODEX_MANIFEST), isCodex: true };
  return null;
}

function checkMcp(pluginDir, isCodex, options) {
  const fileName = isCodex ? ".mcp.json" : "mcp.json";
  const path = join(pluginDir, fileName);
  if (!existsSync(path)) return { issues: [], hasMcpServers: false };
  const { value, issues } = readJson(path, "mcp_manifest");
  if (issues.length > 0) return { issues, hasMcpServers: false };
  const hasMcpServers = Object.keys(value?.mcpServers ?? {}).length > 0;
  const configIssues = checkMcpConfig(value, options).filter((issue) => !(isCodex && issue.code === "mcp_schema_missing"));
  return { issues: configIssues, hasMcpServers };
}

function listMarkdown(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdown(full);
    return entry.name.toLowerCase().endsWith(".md") ? [full] : [];
  });
}

function checkSkills(pluginDir, pluginName) {
  const skillsDir = join(pluginDir, "skills");
  if (!existsSync(skillsDir)) return { issues: [], skillNames: [] };
  const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const results = dirs.map((entry) => {
    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    const markdown = existsSync(skillPath) ? readFileSync(skillPath, "utf8") : undefined;
    const name = markdown?.match(/^name:\s*["']?([^"'\r\n]+)/m)?.[1]?.trim();
    return { name, issues: checkSkill({ dirName: entry.name, markdown, pluginName }) };
  });
  const skillNames = results.map((result) => result.name).filter(Boolean);
  const duplicates = [...new Set(skillNames.filter((name, index) => skillNames.indexOf(name) !== index))];
  return {
    skillNames,
    issues: [
      ...results.flatMap((result) => result.issues),
      ...listMarkdown(skillsDir).flatMap((file) =>
        checkSkillContent({ label: relative(pluginDir, file), markdown: readFileSync(file, "utf8") }),
      ),
      ...duplicates.map((name) => error("skill_identity_duplicate", `two skills are named ${name}`)),
    ],
  };
}

function checkAssetFile(pluginDir, value, label) {
  const pathIssues = checkDeclaredPath(value, label);
  if (pathIssues.length > 0) return pathIssues;
  const absolute = resolve(pluginDir, value);
  if (relative(pluginDir, absolute).startsWith("..")) {
    return [error("declared_asset_path_outside_package", `${label} points outside the plugin: ${value}`)];
  }
  if (!existsSync(absolute)) return [error("declared_asset_file_missing", `${label} file not found: ${value}`)];
  if (!statSync(absolute).isFile()) return [error("declared_asset_not_regular_file", `${label} is not a file: ${value}`)];
  return checkImage({ label, extension: extname(absolute).toLowerCase(), buffer: readFileSync(absolute) });
}

function checkOpenAiExtension(pluginDir, { manifest, isCodex, hasMcpServers, skillNames }) {
  const extension = manifest.extensions?.["com.openai"] ?? {};
  const iface = isCodex ? manifest.interface : extension.interface;
  const assetIssues =
    iface && typeof iface === "object"
      ? INTERFACE_ASSET_FIELDS.filter((field) => iface[field] !== undefined).flatMap((field) =>
          checkAssetFile(pluginDir, iface[field], `interface.${field}`),
        )
      : [];
  const onboarding = extension.onboardingSkill;
  const onboardingIssues =
    onboarding === undefined
      ? []
      : [
          ...checkDeclaredPath(onboarding, "onboardingSkill"),
          ...(existsSync(resolve(pluginDir, String(onboarding)))
            ? []
            : [error("declared_asset_file_missing", `onboardingSkill not found: ${onboarding}`)]),
        ];
  return [
    ...checkInterface(iface, { hasMcpServers }),
    ...assetIssues,
    ...onboardingIssues,
    ...(extension.hooks !== undefined
      ? [warning("plugin_hooks_not_public", "plugins with hooks are not eligible for the public directory")]
      : []),
    ...(extension.apps !== undefined
      ? [warning("app_configuration_excluded", "ZIP uploads drop apps / .app.json")]
      : []),
    ...(!hasMcpServers && skillNames.length === 0
      ? [error("plugin_runtime_surface_missing", "the plugin has no skill and no MCP server")]
      : []),
  ];
}

export function checkPlugin(pluginDir, options = {}) {
  const located = locateManifest(pluginDir);
  if (!located) {
    return [error("plugin_manifest_missing", `no plugin.json or .codex-plugin/plugin.json in ${pluginDir}`)];
  }
  const { value: manifest, issues: readIssues } = readJson(located.path, "plugin_manifest");
  if (readIssues.length > 0) return readIssues;

  const rootIssues = checkRootManifest(manifest);
  if (rootIssues.some((issue) => issue.code === "plugin_manifest_root_not_object")) return rootIssues;

  const mcp = checkMcp(pluginDir, located.isCodex, options);
  const skills = checkSkills(pluginDir, manifest.name);
  return [
    ...rootIssues,
    ...mcp.issues,
    ...skills.issues,
    ...checkOpenAiExtension(pluginDir, {
      manifest,
      isCodex: located.isCodex,
      hasMcpServers: mcp.hasMcpServers,
      skillNames: skills.skillNames,
    }),
  ];
}

export function formatIssues(issues) {
  return issues.map((issue) => `${issue.level === "error" ? "ERROR" : "WARN "} ${issue.code}: ${issue.message}`);
}

function main(argv) {
  const strict = argv.includes("--strict");
  const requireOAuth = argv.includes("--require-oauth");
  const target = argv.find((arg) => !arg.startsWith("--"));
  const pluginDir = resolvePluginDir(target);
  const issues = checkPlugin(pluginDir, { requireOAuth });
  const errors = issues.filter((issue) => issue.level === "error").length;
  const warnings = issues.length - errors;

  for (const line of formatIssues(issues)) console.log(line);
  console.log(`\n${relative(process.cwd(), pluginDir) || "."}: ${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0 || (strict && warnings > 0)) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
