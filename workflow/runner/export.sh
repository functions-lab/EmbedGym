#!/bin/bash
# Usage: export.sh <run> <item>
# Creates WORK/<run>/<item>/ (WORK: $EMBEDGYM_WORKFLOW_DIR, default ~/embedgym-workflow):
# - repo/: this checkout's files that git tracks or does not ignore, submodules included,
#   without .git. The checkout must have no uncommitted or untracked files, so that export.json's
#   base is the commit the copy holds; ALLOW_DIRTY=1 (dry runs only) copies them anyway and
#   records the base as <commit>+dirty.
# - ws/: workspaces outside the repository and the sim lock file.
# - arduino-libraries/: mounted as the agents' /root/Arduino/libraries; starts as a copy of
#   $ARDUINO_LIBRARIES (default: the host arduino-cli's), and chain.py adds each part's approved ones.
# node_modules are hard-link copies of Linux installs made once per lockfile pair in the agent
# image, since agents run in that Linux container. velxio/third-party/wokwi-elements/src, which the
# metadata generator scans, is copied from $WOKWI_ELEMENTS (default: that path in this checkout).
set -euo pipefail
RUNNER=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$RUNNER/../.." && pwd)
WORK=${EMBEDGYM_WORKFLOW_DIR:-$HOME/embedgym-workflow}
WOKWI_ELEMENTS=${WOKWI_ELEMENTS:-$REPO/velxio/third-party/wokwi-elements}

[ $# -eq 2 ] || { echo "usage: export.sh <run> <item>" >&2; exit 1; }
run=$1 item=$2
dir=$WORK/$run/$item
[ ! -e "$dir" ] || { echo "error: $dir exists" >&2; exit 1; }
[ -d "$WOKWI_ELEMENTS/src" ] || {
  echo "error: no wokwi-elements clone at $WOKWI_ELEMENTS; git clone https://github.com/wokwi/wokwi-elements.git $REPO/velxio/third-party/wokwi-elements" >&2
  exit 1
}
libraries=${ARDUINO_LIBRARIES:-$(arduino-cli config get directories.user)/libraries}
[ -d "$libraries" ] || { echo "error: no Arduino libraries dir $libraries; set ARDUINO_LIBRARIES" >&2; exit 1; }
case "$(uname -s)" in
  Linux) user=(--user "$(id -u):$(id -g)") ;;
  Darwin) user=() ;;
  *) echo "error: unsupported host $(uname -s)" >&2; exit 1 ;;
esac

base=$(git -C "$REPO" rev-parse HEAD)
if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  [ "${ALLOW_DIRTY:-}" = 1 ] || { echo "error: commit or remove the changes in $REPO first" >&2; exit 1; }
  base="$base+dirty"
fi

key=$(cat "$REPO/package-lock.json" "$REPO/velxio/frontend/package-lock.json" | git hash-object --stdin)
modules=$WORK/_shared/node_modules/$key
if [ ! -d "$modules" ]; then
  tmp=$WORK/_shared/node_modules/.$key
  rm -rf "$tmp"
  mkdir -p "$tmp/root" "$tmp/frontend"
  cp "$REPO/package.json" "$REPO/package-lock.json" "$tmp/root/"
  cp "$REPO/velxio/frontend/package.json" "$REPO/velxio/frontend/package-lock.json" "$tmp/frontend/"
  for d in root frontend; do
    # Skips the frontend's postinstall (copies Monaco into public/, unused by the harness) and
    # esbuild's, which only checks the platform binary npm installs anyway.
    docker run --rm "${user[@]}" -v "$tmp/$d:/w" -w /w embedgym-agent npm ci --ignore-scripts --no-audit --no-fund >&2
  done
  mv "$tmp" "$modules"
fi

mkdir -p "$dir/repo" "$dir/ws"
cp -R "$libraries" "$dir/arduino-libraries"
python3 - "$REPO" "$dir/repo" <<'EOF'
import shutil
import subprocess
import sys
from pathlib import Path


def files(checkout: Path, prefix: str = ""):
    """Paths of the files git tracks or does not ignore in `checkout`, and in its submodules."""
    out = subprocess.run(["git", "-C", str(checkout), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                         capture_output=True, check=True).stdout.decode()
    for rel in sorted(set(out.split("\0")) - {""}):
        path = checkout / rel
        if path.is_dir() and not path.is_symlink():
            if not (path / ".git").exists():
                raise SystemExit(f"submodule {prefix}{rel} is not checked out: git submodule update --init")
            yield from files(path, f"{prefix}{rel}/")
        # A tracked file deleted in the working tree (ALLOW_DIRTY) is left out.
        elif path.exists() or path.is_symlink():
            yield f"{prefix}{rel}"


src, dst = map(Path, sys.argv[1:])
for rel in files(src):
    (dst / rel).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src / rel, dst / rel, follow_symlinks=False)
EOF

cp -al "$modules/root/node_modules" "$dir/repo/node_modules"
cp -al "$modules/frontend/node_modules" "$dir/repo/velxio/frontend/node_modules"
mkdir -p "$dir/repo/velxio/third-party/wokwi-elements"
cp -R "$WOKWI_ELEMENTS/src" "$dir/repo/velxio/third-party/wokwi-elements/src"
# Codex's project root (the copy has no .git).
touch "$dir/repo/.codex-root"

python3 - "$dir" "$base" <<'EOF'
import json, sys
d, base = sys.argv[1:]
json.dump({"base": base}, open(f"{d}/export.json", "w"), indent=1)
EOF
echo "$dir"
