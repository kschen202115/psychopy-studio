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
Phase 1 — Python backend (current)
  Browser UI  ←WebSocket→  local Python process  →  official psychopy compiler
  Files: browser IndexedDB.  Compiler: official psychopy.experiment + psyexpCompile.
  Status: working end-to-end, some rough edges.

Phase 2 — Python in WASM (planned)
  Eliminate the local Python process entirely.
  Run the official PsychoPy compiler inside the browser via Pyodide / python-wasm.
  No backend, no WebSocket.  Pure browser, works offline.

Phase 3 — Native JS compiler (long-term)
  Port the .psyexp → PsychoJS compilation pipeline to JavaScript.
  Zero Python dependency.  Full offline capability.  Embeddable in any page.
```

Each phase keeps the same browser-storage architecture and UI — only the compilation
layer changes.  Phase 1 is complete and usable today.

---

## What this fork adds (Phase 1)

| | Upstream | This fork |
|---|---|---|
| **Deployment** | Electron desktop app | Electron + plain browser (SvelteKit) |
| **File storage** | Local OS filesystem | Browser IndexedDB (`/webfs/*`) — nothing leaves your machine |
| **Compilation** | Desktop Python only | Via WebSocket to a local Python process (official `psychopy.experiment` + `psyexpCompile`) |
| **PsychoJS library** | Bundled with Pavlovia upload | Auto-fetched from `lib.pavlovia.org`, cached in browser storage |
| **Resource files** | On disk | Uploaded to browser storage; sent to compiler as base64; resolved with `exp.getResourceFiles()` |
| **Preview** | Not available | One click → new tab, `__pilotToken=local` |
| **Export** | Pavlovia only | Download ZIP (experiment + PsychoJS lib + all resources) for self-hosting |
| **File manager** | None | Multi-select, upload files/folders, ZIP download, delete, clear all |

The compiler, resource manifest, and PsychoJS runtime are taken unchanged from the
official PsychoPy/Pavlovia pipeline — this fork does not reimplement them.

---

## Quick start

### 1 — Python compiler backend

```bash
# Put the official PsychoPy source next to this repo
git clone --depth 1 -b dev https://github.com/psychopy/psychopy.git ../psychopy-core-src

# Minimal Python env (no GUI packages needed)
python3 -m venv .venv-backend
.venv-backend/bin/pip install websockets esprima dukpy astunparse numpy scipy pandas \
    openpyxl json-tricks i18next pyyaml pyserial
.venv-backend/bin/pip install javascripthon --no-deps

# Start (listens on ws://127.0.0.1:8002)
.venv-backend/bin/python web_backend/official_backend.py
# or: npm run web:backend
```

To use a different PsychoPy checkout:
```bash
export PSYCHOPY_CORE_SRC=/path/to/psychopy
```

### 2 — Frontend

```bash
npm install
npm run svelte:dev   # → http://localhost:5173
```

Open `http://localhost:5173`, switch to **Builder**.

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
        │  WebSocket: { psyexp, resources: [{path, base64}] }
        ▼
  official_backend.py
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

## Architecture (Phase 1)

```
Browser                                     Python (local, Phase 1 only)
─────────────────────────────────────       ──────────────────────────────────
SvelteKit UI (Svelte 5)                     web_backend/official_backend.py
  │                                           thin WebSocket shell
  │  ws://127.0.0.1:8002
  ├──────────────────────────────────────►  psychopy.experiment.fromFile()
  │  { psyexp, resources:[{path,base64}] }  psychopy.scripts.psyexpCompile()
  │◄──────────────────────────────────────  exp.getResourceFiles()
  │  { html, js, requiredResources }         temp dir discarded after compile
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

## Production deployment (Phase 1)

```bash
npm run svelte:build   # static output → dist/
```

Host `dist/` on any static server. Run the Python backend on the same host and
reverse-proxy it (e.g. Nginx `proxy_pass`) to `wss://yourdomain.com/ws-backend`.

Point the frontend at it:
```js
localStorage.setItem("psychopy.officialBackendUrl", "wss://yourdomain.com/ws-backend")
```

---

## Known limitations (Phase 1)

- Only PsychoJS target is supported in browser mode (Python execution still requires the desktop app).
- Stimulus files must be in the same folder as the `.psyexp` (subfolders are fine); files placed
  elsewhere are matched by filename as a fallback, and anything still missing is listed in the Export dialog.
- First preview requires internet access to download the official PsychoJS library; subsequent
  runs use the cached copy in browser storage.
- The Python backend must be running and reachable at compile time.

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
