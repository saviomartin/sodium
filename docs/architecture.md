# Sodium architecture

## Product boundary

`sodium.json` is the Git-owned source of truth. Tool code runs in the customer's page through the local SDK. Sodium's cloud receives only versioned config snapshots and narrow lifecycle events.

```text
agent skill -> sodium.json + browser bootstrap -> CLI verification -> local SDK -> document.modelContext
                                      \-> immutable deployment -> dashboard
local SDK outcome/referral events --------------------> dashboard
```

Sodium does not fetch repositories, execute customer source remotely, inject a hosted script, or serve executable tool definitions. GitHub is an identity provider only.

## Components

### Spec

`packages/spec` owns schema version 1. It validates:

- exact application origins;
- stable tool IDs and MCP-safe tool names;
- JSON Schema input/output subsets;
- route and selector availability;
- declarative execution bindings;
- risk-driven confirmation floors.

Tools can navigate, extract page data, submit forms, perform bounded DOM interactions, call same-origin HTTP endpoints, or invoke an explicitly supplied local handler.

### Skill

The `sodium-webmcp` skill inspects real routes, UI, forms, and existing APIs. It writes a grounded goal-level config, real browser-safe handlers when needed, and a native client bootstrap. It may add stable `data-sodium-id` selectors when necessary. The agent records the bootstrap and mount files in `.sodium/integration.json`; deployment remains an explicit CLI action.

### CLI

`npx sodiumtools init` installs the local authoring foundation:

1. recognize popular browser stacks for agent guidance without blocking unknown stacks;
2. install the browser SDK when it is missing;
3. install the project-local Sodium authoring skill;
4. offer to launch a detected coding agent to author and validate the tools and browser integration;
5. leave cloud authorization and publication as explicit `login` and `deploy` commands.

The CLI has no framework codemods. `validate`, `deploy`, and `doctor` statically verify the declared SDK import, config, public project data, bootstrap strategy, and mount source. `doctor --url` additionally opens the real app with `agent-browser` and proves that route-eligible Sodium tools are registered. `deploy` is content-addressed: sending an unchanged config returns the existing deployment, then opens the project dashboard unless `--no-open` is supplied. Project creation and key rotation are atomic database functions. CLI bearer tokens are stored mode `0600`, hashed at rest, revocable, and never exposed to the browser SDK.

### SDK

The SDK compiles the checked-in config and registers route-appropriate tools through the WebMCP adapter. It re-evaluates registration on history navigation and DOM mutation. Consequential tools require confirmation according to the risk floor.

The SDK never downloads code or a manifest. Telemetry failure never affects tool execution. It records a recognized answer-engine referrer before WebMCP detection, so referral measurement still works in ordinary browsers.

### Control plane

The Next.js App Router application provides:

- GitHub identity sign-in;
- one-time CLI device authorization;
- authenticated project and deployment APIs;
- origin-checked telemetry ingestion;
- 7/30/90-day tool calls, success rate, denials, p95 latency, answer-engine referrals, and deployment history;
- a generated JSON Schema at `/schema/v1.json`.

## Data model and security

| Table               | Purpose                              | Browser access  |
| ------------------- | ------------------------------------ | --------------- |
| `projects`          | ownership and hashed publishable key | owner read-only |
| `deployments`       | immutable config snapshots           | owner read-only |
| `api_tokens`        | hashed CLI credentials               | none            |
| `cli_auth_requests` | short-lived one-time device codes    | none            |
| `usage_events`      | narrow lifecycle events              | owner read-only |

All public tables have RLS. Mutations run through authenticated server routes and narrowly granted service-role RPCs. Event ingestion requires the project ID, a matching hashed publishable key, a valid deployment, and an exact configured `Origin`.

Events contain tool identity, invocation ID, outcome, latency, SDK/config version, and bounded error code. An anonymous `sessionStorage` UUID connects an attributed referral to later tool events in the same browser tab. Referral events contain only an allowlisted engine name and `referrer` or `campaign` attribution method. They never contain arguments, outputs, page content, user identity, cookies, query strings, or arbitrary URLs. Invocation IDs and referral-session indexes make retries deduplicable without tracking a person.

## Versioning

- `schemaVersion` versions authored config semantics.
- deployment `version` is monotonic per project.
- `configHash` makes deployments idempotent and auditable.
- `sdkVersion` is sent with telemetry for compatibility analysis.

Breaking schema changes require a new schema endpoint and an explicit CLI migration. Old deployments remain readable; the browser always executes the config committed with the application build.
