#!/usr/bin/env bash
# Download the minimal Pyodide runtime so the app needs NO external CDN at run
# time (relevant for offline use and CDN-restricted networks).
#
# Output: static/pyodide/runtime/  (generated, gitignored)
# The core loader + numpy + pandas are fetched. pandas is a C-extension, so
# (unlike the pure-python deps) it can't live in the archive; it's needed only by
# importConditions and is loaded after startup by pyodideWorker.js. openpyxl (for
# xlsx conditions) is pure-python and already vendored in psychopy-core.zip (see
# build_archive.sh), as are all other deps — so micropip is never used at run time.
set -euo pipefail

VER="v0.26.4"
BASE="https://cdn.jsdelivr.net/pyodide/${VER}/full"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$HERE/../.." && pwd)/static/pyodide/runtime"
NUMPY="numpy-1.26.4-cp312-cp312-pyodide_2024_0_wasm32.whl"

# pandas + its deps come from the pyodide index (names/versions per
# pyodide-lock.json for ${VER}); self-hosting them lets loadPackage(["pandas"])
# resolve offline. numpy is already fetched above and satisfies pandas too.
PANDAS_WHEELS=(
  "pandas-2.2.0-cp312-cp312-pyodide_2024_0_wasm32.whl"
  "python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
  "pytz-2024.1-py2.py3-none-any.whl"
  "six-1.16.0-py2.py3-none-any.whl"
)

mkdir -p "$OUT"
for f in pyodide.mjs pyodide.asm.js pyodide.asm.wasm python_stdlib.zip \
         pyodide-lock.json "$NUMPY" "${PANDAS_WHEELS[@]}"; do
  echo "fetch $f"
  curl -fsSL "$BASE/$f" -o "$OUT/$f"
done

echo "Pyodide runtime in $OUT ($(du -sh "$OUT" | cut -f1))"
