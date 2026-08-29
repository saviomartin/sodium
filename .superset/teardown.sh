#!/usr/bin/env bash
set -euo pipefail

# Superset runs this inside the worktree before removing it and its local branch.
if ! branch="$(git symbolic-ref --quiet --short HEAD)"; then
  echo "✓ No local branch is attached, skipping remote cleanup"
  exit 0
fi

if ! remote_ref="$(git ls-remote --heads origin "refs/heads/$branch")"; then
  echo "Could not check remote branch '$branch' on origin" >&2
  exit 1
fi

if [ -z "$remote_ref" ]; then
  echo "✓ Remote branch '$branch' is already absent"
  exit 0
fi

echo "▸ Deleting remote branch '$branch'"
git push origin ":refs/heads/$branch"
echo "✓ Remote branch '$branch' deleted"
