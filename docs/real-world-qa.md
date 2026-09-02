# Real-world QA

This is the release acceptance test for Sodium. It uses a disposable application under `.testing/`, which is intentionally gitignored. Unit tests alone do not replace this test.

## Acceptance checklist

| Area                 | Required evidence                                                                                                                         | 2026-09-02 result               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Consumer app         | Fresh `create-next-app` fixture lints and production-builds before and after installation                                                 | Pass                            |
| Package boundary     | Packed spec, SDK, and CLI tarballs install in the fixture without workspace imports                                                       | Pass                            |
| Login                | Device code is approved by the signed-in dashboard account; token file mode is `0600`; a second login reuses the session                  | Pass                            |
| Init                 | `npx sodiumtools init` installs the SDK and project-local skill without requiring auth or creating a cloud project                        | Pass: packed 0.2.1              |
| Framework neutrality | Unknown browser stacks initialize; popular stacks are recognized only to guide the agent                                                  | Pass: 0.3.0 + 8 profiles        |
| Integration proof    | `validate` verifies the receipt and mount; `doctor --url` finds route-eligible tools in the running app                                   | Pass: Next build + 3 live tools |
| Deployments          | Changed config increments the version; unchanged config returns the same deployment                                                       | Pass: versions 1, 2, and 3      |
| Diagnostics          | `validate` accepts five tools; `doctor` detects drift and returns healthy after deployment                                                | Pass                            |
| WebMCP discovery     | `agent-browser webmcp list` sees route-eligible tools and updates after application state changes                                         | Pass                            |
| Tool execution       | Same-origin request, DOM interaction, extraction, and navigation return bounded structured results                                        | Pass                            |
| Confirmation         | Denial returns `user_denied` without mutation; confirmation performs the action and verifies its postcondition                            | Pass                            |
| Route lifecycle      | Catalog tools unregister on `/checkout` and re-register after returning                                                                   | Pass                            |
| Fallback             | Standard Chromium without WebMCP keeps the host app functional and produces no page errors                                                | Pass                            |
| Analytics            | Starts, outcomes, registration, initialization, duration, and denial events persist with deployment version; arguments and outputs do not | Pass                            |
| Ingestion security   | Wrong origin and wrong publishable key both return the opaque `202` boundary and create no event                                          | Pass                            |
| Dashboard            | Account can see exact tools, calls, success rates, last event, and all deployment versions                                                | Pass                            |
| CLI output           | Ink TUI shows compact progress, aligned results, actionable errors, and a deterministic plain/CI fallback                                 | Pass: packed 0.2.1              |
| Agent handoff        | Init detects Codex, Claude Code, and Gemini; Other copies and prints a universal prompt                                                   | Pass: packed 0.2.1              |
| Browser handoff      | Deploy opens the project dashboard by default and honors `--no-open`                                                                      | Pass: `prj_zlx5svso7zdg`        |
| Public execution     | `npx sodiumtools` runs without a global installation; both older package names point users to the new command                             | Pass: CLI 0.2.1                 |

## Defects found by this fixture

The real consumer test found and fixed seven integration defects that package-local tests had missed:

1. The CLI had no explicit `login` command or saved-session validation.
2. Generated Next.js and Vite code widened JSON `schemaVersion` and failed consumer TypeScript builds.
3. React development Strict Mode raced two asynchronous installations and left only part of the tool set registered.
4. Conditional tools did not refresh when React changed an attribute without inserting a node.
5. Interaction postconditions ran before React committed the resulting DOM state.
6. `sdk_ready` telemetry included an undeclared field and was rejected by strict ingestion.
7. Re-running `init` unnecessarily invoked the package manager even when the SDK was already installed.

## Release command

The CLI is published as `sodiumtools`, so the zero-install command is:

```bash
npx sodiumtools init
npx sodiumtools login
npx sodiumtools deploy
```

After installation, both `sodiumtools` and the short `sodium` binary are available locally.

## Repeat before publishing

1. Recreate the popular-framework and unknown browser fixtures listed in `testing-plan.md` with their current generators.
2. Pack and install the three workspace packages as tarballs; never link a fixture to workspace source.
3. Let the coding agent author each native bootstrap, then require `validate`, the application build, and `doctor --url` to pass.
4. Execute login, changed deploy, and unchanged deploy against the development control plane; run WebMCP calls and verify event rows and the signed-in dashboard.
5. Delete the disposable auth user and confirm its project, deployments, CLI tokens, and events cascade to zero rows.
