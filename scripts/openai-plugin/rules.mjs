// Pure validation rules for an OpenAI (ChatGPT / Codex) plugin package.
//
// Limits and codes follow https://developers.openai.com/plugins/deploy/submission-errors and
// https://developers.openai.com/plugins/build/plugins. Where the docs give a package limit and a
// stricter final-directory limit, exceeding the package limit is an error and exceeding the
// final limit is a warning. Each rule returns a new array of issues and never mutates its input.

export const LIMITS = Object.freeze({
  name: 64,
  version: 64,
  description: 1024,
  authorName: 120,
  authorEmail: 320,
  url: 2048,
  urlFinal: 1024,
  displayName: 80,
  displayNameFinal: 30,
  shortDescription: 240,
  shortDescriptionFinal: 30,
  longDescription: 4000,
  developerName: 120,
  developerNameFinal: 80,
  capabilities: 20,
  capability: 120,
  defaultPrompts: 3,
  defaultPrompt: 512,
  defaultPromptFinal: 128,
  skillDescription: 1024,
  skillIdentity: 64,
  imageBytes: 5 * 1024 * 1024,
  imageMinSide: 48,
  imageMaxSide: 4096,
});

export const CATEGORIES = Object.freeze([
  "Productivity",
  "Creativity",
  "Developer Tools",
  "Business & Operations",
  "Data & Analytics",
  "Communication",
  "Education & Research",
  "Security",
  "Finance",
  "Healthcare",
  "Travel",
  "Entertainment",
  "Other",
]);

export const IMAGE_EXTENSIONS = Object.freeze([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
export const INTERFACE_URL_FIELDS = Object.freeze([
  "websiteURL",
  "supportURL",
  "privacyPolicyURL",
  "termsOfServiceURL",
]);
export const INTERFACE_ASSET_FIELDS = Object.freeze(["logo", "logoDark", "composerIcon", "composerIconDark"]);

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const MIN_BRAND_CONTRAST = 2;
const DARK_SURFACE = "#212121";

export const error = (code, message) => ({ level: "error", code, message });
export const warning = (code, message) => ({ level: "warning", code, message });

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function hasControlChars(text, { allowNewlines = false } = {}) {
  const pattern = allowNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  return pattern.test(text);
}

// Shared checks for a string field: type, emptiness, control characters, package and final length.
export function checkText(value, { code, label, max, finalMax, required = false, multiline = false }) {
  if (value === undefined) {
    return required ? [error(`${code}_missing`, `${label} is required`)] : [];
  }
  if (typeof value !== "string") return [error(`${code}_wrong_type`, `${label} must be a string`)];
  if (value.trim() === "") return [error(`${code}_empty`, `${label} must not be empty`)];
  if (hasControlChars(value, { allowNewlines: multiline })) {
    return [error(`${code}_character_unsupported`, `${label} contains control characters or line breaks`)];
  }
  if (max && value.length > max) {
    return [error(`${code}_too_long`, `${label} is ${value.length} chars, max ${max}`)];
  }
  if (finalMax && value.length > finalMax) {
    return [
      warning(`${code}_too_long`, `${label} is ${value.length} chars; the directory listing allows ${finalMax}`),
    ];
  }
  return [];
}

export function checkHttpsUrl(value, { code, label, required = false }) {
  if (value === undefined) return required ? [error(`${code}_missing`, `${label} is required`)] : [];
  const textIssues = checkText(value, { code, label, max: LIMITS.url, finalMax: LIMITS.urlFinal });
  if (textIssues.some((issue) => issue.level === "error")) return textIssues;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return [error(`${code}_format`, `${label} is not a valid URL: ${value}`)];
  }
  if (parsed.protocol !== "https:") return [error(`${code}_not_https`, `${label} must use https: ${value}`)];
  if (parsed.username || parsed.password) {
    return [error(`${code}_has_credentials`, `${label} must not contain credentials`)];
  }
  return textIssues;
}

export function checkRootManifest(manifest) {
  if (!isObject(manifest)) return [error("plugin_manifest_root_not_object", "plugin.json must be a JSON object")];

  const nameIssues = checkText(manifest.name, {
    code: "plugin_name",
    label: "name",
    max: LIMITS.name,
    required: true,
  });
  const nameFormat =
    nameIssues.length === 0 && !NAME_PATTERN.test(manifest.name)
      ? [error("plugin_name_format", "name must start with a letter or digit and use only letters, digits, _ or -")]
      : [];

  const versionIssues = checkText(manifest.version, {
    code: "plugin_version",
    label: "version",
    max: LIMITS.version,
    required: true,
  });
  const versionFormat =
    versionIssues.length === 0 && !SEMVER_PATTERN.test(manifest.version)
      ? [error("plugin_version_not_semver", `version must be semver, got ${manifest.version}`)]
      : [];

  return [
    ...nameIssues,
    ...nameFormat,
    ...versionIssues,
    ...versionFormat,
    ...checkText(manifest.description, {
      code: "plugin_description",
      label: "description",
      max: LIMITS.description,
      multiline: true,
    }),
    ...checkAuthor(manifest.author),
    ...checkHttpsUrl(manifest.homepage, { code: "plugin_homepage", label: "homepage" }),
    ...checkId(manifest.id),
  ];
}

function checkId(id) {
  if (id === undefined) return [];
  if (typeof id !== "string") return [error("plugin_id_wrong_type", "id must be a string")];
  return id.trim() === "" ? [error("plugin_id_empty", "id must not be empty")] : [];
}

export function checkAuthor(author) {
  if (author === undefined) return [error("plugin_developer_missing", "author.name is required")];
  if (!isObject(author)) return [error("plugin_author_wrong_type", "author must be an object")];
  return [
    ...(author.name === undefined
      ? [error("plugin_developer_missing", "author.name is required")]
      : checkText(author.name, { code: "plugin_author_name", label: "author.name", max: LIMITS.authorName })),
    ...checkText(author.email, { code: "plugin_author_email", label: "author.email", max: LIMITS.authorEmail }),
    ...checkHttpsUrl(author.url, { code: "plugin_author_url", label: "author.url" }),
  ];
}

// WCAG relative luminance contrast ratio between two #RRGGBB colors.
export function contrastRatio(hexA, hexB) {
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function checkBrandColor(value, { code, label, against }) {
  if (value === undefined) return [];
  if (typeof value !== "string") return [error(`${code}_wrong_type`, `${label} must be a string`)];
  if (!HEX_COLOR_PATTERN.test(value)) return [error(`${code}_format`, `${label} must be #RRGGBB, got ${value}`)];
  const ratio = contrastRatio(value, against);
  return ratio < MIN_BRAND_CONTRAST
    ? [error(`${code}_contrast`, `${label} ${value} has ${ratio.toFixed(2)}:1 contrast against ${against}, need 2:1`)]
    : [];
}

function checkCapabilities(capabilities) {
  if (capabilities === undefined) return [];
  if (!Array.isArray(capabilities)) return [error("plugin_capabilities_wrong_type", "capabilities must be an array")];
  const countIssue =
    capabilities.length > LIMITS.capabilities
      ? [error("plugin_capabilities_too_many", `capabilities has ${capabilities.length} entries, max 20`)]
      : [];
  return [
    ...countIssue,
    ...capabilities.flatMap((entry, index) =>
      checkText(entry, { code: "plugin_capability", label: `capabilities[${index}]`, max: LIMITS.capability }),
    ),
  ];
}

function checkDefaultPrompts(defaultPrompt) {
  if (defaultPrompt === undefined) return [];
  const prompts = typeof defaultPrompt === "string" ? [defaultPrompt] : defaultPrompt;
  if (!Array.isArray(prompts)) {
    return [error("plugin_default_prompt_wrong_type", "defaultPrompt must be a string or an array of strings")];
  }
  const countIssue =
    prompts.length > LIMITS.defaultPrompts
      ? [error("plugin_default_prompt_too_many", `defaultPrompt has ${prompts.length} entries, max 3`)]
      : [];
  const entryIssues = prompts.flatMap((prompt, index) => {
    const label = `defaultPrompt[${index}]`;
    if (typeof prompt !== "string") return [error("plugin_default_prompt_entry_wrong_type", `${label} must be a string`)];
    const textIssues = checkText(prompt, {
      code: "plugin_default_prompt",
      label,
      max: LIMITS.defaultPrompt,
      finalMax: LIMITS.defaultPromptFinal,
    });
    const mention = /(^|\s)@\S/.test(prompt)
      ? [error("plugin_default_prompt_mention", `${label} must not @mention an MCP server`)]
      : [];
    return [...textIssues, ...mention];
  });
  const normalized = prompts.filter((p) => typeof p === "string").map((p) => p.trim().replace(/\s+/g, " ").toLowerCase());
  const duplicate =
    new Set(normalized).size !== normalized.length
      ? [error("plugin_default_prompt_duplicate", "defaultPrompt entries must be unique")]
      : [];
  return [...countIssue, ...entryIssues, ...duplicate];
}

function checkCategory(category) {
  if (category === undefined) {
    return [warning("plugin_category_missing", "interface.category is not set; the directory files it under Other")];
  }
  if (typeof category !== "string") return [error("plugin_category_wrong_type", "category must be a string")];
  return CATEGORIES.includes(category)
    ? []
    : [error("plugin_category_unknown", `category "${category}" is not one of: ${CATEGORIES.join(", ")}`)];
}

// Listing fields under extensions["com.openai"].interface. Asset files are checked separately.
export function checkInterface(iface, { hasMcpServers }) {
  if (iface === undefined) {
    return [
      error(
        "plugin_interface_missing",
        'extensions["com.openai"].interface is required to submit (displayName, shortDescription, logo, ...)',
      ),
    ];
  }
  if (!isObject(iface)) return [error("plugin_interface_wrong_type", "interface must be an object")];

  const urlIssues = INTERFACE_URL_FIELDS.flatMap((field) =>
    checkHttpsUrl(iface[field], {
      code: `plugin_${field.replace(/URL$/, "").replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}_url`,
      label: `interface.${field}`,
      required: hasMcpServers,
    }),
  );
  const requiredAssets = ["logo", "composerIcon"].flatMap((field) =>
    iface[field] === undefined
      ? [error(`plugin_${field === "logo" ? "logo" : "composer_icon"}_path_missing`, `interface.${field} is required`)]
      : [],
  );

  return [
    ...checkText(iface.displayName, {
      code: "plugin_display_name",
      label: "interface.displayName",
      max: LIMITS.displayName,
      finalMax: LIMITS.displayNameFinal,
      required: true,
    }),
    ...checkText(iface.shortDescription, {
      code: "plugin_short_description",
      label: "interface.shortDescription",
      max: LIMITS.shortDescription,
      finalMax: LIMITS.shortDescriptionFinal,
      required: true,
    }),
    ...checkText(iface.longDescription, {
      code: "plugin_long_description",
      label: "interface.longDescription",
      max: LIMITS.longDescription,
      required: true,
      multiline: true,
    }),
    ...checkText(iface.developerName, {
      code: "plugin_developer_name",
      label: "interface.developerName",
      max: LIMITS.developerName,
      finalMax: LIMITS.developerNameFinal,
      required: true,
    }),
    ...checkCategory(iface.category),
    ...checkCapabilities(iface.capabilities),
    ...urlIssues,
    ...checkDefaultPrompts(iface.defaultPrompt),
    ...checkBrandColor(iface.brandColor, { code: "plugin_brand_color", label: "brandColor", against: "#FFFFFF" }),
    ...checkBrandColor(iface.brandColorDark, {
      code: "plugin_brand_color_dark",
      label: "brandColorDark",
      against: DARK_SURFACE,
    }),
    ...requiredAssets,
  ];
}

// A declared path must be ./-relative, stay inside the package and be free of odd characters.
export function checkDeclaredPath(value, label) {
  if (typeof value !== "string") return [error("declared_asset_path_wrong_type", `${label} must be a string path`)];
  if (value === "") return [error("declared_asset_path_empty", `${label} must not be empty`)];
  if (value !== value.trim()) return [error("declared_asset_path_has_outer_whitespace", `${label} has outer whitespace`)];
  if (hasControlChars(value)) return [error("declared_asset_path_has_control_character", `${label} has control chars`)];
  if (/^([A-Za-z]:|[\\/])/.test(value) || value.split(/[\\/]/).includes("..")) {
    return [error("declared_asset_path_unsafe", `${label} must not be absolute or contain ..: ${value}`)];
  }
  if (!value.startsWith("./")) {
    return [error("branding_asset_path_missing_root_prefix", `${label} must start with ./: ${value}`)];
  }
  return [];
}

// Image dimensions from the file header, for the formats where that is cheap. Returns null if unknown.
export function readImageSize(buffer, extension) {
  if (extension === ".png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (extension === ".svg") {
    const svg = buffer.toString("utf8");
    const viewBox = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/);
    if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
    const width = svg.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)(px)?["']/);
    const height = svg.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)(px)?["']/);
    if (width && height) return { width: Number(width[1]), height: Number(height[1]) };
  }
  return null;
}

export function checkImage({ label, extension, buffer }) {
  if (!IMAGE_EXTENSIONS.includes(extension)) {
    return [error("image_file_format_unsupported", `${label} must be one of ${IMAGE_EXTENSIONS.join(" ")}`)];
  }
  if (buffer.length > LIMITS.imageBytes) {
    return [error("image_file_too_large", `${label} is ${buffer.length} bytes, max 5 MiB`)];
  }
  const size = readImageSize(buffer, extension);
  if (!size) return [warning("image_dimensions_unchecked", `${label}: could not read dimensions, check it is square`)];
  const { width, height } = size;
  return [
    ...(width !== height ? [error("raster_image_not_square", `${label} is ${width}x${height}, must be square`)] : []),
    ...(Math.min(width, height) < LIMITS.imageMinSide
      ? [error("raster_image_dimensions_too_small", `${label} is ${width}x${height}, min 48x48`)]
      : []),
    ...(extension !== ".svg" && Math.max(width, height) > LIMITS.imageMaxSide
      ? [error("raster_image_dimensions_too_large", `${label} is ${width}x${height}, max 4096 per side`)]
      : []),
  ];
}

// mcp.json in the portable layout: named servers, each with type and an https url, no secrets.
export function checkMcpConfig(config, options = {}) {
  if (!isObject(config)) return [error("mcp_manifest_wrong_type", "mcp.json must be a JSON object")];
  if (config.mcpServers === undefined) return [error("mcp_servers_missing", "mcp.json has no mcpServers")];
  if (!isObject(config.mcpServers)) return [error("mcp_servers_wrong_type", "mcpServers must be an object")];
  const schemaIssue = config.$schema
    ? []
    : [warning("mcp_schema_missing", "portable mcp.json should set $schema to the agent-plugins mcp schema")];
  const serverIssues = Object.entries(config.mcpServers).flatMap(([name, server]) => {
    if (name.trim() === "") return [error("mcp_server_name_empty", "MCP server names must not be empty")];
    if (!isObject(server)) return [error("mcp_server_wrong_type", `mcpServers.${name} must be an object`)];
    return checkMcpServer(name, server, options);
  });
  const countIssue =
    Object.keys(config.mcpServers).length > 1
      ? [warning("mcp_multiple_servers", "only one MCP server can be connected per submitted plugin")]
      : [];
  return [...schemaIssue, ...serverIssues, ...countIssue];
}

export const AUTH_TYPES = Object.freeze(["oauth"]);
export const CLIENT_MODES = Object.freeze(["dcr", "provided"]);
// Keys that must never appear in a submitted package, at any depth of an MCP server entry.
const SECRET_KEY_PATTERN =
  /^(client_?secret|secret|password|passwd|api_?key|access_?token|refresh_?token|bearer_?token|token|private_?key|authorization)$/i;
const CLIENT_ID_KEYS = ["clientId", "client_id"];

function findSecretKeys(value, path = []) {
  if (Array.isArray(value)) return value.flatMap((item, index) => findSecretKeys(item, [...path, String(index)]));
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(SECRET_KEY_PATTERN.test(key) ? [[...path, key].join(".")] : []),
    ...findSecretKeys(child, [...path, key]),
  ]);
}

// extensions["com.openai"].auth: OAuth only, DCR needs no client id, never any secret.
export function checkMcpAuth(auth, label, { requireOAuth = false } = {}) {
  if (auth === undefined) {
    return requireOAuth ? [error("mcp_auth_missing", `${label} must declare extensions["com.openai"].auth`)] : [];
  }
  if (!isObject(auth)) return [error("mcp_auth_wrong_type", `${label} auth must be an object`)];
  const typeIssues = AUTH_TYPES.includes(auth.type)
    ? []
    : [error("mcp_auth_type_invalid", `${label} auth.type must be one of ${AUTH_TYPES.join(", ")}, got ${auth.type}`)];
  const client = auth.client;
  if (client === undefined) return typeIssues;
  if (!isObject(client)) return [...typeIssues, error("mcp_auth_client_wrong_type", `${label} auth.client must be an object`)];
  const mode = client.mode ?? "dcr";
  if (!CLIENT_MODES.includes(mode)) {
    return [...typeIssues, error("mcp_auth_client_mode_invalid", `${label} auth.client.mode must be dcr or provided`)];
  }
  const hasClientId = CLIENT_ID_KEYS.some((key) => client[key] !== undefined);
  const modeIssues =
    mode === "dcr"
      ? hasClientId
        ? [error("mcp_auth_dcr_client_id", `${label} DCR auth must omit the client id`)]
        : []
      : [
          ...(hasClientId ? [] : [error("mcp_auth_provided_client_id_missing", `${label} provided auth needs a client id`)]),
          ...(client.tokenEndpointAuthMethod === undefined
            ? [error("mcp_auth_provided_auth_method_missing", `${label} provided auth needs tokenEndpointAuthMethod`)]
            : []),
        ];
  return [...typeIssues, ...modeIssues];
}

function checkMcpServer(name, server, options) {
  const label = `mcpServers.${name}`;
  const auth = server.extensions?.["com.openai"]?.auth;
  const secretKeys = findSecretKeys(server).filter((path) => !path.endsWith("headers.Authorization"));
  return [
    ...(server.type === undefined
      ? [error("mcp_server_type_missing", `${label}.type is required in portable mcp.json (e.g. streamable-http)`)]
      : []),
    ...checkHttpsUrl(server.url, { code: "mcp_server_url", label: `${label}.url`, required: true }),
    ...(isObject(server.headers) && Object.keys(server.headers).length > 0
      ? [error("mcp_server_headers_unsupported", `${label}.headers must be empty for public submission`)]
      : []),
    ...secretKeys.map((path) =>
      /client_?secret$/i.test(path) && path.includes("auth")
        ? error("mcp_auth_client_secret", `${label} auth must not include ${path.split(".").pop()}`)
        : error("mcp_secret_field", `${label} must not contain a secret field: ${path}`),
    ),
    ...checkMcpAuth(auth, label, options),
  ];
}

// Parses the SKILL.md frontmatter keys that submission checks. Supports plain and quoted scalars.
export function parseSkillFrontmatter(markdown) {
  if (!/^---\r?\n/.test(markdown)) return { error: "skill_frontmatter_missing" };
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) return { error: "skill_frontmatter_unclosed" };
  const fields = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/))
      .filter(Boolean)
      .map(([, key, raw]) => [key, unquoteYamlScalar(raw.trim())]),
  );
  return { fields, body: markdown.slice(match[0].length) };
}

function unquoteYamlScalar(raw) {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}

export function checkSkill({ dirName, markdown, pluginName }) {
  const label = `skills/${dirName}/SKILL.md`;
  if (dirName.startsWith(".")) return [error("skill_directory_hidden", `skills/${dirName} must not start with .`)];
  if (markdown === undefined) return [error("skill_manifest_missing", `${label} is missing`)];
  const parsed = parseSkillFrontmatter(markdown);
  if (parsed.error) return [error(parsed.error, `${label}: frontmatter is missing or not closed with ---`)];
  const { name, description } = parsed.fields;
  if ([">", "|", ">-", "|-"].includes(description)) {
    return [warning("skill_description_unchecked", `${label}: block-scalar description, length not checked`)];
  }
  const identity = `${pluginName}:${name}`;
  return [
    ...checkText(name, { code: "skill_name", label: `${label} name`, required: true }),
    ...checkText(description, {
      code: "skill_description",
      label: `${label} description`,
      max: LIMITS.skillDescription,
      required: true,
      multiline: true,
    }),
    ...(parsed.body.trim() === "" ? [error("skill_body_empty", `${label} has no body`)] : []),
    ...(name && identity.length > LIMITS.skillIdentity
      ? [error("skill_identity_too_long", `${identity} is ${identity.length} chars, max 64`)]
      : []),
  ];
}

// Tool surface of the OpenAI profile (plan 4.4). The shipped skills may name only V1_TOOLS.
export const V1_TOOLS = Object.freeze([
  "ai_agents_list", "ai_files_list", "analytics_new_contact_counts_per_day", "analytics_blocked_contacts_per_day",
  "analytics_broadcast_stats", "analytics_sequence_step_stats", "analytics_flow_stats", "broadcasts_list",
  "broadcasts_get", "capabilities_get", "contacts_list", "contacts_get", "contacts_list_tags",
  "contacts_list_custom_fields", "contacts_list_messages", "contacts_list_sequences", "conversations_list",
  "conversations_get", "flows_list", "flows_get", "keywords_list", "messages_list",
  "mini_apps_list", "pipelines_list", "pipelines_list_items", "sequences_list",
  "sequences_get", "token_get", "contacts_create", "contacts_add_tags_by_name", "contacts_set_custom_field",
  "contacts_send_message", "conversations_assign", "broadcasts_stop", "pipelines_create_item",
  "pipelines_move_item", "get_guide",
]);
export const DEFERRED_V2_TOOLS = Object.freeze([
  "flows_create", "flows_update_draft", "flows_publish", "sequences_update", "contacts_send_flow",
  "contacts_subscribe_sequences",
]);
export const EXCLUDED_TOOLS = Object.freeze([
  "connections_create", "connection_providers_list", "connect_sessions_get", "error_logs_list",
  "ai_functions_list", "ai_agents_create", "ai_agents_update", "mini_apps_create",
]);

const toolPattern = (names) => new RegExp(`(?<![A-Za-z0-9_])(${names.join("|")})(?![A-Za-z0-9_])`, "g");
const FORBIDDEN_SKILL_RULES = Object.freeze([
  { code: "skill_dynamic_executor", pattern: /(?<![A-Za-z0-9_])(search_tools|call_tool)(?![A-Za-z0-9_])/g, why: "dynamic tool executor" },
  { code: "skill_api_key_instruction", pattern: /CHATBOTX_API_(KEY|URL)|workspace (API )?(key|token)s?\b|API key/gi, why: "API-key instruction" },
  {
    code: "skill_cli_instruction",
    pattern: /\bCLI\b|npx\s+(-y\s+)?chatbotx|npm (install|i)\s+(-g\s+)?chatbotx|`chatbotx\s+[a-z]|\$\s*chatbotx\b|chatbotx-mcp\b/g,
    why: "CLI or local-server instruction",
  },
  { code: "skill_deferred_tool", pattern: toolPattern(DEFERRED_V2_TOOLS), why: "deferred v2 tool" },
  { code: "skill_unavailable_operation", pattern: toolPattern(EXCLUDED_TOOLS), why: "tool outside the OpenAI profile" },
]);

// Scans the full text of a shipped skill file (SKILL.md or a reference) for instructions that
// bypass the reviewed tool surface. One issue per rule, naming the first match.
export function checkSkillContent({ label, markdown }) {
  return FORBIDDEN_SKILL_RULES.flatMap(({ code, pattern, why }) => {
    const match = markdown.match(pattern);
    return match ? [error(code, `${label} contains a ${why}: ${match[0]}`)] : [];
  });
}
