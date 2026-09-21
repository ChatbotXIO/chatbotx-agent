---
name: chatbotx
description: Manage contacts, conversations, broadcasts, flows, sequences, appointments, minigames, and every other ChatbotX workspace resource from the command line.
allowed-tools: Bash(chatbotx:*)
version: 1.0.0
homepage: https://github.com/ChatbotXIO/chatbotx-agent/tree/main/skills/chatbotx
emoji: "🤖"
metadata:
  openclaw:
    requires:
      bins:
        - chatbotx
    os:
      - macos
      - linux
      - windows
    primaryEnv: CHATBOTX_API_KEY
    envVars:
      - name: CHATBOTX_API_KEY
        required: true
        description: ChatbotX workspace API key (ChatbotX Settings → Developer → API Keys).
      - name: CHATBOTX_API_URL
        required: true
        description: Base API URL of the ChatbotX instance, e.g. https://app.chatbotx.io/api.
      - name: CHATBOTX_ALLOW_SELF_SIGNED_CERT
        required: false
        description: Set to "true" to skip TLS certificate validation, e.g. for a local/self-signed instance.
    install:
      - kind: node
        package: chatbotx
        bins: [chatbotx]
---

# ChatbotX

Use the `chatbotx` CLI to manage a ChatbotX workspace: contacts, conversations, broadcasts, flows,
sequences, appointments, minigames, analytics, and the rest of the workspace API. Commands are
generated at runtime from the connected workspace's OpenAPI spec, so `--help` on the live CLI is
the authoritative reference and this document can lag behind it.

## Rules for agents

1. Confirm credentials and workspace scope before anything else. Run `chatbotx token list`. A `401`
   means the user must set `CHATBOTX_API_KEY` and `CHATBOTX_API_URL`, or run
   `chatbotx config set --apiKey <key> --apiUrl <url>`. Do not run any other command until this
   returns a workspace, permission, and scope payload.
2. Discover before mutating. Run `chatbotx capabilities list` and the relevant `list` or `get`
   command to resolve names, ids, permissions, and current state before any write. Run
   `<command> --help` when the exact flags are unknown.
3. Messages, broadcasts, bulk operations, deletes, and flow publishing reach real customers.
   Confirm the exact recipients, filters, payloads, and schedules. There is no dry-run flag, so
   count the audience first with `contacts count --contactFilter <filter>` or
   `broadcasts audience list`.
4. Verify every write with the matching `get` or `list` command. An exit code of `0` is not proof:
   a command affected by a name collision (see below) can do nothing and still exit `0`.
5. Never expose API keys, saved config, or unredacted contact data in responses.
   `~/.chatbotX/config.json` holds plaintext credentials. Treat it as a secret file.

## Setup

Requires Node.js 24 or newer. Documented against `chatbotx` 1.8 or newer.

```bash
npm install -g chatbotx

# Save credentials once
chatbotx config set --apiKey <yourApiKey> --apiUrl <yourApiUrl>
# --apiUrl example: https://app.chatbotx.io/api

# Or via environment variables (no config file written)
export CHATBOTX_API_KEY="your_api_key"
export CHATBOTX_API_URL="https://app.chatbotx.io/api"

# Local dev / self-signed cert
chatbotx config set --allowSelfSignedCert true
```

Global options work on every command. `--apiKey`, `--apiUrl`, and `--allowSelfSignedCert` each
override the saved config for one run. `--refresh-spec` re-fetches the OpenAPI spec and clears the
1-hour cache at `~/.chatbotX/openapi-cache.json`. Use it, or set `CHATBOTX_SPEC_CACHE_TTL_SECONDS`,
when a command is missing after a workspace API upgrade.

## Output and errors

Every command prints JSON, so output can be piped into `jq`. Add `--pretty` for indented output.
Errors come back as `{"error": true, "message": "...", "status": <httpStatus>}`. Branch on
`status`, not on `message`.

| Status | Meaning |
|---|---|
| `401` | Invalid or missing API key |
| `402` | Add-on required |
| `403` | Plan limit or missing permission |
| `404` | Not found |
| `429` | Rate limited |

## Workflow

```bash
# 1. Discover what a workspace token can see
chatbotx capabilities list
chatbotx token list

# 2. Look up the ids you need — most write commands take an id, not a name
chatbotx inboxes list
chatbotx contacts list --keyword "jane"
chatbotx tags list

# 3. Act
chatbotx contacts message send email:jane@example.com --text "Hi Jane!" --inboxId <inboxId>

# 4. Verify
chatbotx contacts messages list email:jane@example.com --perPage 5
```

The same shape applies to broadcasts and flows:

```bash
# Broadcasts: count the audience, create, verify, stop if needed
chatbotx contacts count --contactFilter <filter>
chatbotx broadcasts create --channel <channel> --subaction <subaction> \
  --schedulesType <schedulesType> --schedulesAt <schedulesAt> --contactFilter <filter>
chatbotx broadcasts get <idOrName>
chatbotx broadcasts stop add <id>

# Flows: validate the spec, then publish
chatbotx flows validate --spec <spec>
chatbotx flows publish add <id> --spec <spec>
```

Help is available at every depth:

```bash
chatbotx --help                          # every command group
chatbotx contacts --help                 # actions in a group
chatbotx contacts message --help         # subactions
chatbotx contacts message send --help    # options for one action
```

## Contact identifiers

Wherever `<identifier>` appears below, the value must carry a prefix. A bare value returns
`404 Invalid identifier format`.

| Format | Example | Lookup by |
|---|---|---|
| `id:<value>` | `id:123456789` | Contact ID |
| `email:<value>` | `email:user@example.com` | Email address |
| `phone:<value>` | `phone:+84708123123` | Phone number |

## Command groups

Every group supports `--help` for its exact flags. The most used groups are expanded below.

### Contacts

```bash
chatbotx contacts list                               # [--page --perPage --sort --keyword --contactFilter]
chatbotx contacts count                               # Count matching filter [--page --perPage --sort --keyword --contactFilter]
chatbotx contacts create --email <email>              # [--phoneNumber --contactId --firstName --lastName]
chatbotx contacts get <identifier>
chatbotx contacts update <identifier>
chatbotx contacts delete <identifier>
chatbotx contacts upsert add <identifier>             # Insert or update by identifier
chatbotx contacts block <identifier>
chatbotx contacts unblock <identifier>
chatbotx contacts filter-fields                       # Field/operator reference for --contactFilter

chatbotx contacts import --fileId <fileId> --channel <channel> --inboxId <inboxId>
chatbotx contacts export --fields <fields>            # [--contactIds --exportAll --filter]

chatbotx contacts bulk-tags --contactIds <contactIds> --tags <tags>
chatbotx contacts bulk-delete --contactIds <contactIds>
chatbotx contacts bulk-sequences --contactIds <contactIds> --sequenceIds <sequenceIds>

chatbotx contacts tags list <identifier>
chatbotx contacts tag add <identifier> --tagIds <tagIds>
chatbotx contacts custom-fields update <identifier> --operations <operations>  # batch set/append/prepend/increase/decrease
chatbotx contacts notes list <identifier>
chatbotx contacts note add <identifier> --text <text>
chatbotx contacts sequences list <identifier>
chatbotx contacts sequence add <identifier> --sequenceIds <sequenceIds>
chatbotx contacts inboxes list <identifier>            # per-channel contact-inbox connections

chatbotx contacts messages list <identifier>           # [--perPage --cursor]
chatbotx contacts message send <identifier>            # [--text --files --mediaFile --flowId --nodeId --inboxId ...]
chatbotx contacts flow add <identifier> --flowId <flowId>
chatbotx contacts coupons list <identifier>            # coupons issued to the contact
```

### Conversations

```bash
chatbotx conversations list                            # [--botCategory --assignedId --channel --status --keyword --tags ...]
chatbotx conversations get <id>
chatbotx conversations assign add <id> --assignedId <assignedId>   # null clears
chatbotx conversations archive add <id>
chatbotx conversations enable-bot add <id>
chatbotx conversations disable-bot add <id>

chatbotx conversations messages list <conversationId>  # [--perPage --cursor]
chatbotx conversations message send <conversationId>   # same options as contacts message send
chatbotx conversations message delete <conversationId> <messageId> --createdAt <createdAt>
```

### Broadcasts

```bash
chatbotx broadcasts list
chatbotx broadcasts get <idOrName>
chatbotx broadcasts audience list <idOrName>            # [--page --perPage]
chatbotx broadcasts create --channel <channel> --subaction <subaction> --schedulesType <schedulesType> \
  --schedulesAt <schedulesAt> --contactFilter <contactFilter>
  # either flowId or templateId required (not both); schedulesAt required when schedulesType=future
chatbotx broadcasts schedule add <id> --schedulesType <schedulesType>  # [--schedulesAt]
chatbotx broadcasts stop add <id>
chatbotx broadcasts resume add <id>
chatbotx broadcasts resend add <id>                     # clone a sent/failed broadcast
chatbotx broadcasts duplicate add <id>
chatbotx broadcasts delete <id>                         # fails while status is sending
```

### Flows and automation

```bash
chatbotx flows list                                     # [--page --perPage --active]  active defaults true
chatbotx flows get <id>
chatbotx flows create --name <name>                     # [--folderId --spec --nodes --edges --publish]
chatbotx flows validate --spec <spec>                    # compile/validate flow-spec DSL without publishing
chatbotx flows publish add <id>                          # [--spec | --nodes --edges]
chatbotx flows draft update <id>                          # overwrite the draft in place
chatbotx flows versions list <id>
chatbotx flows import --fileId <fileId>                   # [--folderId] async import of an exported flow file
chatbotx schemas flow-spec                                # JSON Schema for the flow-spec DSL

chatbotx sequences list / get / create / update / delete
chatbotx sequences steps update <id> --order <order>       # create/update one step
chatbotx keywords list                                      # automated keyword responses [--type inbound|comment]
chatbotx triggers list / create / update / delete
chatbotx webhooks list / create / delete
chatbotx external-webhooks list / create / delete            # [--provider make|n8n]
```

### Team and workspace admin

```bash
chatbotx members list / get
chatbotx teams list / get / create / update / delete
chatbotx teams member add <id> --userIds <userIds>
chatbotx tags list / create / get / update / delete
chatbotx custom-fields list / create / get / update / delete
chatbotx bot-fields list / get / delete
chatbotx bot-fields update --fields <fields>                 # JSON array of {id,value} or {name,value}
chatbotx folders list --folderType <tag|customField>          # [--parentId]
chatbotx inboxes list
chatbotx capabilities list                                     # [--include] discover ids/names an agent needs
chatbotx token list                                             # calling token's workspace/permission/scopes
```

### Analytics

Time-range commands take `--from --to --timezone`. Some also take `--granularity`.

```bash
chatbotx analytics contact-counts-per-day
chatbotx analytics new-contacts-count
chatbotx analytics active-contacts-count
chatbotx analytics contacts-by-dimension --dimension <country|channel|source>
chatbotx analytics bot-messages-by-result              # [--granularity]
chatbotx analytics broadcasts-stats <broadcastId>
chatbotx analytics flows-stats <flowId>
chatbotx analytics sequences-steps-stats <sequenceId> <stepId>
chatbotx analytics mac-active-count                     # no time range — current billing period
```

### AI

```bash
chatbotx ai-agents list / get / create / update / delete
chatbotx ai-files list / get / create / delete           # knowledge-base files [--file --url]
chatbotx ai-functions list / get / create / update / delete
chatbotx ai-mcp-servers list / get / create / update / delete
```

### Commerce and engagement

```bash
chatbotx products list / get / create / update / delete
chatbotx product-categories list / create / update / delete
chatbotx coupon-topics list / get / create / update / archive / unarchive / delete
chatbotx coupon-topics issue add <id> --contactId <contactId>
chatbotx coupons list
chatbotx minigames list / get / create / update / delete / bulk-delete
chatbotx minigames plays list <id> --contactId <contactId>
chatbotx minigames players list <id>
chatbotx questionnaires list / get / create / update / delete / duplicate
chatbotx questionnaires submissions list <id>
chatbotx appointment-calendars list / get / create / update / delete
chatbotx appointments list / get / create / cancel / delete
chatbotx ref-links list / get / create / update / delete
chatbotx qr-codes list / get / create / update / delete
```

### Integrations and channels

```bash
chatbotx integrations list / get
chatbotx integrations status-token-errors
chatbotx whatsapp templates                              # [--inboxId --integrationWhatsappId --status]
chatbotx smtp-integrations list / get / create / update / delete
chatbotx spreadsheets list / get / create / update / delete   # connected Google Sheets
chatbotx facebook-lead-ads list / get / create / update / delete
chatbotx fb-comments list / get / create / update / delete
chatbotx ig-comments list / get / create / update / delete
chatbotx ig-stories list / get / create / update / delete
chatbotx contact-scans status --inboxId <inboxId>
chatbotx messenger-personas list
chatbotx messenger-channels tag-sync update <id> --enabled <enabled>
chatbotx zalo-channels tag-sync update <id> --enabled <enabled>
chatbotx webchats list / get / create / update / delete
chatbotx user-persistent-menus list / get / create / update / delete
chatbotx dynamic-images list / get / create / update / delete
chatbotx email-topics list / get / create / update / delete
chatbotx media-library files-upload-url --fileName <fileName> --mimeType <mimeType>
chatbotx media-library files-move --fileIds <fileIds>       # [--folderId]
```

### Ads

```bash
chatbotx ads conversion-rules                              # list rules; create via same command, see collisions below
chatbotx ads funnel / funnel-timeseries / analytics-overview / analytics-timeseries
chatbotx ads capi-delivery
chatbotx ads conversions-export                             # [--allChannels]
chatbotx ads ad-accounts list <channel>
chatbotx ads campaigns                                       # list/create messaging ad campaigns, see collisions below
chatbotx ads campaigns-publish <id> / campaigns-pause <id> / campaigns-retry <id>
chatbotx ads campaigns-insights                               # POST, adIds up to 500
```

### Misc

```bash
chatbotx error-logs list                                     # [--page --perPage --sort --keyword]
chatbotx appointment-external-calendars list / delete <integrationId>
chatbotx appointment-reminders list
```

## Command-name collisions

Command names are derived from the API path and method alone. When two operations under one
resource reduce to the same name, the CLI registers the first and skips the second. It prints
`Warning: duplicate command name "..." — skipping` on stderr but still exits `0`. Verified cases:

- `bot-fields update <idOrName> --value <value>` (single field) is unreachable. Use
  `bot-fields update --fields <fields>`, which updates by id or name in batch.
- `contacts custom-field update <identifier> <idOrName> --value <value>` (single-field PUT) is
  unreachable. Use `contacts custom-fields update <identifier> --operations '[{"customFieldId":"...","operation":"set","value":"..."}]'`
  for a single field too.
- `contacts custom-field delete <identifier>` clears every custom field on the contact, not one.
  The per-field delete has no CLI command.
- `integrations find-by-ai --provider <provider>` is GET only. Connecting or disconnecting an AI
  provider has no CLI command; use the API directly.
- `ads conversion-rules`, `ads campaigns`, `media-library folders`, and `media-library files` each
  collapse list (GET) and create (POST) onto one name. Only the first-registered operation is
  reachable.
- `analytics flows-stats <flowId>`: GET (fetch) wins. The DELETE (reset stats) variant has no CLI
  command.
- `minigames update <id>`: only one of PUT (full replace) and PATCH (partial) is reachable.

When a documented action returns `404` or silently does nothing, assume a collision and call the
workspace REST API directly instead of trying other flag combinations.

## Notes

- `contacts message send` and `conversations message send` accept either `--flowId` or free text
  with `--text`. Check `--help` before sending.
- `broadcasts create` needs exactly one of `--flowId` or `--templateId`. `--schedulesAt` is
  required only when `--schedulesType future` and the broadcast is not saved as a draft.
- Filter on the server with `--contactFilter` instead of filtering results client side.
  `chatbotx contacts filter-fields` documents every supported field and operator.

## MCP alternative

Agents in MCP-capable IDEs can use the `chatbotx-mcp` server instead of the CLI. It exposes the
same workspace API as MCP tools, filtered by the token's scopes. Setup and the default tool list
are in `skills/chatbotx-mcp/SKILL.md` of this repository.
