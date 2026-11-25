import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkDeclaredPath,
  checkImage,
  checkInterface,
  checkMcpConfig,
  checkMcpAuth,
  checkSkillContent,
  V1_TOOLS,
  DEFERRED_V2_TOOLS,
  EXCLUDED_TOOLS,
  checkRootManifest,
  checkSkill,
  contrastRatio,
  parseSkillFrontmatter,
} from "../rules.mjs";
import { checkPlugin } from "../check-manifest.mjs";

const codes = (issues) => issues.map((issue) => issue.code);
const errorCodes = (issues) => codes(issues.filter((issue) => issue.level === "error"));

const VALID_MANIFEST = {
  name: "demo-plugin",
  version: "1.0.0",
  description: "Does things.",
  author: { name: "Demo", url: "https://example.com" },
  homepage: "https://example.com",
};

const VALID_INTERFACE = {
  displayName: "Demo",
  shortDescription: "Does things",
  longDescription: "Does things.\nIn detail.",
  developerName: "Demo Inc",
  category: "Productivity",
  capabilities: ["Read"],
  websiteURL: "https://example.com",
  supportURL: "https://example.com/support",
  privacyPolicyURL: "https://example.com/privacy",
  termsOfServiceURL: "https://example.com/terms",
  defaultPrompt: ["List my contacts"],
  brandColor: "#1A56DB",
  logo: "./assets/logo.svg",
  composerIcon: "./assets/logo.svg",
};

const SQUARE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"></svg>';

test("accepts a valid root manifest", () => {
  assert.deepEqual(checkRootManifest(VALID_MANIFEST), []);
});

test("rejects a non-object manifest", () => {
  assert.deepEqual(codes(checkRootManifest([])), ["plugin_manifest_root_not_object"]);
});

test("rejects names with spaces or a leading hyphen", () => {
  assert.deepEqual(codes(checkRootManifest({ ...VALID_MANIFEST, name: "my plugin" })), ["plugin_name_format"]);
  assert.deepEqual(codes(checkRootManifest({ ...VALID_MANIFEST, name: "-demo" })), ["plugin_name_format"]);
});

test("requires a semver version", () => {
  assert.deepEqual(codes(checkRootManifest({ ...VALID_MANIFEST, version: undefined })), ["plugin_version_missing"]);
  assert.deepEqual(codes(checkRootManifest({ ...VALID_MANIFEST, version: "1.2" })), ["plugin_version_not_semver"]);
});

test("rejects a description over 1024 chars", () => {
  const manifest = { ...VALID_MANIFEST, description: "x".repeat(1025) };
  assert.deepEqual(codes(checkRootManifest(manifest)), ["plugin_description_too_long"]);
});

test("requires author.name and https author urls", () => {
  assert.deepEqual(codes(checkRootManifest({ ...VALID_MANIFEST, author: undefined })), ["plugin_developer_missing"]);
  const httpAuthor = { ...VALID_MANIFEST, author: { name: "Demo", url: "http://example.com" } };
  assert.deepEqual(codes(checkRootManifest(httpAuthor)), ["plugin_author_url_not_https"]);
});

test("rejects homepage urls with credentials", () => {
  const manifest = { ...VALID_MANIFEST, homepage: "https://user:pw@example.com" };
  assert.deepEqual(codes(checkRootManifest(manifest)), ["plugin_homepage_has_credentials"]);
});

test("accepts a valid interface", () => {
  assert.deepEqual(checkInterface(VALID_INTERFACE, { hasMcpServers: true }), []);
});

test("reports a missing interface as an error", () => {
  assert.deepEqual(codes(checkInterface(undefined, { hasMcpServers: true })), ["plugin_interface_missing"]);
});

test("requires policy urls only when the plugin has an MCP server", () => {
  const { websiteURL, ...withoutWebsite } = VALID_INTERFACE;
  assert.deepEqual(codes(checkInterface(withoutWebsite, { hasMcpServers: true })), ["plugin_website_url_missing"]);
  assert.deepEqual(checkInterface(withoutWebsite, { hasMcpServers: false }), []);
});

test("maps each policy url field to its portal error code", () => {
  const iface = { ...VALID_INTERFACE, privacyPolicyURL: "http://x.com", termsOfServiceURL: "http://x.com" };
  assert.deepEqual(codes(checkInterface(iface, { hasMcpServers: true })), [
    "plugin_privacy_policy_url_not_https",
    "plugin_terms_of_service_url_not_https",
  ]);
});

test("warns, but does not fail, when listing text exceeds the directory limit", () => {
  const issues = checkInterface({ ...VALID_INTERFACE, displayName: "A".repeat(40) }, { hasMcpServers: true });
  assert.deepEqual(issues.map((i) => [i.level, i.code]), [["warning", "plugin_display_name_too_long"]]);
});

test("rejects unknown categories and warns when the category is missing", () => {
  assert.deepEqual(errorCodes(checkInterface({ ...VALID_INTERFACE, category: "Sales" }, { hasMcpServers: true })), [
    "plugin_category_unknown",
  ]);
  const { category, ...withoutCategory } = VALID_INTERFACE;
  assert.deepEqual(codes(checkInterface(withoutCategory, { hasMcpServers: true })), ["plugin_category_missing"]);
});

test("rejects multi-line short descriptions", () => {
  const iface = { ...VALID_INTERFACE, shortDescription: "a\nb" };
  assert.deepEqual(codes(checkInterface(iface, { hasMcpServers: true })), [
    "plugin_short_description_character_unsupported",
  ]);
});

test("validates default prompts: count, mentions, duplicates", () => {
  const check = (defaultPrompt) => codes(checkInterface({ ...VALID_INTERFACE, defaultPrompt }, { hasMcpServers: true }));
  assert.deepEqual(check(["a", "b", "c", "d"]), ["plugin_default_prompt_too_many"]);
  assert.deepEqual(check(["Ask @chatbotx for contacts"]), ["plugin_default_prompt_mention"]);
  assert.deepEqual(check(["List contacts", "list  CONTACTS"]), ["plugin_default_prompt_duplicate"]);
});

test("rejects brand colors with too little contrast", () => {
  const check = (brandColor) => codes(checkInterface({ ...VALID_INTERFACE, brandColor }, { hasMcpServers: true }));
  assert.deepEqual(check("#FFEE00"), ["plugin_brand_color_contrast"]);
  assert.deepEqual(check("blue"), ["plugin_brand_color_format"]);
});

test("computes WCAG contrast", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF").toFixed(0), "21");
  assert.equal(contrastRatio("#FFFFFF", "#FFFFFF"), 1);
});

test("requires logo and composerIcon", () => {
  const { logo, composerIcon, ...withoutIcons } = VALID_INTERFACE;
  assert.deepEqual(codes(checkInterface(withoutIcons, { hasMcpServers: true })), [
    "plugin_logo_path_missing",
    "plugin_composer_icon_path_missing",
  ]);
});

test("rejects unsafe or unprefixed asset paths", () => {
  assert.deepEqual(codes(checkDeclaredPath("assets/logo.png", "logo")), ["branding_asset_path_missing_root_prefix"]);
  assert.deepEqual(codes(checkDeclaredPath("./../logo.png", "logo")), ["declared_asset_path_unsafe"]);
  assert.deepEqual(codes(checkDeclaredPath("/etc/logo.png", "logo")), ["declared_asset_path_unsafe"]);
  assert.deepEqual(checkDeclaredPath("./assets/logo.png", "logo"), []);
});

test("checks image format, squareness and minimum size", () => {
  const svg = (viewBox) => Buffer.from(`<svg viewBox="${viewBox}"></svg>`);
  assert.deepEqual(checkImage({ label: "logo", extension: ".svg", buffer: svg("0 0 64 64") }), []);
  assert.deepEqual(codes(checkImage({ label: "logo", extension: ".svg", buffer: svg("0 0 64 32") })), [
    "raster_image_not_square",
    "raster_image_dimensions_too_small",
  ]);
  assert.deepEqual(codes(checkImage({ label: "logo", extension: ".gif", buffer: Buffer.alloc(1) })), [
    "image_file_format_unsupported",
  ]);
});

test("reads PNG dimensions from the header", () => {
  const png = Buffer.alloc(24);
  png.write("\x89PNG", 0, "latin1");
  png.writeUInt32BE(32, 16);
  png.writeUInt32BE(32, 20);
  assert.deepEqual(codes(checkImage({ label: "icon", extension: ".png", buffer: png })), [
    "raster_image_dimensions_too_small",
  ]);
});

test("validates portable mcp.json servers", () => {
  const valid = {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { demo: { type: "streamable-http", url: "https://example.com/mcp" } },
  };
  assert.deepEqual(checkMcpConfig(valid), []);
  assert.deepEqual(codes(checkMcpConfig({ mcpServers: { demo: { url: "http://x.com" } } })), [
    "mcp_schema_missing",
    "mcp_server_type_missing",
    "mcp_server_url_not_https",
  ]);
  const withSecrets = {
    ...valid,
    mcpServers: {
      demo: {
        type: "streamable-http",
        url: "https://example.com/mcp",
        headers: { Authorization: "x" },
        extensions: { "com.openai": { auth: { type: "oauth", client: { clientSecret: "s" } } } },
      },
    },
  };
  assert.deepEqual(codes(checkMcpConfig(withSecrets)), ["mcp_server_headers_unsupported", "mcp_auth_client_secret"]);
  assert.deepEqual(codes(checkMcpConfig({})), ["mcp_servers_missing"]);
});

test("parses quoted and plain frontmatter scalars", () => {
  const { fields, body } = parseSkillFrontmatter('---\nname: demo\ndescription: "Uses \\"quotes\\""\n---\n# Body\n');
  assert.deepEqual(fields, { name: "demo", description: 'Uses "quotes"' });
  assert.equal(body, "# Body\n");
});

test("validates SKILL.md frontmatter, body and identity length", () => {
  const skill = (frontmatter, body = "# Body") => `---\n${frontmatter}\n---\n${body}\n`;
  const check = (markdown, dirName = "demo") => codes(checkSkill({ dirName, markdown, pluginName: "plugin" }));
  assert.deepEqual(check(skill("name: demo\ndescription: Does things")), []);
  assert.deepEqual(check("# no frontmatter"), ["skill_frontmatter_missing"]);
  assert.deepEqual(check("---\nname: demo\n"), ["skill_frontmatter_unclosed"]);
  assert.deepEqual(check(skill("name: demo")), ["skill_description_missing"]);
  assert.deepEqual(check(skill(`name: demo\ndescription: ${"x".repeat(1025)}`)), ["skill_description_too_long"]);
  assert.deepEqual(check(skill("name: demo\ndescription: x", "")), ["skill_body_empty"]);
  assert.deepEqual(check(skill(`name: ${"n".repeat(60)}\ndescription: x`)), ["skill_identity_too_long"]);
  assert.deepEqual(check(undefined), ["skill_manifest_missing"]);
  assert.deepEqual(check(skill("name: demo\ndescription: x"), ".hidden"), ["skill_directory_hidden"]);
});

function makePlugin({ manifest, mcp, skills = {}, files = {} }) {
  const dir = mkdtempSync(join(tmpdir(), "openai-plugin-"));
  if (manifest) writeFileSync(join(dir, "plugin.json"), JSON.stringify(manifest));
  if (mcp) writeFileSync(join(dir, "mcp.json"), JSON.stringify(mcp));
  for (const [name, markdown] of Object.entries(skills)) {
    mkdirSync(join(dir, "skills", name), { recursive: true });
    writeFileSync(join(dir, "skills", name, "SKILL.md"), markdown);
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const FULL_PLUGIN = {
  manifest: { ...VALID_MANIFEST, extensions: { "com.openai": { interface: VALID_INTERFACE } } },
  mcp: {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { demo: { type: "streamable-http", url: "https://example.com/mcp" } },
  },
  skills: { demo: "---\nname: demo\ndescription: Does things\n---\n# Demo\n" },
  files: { "assets/logo.svg": SQUARE_SVG },
};

test("passes a complete plugin directory", () => {
  assert.deepEqual(checkPlugin(makePlugin(FULL_PLUGIN)), []);
});

test("reports a missing manifest and malformed JSON", () => {
  assert.deepEqual(codes(checkPlugin(makePlugin({}))), ["plugin_manifest_missing"]);
  const dir = makePlugin({ files: { "plugin.json": "{ nope" } });
  assert.deepEqual(codes(checkPlugin(dir)), ["plugin_manifest_json_malformed"]);
});

test("reports missing logo files and duplicate skill names", () => {
  const dir = makePlugin({
    ...FULL_PLUGIN,
    files: {},
    skills: { a: FULL_PLUGIN.skills.demo, b: FULL_PLUGIN.skills.demo },
  });
  assert.deepEqual(codes(checkPlugin(dir)), [
    "skill_identity_duplicate",
    "declared_asset_file_missing",
    "declared_asset_file_missing",
  ]);
});

test("fails a plugin with no skill and no MCP server", () => {
  const dir = makePlugin({ ...FULL_PLUGIN, mcp: undefined, skills: {} });
  assert.deepEqual(codes(checkPlugin(dir)), ["plugin_runtime_surface_missing"]);
});

const serverWithAuth = (auth, extra = {}) => ({
  mcpServers: {
    demo: {
      type: "streamable-http",
      url: "https://example.com/mcp",
      extensions: { "com.openai": { auth } },
      ...extra,
    },
  },
});

test("accepts OAuth with DCR and rejects other auth types", () => {
  assert.deepEqual(errorCodes(checkMcpConfig(serverWithAuth({ type: "oauth" }))), []);
  assert.deepEqual(errorCodes(checkMcpConfig(serverWithAuth({ type: "oauth", client: { mode: "dcr" } }))), []);
  assert.deepEqual(errorCodes(checkMcpConfig(serverWithAuth({ type: "bearer" }))), ["mcp_auth_type_invalid"]);
  assert.deepEqual(errorCodes(checkMcpConfig(serverWithAuth({}))), ["mcp_auth_type_invalid"]);
});

test("requires auth only when requireOAuth is set", () => {
  assert.deepEqual(codes(checkMcpAuth(undefined, "s")), []);
  assert.deepEqual(codes(checkMcpAuth(undefined, "s", { requireOAuth: true })), ["mcp_auth_missing"]);
});

test("DCR must omit client ids; provided mode needs a client id and auth method", () => {
  assert.deepEqual(codes(checkMcpAuth({ type: "oauth", client: { mode: "dcr", clientId: "abc" } }, "s")), [
    "mcp_auth_dcr_client_id",
  ]);
  assert.deepEqual(codes(checkMcpAuth({ type: "oauth", client: { mode: "provided" } }, "s")), [
    "mcp_auth_provided_client_id_missing",
    "mcp_auth_provided_auth_method_missing",
  ]);
  assert.deepEqual(
    codes(checkMcpAuth({ type: "oauth", client: { mode: "provided", clientId: "abc", tokenEndpointAuthMethod: "none" } }, "s")),
    [],
  );
  assert.deepEqual(codes(checkMcpAuth({ type: "oauth", client: { mode: "magic" } }, "s")), ["mcp_auth_client_mode_invalid"]);
});

test("rejects secret fields anywhere in an MCP server entry", () => {
  for (const key of ["client_secret", "clientSecret", "refresh_token", "apiKey", "password"]) {
    const issues = checkMcpConfig(serverWithAuth({ type: "oauth", client: { mode: "provided", clientId: "x", tokenEndpointAuthMethod: "none", [key]: "v" } }));
    assert.ok(errorCodes(issues).some((code) => code === "mcp_auth_client_secret" || code === "mcp_secret_field"), key);
  }
  assert.deepEqual(errorCodes(checkMcpConfig(serverWithAuth({ type: "oauth" }, { env: { token: "x" } }))), ["mcp_secret_field"]);
});

test("scans skill text for dynamic executor, API-key, CLI and unavailable-tool instructions", () => {
  const scan = (markdown) => codes(checkSkillContent({ label: "skills/x/SKILL.md", markdown }));
  assert.deepEqual(scan("Use `contacts_list` and `get_guide`."), []);
  assert.deepEqual(scan("Find it with search_tools"), ["skill_dynamic_executor"]);
  assert.deepEqual(scan("then call_tool"), ["skill_dynamic_executor"]);
  assert.deepEqual(scan("Set CHATBOTX_API_KEY"), ["skill_api_key_instruction"]);
  assert.deepEqual(scan("Run `chatbotx contacts list`"), ["skill_cli_instruction"]);
  assert.deepEqual(scan("npx -y chatbotx-mcp"), ["skill_cli_instruction"]);
  assert.deepEqual(scan("use flows_publish now"), ["skill_deferred_tool"]);
  assert.deepEqual(scan("use error_logs_list now"), ["skill_unavailable_operation"]);
  assert.deepEqual(scan("flows_list_extra is not flows_create_x"), []);
});

test("tool sets are disjoint and v1 has 37 tools", () => {
  assert.equal(V1_TOOLS.length, 37);
  assert.equal(new Set(V1_TOOLS).size, 37);
  for (const name of [...DEFERRED_V2_TOOLS, ...EXCLUDED_TOOLS]) assert.ok(!V1_TOOLS.includes(name), name);
});

test("checkPlugin scans reference files and enforces requireOAuth", () => {
  const dir = makePlugin({
    ...FULL_PLUGIN,
    files: { "assets/logo.svg": SQUARE_SVG, "skills/demo/references/notes.md": "Use call_tool here" },
  });
  assert.deepEqual(codes(checkPlugin(dir)), ["skill_dynamic_executor"]);
  const clean = makePlugin(FULL_PLUGIN);
  assert.deepEqual(codes(checkPlugin(clean, { requireOAuth: true })), ["mcp_auth_missing"]);
});

test("defaults the plugin directory to dist/openai, not the repository root", async () => {
  const { DEFAULT_PLUGIN_DIR, resolvePluginDir } = await import("../check-manifest.mjs");
  const { resolve } = await import("node:path");
  const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
  assert.equal(DEFAULT_PLUGIN_DIR, resolve(repoRoot, "dist", "openai"));
  assert.equal(resolvePluginDir(undefined), DEFAULT_PLUGIN_DIR);
  assert.equal(resolvePluginDir("some/dir"), resolve("some/dir"));
});
