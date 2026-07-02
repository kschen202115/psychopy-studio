#!/usr/bin/env bash
# Sanity-check the built dist/ before deploying to Cloudflare.
#
# Guards against the iCloud-sync corruption that has silently produced a broken
# dist (missing _app, duplicate "* 2" directories) which `wrangler deploy` will
# happily upload, leaving the live Worker serving 404s / a blank page.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DIST="$(cd "$HERE/../.." && pwd)/dist"

fail() { echo "dist verify FAILED: $1" >&2; exit 1; }

[ -d "$DIST/_app" ] || fail "dist/_app missing (build did not complete?)"
ls "$DIST"/_app/immutable/workers/*.js >/dev/null 2>&1 \
  || fail "pyodide worker chunk missing from dist/_app/immutable/workers/"
dupes="$(find "$DIST" -name '* 2' -print -quit)"
[ -z "$dupes" ] || fail "duplicate '* 2' entries present (iCloud corruption): $dupes"
[ -f "$DIST/pyodide/psychopy-core.zip" ] || fail "dist/pyodide/psychopy-core.zip missing"
[ -f "$DIST/pyodide/runtime/pyodide.asm.wasm" ] || fail "dist/pyodide/runtime wasm missing"

count="$(find "$DIST" -type f | wc -l | tr -d ' ')"
echo "dist OK: $count files; _app + pyodide worker + runtime/archive all present"
