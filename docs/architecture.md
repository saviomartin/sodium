# Architecture

Sodium converts existing Next.js sites into reviewed, verified, WebMCP-enabled applications:
connect a GitHub repository → analyze routes and actions → review proposed tools →
publish a signed manifest consumed by a one-line loader snippet.

This document records the research that grounded the design (verified 2026-08-28)
and the decisions that follow from it. Where the WebMCP proposal is still moving,
the affected behavior lives behind `packages/runtime/src/webmcp-adapter.ts`.

---

## 1. Research findings

### 1.1 WebMCP (Web Model Context API)

Canonical spec: the W3C Web Machine Learning CG draft at
[webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp)
([rendered spec](https://webmachinelearning.github.io/webmcp/)). Facts we build on:

- **Entry point is `document.modelContext`** (moved off `navigator.modelContext` by
  [PR #184](https://github.com/webmachinelearning/webmcp/pull/184), 2026-05-27; the
  `navigator` alias is deprecated in Chromium 150). Feature-detect both.
- **`provideContext()`/`clearContext()` were removed**
  ([#132](https://github.com/webmachinelearning/webmcp/issues/132)). The surface is
  `registerTool(tool, { exposedTo?, signal? })`, `getTools({ fromOrigins? })`,
  `executeTool(tool, input, { signal })`, and a `toolchange` event. **Unregistration is
  only via `AbortSignal`** — there is no `unregisterTool()`. Re-registering a live name rejects.
- **Tool descriptor**: `{ name (1–128 chars, `[a-zA-Z0-9_.-]`), title?, description,
inputSchema (JSON Schema), execute(input, { signal }) → Promise<any>, annotations? }`.
  The return value is JSON-stringified by the browser; MCP-style `content` arrays are
  accepted but not required.
- **Annotations are only `readOnlyHint` and `untrustedContentHint`** (both default false)
  — WebMCP does _not_ carry MCP's `destructiveHint`/`idempotentHint`/`openWorldHint`
  ([spec §security](https://webmachinelearning.github.io/webmcp/#security-privacy)).
- **Security model**: `[SecureContext]` (HTTPS only); permissions-policy feature `"tools"`
  with default allowlist `'self'`; tools are exposed same-origin only unless `exposedTo`
  opts into specific origins; Chrome additionally requires origin isolation
  (no `Origin-Agent-Cluster: ?0`). There is **no user-activation requirement in the spec
  today**; browser/agent-side confirmation UX is open design
  ([#165](https://github.com/webmachinelearning/webmcp/issues/165)) — which is why
  consequential confirmation must stay in the customer's backend and our contracts carry
  an explicit confirmation policy.
- **Chrome status**: early preview behind a flag
  ([blog, 2026-02-10](https://developer.chrome.com/blog/webmcp-epp)); **origin trial in
  Chrome 149–156** ([blog, 2026-06-09](https://developer.chrome.com/blog/ai-webmcp-origin-trial));
  local development via `chrome://flags/#enable-webmcp-testing` / "Experimental Web
  Platform features" ([docs](https://developer.chrome.com/docs/ai/webmcp)). Edge runs its
  own OT (Edge 150, ends 2026-11-17). Firefox/WebKit: no signal yet.
- **Dynamic registration on SPAs**: tools are per-`Document`; Google guidance is to
  register/unregister per route with `AbortController`
  ([best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)).
  Cross-document navigation during a tool call is an open problem
  ([#135](https://github.com/webmachinelearning/webmcp/issues/135)).
- **Declarative form API** (`toolname`/`tooldescription`/`toolautosubmit` attributes)
  exists as an explainer; static manifest files were **explicitly rejected** by the
  proposal as an alternative — a JS loader that registers imperatively is the intended
  integration shape for dynamic sites.
- Ecosystem: official TS types [`webmcp-types`](https://www.npmjs.com/package/webmcp-types);
  community polyfill [`@mcp-b/webmcp-polyfill`](https://www.npmjs.com/package/@mcp-b/webmcp-polyfill);
  [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools)
  (inspector extension, evals CLI). Our e2e tests use a small in-repo polyfill implementing
  the current IDL so tests are hermetic and pin the exact surface we target.

### 1.2 Next.js App Router (v16)

- Next 16 renames `middleware.ts` → **`proxy.ts`** (export `proxy()`); the dashboard uses
  proxy-based Supabase session refresh, and the analyzer treats both filenames as auth
  evidence. ([nextjs.org file conventions](https://nextjs.org/docs/app/api-reference/file-conventions))
- `params`/`searchParams`/`cookies()`/`headers()` are async (Next 15+).
- Route handlers (`route.ts`) export HTTP-method functions; `page.tsx` and `route.ts`
  cannot share a folder. Server Actions are `"use server"` functions, preferred for
  UI mutations; route handlers for webhooks/public APIs.
- App Router conventions the analyzer must understand: `page/layout/route/loading/error`
  files, dynamic `[param]`, catch-all `[...param]`, optional `[[...param]]`, groups
  `(group)`, parallel `@slot`, interception `(.)`, private `_folders`.

### 1.3 Supabase (current, per docs + official `with-supabase` template)

- **SSR auth**: `@supabase/ssr` (0.12.x) with the `getAll`/`setAll` cookie contract;
  per-request server clients (never module-scope); Next 16 `proxy.ts` runs `updateSession`.
  **`auth.getClaims()` is the current recommendation for protecting pages** (local JWT
  verification via JWKS with asymmetric keys); `getUser()` when a server-confirmed user
  record is needed; never trust `getSession()` server-side.
  New-style publishable/secret API keys (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`) replace legacy anon/service_role JWTs.
  ([SSR guide](https://supabase.com/docs/guides/auth/server-side/nextjs))
- **RLS**: wrap auth calls in sub-selects (`(select auth.uid())`, advisor rule
  `0003_auth_rls_initplan`); break recursive membership policies with **security-definer
  helpers in a private schema** with `set search_path = ''`; roles live in protected
  tables, never user-editable metadata; always scope policies `to authenticated`.
  ([RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security),
  [RBAC guide](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac))
- **Queues**: built on **pgmq**; enable the integration, expose `pgmq_public` wrappers
  (`send`, `send_batch`, `read(queue, vt, n)`, `pop`, `archive`, `delete`). Workers should
  consume over a direct Postgres connection using `pgmq.read_with_poll()` (long poll)
  rather than hot-polling PostgREST. Visibility timeout makes unacked messages reappear —
  our stages are idempotent for exactly this reason.
  ([Queues docs](https://supabase.com/docs/guides/queues),
  [PGMQ reference](https://supabase.com/docs/guides/queues/pgmq))
- **Realtime**: **Broadcast is the recommended mechanism** (not Postgres Changes) —
  worker-side `realtime.send()`; private channels authorized by RLS
  on `realtime.messages`; client calls `realtime.setAuth()` then subscribes with
  `config.private = true`. ([Broadcast](https://supabase.com/docs/guides/realtime/broadcast),
  [authorization](https://supabase.com/docs/guides/realtime/authorization))
- **Storage**: private buckets + RLS on `storage.objects`; server-created signed URLs.
- **Vault** for at-rest encryption of per-tenant credentials (`vault.create_secret`,
  read via `vault.decrypted_secrets` **only inside security-definer functions**; the view
  must never be exposed through the Data API).
  ([Vault](https://supabase.com/docs/guides/database/vault))
- **Local dev/testing**: `supabase start` → `migration new` → `db reset` (replays
  migrations + `seed.sql`); **pgTAP** tests under `supabase/tests/database` run with
  `supabase test db` (role impersonation via `set local role` /
  `request.jwt.claim.sub`); types via `supabase gen types typescript --local`; run
  `supabase db advisors` (CLI ≥ 2.81) before shipping schema changes.

### 1.4 GitHub App

- Auth: app JWT (RS256, `exp` ≤ 10 min, `iat` backdated 60 s) →
  `POST /app/installations/{id}/access_tokens` (1-hour tokens, **scopable at creation**
  to `repository_ids` + `permissions`). Octokit: `octokit` v5 meta-package /
  `@octokit/app` v16 / `@octokit/auth-app` v8 (auto token caching).
  ([JWT](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app),
  [installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app))
- Install flow: `https://github.com/apps/<slug>/installations/new?state=<csrf>`; the
  setup callback's `installation_id` **must not be trusted** — we verify by listing the
  app's installations server-side and binding `state` to the session.
  ([setup URL docs](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url))
- Webhooks: `X-Hub-Signature-256` HMAC verified with a timing-safe compare
  (`@octokit/webhooks`), `X-GitHub-Delivery` GUID for idempotency, respond 2xx < 10 s and
  process async; no automatic redelivery.
  ([validating deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries))
- Content access without executing code: `GET /repos/{o}/{r}/tarball/{ref}` → 302 (link
  expires in ~5 min) with the installation token. No git binary, no submodules, no hooks.
- PR creation: Git Data API (blobs → tree with `base_tree` → commit → `refs`), then
  `POST /repos/{o}/{r}/pulls`; commits authored as `<app>[bot]`.
- **Minimal permissions: `contents: write`, `pull_requests: write`, `metadata: read`**
  (implicit); `installation*` events arrive automatically.
  ([permissions matrix](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps))
- Keys: GitHub issues PKCS#1 PEM; Node crypto accepts it (convert to PKCS#8 for WebCrypto
  runtimes); store in env/KMS, never in the database. Local webhook dev via smee.io.

---

## 2. Decisions

### D1 — Monorepo boundaries (pnpm + Turborepo)

```
apps/web         Next.js dashboard, onboarding, API routes, public manifest + loader endpoints
apps/worker      background worker: clone → static analysis → crawl → AI synthesis → validation; PR generation; sync
packages/analyzer    framework-neutral analysis engine + Next.js adapter (ts-morph AST, no execution)
packages/runtime     loader (agent.js), WebMCP adapter, first-party bridge SDK
packages/contracts   Zod schemas, DB types, versioned action contracts, deterministic validation, signing
examples/fixture-shop  realistic authenticated Next.js fixture proving the end-to-end path
```

Internal packages are consumed as TypeScript source ("just-in-time packages");
only `packages/runtime` has a build (esbuild → immutable browser bundles).

### D2 — Transport-neutral contracts; WebMCP behind an adapter

`ActionContract` (packages/contracts) is the durable artifact: stable `actionId`, name,
title, description, JSON-Schema input, structured output, evidence, route/state
conditions, auth requirement, risk level, confirmation policy, handler binding,
confidence. The **manifest** keeps the richer MCP-style annotation set
(`readOnlyHint/destructiveHint/idempotentHint/openWorldHint`) because contracts must
outlive WebMCP churn; `webmcp-adapter.ts` projects that onto today's WebMCP surface
(`readOnlyHint`, plus `untrustedContentHint` for extract handlers that read page
content) and owns `document.modelContext` feature detection, `registerTool` +
`AbortController` lifecycle, and SPA route re-registration. When the proposal changes,
only the adapter changes.

### D3 — Risk ladder and hard gates

Five ordered risk levels: `read_only < reversible < state_changing < destructive <
financial`. Deterministic floors (enforced in code, not by the model):
state_changing ⇒ confirmation ≥ recommended; destructive/financial ⇒ confirmation =
required **and** bridge handler only (no automatic form submission). Publication of any
non-read-only tool requires an explicit human approval; nothing state-changing is ever
auto-published, including during continuous sync (drafts only).

### D4 — Manifests are data, never code

The published manifest contains only declarative material: JSON-Schema subsets,
CSS selectors, URL templates, form field maps, bridge keys. The loader has **no eval, no
Function constructor, no dynamic import of customer code** and rejects manifests that do
not parse against the strict schema (unknown handler kinds and extra keys fail closed).
Complex behavior comes from the **bridge SDK**: generated, human-reviewed handlers living
in the customer's repository, registered at runtime under `bridgeKey`s — so all
authentication, authorization, validation, idempotency, and consequential confirmation
run in the customer's own code and backend.

### D5 — Signed manifests, pinned loader

Manifests are canonicalized (sorted-key JSON), signed with **Ed25519**, and served as
`{ algorithm, keyId, payload (base64url), signature }`. The loader verifies via WebCrypto
(Ed25519 is Baseline in modern browsers) against a public JWK pinned into the loader
bundle at build time, checks `siteId` and exact-match `origins` against
`location.origin`, then registers tools. The loader itself is versioned
(`/agent/v1.js`) and immutable per version; customers pin a major version. Signing keys
never leave the server (`MANIFEST_SIGNING_PRIVATE_KEY` env; public JWK is embedded and
also served at `/.well-known/sodium-keys.json` for rotation).

### D6 — Analysis pipeline: resumable stages over pgmq

One analysis run = five idempotent stages, each a separate queue message
(`clone → static → crawl → synthesize → validate`), status tracked per stage in
`analysis_runs`. The worker consumes with `pgmq.read_with_poll` over a direct Postgres
connection, retries transient failures with bounded backoff (`attempt` in the message,
max 3), archives poison messages, and reports progress with `realtime.send()` on private
`run:{id}` channels. Repository code is **never executed**: tarball download (no git),
extraction with entry filtering (no symlinks/absolute paths), secret/ignore filtering
(`.gitignore`-style + `.sodiumignore`), per-file and total size caps. Any future build
execution goes into an isolated sandbox — explicitly out of scope now.

### D7 — AI proposes, code disposes

Stage 4 uses the AI SDK (`generateObject` with Zod schemas, models addressed as
`"provider/model"` strings through the AI Gateway) to group primitives into goal-level
candidate tools. Every model output is re-validated by deterministic code
(`validateContract` / `validateContractSet`): names, schema limits, duplicate names,
overlapping purposes, handler/risk consistency, confirmation floors, unbound template
params, injection markers. Repository content, page text, and screenshots are **data,
never instructions**: prompts wrap them in delimited untrusted blocks, and outputs that
smell like instruction-following (e.g. "ignore previous…" in a description) are rejected.
Evaluations (deterministic schema round-trips + agent-selection checks) run before a
candidate is marked ready for review.

### D8a — One hosted Supabase project for every environment (no Docker)

By explicit project decision, local development, previews and production all
run against hosted Supabase projects rather than the Dockerized local stack:
`supabase link` + `supabase db push` applies migrations over the IPv4 session
pooler, `scripts/db-seed.mjs` seeds over the same connection, and the
database security suite (`pnpm db:test`) runs against the live project inside
always-rolled-back transactions. Consequences: `supabase start`/`db reset`
are not used; type generation uses `--linked`; and the seed (demo users with
known passwords) must never be applied to the production project.

### D8 — Supabase schema in five domains, RLS everywhere

`identity` (profiles, organizations, memberships with roles), `source control`
(installations, repositories, environments, commits), `analysis` (runs, routes,
candidates, evidence), `publication` (contracts, immutable contract versions, manifests,
deployments), `operations` (eval runs, usage events, audit log). Every exposed table has
RLS; membership checks go through security-definer helpers in a `private` schema; roles
live in `org_memberships.role` (never user metadata); service-role key is worker/server
only. GitHub installation **IDs** are stored; installation tokens are minted on demand
and never persisted. Preview credentials are encrypted via Vault, readable only through
a security-definer accessor. Artifacts (screenshots, crawl snapshots) go to a private
bucket with org-scoped policies. Migrations + seed + pgTAP tests run through the
Supabase CLI; cross-tenant isolation is proven with two seeded organizations.

### D9 — Continuous sync never touches production

Verified push/PR webhooks (signature, delivery ID, repository + installation ownership
against our records) enqueue `sync.compare` jobs. The worker re-analyzes changed files,
diffs against published contract versions, and writes compatibility findings
(`input_changed`, `handler_removed`, `side_effect_changed`, `auth_changed`,
`eval_broken`). Breaking findings create a **draft** manifest version requiring approval.
Publication is atomic (single row flip of `sites.current_manifest_id`), history is
immutable, and rollback is one click to any previously approved version.

### D10 — What ships to the customer

Simple sites: the loader alone supports three automatic primitives — navigation,
reading approved structured content (selector extraction), and submitting approved
forms (never for destructive/financial actions). Complex apps: the generated integration
PR adds (a) the pinned loader `<script>` in the root layout, (b) a generated action
bridge binding approved `bridgeKey`s to existing app functions (reusing the app's own
validation/auth layers), (c) generated tests + manifest metadata, all marked
`@generated` with a documented regeneration workflow. PRs go to a new branch, never the
default branch.

### D11 — Honest capability claims

Published tools are described as "available to compatible WebMCP browser agents while
the application is open" — never as universal agent support. The dashboard shows the
current Chrome/Edge origin-trial status.

---

## 3. Trust model summary

| Input                         | Trust                    | Treatment                                                                                   |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| Customer repo contents        | Untrusted data           | Parsed as AST/text; never executed; never treated as instructions; excerpts capped + hashed |
| Preview pages/screenshots     | Untrusted data           | DOM/a11y as primary evidence; wrapped as untrusted blocks in prompts                        |
| AI output                     | Untrusted proposal       | Deterministic validation + human approval before publication                                |
| Manifest (at runtime)         | Verified data            | Ed25519 signature + strict schema + origin check; declarative only                          |
| GitHub webhooks               | Untrusted until verified | HMAC + delivery ID + ownership checks before enqueue                                        |
| User-supplied org/repo params | Untrusted                | RLS + explicit membership checks server-side                                                |

## 4. Known deferrals

- Preview crawling requires a customer-provided preview URL (+ optional credentials);
  we do not build or run arbitrary repos.
- WebMCP `requestUserInteraction()` / elicitation is unshipped; when it lands, the
  adapter will surface confirmation-required tools through it.
- MCP/commerce transports: contracts are transport-neutral; only manifest projection
  code needs adding.
- Sandboxed build execution (explicit isolation budget) — out of scope, interface left
  behind `PreviewProvider`.
- Manifest anti-replay: envelopes are signed but carry no expiry, so an attacker who
  controls the network path could serve an OLD validly-signed manifest for the same
  site+origin (never a forged or cross-site one). Impact is bounded — old manifests
  only contained previously human-approved tools, and rollback works by re-signing —
  but a future envelope revision should add `expiresAt` plus a minimum-version hint
  pinned in the loader.
