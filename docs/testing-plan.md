# Sodium testing plan

Development and production use separate, real Supabase projects and separate
GitHub App credentials. Acceptance QA uses a real GitHub identity and a real
repository; it never inserts demo rows or seeded accounts. The standalone
target repository is `foundative/webmcp-fixture-shop`.

## 1. Automated baseline

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm check-types
corepack pnpm test
corepack pnpm db:test
corepack pnpm build
```

The Playwright suite is regression coverage, not acceptance proof. Real-user
acceptance uses the flow below against the empty development project.

## 2. Start the app

```bash
corepack pnpm env:pull
corepack pnpm dev
```

## 3. User flow

1. Open `http://localhost:3000` and continue with GitHub.
2. Confirm the first authenticated page is **Connect a GitHub repository**.
3. Install or update the GitHub App and connect
   `foundative/webmcp-fixture-shop`.
4. Confirm the repository page has one **Run analysis** button and no SHA
   input.
5. Run analysis. The worker must download the latest `main` commit.
6. Keep the page open until all stages finish. Do not reload.
7. Sleep/background the tab during a second run, then return. The UI must
   reconcile to the database within 2.5 seconds.
8. Review, approve, publish, roll back, and generate an integration PR.

## 4. Edge cases

- Double-submit or two tabs: both land on the same active run.
- A queued/running record older than 30 minutes is marked `stale_run`; a new
  run starts.
- Realtime disconnect: the page says database sync remains active and still
  reaches the terminal state.
- Suspended GitHub installation: repository selection and analysis fail with a
  reconnect message.
- Repository access revoked between page load and Connect: the server rejects
  the stale/tampered selection.
- Missing preview: crawl is skipped; static analysis still completes.
- Unreachable preview: crawl fails with a structured retryable error.

## 5. Settings

1. Open **Settings** and sign out; protected routes must return to `/login`.
2. With a disposable account, delete the account.
3. Verify its auth user, memberships, owned personal workspace, repositories,
   runs, manifests, events, and `artifacts/<workspace-id>/...` objects are
   absent.
4. Verify the connected GitHub repository itself still exists and is unchanged.
