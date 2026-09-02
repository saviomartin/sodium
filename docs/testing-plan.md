# Testing plan

## Automated gates

1. Spec tests: config parsing, friendly-to-compiled translation, duplicate IDs/names, bindings, and risk confirmation floors.
2. SDK tests: WebMCP registration, route matching, every execution primitive, no remote manifest fetch, telemetry fallback, exact referral attribution, lookalike-host rejection, and argument redaction.
3. CLI tests: non-blocking app recognition, integration-receipt containment, SDK/mount verification, validation, device auth, idempotent deployment, and generated file permissions.
4. Web tests: RPC normalization, referral payload privacy, API input limits, ownership, origin rejection, and one-time code consumption.
5. Browser E2E: real referral ingestion and deduplication, persisted attribution, downstream tool correlation, rendered dashboard data, real cookie auth, device activation, and account deletion cascades.

Run:

```bash
corepack pnpm check-types
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm --dir apps/web test:e2e
```

## Manual release smoke test

1. Run `npx sodiumtools init` without a global installation in fresh Next.js App Router, Next.js Pages Router, Vite React, Nuxt, SvelteKit, Astro, Angular, and unknown browser-app fixtures.
2. Use the installed `$sodium-webmcp` skill to create `sodium.json`, handlers, the native browser bootstrap, and `.sodium/integration.json` in each application.
3. Run the `login` and `deploy` commands through `npx sodiumtools`, then verify the project and first deployment are created once and deploy opens the project dashboard.
4. Open the deployed app from a recognized answer engine or with `?utm_source=chatgpt`, call one tool, and verify the referral and downstream call appear together without a raw URL, arguments, or outputs in telemetry.
5. Run `npx sodiumtools doctor --url <route-with-tools>`, verify the real page reports registered Sodium tools, then deploy an unchanged config and verify the deployment version does not increment.

Record the evidence and release blockers in [`real-world-qa.md`](real-world-qa.md).

## Failure cases

- Invalid, expired, reused, or mismatched device codes issue no API token.
- Unknown bearer tokens and cross-owner project IDs return the same unauthorized/not-found boundary.
- Missing or wrong `Origin`, publishable key, deployment, tool ID, or schema produces no event row.
- Missing WebMCP support registers nothing and leaves the host application usable.
- A missing receipt, path outside the project, missing SDK import, or claimed-but-unmounted bootstrap blocks validation and deployment.
- A missing custom handler fails that invocation with a bounded code; it does not run arbitrary code.
