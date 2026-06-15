#!/usr/bin/env node
/**
 * Assemble the EdgeOne Pages Python cloud function (source / file-system routing).
 *
 * EdgeOne Pages routes by FILE PATH: a .py file under cloud-functions/ that
 * defines `class handler(BaseHTTPRequestHandler)` is auto-mapped to the URL of
 * its path. So cloud-functions/api/backend.py -> GET/POST /api/backend.
 * https://pages.edgeone.ai/document/cloud-functions
 *
 * Static frontend is handled separately (svelte:build -> dist/, declared as
 * outputDirectory in edgeone.json). This script only produces the function:
 *
 *   cloud-functions/
 *   ├── requirements.txt              (committed) pip deps, EdgeOne installs
 *   └── api/                          (gitignored, built here)
 *       ├── backend.py                copy of official_backend.py — defines
 *       │                             `class handler`, route = /api/backend
 *       ├── requirements.txt          same deps, also inside the function dir
 *       └── psychopy/                 pruned official PsychoPy source (git dev),
 *                                     a sibling so backend.py imports it
 *
 * PsychoPy source: $PSYCHOPY_CORE_SRC -> ../psychopy-core-src ->
 * ./psychopy-core-src -> shallow `git clone -b dev`.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CF = join(ROOT, "cloud-functions");
const FUNC = join(CF, "api");                 // cloud-functions/api/backend.py -> /api/backend
const BACKEND_SRC = join(ROOT, "web_backend", "official_backend.py");
const REQUIREMENTS_SRC = join(CF, "requirements.txt");

const PRUNE_DIRS = new Set(["demos", "tests", "__pycache__"]);
const PSYCHOPY_GIT = "https://github.com/psychopy/psychopy.git";
const PSYCHOPY_BRANCH = "dev";

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

if (!existsSync(BACKEND_SRC)) {
  console.error(`[edgeone] ERROR: backend not found at ${BACKEND_SRC}`);
  process.exit(1);
}

let src = findLocalSource();
if (src) console.log(`[edgeone] using local PsychoPy source: ${src}`);
else { console.log("[edgeone] no local PsychoPy checkout, cloning from git"); src = cloneSource(); }

console.log(`[edgeone] resetting ${FUNC}`);
rmSync(FUNC, { recursive: true, force: true });
mkdirSync(FUNC, { recursive: true });

// backend.py defines `class handler` and is self-contained (imports only the
// vendored psychopy sibling); its path cloud-functions/api/backend.py is the route.
console.log("[edgeone] handler: official_backend.py -> cloud-functions/api/backend.py");
cpSync(BACKEND_SRC, join(FUNC, "backend.py"));
if (existsSync(REQUIREMENTS_SRC)) cpSync(REQUIREMENTS_SRC, join(FUNC, "requirements.txt"));

console.log(`[edgeone] deps: pruned psychopy/ -> cloud-functions/api/psychopy`);
cpSync(src, join(FUNC, "psychopy"), {
  recursive: true,
  filter: (from) => {
    const rel = relative(src, from);
    if (!rel) return true;
    return !rel.split(/[\\/]/).some((seg) => PRUNE_DIRS.has(seg));
  },
});

console.log(`[edgeone] done — cloud-functions/api is ${dirSizeMB(FUNC)}M (route /api/backend)`);
