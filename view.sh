#!/usr/bin/env bash
# Build the benchmark dashboard and serve it over results/ on http://localhost:5177.
#
# Usage:  bash view.sh
#
# The page re-reads results/ every 10 s; a workspace's trajectories load when
# its cell is opened. Viewer code changes need a rerun. Ctrl-C stops it.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ $# -ne 0 ]; then
  echo "usage: bash view.sh" >&2
  exit 1
fi

VITE_BIN="$ROOT/velxio/frontend/node_modules/.bin/vite"
[ -x "$VITE_BIN" ] || { echo "error: vite not found at $VITE_BIN" >&2; exit 1; }

cd "$ROOT/viewer"
"$VITE_BIN" build --config ./vite.config.ts --logLevel warn
exec "$VITE_BIN" preview --config ./vite.config.ts
