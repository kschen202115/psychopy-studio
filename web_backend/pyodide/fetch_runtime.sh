#!/usr/bin/env bash
# Download the minimal Pyodide runtime so the app needs NO external CDN at run
# time (relevant for offline use and CDN-restricted networks).
#
# Output: static/pyodide/runtime/  (generated, gitignored)
# Only the core loader + numpy are fetched; all other Python deps are vendored
# in psychopy-core.zip (see build_archive.sh), so micropip is never used.
set -euo pipefail

VER="v0.26.4"
BASE="https://cdn.jsdelivr.net/pyodide/${VER}/full"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$HERE/../.." && pwd)/static/pyodide/runtime"
NUMPY="numpy-1.26.4-cp312-cp312-pyodide_2024_0_wasm32.whl"

mkdir -p "$OUT"
for f in pyodide.mjs pyodide.asm.js pyodide.asm.wasm python_stdlib.zip \
         pyodide-lock.json "$NUMPY"; do
  echo "fetch $f"
  curl -fsSL "$BASE/$f" -o "$OUT/$f"
done

echo "Pyodide runtime in $OUT ($(du -sh "$OUT" | cut -f1))"
