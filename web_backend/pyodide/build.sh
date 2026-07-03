#!/usr/bin/env bash
# Build the fully self-contained Pyodide static site into dist/.
#
# Steps: ensure the (gitignored) pyodide runtime is present, use the committed
# psychopy-core archive, build the frontend, strip throwaway spike files, then
# sanity-check dist. Safe to run in CI (EdgeOne) and locally.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"

# 1. self-hosted pyodide runtime (~49M, gitignored) — fetch via curl if absent
[ -f static/pyodide/runtime/pyodide.asm.wasm ] || bash "$HERE/fetch_runtime.sh"

# 2. psychopy core archive — committed to the repo; rebuild only if missing
#    (the rebuild needs pip + zip, which restricted CI sandboxes may lack)
[ -f static/pyodide/psychopy-core.zip ] || bash "$HERE/build_archive.sh"

# 3. frontend -> dist/
npm run svelte:build

# 4. drop spike artifacts that vite copies out of static/
rm -f dist/psychopy-spike.zip dist/pyodide-spike.html

# 5. sanity-check the output before it is served / deployed
bash "$HERE/verify_dist.sh"
