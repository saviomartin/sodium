# Sodium

Sodium converts existing Next.js websites into **reviewed, verified,
WebMCP-enabled applications**: connect a GitHub repository, let the analysis
pipeline discover routes and application actions, review the proposed tool
contracts with evidence and risk classification, then publish a signed
manifest consumed by a one-line loader:

```html
<script
  src="https://your-sodium-host/agent/v1.js"
  data-site="site_123"
></script>
```

Published tools are available to **compatible WebMCP browser agents while the
application is open** (currently Chrome/Edge origin-trial builds). See
[docs/architecture.md](docs/architecture.md) for the research, source links
and design decisions; WebMCP-specific behavior is isolated in
`packages/runtime/src/webmcp-adapter.ts` because the proposal is still moving.

## Repository layout

| Path                    | Purpose                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web`              | Next.js dashboard: onboarding, review, publication, public manifest + loader endpoints, GitHub webhooks                        |
| `apps/worker`           | Background worker: clone → static analysis → preview crawl → AI synthesis → validation; PR generation; continuous sync         |
| `packages/analyzer`     | Framework-neutral analysis engine + Next.js App Router adapter (AST only, never executes repository code)                      |
| `packages/runtime`      | The loader (`agent.js`), the WebMCP adapter and the first-party action-bridge SDK                                              |
| `packages/contracts`    | Shared Zod schemas, versioned action contracts, deterministic validation, manifest signing                                     |
| `examples/fixture-shop` | Realistic authenticated fixture app proving the end-to-end path (read-only, form, state-changing, confirmation-required tools) |
| `supabase/`             | Migrations, seed data (two organizations for isolation testing)                                                                |

## Local development setup

Prereqs: Node ≥ 24, pnpm 11 (via corepack), the Supabase CLI. **No Docker**:
one hosted Supabase project backs local development, previews and production.

```bash
corepack enable && pnpm install

# 1. Supabase project (once):
supabase projects create sodium --org-id <your-org> --region <region> --db-password <pw>
supabase link --project-ref <project-ref>
cp .env.example .env                       # fill SUPABASE_DB_URL (IPv4 pooler URL)
pnpm db:push                               # apply supabase/migrations
pnpm db:types                              # regenerate packages/contracts/src/database.types.ts

# 2. GitHub sign-in (once — see the section below):
#    set SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID / _SECRET in .env, then:
supabase config push

# 3. Environment files (see .env.example for every variable):
#    apps/web/.env.local  and  apps/worker/.env

# 4. Build the loader once, then run everything:
pnpm --filter @sodium/runtime build
pnpm dev        # dashboard :3000, fixture shop :4000 (turbo)
# worker (separate terminal):
pnpm --filter @sodium/worker dev
```

### GitHub sign-in

Sign-in is **GitHub-only** — no passwords, no demo accounts, no seed data.
Signing in identifies you; repository access is a separate, per-repository
grant made by installing the GitHub App during onboarding.

One-time provider setup (works for local dev and production alike, since one
hosted Supabase project backs both):

1. Create a GitHub **OAuth App** (github.com → Settings → Developer settings
   → OAuth Apps) — or reuse the Sodium GitHub App's client id/secret if you
   registered one (docs/github-app.md); both speak the same OAuth flow.
   Authorization callback URL:
   `https://<project-ref>.supabase.co/auth/v1/callback`
2. Put the credentials in the root `.env`:
   `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` and
   `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET`
3. `supabase config push` — this enables the provider and allow-lists the
   app's `/auth/callback` and `/auth/confirm` redirect URLs from
   `supabase/config.toml`.

Everything a user needs afterwards is created through the product itself:
onboarding creates the organization, and "Use the local fixture repository"
provides an analyzable repo without any GitHub App credentials.

### The remaining credentials are optional in development

The real adapters are implemented; missing credentials switch in
fixture-backed providers instead of fake secrets:

- **No GitHub App** → "Use the local fixture repository" in onboarding
  analyzes `examples/fixture-shop`; integration "PRs" are written to
  `$WORK_DIR/local-prs/` as a reviewable file set.
- **No AI gateway key** → deterministic fixture synthesis maps analyzer
  primitives to tools with fixed rules (the whole pipeline, validation, evals
  and review flow stay real).
- **Manifest signing** falls back to the committed, clearly-marked INSECURE
  dev key; production refuses to boot with it.

To go live with real integrations: [docs/github-app.md](docs/github-app.md)
and set `AI_GATEWAY_API_KEY` (+ `AI_MODEL`, addressed as `provider/model`
through the Vercel AI Gateway).

## The workflow

1. **Sign in with GitHub** (identity only) and create or select an
   organization.
2. **Install the GitHub App** (repository access — deliberately separate
   from sign-in, granted per repository) and select a repository, or use the
   local fixture.
3. **Configure a preview environment**: a deployed URL Sodium may crawl with
   Playwright (optional credentials stored via Supabase Vault). Sodium never
   builds or executes repository code — analysis is tarball + AST only.
4. **Run analysis**: five durable, resumable stages over Supabase Queues
   (pgmq) with progress streamed over Realtime broadcast.
5. **Review** proposed tools: evidence, risk (read-only → financial),
   confidence, deterministic validation issues, evaluation results. Edit
   agent-facing wording, approve or reject. AI proposes — deterministic code
   validates — humans decide. **State-changing tools are never published
   automatically.**
6. **Publish**: approved contracts become an immutable, Ed25519-signed
   manifest version served at `/api/m/{siteId}`; the loader registers tools
   only on the exact configured origins. One-click rollback re-signs any
   previous version.
7. **Integrate**: for complex apps, generate a reviewable PR that adds the
   pinned loader plus a generated action bridge binding approved tools to
   your existing functions — your validation, auth, idempotency and
   confirmation logic runs unchanged. Never pushes to the default branch.
8. **Stay in sync**: verified push webhooks re-analyze changed code and file
   compatibility findings; breaking drift creates a _draft_ manifest that a
   human must approve.

## Testing

```bash
pnpm test                    # unit tests: contracts, analyzer, runtime, worker, web
pnpm db:test                 # RLS/database security tests against the linked project
pnpm --filter fixture-shop test:e2e   # WebMCP end-to-end fixture (Playwright)
pnpm --filter @sodium/web test:e2e    # dashboard browser tests (spawns the worker)
```

Five verification layers: unit (extractors, contract validation, risk floors,
manifest generation/signing), database (cross-tenant RLS isolation,
member/owner differences, immutability triggers — run against the real
project inside rolled-back transactions), integration (webhook verification,
queued pipeline, approval → publication → rollback), browser (onboarding,
review, editing, approval, publishing), and the end-to-end fixture proving an
approved tool is registered **and executed** on a sample Next.js site under a
WebMCP-capable browser (hermetic polyfill of the current draft API). Security
tests cover tampered/malicious manifests, duplicate tool names, unknown
handler kinds, unauthorized handlers, prompt-injected repository content and
cross-origin loader use.

## Production readiness

See [docs/production-checklist.md](docs/production-checklist.md).
