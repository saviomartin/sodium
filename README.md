# Sodium

Sodium converts an existing Next.js repository into a reviewed, verified,
WebMCP-enabled application.

The product flow is deliberately short:

1. Continue with GitHub; first sign-in continues directly into GitHub App access.
2. Choose a repository from the home page.
3. Review the latest automatic analysis on the repository page.
4. Enable the proposed tools you want and publish the ready changes.

There is no organization setup, local repository mode, manual commit SHA, or
embedded demo application. The database keeps an invisible personal workspace
only as the RLS tenant boundary.

## Repository layout

| Path                 | Purpose                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web`           | Next.js app: home/auth, repository connection, analysis, tool controls, Settings               |
| `apps/worker`        | Background pipeline: GitHub snapshot, static analysis, AI synthesis, validation, PR generation |
| `packages/analyzer`  | AST-only Next.js analysis; repository code is never executed                                   |
| `packages/contracts` | Shared versioned schemas, risk rules, validation, manifest signing                             |
| `packages/runtime`   | Signed manifest loader, WebMCP adapter, action bridge                                          |
| `supabase`           | Auth-linked personal workspaces, RLS schema, queue, migrations                                 |

The standalone test application lives at
[`foundative/webmcp-fixture-shop`](https://github.com/foundative/webmcp-fixture-shop).
It intentionally contains no Sodium runtime or generated integration.

## Local setup

Requirements: Node 24+, pnpm 11, the Vercel CLI, and access to the linked
`foundative/sodium-webmcp` project. Local development is isolated from
production:

| Runtime                    | Supabase project     | GitHub App                 | Public origin                      |
| -------------------------- | -------------------- | -------------------------- | ---------------------------------- |
| Local / Vercel Development | `sodium-development` | `Sodium Local Development` | `http://localhost:3000`            |
| Vercel Preview             | `sodium-development` | development credentials    | deployment-specific `VERCEL_URL`   |
| Production                 | `sodium`             | `sodium-webmcp`            | `https://sodium-webmcp.vercel.app` |

The app validates these project refs at startup. A local or Preview build
pointed at production Supabase exits instead of starting.

```bash
corepack pnpm install
corepack pnpm env:pull
corepack pnpm db:push
corepack pnpm dev
```

`env:pull` pulls only Vercel's **Development** scope, validates every required
value, and writes three ignored mode-600 files:

- `.env`: the minimal Supabase CLI/database variables;
- `apps/web/.env.local`: localhost Auth, signing, and GitHub App variables;
- `apps/worker/.env`: the isolated database, GitHub App, and worker variables.

The development database starts empty. `supabase/seed.sql` intentionally
creates no users, repositories, or demo rows. Sign in with GitHub and connect a
real repository to test the same user flow as production.

GitHub App permissions and callback URLs are documented in
[`docs/github-app.md`](docs/github-app.md).

Open `http://localhost:3000`, continue with GitHub, and choose
`foundative/webmcp-fixture-shop` from the home page.

## Environment administration

```bash
# Reapply pending migrations to development only (project-ref guarded)
corepack pnpm db:push

# Reconcile Auth provider and redirect settings from scoped credentials
corepack pnpm supabase:auth:development
corepack pnpm supabase:auth:production
```

Production Supabase credentials are never copied into the local app files.
Production Auth accepts only production callbacks; development accepts
localhost plus the Foundative Vercel Preview pattern.

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
