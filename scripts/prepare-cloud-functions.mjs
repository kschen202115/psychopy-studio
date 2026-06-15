#!/usr/bin/env node
/**
 * Vendor the heavy, non-committed parts of the EdgeOne Pages Python function.
 *
 * Populates cloud-functions/_vendor/ (gitignored) at build/package time:
 *   _vendor/psychopy/            pruned official PsychoPy source (git `dev`)
 *   _vendor/official_backend.py  copy of this project's backend logic
 *
 * PsychoPy source is resolved in this order:
 *   1. $PSYCHOPY_CORE_SRC/psychopy
 *   2. ../psychopy-core-src/psychopy   (local dev checkout)
 *   3. ./psychopy-core-src/psychopy
 *   4. shallow `git clone -b dev` of psychopy/psychopy into a temp dir
 *
 * Usage: node scripts/prepare-cloud-functions.mjs
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "cloud-functions", "_vendor");
const PSYCHOPY_DEST = join(VENDOR, "psychopy");
const BACKEND_SRC = join(ROOT, "web_backend", "official_backend.py");
const BACKEND_DEST = join(VENDOR, "official_backend.py");

// Directories inside the psychopy package that are never used at runtime.
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
  console.log(`[prepare] cloning ${PSYCHOPY_GIT} (${PSYCHOPY_BRANCH}, --depth 1) -> ${dest}`);
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--branch", PSYCHOPY_BRANCH, PSYCHOPY_GIT, dest],
    { stdio: "inherit" },
  );
  return join(dest, "psychopy");
}

function dirSizeMB(path) {
  try {
    return execFileSync("du", ["-sm", path], { encoding: "utf8" }).split(/\s+/)[0];
  } catch {
    return "?";
  }
}

let src = findLocalSource();
if (src) {
  console.log(`[prepare] using local PsychoPy source: ${src}`);
} else {
  console.log("[prepare] no local PsychoPy checkout found, falling back to git");
  src = cloneSource();
}

if (!existsSync(BACKEND_SRC)) {
  console.error(`[prepare] ERROR: backend not found at ${BACKEND_SRC}`);
  process.exit(1);
}

console.log(`[prepare] resetting ${VENDOR}`);
rmSync(VENDOR, { recursive: true, force: true });
mkdirSync(VENDOR, { recursive: true });

console.log(`[prepare] copying pruned psychopy/ -> ${PSYCHOPY_DEST}`);
cpSync(src, PSYCHOPY_DEST, {
  recursive: true,
  filter: (from) => {
    const rel = relative(src, from);
    if (!rel) return true;
    return !rel.split(/[\\/]/).some((seg) => PRUNE_DIRS.has(seg));
  },
});

console.log(`[prepare] copying backend logic -> ${BACKEND_DEST}`);
cpSync(BACKEND_SRC, BACKEND_DEST);

console.log(`[prepare] done — _vendor is ${dirSizeMB(VENDOR)}M (pruned: ${[...PRUNE_DIRS].join(", ")})`);
