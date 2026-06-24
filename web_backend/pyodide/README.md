# In-browser PsychoPy backend (Pyodide)

The official PsychoPy "backend" is a **compiler / metadata service**, not an
experiment runtime (experiments run in the browser via PsychoJS). It exposes 6
commands, all dispatched by `official_core.handle_command(command, args, kwargs)`:

- `getElementProfiles` / `getLoopProfiles` / `getDeviceProfiles` — Builder metadata
- `roundtripPsyexp` — load/save `.psyexp` XML through `psychopy.experiment`
- `compilePsychoJS` — `.psyexp` → PsychoJS `.js` + `index.html` (the core path)
- `compilePsychoPy` — `.psyexp` → PsychoPy Python script

This runs **entirely in the browser** via Pyodide — no Python server process.

## Pieces

| File | Role |
|------|------|
| `../official_core.py` | Transport-agnostic backend logic. Single source of truth, loaded by both the worker (`?raw`) and the optional WS dev server. |
| `../official_backend.py` | Optional WebSocket dev server (imports `official_core`). For local diffing; not used in production. |
| `src/lib/official/pyodideWorker.js` | Pyodide Web Worker: loads runtime + archive, exposes `handle_command` over `postMessage`. |
| `src/lib/official/backend.js` | Unchanged public API; transport swapped WS → worker. |
| `static/pyodide/psychopy-core.zip` | Pruned psychopy + vendored deps (generated, gitignored). |
| `core_modules.txt` | The 117 modules in the traced import closure (keep-set). |
| `prune_psychopy.py` | Pure-deletion prune of upstream psychopy to those 117 modules. |
| `build_archive.sh` | One-shot: clone/reuse upstream → prune → vendor deps → zip. |

## Dependency recipe (validated)

Fully self-contained — **no external CDN and no micropip/PyPI at run time.**

- **pyodide runtime + numpy 1.26.4** — self-hosted under `static/pyodide/runtime/`
  (`fetch_runtime.sh`). numpy version matches what Pyodide 0.26.4 bundles.
- **all pure-python deps vendored into the archive** (`pip install --no-deps`,
  so the C-ext `dukpy` that `javascripthon` declares is never pulled):
  `esprima`, `astunparse`, `i18next`, `javascripthon` (= `metapensiero`),
  `json-tricks`, `openpyxl` (+`et_xmlfile`), `pyyaml` (`yaml`), `six`,
  `packaging`. → micropip is not used at all.
- **stubbed** (imported at load, never called on the compile path):
  `scipy`, `pandas`, `dukpy`, `serial`. Stubs are *type-safe* (attributes are
  real classes) so `isinstance()` checks don't crash.
- **env shim** (worker only, not a source edit): `sys.platform = "linux"` +
  `platform.system = lambda: "Linux"`, so psychopy loads `Linux.spec` instead of
  a nonexistent `Emscripten.spec`.

## Rebuild the generated assets

Both outputs are gitignored; regenerate before `vite build`:

```bash
bash web_backend/pyodide/fetch_runtime.sh   # static/pyodide/runtime/ (~25M)
bash web_backend/pyodide/build_archive.sh   # static/pyodide/psychopy-core.zip (~3.8M)
```

## Notes / known limits

- `getDeviceProfiles` fails (pruned `psychopy.hardware`, and pyglet is absent);
  the frontend already falls back to local device profiles — same as a desktop
  backend without pyglet.
- The keep-set was traced from an all-components profile pass + an empty-ish
  compile. Real experiments using specific components may need a few extra
  method-level imports; extend `core_modules.txt` and rebuild if a compile hits
  `ModuleNotFoundError`.
- First load pulls ~29M (pyodide runtime + numpy + the psychopy archive) from
  the app's own origin and inits in the worker (a few seconds). The worker is
  lazy — it only starts on the first backend command.
