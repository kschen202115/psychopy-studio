#!/usr/bin/env node
/**
 * Assemble the EdgeOne Pages Build Output (.edgeone/) for our custom build.
 *
 * Because we use a custom build command, EdgeOne consumes a prebuilt
 * `.edgeone/` directory directly (edgeone.json -> outputDirectory: ".edgeone")
 * instead of running framework detection / processing cloud-functions source.
 * https://pages.edgeone.ai/document/building-output-configuration
 *
 * Produces:
 *   .edgeone/
 *   ├── assets/                       static frontend (copy of dist/)
 *   └── cloud-functions/
 *       └── api-python/               Python function group (handler mode)
 *           ├── config.json           { version, routes } — the "meta" file
 *           ├── app.py                fixed entry, exposes `handler`
 *           ├── requirements.txt      pip deps (EdgeOne installs these)
 *           ├── official_backend.py   backend logic (vendored)
 *           └── psychopy/             pruned official PsychoPy source (git dev)
 *
 * PsychoPy source: $PSYCHOPY_CORE_SRC -> ../psychopy-core-src ->
 * ./psychopy-core-src -> shallow `git clone -b dev`.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, ".edgeone");
const ASSETS = join(OUT, "assets");
const FUNC = join(OUT, "cloud-functions", "api-python");
const BACKEND_SRC = join(ROOT, "web_backend", "official_backend.py");
const REQUIREMENTS_SRC = join(ROOT, "cloud-functions", "requirements.txt");

const PRUNE_DIRS = new Set(["demos", "tests", "__pycache__"]);
const PSYCHOPY_GIT = "https://github.com/psychopy/psychopy.git";
const PSYCHOPY_BRANCH = "dev";

// The function handles every method on this exact path; the handler itself is
// path-agnostic (GET=health, POST=command), the regex just scopes the route.
const ROUTE = "^/api/backend$";

const APP_PY = `"""EdgeOne Pages Python function entry (fixed filename: app.py).

Vendored siblings in this directory: official_backend.py + psychopy/.
The route is declared in config.json (${ROUTE} -> /api/backend).
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
# official_backend reads PSYCHOPY_CORE_SRC at import time; psychopy/ is a sibling.
os.environ.setdefault("PSYCHOPY_CORE_SRC", _HERE)

from official_backend import CommandRequestHandler as handler  # noqa: E402

__all__ = ["handler"]
`;

const CONFIG_JSON = JSON.stringify({ version: 3, routes: [{ src: ROUTE }] }, null, 2) + "\n";

function findLocalSource() {
  const candidates = [
    process.env.PSYCHOPY_CORE_SRC && join(process.env.PSYCHOPY_CORE_SRC, "psychopy"),
    join(ROOT, "..", "psychopy-core-src", "psychopy"),
    join(ROOT, "psychopy-core-src", "psychopy"),
  ].filter(Boolean);
  return candidates.find((c) => existsSync(join(c, "experiment"))) || null;
}

function cloneSource() {
  const dest = join(tmpdir(), `psychopy-${PSYCHOPY_BRANCH}-${Date.now()}`);
  console.log(`[edgeone] cloning ${PSYCHOPY_GIT} (${PSYCHOPY_BRANCH}, --depth 1) -> ${dest}`);
  execFileSync("git", ["clone", "--depth", "1", "--branch", PSYCHOPY_BRANCH, PSYCHOPY_GIT, dest], { stdio: "inherit" });
  return join(dest, "psychopy");
}

function dirSizeMB(p) {
  try { return execFileSync("du", ["-sm", p], { encoding: "utf8" }).split(/\s+/)[0]; } catch { return "?"; }
}

if (!existsSync(DIST)) {
  console.error(`[edgeone] ERROR: ${DIST} not found — run "npm run svelte:build" first`);
  process.exit(1);
}
if (!existsSync(BACKEND_SRC)) {
  console.error(`[edgeone] ERROR: backend not found at ${BACKEND_SRC}`);
  process.exit(1);
}

let src = findLocalSource();
if (src) console.log(`[edgeone] using local PsychoPy source: ${src}`);
else { console.log("[edgeone] no local PsychoPy checkout, cloning from git"); src = cloneSource(); }

// Reset only our build output; preserve .edgeone/project.json (CLI link state).
rmSync(ASSETS, { recursive: true, force: true });
rmSync(join(OUT, "cloud-functions"), { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });
mkdirSync(FUNC, { recursive: true });

console.log("[edgeone] static: dist/ -> .edgeone/assets/");
cpSync(DIST, ASSETS, { recursive: true });

console.log(`[edgeone] function: pruned psychopy/ -> .edgeone/cloud-functions/api-python/psychopy`);
cpSync(src, join(FUNC, "psychopy"), {
  recursive: true,
  filter: (from) => {
    const rel = relative(src, from);
    if (!rel) return true;
    return !rel.split(/[\\/]/).some((seg) => PRUNE_DIRS.has(seg));
  },
});
cpSync(BACKEND_SRC, join(FUNC, "official_backend.py"));
if (existsSync(REQUIREMENTS_SRC)) cpSync(REQUIREMENTS_SRC, join(FUNC, "requirements.txt"));
writeFileSync(join(FUNC, "app.py"), APP_PY);
writeFileSync(join(FUNC, "config.json"), CONFIG_JSON);

console.log(`[edgeone] done — .edgeone is ${dirSizeMB(OUT)}M (assets + api-python; route ${ROUTE})`);
