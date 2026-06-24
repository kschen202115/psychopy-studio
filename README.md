# PsychoPy Studio — Browser-First Fork

> **Goal: run PsychoPy entirely in the browser — no installation, no local Python, no Electron.**
>
> Fork of [psychopy/psychopy-studio](https://github.com/psychopy/psychopy-studio).

---

## Vision

The upstream PsychoPy Studio is an Electron desktop app that ships its own Python runtime.
This fork explores what it takes to move the full workflow — experiment editing, `.psyexp` → PsychoJS
compilation, stimulus management, and in-browser preview — into a plain web page, so researchers can
use PsychoPy on any device without installing anything.

### Roadmap

```
Phase 1 — Python backend (done, kept as optional dev tool)
  Browser UI  ←WebSocket→  local Python process  →  official psychopy compiler

Phase 2 — Python in WASM (current)
  The official PsychoPy compiler runs INSIDE the browser via Pyodide.
  No server process, no WebSocket. Self-hosted runtime → works fully offline.
  Files: browser IndexedDB.  Compiler: official psychopy.experiment + psyexpCompile.

Phase 3 — Native JS compiler (long-term)
  Port the .psyexp → PsychoJS compilation pipeline to JavaScript.
  Zero Python dependency.  Embeddable in any page.
```

Each phase keeps the same browser-storage architecture and UI — only the compilation
layer changes.  **Phase 2 is complete:** the compiler runs in a Pyodide Web Worker,
so a deployed app needs no backend at all. The Phase 1 WebSocket server still works
and is kept for local development / output diffing.

---

## What this fork adds

| | Upstream | This fork |
|---|---|---|
| **Deployment** | Electron desktop app | Electron + plain browser (SvelteKit) |
| **File storage** | Local OS filesystem | Browser IndexedDB (`/webfs/*`) — nothing leaves your machine |
| **Compilation** | Desktop Python only | **In-browser via Pyodide** — official `psychopy.experiment` + `psyexpCompile` run in a Web Worker, no server |
| **PsychoJS library** | Bundled with Pavlovia upload | Auto-fetched from `lib.pavlovia.org`, cached in browser storage |
| **Resource files** | On disk | Uploaded to browser storage; sent to compiler as base64; resolved with `exp.getResourceFiles()` |
| **Preview** | Not available | One click → new tab, `__pilotToken=local` |
| **Export** | Pavlovia only | Download ZIP (experiment + PsychoJS lib + all resources) for self-hosting |
| **File manager** | None | Multi-select, upload files/folders, ZIP download, delete, clear all |

The compiler, resource manifest, and PsychoJS runtime are taken unchanged from the
official PsychoPy/Pavlovia pipeline — this fork does not reimplement them.

---

## Quick start

### 1 — Build the in-browser backend assets

The compiler runs in the browser, so there is **no server to start**. Two
generated assets (both gitignored) must be built once before running:

```bash
# pruned upstream psychopy + vendored python deps  → static/pyodide/psychopy-core.zip
bash web_backend/pyodide/build_archive.sh
# self-hosted pyodide runtime + numpy              → static/pyodide/runtime/
bash web_backend/pyodide/fetch_runtime.sh
```

`build_archive.sh` clones the official PsychoPy `dev` branch to
`../psychopy-core-src` if needed (override with `PSYCHOPY_CORE_SRC`). See
[web_backend/pyodide/README.md](web_backend/pyodide/README.md) for how the
backend works.

### 2 — Frontend

```bash
npm install
npm run svelte:dev   # → http://localhost:5173
```

Open `http://localhost:5173`, switch to **Builder**. The Pyodide worker starts
lazily on the first compile (a few seconds), then stays warm.

> **Optional** — the legacy WebSocket Python server still exists for local
> development / diffing the in-browser output. See
> [web_backend/pyodide/README.md](web_backend/pyodide/README.md).

---

## Browser workflow

```
Upload .psyexp + stimuli
        │
        ▼
  Browser storage (IndexedDB)     ← nothing leaves the browser
        │
        ▼
  [Compile to JS and preview]
        │  postMessage: { psyexp, resources: [{path, base64}] }
        ▼
  Pyodide Web Worker → official_core.handle_command()
    psychopy.experiment.fromFile()
    psychopy.scripts.psyexpCompile()
    exp.getResourceFiles()   ← official resource manifest
        │
        ▼
  compiled HTML + JS written to IndexedDB
  PsychoJS lib fetched from lib.pavlovia.org → IndexedDB (cached)
  Service Worker intercepts GET /webfs/* → reads from IndexedDB
        │
        ▼
  New tab: /webfs/myexp/index.html?__pilotToken=local
  PsychoJS runs, fetches stimuli via /webfs/myexp/stim/… (Service Worker)
```

### Ribbon — Browser section

| Button | Action |
|---|---|
| **Compile to JS and preview** | Compile via backend, open in new tab |
| **Export official browser files** | JS + HTML + PsychoJS lib + resources → ZIP |
| **Manage browser files** | Upload (files or folders), ZIP download, delete |

---

## Architecture

```
Browser (everything runs here — no server)
──────────────────────────────────────────────────────────────────
SvelteKit UI (Svelte 5)
  │   src/lib/official/backend.js  (unchanged public API)
  │   postMessage { psyexp, resources:[{path,base64}] }
  ▼
Pyodide Web Worker  (src/lib/official/pyodideWorker.js)
  │   self-hosted pyodide runtime + numpy + pruned psychopy archive
  │   official_core.handle_command()
  │     psychopy.experiment.fromFile()
  │     psychopy.scripts.psyexpCompile()
  │     exp.getResourceFiles()
  │   → { html, js, requiredResources }
  │
  ▼
IndexedDB (PsychoPyWebFS)
  key: "myexp/index.html"
  key: "myexp/myexp.js"
  key: "myexp/lib/psychojs-2025.x.x.js"
  key: "myexp/stim/face.png"
  │
Service Worker (/webfs-sw.js)
  intercepts GET /webfs/* → reads from IndexedDB → HTTP Response
  │
  ▼
/webfs/myexp/index.html?__pilotToken=local
  PsychoJS loads → fetches /webfs/myexp/stim/face.png (Service Worker)
```

> **Note:** do not set *HTML path* in the experiment's online settings.
> When non-empty, the official Flow omits `resources:` from `psychoJS.start()`,
> which breaks resource loading in browser mode.

---

## Production deployment

```bash
bash web_backend/pyodide/build_archive.sh   # → static/pyodide/psychopy-core.zip
bash web_backend/pyodide/fetch_runtime.sh   # → static/pyodide/runtime/
npm run svelte:build                         # static output → dist/
```

Host `dist/` on **any static server / CDN** — there is no backend to run or
reverse-proxy. The Pyodide runtime and PsychoPy archive are served from the same
origin, so the app works offline and behind restricted networks (no external
CDN at run time).

---

## Known limitations

- Only PsychoJS target is supported in browser mode (Python execution still requires the desktop app).
- Stimulus files must be in the same folder as the `.psyexp` (subfolders are fine); files placed
  elsewhere are matched by filename as a fallback, and anything still missing is listed in the Export dialog.
- First preview requires internet access to download the official PsychoJS library; subsequent
  runs use the cached copy in browser storage.
- First compile of a session loads the Pyodide runtime (~29 MB from the app's own
  origin) and inits the worker for a few seconds; it then stays warm.
- `getDeviceProfiles` (camera/serial hardware) degrades to local fallback profiles
  in the browser — same as a desktop backend without `pyglet`.

---

## Desktop mode (unchanged from upstream)

See [INSTALL.md](INSTALL.md).

```bash
npm run electron:start     # dev
npm run electron:make      # package macOS
npm run build:complete     # package Windows
```

---

## Upstream

- Studio UI: [psychopy/psychopy-studio](https://github.com/psychopy/psychopy-studio)
- Core library: [psychopy/psychopy](https://github.com/psychopy/psychopy) (dev branch)
- PsychoJS runtime: [psychopy/psychojs](https://github.com/psychopy/psychojs), served via `lib.pavlovia.org`
