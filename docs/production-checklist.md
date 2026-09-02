# Production checklist

## Before the destructive migration

- [ ] Export the legacy Supabase tables and Vault secret IDs.
- [ ] Inventory every active Stripe subscription and cancel or migrate it before removing billing rows.
- [ ] Confirm there are no required repository analyses, manifests, artifacts, or webhook deliveries to retain.
- [ ] Apply and test the migration against an isolated restored snapshot first.

## Identity and secrets

- [ ] GitHub OAuth is branded Sodium, has exact Supabase callback URLs, and requests no `repo` scope.
- [ ] `SUPABASE_SECRET_KEY` is server-only; publishable values are the only `NEXT_PUBLIC_*` credentials.
- [ ] Remove legacy Stripe, worker, AI, webhook, manifest-signing, and loader variables from every Vercel target.
- [ ] `corepack pnpm env:verify` passes for Development, Preview, and Production.

## Data and API

- [ ] RLS is enabled and forced through owner-select policies on every exposed table.
- [ ] Public/anon/authenticated grants are absent from service-only tables and RPCs.
- [ ] CLI tokens and publishable keys are hashed at rest; device codes expire and are one-time.
- [ ] Project creation, key rotation, and deployments remain atomic and idempotent under concurrency.
- [ ] Retention and rate limits are configured for telemetry before public launch.

## Release proof

- [ ] Typecheck, lint, unit tests, production build, and browser E2E pass from a clean checkout.
- [ ] Fresh Next App, Next Pages, Vite React, Nuxt, SvelteKit, Astro, Angular, and unknown browser fixtures pass `validate`, build, and `doctor --url` with published npm packages.
- [ ] A real WebMCP tool call produces one started event and one outcome with no arguments/outputs.
- [ ] Wrong-origin and wrong-key event requests produce no stored rows.
- [ ] Dashboard totals match direct database queries for the same 30-day window.
