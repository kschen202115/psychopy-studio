#!/usr/bin/env bash
# Build the in-browser PsychoPy core archive for the Pyodide backend worker.
#
# Output: static/pyodide/psychopy-core.zip  (~3.3M, gitignored)
# Contents: pruned upstream psychopy (117 modules) + the pure-python deps that
# pyodide's micropip can't supply (no wheel, or would drag in C-ext dukpy).
#
# Reproducible from clean upstream — no manual edits to psychopy sources.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CORE_SRC="${PSYCHOPY_CORE_SRC:-$REPO/../psychopy-core-src}"
OUT="$REPO/static/pyodide/psychopy-core.zip"
STAGE="$(mktemp -d)"
VENDOR="$(mktemp -d)"

# 1. upstream psychopy (official dev branch) next to the repo, as documented
if [ ! -d "$CORE_SRC/psychopy/experiment" ]; then
  echo "Cloning official psychopy dev -> $CORE_SRC"
  git clone --depth 1 -b dev https://github.com/psychopy/psychopy.git "$CORE_SRC"
fi

# 2. pure-deletion prune to the traced 117-module core, straight into the stage
echo "Pruning psychopy core ..."
PSYCHOPY_CORE_SRC="$CORE_SRC" PRUNE_OUT="$STAGE/psychopy" python3 "$HERE/prune_psychopy.py"

# 3. vendor ALL pure-python deps so the worker needs no micropip (no PyPI at
#    runtime → fully self-contained / offline).
#    --no-deps is REQUIRED: javascripthon declares dukpy (C-ext, no wheel); the
#    compile path calls translates(enable_es6=True) which never touches dukpy,
#    so dukpy is stubbed in the worker instead of installed.
echo "Vendoring pure-python deps ..."
# The packages are written straight into $VENDOR. In restricted CI sandboxes
# (e.g. EdgeOne) pip's post-install pyenv-rehash hook can fail with
# "/usr/bin/chmod: Permission denied" AFTER the files are already in place, which
# would otherwise abort the build under `set -e`. Tolerate a non-zero exit here
# and judge success by verifying the vendored output below instead.
python3 -m pip install --no-deps --target "$VENDOR" \
  esprima astunparse i18next javascripthon \
  json-tricks openpyxl pyyaml six et-xmlfile packaging >/dev/null \
  || echo "  (pip exited non-zero — likely the pyenv-rehash hook; verifying output)"
# importable names to copy (metapensiero = javascripthon; six is a single module;
# yaml = pyyaml; et_xmlfile is an openpyxl dependency). Exclude compiled .so —
# the pure-python fallbacks are what pyodide uses.
missing=""
for name in esprima astunparse i18next metapensiero json_tricks openpyxl yaml et_xmlfile six.py packaging; do
  if [ -e "$VENDOR/$name" ]; then cp -R "$VENDOR/$name" "$STAGE/"; else missing="$missing $name"; fi
done
if [ -n "$missing" ]; then
  echo "Vendoring failed — missing deps:$missing" >&2
  exit 1
fi
find "$STAGE" -name "*.so" -delete 2>/dev/null || true

# 4. zip with package dirs at archive root (unpacked into site-packages)
find "$STAGE" -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
( cd "$STAGE" && zip -rq "$OUT" . -x "*.pyc" )
rm -rf "$STAGE" "$VENDOR"

echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
