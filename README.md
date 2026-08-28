# Sodium

Sodium converts an existing Next.js repository into a reviewed, verified,
WebMCP-enabled application.

The product flow is deliberately short:

1. Continue with GitHub.
2. Connect a repository through the GitHub App.
3. Run analysis on the latest default-branch commit.
4. Enable the proposed tools you want. Availability updates automatically.

There is no organization setup, local repository mode, manual commit SHA, or
embedded demo application. The database keeps an invisible personal workspace
only as the RLS tenant boundary.

## Repository layout

| Path                 | Purpose                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web`           | Next.js app: auth, repository connection, analysis, tool controls, Settings                        |
| `apps/worker`        | Background pipeline: GitHub snapshot, static analysis, crawl, synthesis, validation, PR generation |
| `packages/analyzer`  | AST-only Next.js analysis; repository code is never executed                                       |
| `packages/contracts` | Shared versioned schemas, risk rules, validation, manifest signing                                 |
| `packages/runtime`   | Signed manifest loader, WebMCP adapter, action bridge                                              |
| `supabase`           | Auth-linked personal workspaces, RLS schema, queue, migrations                                     |

The standalone test application lives at
[`foundative/webmcp-fixture-shop`](https://github.com/foundative/webmcp-fixture-shop).
It intentionally contains no Sodium runtime or generated integration.

## Local setup

Requirements: Node 24+, pnpm 11, Supabase CLI, and a configured GitHub App.
Local development uses the same hosted Supabase and GitHub paths as production.

```bash
corepack pnpm install
supabase link --project-ref <project-ref>
corepack pnpm db:push
```

Configure:

- `apps/web/.env.local`: Supabase public/secret keys, `SITE_URL`, manifest
  signing key, and GitHub App id/private key/webhook secret/slug.
- `apps/worker/.env`: Supabase URL/secret/database URL, the same GitHub App
  id/private key, and optional AI Gateway credentials.

GitHub App permissions and callback URLs are documented in
[`docs/github-app.md`](docs/github-app.md).

Run:

```bash
corepack pnpm --filter @sodium/web dev
corepack pnpm --filter @sodium/worker dev
```

Open `http://localhost:3000`, sign in with GitHub, and connect
`foundative/webmcp-fixture-shop`.

## Validation

```bash
corepack pnpm lint
corepack pnpm check-types
corepack pnpm test
corepack pnpm db:test
corepack pnpm build
corepack pnpm --filter @sodium/web test:e2e
```

The analysis page uses private Realtime broadcasts for immediate progress and
database reconciliation as a fallback, so a missed event or sleeping tab
cannot leave completed work stuck on screen.

## Security boundaries

- Repository archives are downloaded by exact commit and parsed as untrusted
  data. They are never installed, built, or executed.
- GitHub installation ids are verified server-side; repository form values are
  never trusted as source metadata.
- Every exposed table has RLS. Authorization data stays in database roles, not
  user-editable metadata.
- Tool changes publish a signed, versioned manifest automatically.
- Account deletion removes app rows, stored artifacts, sessions, and the auth
  identity; it never deletes or modifies the user's GitHub repositories.
