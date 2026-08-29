# Production-readiness checklist

## Secrets & keys

- [ ] Generate a production Ed25519 manifest keypair (`node packages/runtime/scripts/gen-dev-keys.mjs` as a template — store the private key in your secret manager, never in the repo). Set `MANIFEST_SIGNING_KEY_ID` + `MANIFEST_SIGNING_PRIVATE_KEY`; build the loader with `SODIUM_MANIFEST_JWKS` containing the matching public JWK(s). The app refuses to boot in production with the committed dev key.
- [ ] Plan key rotation: the loader pins a JWK **set** — ship new+old, re-sign, then retire the old key with the next loader version.
- [ ] GitHub OAuth tokens exist only in Supabase Vault; the webhook secret remains server-only and neither appears in logs.
- [ ] `SUPABASE_SECRET_KEY` is server-only (web server + worker). Rotate any key that ever reached a client bundle.
- [ ] Stripe Production uses a restricted `rk_live_…` key, the live $49/month repository Price, the repository-only Portal configuration, and a Secret `STRIPE_WEBHOOK_SECRET`. Development/Preview must use test objects only.

## Stripe billing

- [ ] Webhook `/api/webhooks/stripe` uses API `2026-08-26.dahlia` and only the documented Checkout, Subscription, and Invoice lifecycle events. Verify a signed live delivery after deployment.
- [ ] Checkout grants no access on its return URL. Verify webhook fulfillment, duplicate-event idempotency, delayed payment, cancellation-at-period-end, `past_due` retry access, and `unpaid` revocation.
- [ ] Verify two repositories under one user have separate Stripe Customers and subscriptions; canceling one must not affect the other.
- [ ] Stripe Tax remains disabled until Foundative has an active tax registration for every configured jurisdiction.
- [ ] `/api/internal/billing/reconcile` runs every six hours with `CRON_SECRET` and reports zero failed rows.

## Supabase

- [ ] `NEXT_PUBLIC_SODIUM_ENVIRONMENT=production` and `SODIUM_ENVIRONMENT=production`; startup must reject either non-production Supabase project ref.
- [ ] Vercel Development and Preview use `sodium-development`; Production uses `sodium`. Never scope one Supabase secret across all three environments.
- [ ] Production Auth allows only `https://sodium.result.dev/auth/{callback,confirm}`. Localhost and Preview patterns belong only to development Auth.
- [ ] Dedicated production project; separate project (or branch) for previews. `supabase link` + `pnpm db:push` per environment; never edit schema through the dashboard.
- [ ] Run `supabase db advisors` (CLI ≥ 2.81) after every migration and resolve findings.
- [ ] `pnpm db:test` (RLS suite) green against the production schema before first launch.
- [ ] Auth: GitHub OAuth is the only sign-in. Development and Production use the same Sodium OAuth App but isolated Supabase projects. Run both `pnpm supabase:auth:*` commands, then `pnpm env:verify`.
- [ ] Storage: confirm the `artifacts` bucket stays private; set retention for crawl artifacts.
- [ ] Queues: monitor `pgmq.q_sodium_jobs` depth and the archive table (poison messages land there) — alert on growth.
- [ ] Backups/PITR enabled; test a restore.

## Web / worker deployment

- [ ] `apps/web` behind HTTPS (WebMCP and the loader require secure contexts). Set `SITE_URL` to the public origin.
- [ ] Serve `/agent/v1.js` via a CDN with immutable caching; keep old majors available forever (customers pin versions).
- [ ] Run at least 2 worker instances; stages are idempotent and pgmq redelivers on crash. Bound `WORKER_CONCURRENCY` by CPU.
- [ ] Rate-limit `/api/events` and `/api/m/*` at the edge; both are public by design and serve/accept only non-sensitive data.
- [ ] Structured worker logs shipped somewhere queryable; alert on `job exceeded max attempts`.

## GitHub

- [ ] The single OAuth App is registered as **Sodium** per docs/github-oauth.md, with both exact Supabase callback URIs and wildcard matching disabled; verify one consent requests `repo user:email` and lands directly on the repository picker.
- [ ] Webhook endpoint reachable; deliveries page checked after launch; redelivery runbook written (GitHub does not auto-retry).
- [ ] Verify repository webhook secret rotation and redelivery procedure.

## AI

- [ ] AI Gateway enabled with Vercel OIDC (preferred) or `AI_GATEWAY_API_KEY`; verify `AI_MODEL=openai/gpt-5.6-terra` and `AI_FALLBACK_MODEL=anthropic/claude-sonnet-5`. Budget alerts on the gateway.
- [ ] Re-confirm prompt-injection posture after any prompt change: repository/page content must stay inside `<untrusted-data>` blocks and outputs must pass `validateContract`.

## Product safety invariants (verify in staging before each release)

- [ ] A tampered or wrong-origin manifest registers zero tools (fixture e2e covers this — keep it green).
- [ ] Destructive/financial candidates cannot be approved below `confirmation: required` and never bind to automatic form submission.
- [ ] Publishing requires an owner/admin; members can review UI but every privileged action fails server-side.
- [ ] Continuous sync creates drafts only; confirm production manifests never change without a human publish.
- [ ] Rollback restores the previous tool set end-to-end (loader picks it up within the manifest cache TTL of 60s).

## Honest-claims copy

- [ ] All user-facing copy describes availability as "compatible WebMCP browser agents while the application is open" — no universal-agent claims.
