# Sodium

Sodium turns application behavior into observable WebMCP tools. The application owns the tool definitions and execution; Sodium owns validation, installation, deployments, and privacy-safe outcome analytics.

## Developer flow

```bash
# 1. Install Sodium and choose an agent to create sodium.json
npx sodiumtools init

# 2. Authorize and create the first project deployment
npx sodiumtools login
npx sodiumtools deploy
npx sodiumtools doctor

# Optional live proof against a running or deployed route
npx sodiumtools doctor --url http://localhost:3000

# Later releases
npx sodiumtools deploy
```

`init` asks for the Sodium project name (defaulting to `package.json` or the repository folder), recognizes popular browser stacks without using them as a support gate, installs `sodium-webmcp-sdk` and the project-local authoring skill, then offers Codex, Claude Code, or Gemini. The skill always goes to `.agents/skills/sodium-webmcp` and is mirrored to `.claude/skills/sodium-webmcp` when the repository has a `.claude` directory. The selected agent opens in a fresh terminal with its unrestricted mode enabled, creates `sodium.json`, implements any real handlers, mounts the SDK using the application's native client lifecycle, writes `.sodium/integration.json`, validates everything, then hands back the exact deploy command. Choose “Another coding agent” to copy the same grounded prompt instead.

The first `deploy` verifies the agent-authored integration, creates the named Sodium project, replaces the local `.sodium/project.json` placeholder with public project credentials, publishes an immutable tool version, and opens the project dashboard. The CLI never rewrites framework entry points. Projects can be permanently deleted from their dashboard; the next local deploy creates a fresh project without deleting the application repository or Sodium account.

Any browser-based JavaScript or TypeScript application is supported; popular frameworks are automatically recognized so the coding agent can use a curated mount recipe. Backend-only applications need a browser frontend because WebMCP tools register inside the page. `doctor --url <app-url>` uses `agent-browser` to prove at least one route-eligible Sodium tool is registered in the real page.

Every successful command prints the relevant project details, dashboard URL when one exists, and one next action. Add `--plain` for deterministic text output or `--no-open` to deploy without opening a browser. A global installation is not required.

Agent Analytics includes best-effort answer-engine referrals from nine recognized AI products. Sodium stores only the engine, attribution method, anonymous tab session, and narrow tool lifecycle events—never the referring URL, query, prompts, tool inputs, tool outputs, or page content.

## Repository layout

| Path                           | Purpose                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| `apps/web`                     | Auth, CLI/device APIs, project analytics, and the JSON Schema endpoint   |
| `packages/spec`                | `sodium.json` schemas, validation, compilation, risk rules, and DB types |
| `packages/runtime`             | Local WebMCP registration, browser execution, and telemetry SDK          |
| `packages/cli`                 | `init`, `validate`, `deploy`, and `doctor` commands                      |
| `.agents/skills/sodium-webmcp` | Agent workflow for the tool contract, handlers, and browser integration |
| `supabase`                     | RLS schema for projects, deployments, CLI tokens, and usage events       |

There is no repository connection, remote source execution, analysis worker, billing gate, hosted loader, or remotely executed manifest. GitHub OAuth is identity-only and requests no repository scope.

## Local development

Requirements: Node 24+, pnpm 11, Supabase CLI 2.116+, and Vercel CLI 59.11.2+.

```bash
corepack pnpm install
corepack pnpm env:pull
corepack pnpm db:push
corepack pnpm dev
```

The migration is intentionally destructive to the legacy Sodium schema. Inventory legacy subscriptions and data before applying it outside an empty development project.

## Validation

```bash
corepack pnpm check-types
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm --dir apps/web test:e2e
```

See [`docs/architecture.md`](docs/architecture.md), [`docs/testing-plan.md`](docs/testing-plan.md), [`docs/real-world-qa.md`](docs/real-world-qa.md), and [`docs/production-checklist.md`](docs/production-checklist.md).
