# GitHub OAuth setup

Sodium uses one GitHub OAuth grant for both authentication and repository
access. The user approves GitHub once and lands directly on the repository
picker; there is no second installation step.

## OAuth App

Create a GitHub OAuth App named **Sodium**. Configure its authorization callback
URL as the Supabase Auth callback for the matching environment:

- Development: `https://laqlbydlawieccohknsj.supabase.co/auth/v1/callback`
- Production: `https://wsacbkkbvkcuqgiagxms.supabase.co/auth/v1/callback`

Supabase Auth receives the client ID and secret through
`SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` and
`SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET`.

## Permissions and storage

The authorization request uses `repo user:email`. GitHub's `repo` OAuth scope
is required for private repository source, commit, and repository webhook
access; `user:email` supplies the user's verified email.

The callback validates the grant against GitHub and stores the provider token
in Supabase Vault. Browser clients can read connection metadata, never tokens.
The worker retrieves a token only for the repository operation it is handling.

Repository push webhooks use `GITHUB_WEBHOOK_SECRET` and send to
`/api/webhooks/github`.
