# GitHub OAuth setup

Sodium uses one GitHub OAuth grant for both authentication and repository
access. The user approves GitHub once and lands directly on the repository
picker; there is no second installation step.

Production callbacks and repository webhooks use the canonical origin
`https://sodium.result.dev`. Keep the legacy Vercel hostname out of provider
redirect and webhook configuration.

## OAuth App

Create one GitHub OAuth App named **Sodium** and reuse it in every environment.
Register both Supabase Auth callbacks as exact redirect URIs with wildcard
matching disabled:

- Development: `https://laqlbydlawieccohknsj.supabase.co/auth/v1/callback`
- Production: `https://wsacbkkbvkcuqgiagxms.supabase.co/auth/v1/callback`

Supabase Auth receives the client ID and secret through
`SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` and
`SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET`. Development and Preview use the
development Supabase project; Production stays isolated in the production
project. Run `pnpm env:verify` after changing any scoped credential.

## Permissions and storage

The authorization request uses `repo user:email`. GitHub's `repo` OAuth scope
is required for private repository source, commit, and repository webhook
access; `user:email` supplies the user's verified email.

The callback validates the grant against GitHub and stores the provider token
in Supabase Vault. Browser clients can read connection metadata, never tokens.
The worker retrieves a token only for the repository operation it is handling.

Repository push webhooks use `GITHUB_WEBHOOK_SECRET` and send to
`/api/webhooks/github`.
