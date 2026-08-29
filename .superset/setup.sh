#!/usr/bin/env bash
set -euo pipefail

# Superset workspace setup — runs once when a new workspace (git worktree) is created.
# Env provided by Superset: SUPERSET_ROOT_PATH, SUPERSET_WORKSPACE_NAME, SUPERSET_WORKSPACE_PATH

cd "$SUPERSET_WORKSPACE_PATH"

echo "▸ Installing dependencies (pnpm)"
pnpm install --frozen-lockfile

vercel_cli() {
  if command -v vercel >/dev/null 2>&1; then
    vercel "$@"
  else
    pnpm dlx vercel@59.10.0 "$@"
  fi
}

# .vercel is gitignored, so fresh worktrees are not linked to the Vercel project.
# Reuse the main checkout's link when available, otherwise link non-interactively.
echo "▸ Linking Vercel project"
if [ -f "$SUPERSET_ROOT_PATH/.vercel/project.json" ] && [ ! -f ".vercel/project.json" ]; then
  mkdir -p .vercel
  cp "$SUPERSET_ROOT_PATH/.vercel/project.json" .vercel/
fi
if [ ! -f ".vercel/project.json" ]; then
  vercel_cli link --yes --project sodium-webmcp --scope foundative
fi

# Vercel CLI does not reliably reuse the repository-root link from a nested app.
for app in apps/web apps/worker; do
  if [ ! -f "$app/.vercel/project.json" ]; then
    mkdir -p "$app/.vercel"
    cp .vercel/project.json "$app/.vercel/"
  fi
done

pull_env() {
  local directory="$1"
  local filename="$2"
  local fallback="$SUPERSET_ROOT_PATH/$directory/$filename"

  echo "▸ Pulling Development env vars from Vercel → $directory/$filename"
  if (cd "$directory" && vercel_cli env pull "$filename" --environment=development --yes); then
    return
  fi

  if [ -f "$fallback" ]; then
    echo "  vercel env pull failed — copying $directory/$filename from main checkout instead"
    cp "$fallback" "$directory/$filename"
    return
  fi

  echo "  Vercel env pull failed and no fallback exists for $directory/$filename" >&2
  return 1
}

pull_env . .env
pull_env apps/web .env.local
pull_env apps/worker .env

echo "✓ Workspace '${SUPERSET_WORKSPACE_NAME:-${SUPERSET_WORKSPACE_PATH##*/}}' ready"
