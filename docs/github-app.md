# GitHub App setup

Sodium uses GitHub Apps (never personal access tokens). Production has one App
for customers; localhost has a separate development App so OAuth sessions,
installations, callbacks, and credentials cannot cross environments.

Note the split: **sign-in** uses GitHub OAuth through Supabase (identity
only — see README → "GitHub sign-in"), while the **GitHub App** below grants
repository access. You can reuse this app's client id/secret as the sign-in
OAuth credentials (enable "Request user authorization (OAuth) during
installation" is not required; the client credentials work for the standard
web flow), or keep a separate plain OAuth App for sign-in.

## 1. Register the app

GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**:

| Setting        | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Homepage URL   | your deployment URL (e.g. `https://sodium.example`)                      |
| Setup URL      | `https://sodium.example/api/github/setup` — check **Redirect on update** |
| Webhook URL    | `https://sodium.example/api/webhooks/github`                             |
| Webhook secret | a long random string → `GITHUB_WEBHOOK_SECRET`                           |

**Permissions** (the minimum for the implemented workflow):

- Repository → **Contents: Read and write** (tarball download for analysis; branch + commit creation for integration PRs)
- Repository → **Pull requests: Read and write** (opening the integration PR)
- Metadata: Read-only (added automatically)

**Events**: `push`, `pull_request` (`installation` events are always delivered).

## 2. Keys and environment

Generate a private key (GitHub downloads PKCS#1 PEM — Node accepts it as-is):

```
GITHUB_APP_ID=<app id>
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=<webhook secret>
NEXT_PUBLIC_GITHUB_APP_SLUG=<app slug from the app URL>
```

Set the first three for **both** `apps/web` and `apps/worker` (the worker mints
its own installation tokens). Keys live in env/KMS only — never in the
database, logs, or generated pull requests.

## 3. Local webhook development

The development App keeps webhooks disabled by default. Manual analysis,
repository access, and integration PRs still work end to end. To test push
delivery specifically, enable the development webhook and use smee:

```bash
npx smee -u https://smee.io/<your-channel> -t http://localhost:3000/api/webhooks/github
```

and set the app's webhook URL to the smee channel.

## 4. Security model recap

- The setup callback's `installation_id` is never trusted: the server verifies
  the installation against the GitHub API as the app. New installations are
  bound to the browser session with a `state` cookie; update callbacks without
  state are accepted only for stored installations visible to the signed-in
  user through row-level security.
- Webhooks are verified with `X-Hub-Signature-256` (timing-safe HMAC), deduped
  by `X-GitHub-Delivery`, and checked against stored repository AND
  installation ownership before any work is enqueued.
- Installation IDs are stored; installation access tokens are minted on
  demand (1-hour lifetime) and never persisted.
