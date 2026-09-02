# Sodium

Sodium turns application behavior into observable WebMCP tools. The application owns the tool definitions and execution; Sodium owns validation, installation, deployments, and privacy-safe outcome analytics.

## Developer flow

```bash
# 1. Ask an agent with the bundled skill to create sodium.json
use $sodium-webmcp

# 2. Install the SDK, authorize the CLI, and create the first deployment
npx sodium-webmcp login
npx sodium-webmcp init

# Later releases
npx sodium-webmcp deploy
```

`login` verifies an existing session or opens a one-time device authorization page. `init` detects Next.js or Vite React, installs `sodium-webmcp-sdk`, adds the smallest framework integration, deploys the validated config, and writes `.sodium/project.json`.

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
