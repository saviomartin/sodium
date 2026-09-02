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

# Later releases
npx sodiumtools deploy
```

`init` asks for the Sodium project name (defaulting to `package.json` or the repository folder), detects Next.js or Vite React, installs `sodium-webmcp-sdk` and the project-local authoring skill, then offers Codex, Claude Code, or Gemini. The selected agent opens in a fresh terminal with its unrestricted mode enabled, creates and validates `sodium.json`, then hands back the exact deploy command. Choose “Another coding agent” to copy the same grounded prompt instead.

The first `deploy` validates the contract, creates the named Sodium project, adds the smallest framework integration, writes `.sodium/project.json`, and opens the project dashboard. Projects can be permanently deleted from their dashboard; the next local deploy creates a fresh project without deleting the application repository or Sodium account.

Every successful command prints the relevant project details, dashboard URL when one exists, and one next action. Add `--plain` for deterministic text output or `--no-open` to deploy without opening a browser. A global installation is not required.

## Repository layout

| Path                           | Purpose                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| `apps/web`                     | Auth, CLI/device APIs, project analytics, and the JSON Schema endpoint   |
| `packages/spec`                | `sodium.json` schemas, validation, compilation, risk rules, and DB types |
| `packages/runtime`             | Local WebMCP registration, browser execution, and telemetry SDK          |
| `packages/cli`                 | `init`, `validate`, `deploy`, and `doctor` commands                      |
| `.agents/skills/sodium-webmcp` | Agent workflow for deriving a grounded `sodium.json` from a real app     |
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
