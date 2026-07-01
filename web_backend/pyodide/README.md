# In-browser PsychoPy backend (Pyodide)

The official PsychoPy "backend" is a **compiler / metadata service**, not an
experiment runtime (experiments run in the browser via PsychoJS). It exposes 7
commands, all dispatched by `official_core.handle_command(command, args, kwargs)`:

- `getElementProfiles` / `getLoopProfiles` / `getDeviceProfiles` — Builder metadata
- `roundtripPsyexp` — load/save `.psyexp` XML through `psychopy.experiment`
- `compilePsychoJS` — `.psyexp` → PsychoJS `.js` + `index.html` (the core path)
- `compilePsychoPy` — `.psyexp` → PsychoPy Python script
- `importConditions` — parse a conditions file (csv/xlsx) via
  `psychopy.data.importConditions`, returning `[trialList, fieldNames]` for the
  Builder loop dialog. The file lives in the browser's WebFS, and the backend is
  sandboxed (it never reads client/WebFS paths), so the caller sends the file
  content in `resources`; the backend materializes it to a temp dir and parses it,
  so csv/xlsx parse identically to the desktop. This is the one command that
  needs the real `pandas` (see below).

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

- **pyodide runtime + numpy 1.26.4 + pandas 2.2.0** — self-hosted under
  `static/pyodide/runtime/` (`fetch_runtime.sh`). Versions match what Pyodide
  0.26.4 bundles (pandas 2.2.0 is required — psychopy's `importConditions` breaks
  under pandas 3.0's copy-on-write). pandas is a C-extension, so it can't be
  vendored in the archive; it ships as a pyodide wheel and is loaded lazily.
- **all pure-python deps vendored into the archive** (`pip install --no-deps`,
  so the C-ext `dukpy` that `javascripthon` declares is never pulled):
  `esprima`, `astunparse`, `i18next`, `javascripthon` (= `metapensiero`),
  `json-tricks`, `openpyxl` (+`et_xmlfile`), `pyyaml` (`yaml`), `six`,
  `packaging`. → micropip is not used at all. (`openpyxl` here is what lets
  `importConditions` read `.xlsx`.)
- **stubbed** (imported at load, never called on the compile path):
  `scipy`, `dukpy`, `serial`, and `pandas` **only during warmup**. Stubs are
  *type-safe* (attributes are real classes) so `isinstance()` checks don't crash.
  `pandas` is a special case: it's stubbed so the heavy import stays off the
  compile path, then — right after init — the worker loads the real pandas wheel,
  drops the stub, and `importlib.reload(psychopy.data.utils)` so its module-level
  `import pandas as pd` rebinds to the real library. `importConditions` awaits
  this swap. So on the compile path pandas is never loaded; it's paid for only
  once, in the background, for conditions parsing.
- **env shim** (worker only, not a source edit): `sys.platform = "linux"` +
  `platform.system = lambda: "Linux"`, so psychopy loads `Linux.spec` instead of
  a nonexistent `Emscripten.spec`.

## Rebuild the generated assets

Both outputs are gitignored; regenerate before `vite build`:

```bash
bash web_backend/pyodide/fetch_runtime.sh   # static/pyodide/runtime/ (~51M: pyodide + numpy + pandas)
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
- After init, the worker preloads the pandas wheel (~another ~13M) in the
  background so the first conditions-file lookup is instant; this download never
  blocks startup or the compile path, and only happens in the pyodide build.
- Non-csv/xlsx conditions files, or any read failure, return `null` so the loop
  dialog just omits the "N conditions" summary instead of erroring.
