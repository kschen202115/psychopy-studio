# PsychoPy Studio — Web Mode Fork

> **Fork of [psychopy/psychopy-studio](https://github.com/psychopy/psychopy-studio)**
> that adds a fully browser-based mode: edit experiments in the browser,
> compile `.psyexp` → PsychoJS with the **official PsychoPy compiler**,
> and preview them directly in a new tab — no Electron, no server-side file storage.

---

## What this fork adds

| Feature | Upstream | This fork |
|---|---|---|
| Interface | Electron desktop app | Electron **and** browser (SvelteKit dev/build) |
| File storage | Local filesystem | **Browser IndexedDB** (WebFS, `/webfs/*`) — nothing leaves your machine |
| `.psyexp` → PsychoJS | Desktop-only via local Python | **In-browser via WebSocket** to the official `psychopy.experiment` + `psyexpCompile` |
| PsychoJS library | Bundled with Pavlovia | Auto-downloaded from `lib.pavlovia.org` and **cached in browser storage** |
| Resource files | On disk next to `.psyexp` | Uploaded to browser storage, sent to compiler as base64, resolved via official `exp.getResourceFiles()` |
| Browser preview | Not available | **One click** — opens `index.html` in a new tab with `__pilotToken=local` |
| Deployable export | Pavlovia upload | **Download ZIP** (experiment + PsychoJS lib + all resources) for self-hosting |
| File manager | None (OS filesystem) | Built-in: multi-select, upload files/folders, ZIP download, delete, clear all |

The compiler, the resource manifest, and the PsychoJS runtime are all taken from the official PsychoPy/Pavlovia pipeline — this fork does not reimplement them.

---

## Quick start (web mode)

### 1 — Clone & set up the official PsychoPy source

```bash
# Place the official source next to this repo
git clone --depth 1 -b dev https://github.com/psychopy/psychopy.git ../psychopy-core-src

# Back in this repo — create a minimal Python venv (no GUI deps needed)
python3 -m venv .venv-backend
.venv-backend/bin/pip install websockets esprima dukpy astunparse numpy scipy pandas \
    openpyxl json-tricks i18next pyyaml pyserial
.venv-backend/bin/pip install javascripthon --no-deps
```

Alternatively, point to an existing PsychoPy checkout with the env var:
```bash
export PSYCHOPY_CORE_SRC=/path/to/psychopy
```

### 2 — Start the compile backend

```bash
.venv-backend/bin/python web_backend/official_backend.py
# Listens on ws://127.0.0.1:8002
# Override: PSYCHOPY_WEB_BACKEND_HOST / PSYCHOPY_WEB_BACKEND_PORT
```

Or use the npm shortcut:
```bash
npm run web:backend
```

### 3 — Start the frontend

```bash
npm install
npm run svelte:dev      # → http://localhost:5173
```

Open `http://localhost:5173` in a browser and switch to **Builder**.

---

## Browser workflow

```
Upload .psyexp (+ stimuli folder)
        │
        ▼
   Browser storage (IndexedDB / WebFS)
        │
        ▼
  [Compile to JS and preview]
        │  sends .psyexp + resource files (base64) over WebSocket
        ▼
  official_backend.py
    psychopy.experiment.fromFile()
    psychopy.scripts.psyexpCompile()
    exp.getResourceFiles()  ← official resource manifest
        │
        ▼
  compiled outputs written back to WebFS
  PsychoJS lib downloaded from lib.pavlovia.org → WebFS
  Service Worker serves /webfs/* from IndexedDB
        │
        ▼
  New tab opens index.html?__pilotToken=local
  (PsychoJS loads stimuli from /webfs/<experiment>/ via Service Worker)
```

### Ribbon — Browser section

| Button | Action |
|---|---|
| **Compile to JS and preview** | Compile with official backend, open in new tab |
| **Export official browser files** | Export JS + HTML + PsychoJS lib + resources → download ZIP |
| **Manage browser files** | File manager: upload, download, ZIP, delete |

### File manager

- **Upload** single files or entire **folders** (directory structure preserved)
- **Multi-select** with checkboxes + Select all
- **Download ZIP** — all files, or selected files only
- **Delete** selected / **Clear all** (with confirmation)

---

## Architecture

```
Browser                               Python (local)
────────────────────────────────      ──────────────────────────────
SvelteKit UI (Svelte 5)               web_backend/official_backend.py
  │                                     │  thin WebSocket shell
  │  WebSocket (ws://127.0.0.1:8002)    │
  ├────────────────────────────────────►│  psychopy.experiment.fromFile()
  │  { psyexp, resources: [{base64}] }  │  psychopy.scripts.psyexpCompile()
  │◄────────────────────────────────────│  exp.getResourceFiles()
  │  { html, js, requiredResources }    │
  │                                     └── temp dir discarded after compile
  ▼
IndexedDB (PsychoPyWebFS)
  │  key: "myexp/index.html"
  │  key: "myexp/myexp.js"
  │  key: "myexp/lib/psychojs-*.js"
  │  key: "myexp/stim/face.png"
  │
Service Worker (/webfs-sw.js)
  │  intercepts GET /webfs/*
  │  reads from IndexedDB → HTTP Response
  │
  ▼
New tab: /webfs/myexp/index.html?__pilotToken=local
  PsychoJS runs, fetches stimuli from /webfs/myexp/stim/face.png
```

**Key constraint:** do not set *HTML path* in your experiment's online settings.
When that field is non-empty, the official Flow omits the `resources:` array from
`psychoJS.start()`, which breaks browser-mode resource loading.

---

## Production deployment

Build the frontend as a static site:

```bash
npm run svelte:build    # outputs to dist/
```

Host `dist/` on any static server (Nginx, Caddy, GitHub Pages …).
Run the Python backend on the same server and reverse-proxy it to
`wss://yourdomain.com/ws-backend` (or any path).

Tell the frontend where the backend is:
```js
localStorage.setItem("psychopy.officialBackendUrl", "wss://yourdomain.com/ws-backend")
```

---

## Desktop mode (Electron)

The original Electron workflow is unchanged. See [INSTALL.md](INSTALL.md) for setup.

```bash
npm run electron:start   # dev
npm run electron:make    # package (macOS)
npm run build:complete   # package (Windows)
```

---

## Limitations

- Browser mode only targets **PsychoJS** (Python runtime still requires the desktop app).
- Stimulus files must be in the same folder as the `.psyexp` (subfolders are fine).
  Files placed elsewhere are matched by filename as a fallback; missing required files
  are listed in red in the Export dialog.
- First preview requires an internet connection to download the official PsychoJS
  library from `lib.pavlovia.org` — subsequent runs use the cached copy in browser storage.
- The compile backend must be reachable from the browser (`ws://127.0.0.1:8002` by default).
  It can run on a remote server; see *Production deployment* above.

---

## Upstream

This fork tracks **[psychopy/psychopy-studio](https://github.com/psychopy/psychopy-studio)**.
Core PsychoPy library: **[psychopy/psychopy](https://github.com/psychopy/psychopy)** (dev branch).
PsychoJS runtime: **[psychopy/psychojs](https://github.com/psychopy/psychojs)**, served via `lib.pavlovia.org`.
