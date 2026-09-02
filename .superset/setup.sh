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
    pnpm dlx vercel@59.11.2 "$@"
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
for app in apps/web; do
  if [ ! -f "$app/.vercel/project.json" ]; then
    mkdir -p "$app/.vercel"
    cp .vercel/project.json "$app/.vercel/"
  fi
done

echo "▸ Pulling and validating isolated Development env vars"
if ! pnpm env:pull; then
  echo "  Vercel env pull failed — copying validated files from the main checkout" >&2
  for file in .env apps/web/.env.local; do
    if [ ! -f "$SUPERSET_ROOT_PATH/$file" ]; then
      echo "  Missing fallback: $SUPERSET_ROOT_PATH/$file" >&2
      exit 1
    fi
    if ! rg -q "laqlbydlawieccohknsj" "$SUPERSET_ROOT_PATH/$file" || \
      rg -q "wsacbkkbvkcuqgiagxms" "$SUPERSET_ROOT_PATH/$file"; then
      echo "  Refusing non-development fallback: $SUPERSET_ROOT_PATH/$file" >&2
      exit 1
    fi
    cp "$SUPERSET_ROOT_PATH/$file" "$file"
    chmod 600 "$file"
  done
fi

echo "✓ Workspace '${SUPERSET_WORKSPACE_NAME:-${SUPERSET_WORKSPACE_PATH##*/}}' ready"
