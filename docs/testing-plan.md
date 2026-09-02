# Testing plan

## Automated gates

1. Spec tests: config parsing, friendly-to-compiled translation, duplicate IDs/names, bindings, and risk confirmation floors.
2. SDK tests: WebMCP registration, route matching, every execution primitive, no remote manifest fetch, telemetry fallback, and argument redaction.
3. CLI tests: framework detection, idempotent codemods, validation, device auth, idempotent deployment, and generated file permissions.
4. Web tests: analytics deduplication and rollups, API input limits, ownership, origin rejection, and one-time code consumption.
5. Browser E2E: signed-out positioning, real cookie auth, project dashboard, device activation, and account deletion cascades.

Run:

```bash
corepack pnpm check-types
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm --dir apps/web test:e2e
```

## Manual release smoke test

1. Install the published CLI globally and run `sodium init` in fresh Next.js and Vite React fixtures.
2. Use the installed `$sodium-webmcp` skill to create and validate `sodium.json` from each real application.
3. Run `sodium login`, then `sodium deploy`, and verify the project and first deployment are created once.
4. Use a WebMCP-capable browser to call one read-only and one confirmed tool, with no arguments or outputs stored in telemetry.
5. Run `sodium doctor`, then deploy an unchanged config and verify the deployment version does not increment.

Record the evidence and release blockers in [`real-world-qa.md`](real-world-qa.md).

## Failure cases

- Invalid, expired, reused, or mismatched device codes issue no API token.
- Unknown bearer tokens and cross-owner project IDs return the same unauthorized/not-found boundary.
- Missing or wrong `Origin`, publishable key, deployment, tool ID, or schema produces no event row.
- Missing WebMCP support registers nothing and leaves the host application usable.
- A missing custom handler fails that invocation with a bounded code; it does not run arbitrary code.
