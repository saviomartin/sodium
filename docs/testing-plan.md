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

1. Run `npx sodium-webmcp init` in fresh Next.js and Vite React fixtures.
2. Run `npx sodium-webmcp login`, verify the browser activation code matches the terminal, and verify it can be consumed once.
3. Use a WebMCP-capable browser to call one read-only and one confirmed tool.
4. Verify no arguments or outputs appear in the event row or network body.
5. Deploy an unchanged config and verify the deployment version does not increment.

Record the evidence and release blockers in [`real-world-qa.md`](real-world-qa.md).

## Failure cases

- Invalid, expired, reused, or mismatched device codes issue no API token.
- Unknown bearer tokens and cross-owner project IDs return the same unauthorized/not-found boundary.
- Missing or wrong `Origin`, publishable key, deployment, tool ID, or schema produces no event row.
- Missing WebMCP support registers nothing and leaves the host application usable.
- A missing custom handler fails that invocation with a bounded code; it does not run arbitrary code.
