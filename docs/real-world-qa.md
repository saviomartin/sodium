# Real-world QA

This is the release acceptance test for Sodium. It uses a disposable application under `.testing/`, which is intentionally gitignored. Unit tests alone do not replace this test.

## Acceptance checklist

| Area | Required evidence | 2026-09-02 result |
| --- | --- | --- |
| Consumer app | Fresh `create-next-app` fixture lints and production-builds before and after installation | Pass |
| Package boundary | Packed spec, SDK, and CLI tarballs install in the fixture without workspace imports | Pass |
| Login | Device code is approved by the signed-in dashboard account; token file mode is `0600`; a second login reuses the session | Pass |
| Init | `sodium init` creates one project, installs one provider, preserves handlers, and is idempotent | Pass |
| Deployments | Changed config increments the version; unchanged config returns the same deployment | Pass: versions 1, 2, and 3 |
| Diagnostics | `validate` accepts five tools; `doctor` detects drift and returns healthy after deployment | Pass |
| WebMCP discovery | `agent-browser webmcp list` sees route-eligible tools and updates after application state changes | Pass |
| Tool execution | Same-origin request, DOM interaction, extraction, and navigation return bounded structured results | Pass |
| Confirmation | Denial returns `user_denied` without mutation; confirmation performs the action and verifies its postcondition | Pass |
| Route lifecycle | Catalog tools unregister on `/checkout` and re-register after returning | Pass |
| Fallback | Standard Chromium without WebMCP keeps the host app functional and produces no page errors | Pass |
| Analytics | Starts, outcomes, registration, initialization, duration, and denial events persist with deployment version; arguments and outputs do not | Pass |
| Ingestion security | Wrong origin and wrong publishable key both return the opaque `202` boundary and create no event | Pass |
| Dashboard | Account can see exact tools, calls, success rates, last event, and all deployment versions | Pass |
| Public install | `npx sodium-webmcp` resolves from npm | Pass: spec, SDK, and CLI `0.1.0` published on 2026-09-02 |

## Defects found by this fixture

The real consumer test found and fixed seven integration defects that package-local tests had missed:

1. The CLI had no explicit `login` command or saved-session validation.
2. Generated Next.js and Vite code widened JSON `schemaVersion` and failed consumer TypeScript builds.
3. React development Strict Mode raced two asynchronous installations and left only part of the tool set registered.
4. Conditional tools did not refresh when React changed an attribute without inserting a node.
5. Interaction postconditions ran before React committed the resulting DOM state.
6. `sdk_ready` telemetry included an undeclared field and was rejected by strict ingestion.
7. Re-running `init` unnecessarily invoked the package manager even when the SDK was already installed.

## Release command constraint

The npm name `sodium` is already owned by an unrelated libsodium port. The zero-install command must therefore be:

```bash
npx sodium-webmcp login
npx sodium-webmcp init
npx sodium-webmcp deploy
```

After installation, the local binary remains the short `sodium` command.

## Repeat before publishing

1. Remove and recreate `.testing/sodium-next-fixture` with the current `create-next-app`.
2. Pack and install the three workspace packages as tarballs; never link the fixture to workspace source.
3. Execute login, init, drift detection, changed deploy, and unchanged deploy against the development control plane.
4. Run the WebMCP calls with `agent-browser`, then verify event rows and the signed-in project dashboard.
5. Delete the disposable auth user and confirm its project, deployments, CLI tokens, and events cascade to zero rows.
