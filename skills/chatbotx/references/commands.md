# ChatbotX CLI command catalog

Companion to `../SKILL.md`. Read the rules, workflow, and command-name collisions there first.

Commands are generated at runtime from the connected workspace's OpenAPI spec, so this catalog
can lag behind the live CLI. `<command> --help` is the authoritative source for flags. Wherever
`<identifier>` appears, the value must carry an `id:`, `email:`, or `phone:` prefix.

## Contacts

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

## Conversations

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

## Broadcasts

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

## Flows and automation

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

## Team and workspace admin

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

## Analytics

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

## AI

```bash
chatbotx ai-agents list / get / create / update / delete
chatbotx ai-files list / get / create / delete           # knowledge-base files [--file --url]
chatbotx ai-functions list / get / create / update / delete
chatbotx ai-mcp-servers list / get / create / update / delete
```

## Commerce and engagement

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

## Integrations and channels

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

## Ads

```bash
chatbotx ads conversion-rules                              # list rules; create via same command, see command-name collisions in SKILL.md
chatbotx ads funnel / funnel-timeseries / analytics-overview / analytics-timeseries
chatbotx ads capi-delivery
chatbotx ads conversions-export                             # [--allChannels]
chatbotx ads ad-accounts list <channel>
chatbotx ads campaigns                                       # list/create messaging ad campaigns, see command-name collisions in SKILL.md
chatbotx ads campaigns-publish <id> / campaigns-pause <id> / campaigns-retry <id>
chatbotx ads campaigns-insights                               # POST, adIds up to 500
```

## Misc

```bash
chatbotx error-logs list                                     # [--page --perPage --sort --keyword]
chatbotx appointment-external-calendars list / delete <integrationId>
chatbotx appointment-reminders list
```
