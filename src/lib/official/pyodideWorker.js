/**
 * Pyodide Web Worker — runs the official PsychoPy backend entirely in-browser.
 *
 * Replaces the external Python server: loads Pyodide + a pruned PsychoPy core
 * (static/pyodide/psychopy-core.zip, ~3.3M) + vendored pure-python deps, then
 * exposes official_core.handle_command(command, args, kwargs) over postMessage.
 *
 * Protocol (main thread <-> worker):
 *   <- { id, command, args?, kwargs? }            run a backend command
 *   -> { id, ok: true, response }                 success
 *   -> { id, ok: false, error }                   failure ({code,message,...})
 *   -> { type: "status", phase, detail }          init progress (no id)
 *   -> { type: "ready" }                          init finished
 */

// single source of truth: the transport-agnostic backend core, inlined at build
// time so there is no second copy to keep in sync.
import officialCoreSource from "../../../web_backend/official_core.py?raw";

// self-hosted pyodide runtime + numpy (fetch_runtime.sh) — no external CDN at
// run time. All other python deps are vendored in the archive (no micropip).
const PYODIDE_BASE = "/pyodide/runtime/";
const ARCHIVE_URL = "/pyodide/psychopy-core.zip";

// heavy/native libs psychopy imports at load but the compile path never calls;
// stubbed as real (type-safe) classes so isinstance()/attr-chains don't crash.
const STUB_ROOTS = ["scipy", "pandas", "dukpy", "serial"];

let pyodide = null;
let initPromise = null;

function status(phase, detail) {
  postMessage({ type: "status", phase, detail });
}

async function init() {
  status("pyodide", "loading runtime");
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`);
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });

  status("packages", "numpy");
  await pyodide.loadPackage(["numpy"]);

  status("env", "stubs + platform shim");
  pyodide.runPython(`
import sys, types, importlib.abc, importlib.machinery, platform
# pyodide runs on emscripten; psychopy keys prefs off platform.system() and has
# no Emscripten.spec. Present as Linux so Linux.spec loads. (env shim only.)
sys.platform = "linux"
platform.system = lambda: "Linux"

# stub heavy libs psychopy imports at load but never calls on the compile path.
# attributes are *classes* (real types) so they work as isinstance() type args
# (always False), are callable (return None), and support attribute chains.
_STUB_ROOTS = ${JSON.stringify(STUB_ROOTS)}
class _StubMeta(type):
    def __getattr__(cls, name): return _StubMeta(name, (), {})
    def __call__(cls, *a, **k): return None
def _stub_class(name): return _StubMeta(name, (), {})
class _StubMod(types.ModuleType):
    def __getattr__(self, name):
        if name in ("__path__", "__all__"): raise AttributeError(name)
        return _stub_class(self.__name__ + "." + name)
class _StubFinder(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def find_spec(self, name, path=None, target=None):
        if name.split(".")[0] in _STUB_ROOTS:
            return importlib.machinery.ModuleSpec(name, self)
        return None
    def create_module(self, spec):
        m = _StubMod(spec.name); m.__path__ = []; return m
    def exec_module(self, module): pass
sys.meta_path.insert(0, _StubFinder())
`);

  status("psychopy", "downloading core archive");
  const buf = await (await fetch(ARCHIVE_URL)).arrayBuffer();
  const sitePkgs = pyodide.runPython("import site; site.getsitepackages()[0]");
  status("psychopy", "unpacking");
  pyodide.unpackArchive(buf, "zip", { extractDir: sitePkgs });

  status("core", "loading official_core");
  pyodide.FS.writeFile("/home/pyodide/official_core.py", officialCoreSource);
  pyodide.runPython(`
import sys
sys.path.insert(0, "/home/pyodide")
import official_core
`);

  status("ready", "warming up (import psychopy.experiment)");
  // force the heavy psychopy import now so the first real command is fast
  pyodide.runPython("import psychopy.experiment")
  postMessage({ type: "ready" });
}

function ensureInit() {
  if (!initPromise) initPromise = init().catch((e) => {
    initPromise = null; // allow retry on next command
    throw e;
  });
  return initPromise;
}

async function runCommand(id, command, args, kwargs) {
  await ensureInit();
  // call official_core.handle_command(command, args, kwargs); marshal via JSON
  const handle = pyodide.runPython(`
import json, official_core
def _bridge(command, args_json, kwargs_json):
    args = json.loads(args_json); kwargs = json.loads(kwargs_json)
    try:
        resp = official_core.handle_command(command, args, kwargs)
        return json.dumps({"ok": True, "response": official_core.json_safe(resp)})
    except official_core.OfficialBackendError as e:
        return json.dumps({"ok": False, "error": e.as_dict()})
    except Exception as e:
        import traceback
        return json.dumps({"ok": False, "error": {
            "code": "backend-command-failed", "message": str(e),
            "traceback": traceback.format_exc(limit=12)}})
_bridge
`);
  const out = JSON.parse(
    handle(command, JSON.stringify(args || []), JSON.stringify(kwargs || {}))
  );
  handle.destroy();
  if (out.ok) postMessage({ id, ok: true, response: out.response });
  else postMessage({ id, ok: false, error: out.error });
}

onmessage = async (ev) => {
  const data = ev.data || {};
  if (data.type === "init") { ensureInit().catch(() => {}); return; }
  const { id, command, args, kwargs } = data;
  try {
    await runCommand(id, command, args, kwargs);
  } catch (e) {
    postMessage({
      id, ok: false,
      error: { code: "pyodide-worker-failed", message: String(e && e.message || e) },
    });
  }
};
