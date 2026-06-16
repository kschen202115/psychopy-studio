#!/usr/bin/env python3
"""Official PsychoPy backend glue for PsychoPy Studio Web.

This module intentionally stays thin. It validates request payloads, isolates
browser-supplied paths, serializes JSON-safe responses, and delegates Builder
semantics to PsychoPy's official ``psychopy.experiment`` and compiler APIs.
"""

from __future__ import annotations

import base64
import binascii
import contextlib
import io
import json
import logging
import os
import re
import sys
import tempfile
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlparse


def _install_optional_stubs() -> None:
    """Stub heavy deps PsychoPy imports at load time but never uses here.

    PsychoPy imports ``scipy`` and ``pandas`` at module load, but the
    compile/profile command paths never call into them. On the serverless
    function they are deliberately NOT installed (dropping ~167MB to stay under
    the bundle size limit); install no-op stubs so PsychoPy's top-level imports
    succeed. When the real packages ARE installed (local dev) this is a no-op.
    """
    import importlib.abc
    import importlib.machinery
    import types

    missing = []
    for name in ("scipy", "pandas"):
        try:
            __import__(name)
        except ImportError:
            missing.append(name)
    if not missing:
        return

    class _Stub(types.ModuleType):
        __path__: list[str] = []

        def __getattr__(self, attr: str) -> Any:
            child = _Stub(f"{self.__name__}.{attr}")
            setattr(self, attr, child)
            return child

        def __call__(self, *args: Any, **kwargs: Any) -> Any:
            return _Stub(self.__name__)

    class _StubFinder(importlib.abc.MetaPathFinder, importlib.abc.Loader):
        def find_spec(self, name: str, path: Any = None, target: Any = None) -> Any:
            if name.split(".")[0] in missing:
                return importlib.machinery.ModuleSpec(name, self)
            return None

        def create_module(self, spec: Any) -> Any:
            return _Stub(spec.name)

        def exec_module(self, module: Any) -> None:
            pass

    sys.meta_path.insert(0, _StubFinder())


_install_optional_stubs()


def _redirect_writable_home() -> None:
    """Point ``HOME`` at a writable dir when the real one is read-only.

    ``psychopy.preferences`` creates ``$HOME/.psychopy3`` (and subdirs) at
    import time. Serverless filesystems are read-only except for the temp dir,
    so importing psychopy there crashes with 'Read-only file system'. If HOME is
    not writable, redirect it to a fresh temp dir (mkdtemp avoids psychopy's
    non-``exist_ok`` ``os.makedirs`` failing on a reused warm container).
    """
    home = os.environ.get("HOME") or ""
    if home and os.access(home, os.W_OK):
        return
    try:
        os.environ["HOME"] = tempfile.mkdtemp(prefix="psychopy-home-")
    except OSError:
        pass


_redirect_writable_home()


def _default_core_src() -> Path:
    """Resolve the official PsychoPy source checkout.

    Priority: PSYCHOPY_CORE_SRC env var, then a `psychopy-core-src` checkout
    next to or inside this repository. If none exists, fall back to an
    installed `psychopy` package (CORE_SRC then doesn't need to exist).
    """
    env = os.environ.get("PSYCHOPY_CORE_SRC")
    if env:
        return Path(env)
    # Vendored case (e.g. this file copied to EdgeOne's app.py): the pruned
    # psychopy/ package sits right next to this file.
    here = Path(__file__).resolve().parent
    if (here / "psychopy" / "experiment").is_dir():
        return here
    repo = Path(__file__).resolve().parents[1]
    for candidate in (repo.parent / "psychopy-core-src", repo / "psychopy-core-src"):
        if (candidate / "psychopy" / "experiment").is_dir():
            return candidate
    return repo.parent / "psychopy-core-src"


CORE_SRC = _default_core_src()
PORT = int(os.environ.get("PSYCHOPY_WEB_BACKEND_PORT", "8002"))
HOST = os.environ.get("PSYCHOPY_WEB_BACKEND_HOST", "127.0.0.1")
TEMP_PREFIX = "psychopy-official-web-"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("OfficialPsychoPyWebBackend")

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._ -]+")
_BROWSER_SCHEMES = ("webfs:", "browser:", "indexeddb:", "blob:")
_BROWSER_ROOTS = ("/webfs/", "webfs/")


class OfficialBackendError(RuntimeError):
    """Explicit, JSON-friendly backend error."""

    def __init__(self, code: str, message: str, **details: Any) -> None:
        super().__init__(message)
        self.code = code
        self.details = details

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": str(self)}
        if self.details:
            payload["details"] = json_safe(self.details)
        return payload


def ensure_core_path() -> None:
    """Make the official PsychoPy source importable, or fail explicitly."""
    if CORE_SRC.exists():
        if str(CORE_SRC) not in sys.path:
            sys.path.insert(0, str(CORE_SRC))
        return
    # no source checkout; accept an installed psychopy package instead
    try:
        import psychopy  # noqa: F401
    except ImportError:
        raise OfficialBackendError(
            "psychopy-core-src-missing",
            "Official PsychoPy source directory was not found and no psychopy package is installed",
            coreSrc=str(CORE_SRC),
            envVar="PSYCHOPY_CORE_SRC",
        ) from None


def send_ok(msg_id: Any, response: Any) -> str:
    return json.dumps({"response": json_safe(response), "evt": {"id": msg_id}}, ensure_ascii=False)


def send_error(msg_id: Any, exc: BaseException | str, *, include_traceback: bool = True, **extra: Any) -> str:
    if isinstance(exc, OfficialBackendError):
        error = exc.as_dict()
    else:
        error = {"code": "backend-command-failed", "message": str(exc)}
    if extra:
        error.update(json_safe(extra))
    if include_traceback:
        error["traceback"] = traceback.format_exc(limit=12)
    return json.dumps({"error": error, "evt": {"id": msg_id}}, ensure_ascii=False)


def json_safe(value: Any) -> Any:
    """Convert official PsychoPy profiles/results into JSON-safe values."""
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (list, tuple, set)):
        return [json_safe(v) for v in value]
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def is_browser_virtual_path(value: str | None) -> bool:
    """Return whether a path names browser/WebFS storage, not server storage."""
    if not value:
        return False
    normalized = str(value).strip().replace("\\", "/").lower()
    if normalized.startswith(("http://", "https://")):
        parsed = urlparse(normalized)
        normalized = parsed.path or normalized
    if normalized.startswith(_BROWSER_SCHEMES):
        return True
    if normalized in {"/webfs", "webfs"} or normalized.startswith(_BROWSER_ROOTS):
        return True
    # Browser file inputs commonly expose this placeholder on Windows.
    if normalized.startswith("c:/fakepath/"):
        return True
    return False


def safe_leaf_name(value: str | None, default_name: str) -> str:
    """Extract a harmless filename from a client/browser path.

    The backend never treats `/webfs/...`, browser fake paths, or user supplied
    absolute paths as server paths. Only a sanitized leaf name is preserved for
    official PsychoPy's filename-sensitive code.
    """
    raw = str(value or default_name).strip()
    raw = raw.split("?", 1)[0].split("#", 1)[0].replace("\\", "/").rstrip("/")
    name = PurePosixPath(raw).name or default_name
    name = name.replace("\x00", "")
    name = _SAFE_NAME_RE.sub("_", name).strip(" .")
    if not name or name in {".", ".."}:
        name = default_name
    default_suffix = Path(default_name).suffix
    if default_suffix and "." not in name:
        name = f"{name}{default_suffix}"
    return name[:180]


def temp_path(value: str | None, default_name: str = "experiment.psyexp", *, root: Path | None = None) -> Path:
    """Map a client path to an isolated server temp path.

    Browser/WebFS paths are virtual client storage and must never be used as
    server filesystem paths. This helper deliberately keeps WebFS separate by
    preserving only a sanitized filename inside a fresh temp directory.
    """
    root = root or Path(tempfile.mkdtemp(prefix=TEMP_PREFIX))
    path = root / safe_leaf_name(value, default_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def safe_relative_path(value: str) -> Path:
    """Sanitize a resource path for materializing browser-provided sidecars."""
    raw = str(value).strip().split("?", 1)[0].split("#", 1)[0].replace("\\", "/")
    lowered = raw.lower()
    if lowered.startswith("webfs://"):
        raw = raw[len("webfs://"):]
    elif lowered.startswith("webfs:"):
        raw = raw[len("webfs:"):]
    if raw.lower().startswith("/webfs/"):
        raw = raw[len("/webfs/"):]
    elif raw.lower() == "/webfs":
        raw = ""

    parts: list[str] = []
    for part in PurePosixPath(raw).parts:
        if part in {"", ".", "..", "/"} or part.endswith(":"):
            continue
        cleaned = _SAFE_NAME_RE.sub("_", part.replace("\x00", "")).strip(" .")
        if cleaned:
            parts.append(cleaned[:120])
    if not parts:
        raise OfficialBackendError("invalid-resource-path", "Resource path did not contain a usable filename", path=value)
    return Path(*parts)


def materialize_resources(root: Path, resources: Any) -> list[str]:
    """Write browser-provided resource contents into the isolated temp tree.

    Resources are optional and intentionally copy-by-value. The backend does not
    dereference WebFS paths; callers must send content if official PsychoPy needs
    sidecar files such as conditions spreadsheets or media.
    """
    if not resources:
        return []
    if isinstance(resources, dict):
        items = [{"path": key, "content": value} for key, value in resources.items()]
    elif isinstance(resources, list):
        items = resources
    else:
        raise OfficialBackendError(
            "invalid-resources-payload",
            "resources must be a mapping or list of resource descriptors",
            receivedType=type(resources).__name__,
        )

    written: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            raise OfficialBackendError("invalid-resource", "Each resource must be an object", resource=json_safe(item))
        rel = safe_relative_path(str(item.get("path") or item.get("name") or ""))
        dest = root / rel
        if not dest.resolve().is_relative_to(root.resolve()):
            raise OfficialBackendError("unsafe-resource-path", "Resource path escaped the isolated temp root", path=str(rel))

        if "base64" in item:
            try:
                payload = base64.b64decode(str(item["base64"]), validate=True)
            except (binascii.Error, ValueError) as exc:
                raise OfficialBackendError("invalid-resource-base64", "Resource base64 content is invalid", path=str(rel)) from exc
        elif "bytes" in item:
            try:
                payload = bytes(item["bytes"])
            except (TypeError, ValueError) as exc:
                raise OfficialBackendError("invalid-resource-bytes", "Resource bytes content is invalid", path=str(rel)) from exc
        else:
            payload = str(item.get("content", item.get("text", ""))).encode("utf-8")

        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(payload)
        written.append(str(rel))
    return written


def error_result(mode: str, exc: BaseException, **extra: Any) -> dict[str, Any]:
    if isinstance(exc, OfficialBackendError):
        error = exc.as_dict()
    else:
        error = {"code": f"{mode}-failed", "message": f"{type(exc).__name__}: {exc}"}
    result: dict[str, Any] = {
        "ok": False,
        "mode": mode,
        "blocker": error["message"],
        "error": error,
        **json_safe(extra),
    }
    if not isinstance(exc, OfficialBackendError):
        result["traceback"] = traceback.format_exc(limit=12)
    return result


def official_component_profiles() -> dict[str, Any]:
    """Delegate element profiles to official psychopy.experiment."""
    ensure_core_path()
    try:
        from psychopy.experiment import getElementProfiles
        return json_safe(getElementProfiles())
    except Exception as exc:
        raise OfficialBackendError(
            "official-element-profiles-failed",
            f"Official PsychoPy could not build element profiles: {type(exc).__name__}: {exc}",
            coreSrc=str(CORE_SRC),
        ) from exc


def official_loop_profiles() -> dict[str, Any]:
    """Delegate loop profiles to official psychopy.experiment."""
    ensure_core_path()
    try:
        from psychopy.experiment import getLoopProfiles
        return json_safe(getLoopProfiles())
    except Exception as exc:
        raise OfficialBackendError(
            "official-loop-profiles-failed",
            f"Official PsychoPy could not build loop profiles: {type(exc).__name__}: {exc}",
            coreSrc=str(CORE_SRC),
        ) from exc


def official_device_profiles() -> dict[str, Any]:
    """Delegate device profiles to official psychopy.experiment."""
    ensure_core_path()
    try:
        from psychopy.experiment import getDeviceProfiles
        return json_safe(getDeviceProfiles())
    except Exception as exc:
        raise OfficialBackendError(
            "official-device-profiles-failed",
            f"Official PsychoPy could not build device profiles: {type(exc).__name__}: {exc}",
            coreSrc=str(CORE_SRC),
        ) from exc


def _prepare_psyexp(
    psyexp_content: str | None,
    psyexp_path: str | None,
    *,
    resources: Any = None,
) -> tuple[Path, Path, list[str]]:
    if psyexp_content is None:
        if is_browser_virtual_path(psyexp_path):
            raise OfficialBackendError(
                "virtual-psyexp-content-required",
                "psyexpContent is required because psyexpPath names browser/WebFS storage, not a server file",
                psyexpPath=psyexp_path,
            )
        raise OfficialBackendError(
            "psyexp-content-required",
            "psyexpContent is required; the web backend does not read arbitrary client paths",
            psyexpPath=psyexp_path,
        )
    if not isinstance(psyexp_content, str):
        raise OfficialBackendError(
            "invalid-psyexp-content",
            "psyexpContent must be a string containing .psyexp XML",
            receivedType=type(psyexp_content).__name__,
        )

    root = Path(tempfile.mkdtemp(prefix=TEMP_PREFIX))
    resource_paths = materialize_resources(root, resources)
    infile = temp_path(psyexp_path, default_name="experiment.psyexp", root=root)
    if infile.suffix.lower() != ".psyexp":
        infile = infile.with_suffix(".psyexp")
    infile.write_text(psyexp_content, encoding="utf-8")
    return root, infile, resource_paths


def _roundtrip_impl(
    psyexp_content: str | None,
    psyexp_path: str | None,
    *,
    resources: Any = None,
) -> dict[str, Any]:
    ensure_core_path()
    from psychopy import experiment

    root, infile, resource_paths = _prepare_psyexp(psyexp_content, psyexp_path, resources=resources)
    outfile = infile.with_name(f"{infile.stem}.official.psyexp")

    exp = experiment.Experiment()
    exp.loadFromXML(str(infile))
    exp.saveToXML(str(outfile), makeLegacy=False)
    if not outfile.exists():
        raise OfficialBackendError("official-roundtrip-missing-output", "Official saveToXML did not create an output .psyexp", outfile=str(outfile))

    return {
        "ok": True,
        "mode": "official-roundtrip",
        "psyexp": outfile.read_text(encoding="utf-8-sig"),
        "input": str(infile),
        "outfile": str(outfile),
        "paths": {
            "clientPsyexpPath": psyexp_path,
            "clientPsyexpPathIsVirtual": is_browser_virtual_path(psyexp_path),
            "serverInput": str(infile),
            "serverOutput": str(outfile),
            "tempRoot": str(root),
        },
        "resourceFiles": resource_paths,
    }


def official_roundtrip_psyexp(
    psyexp_content: str | None = None,
    psyexp_path: str | None = None,
    *,
    resources: Any = None,
) -> dict[str, Any]:
    """Load and save .psyexp XML through official PsychoPy."""
    try:
        return _roundtrip_impl(psyexp_content, psyexp_path, resources=resources)
    except Exception as exc:
        return error_result(
            "official-roundtrip",
            exc,
            paths={
                "clientPsyexpPath": psyexp_path,
                "clientPsyexpPathIsVirtual": is_browser_virtual_path(psyexp_path),
            },
        )


def _compile_official(
    *,
    target: str,
    psyexp_content: str | None,
    psyexp_path: str | None,
    outfile: str | None,
    resources: Any = None,
) -> dict[str, Any]:
    ensure_core_path()
    from psychopy.scripts.psyexpCompile import compileScript

    roundtrip = _roundtrip_impl(psyexp_content, psyexp_path, resources=resources)
    infile = Path(roundtrip["outfile"])
    suffix = ".js" if target == "PsychoJS" else ".py"
    requested_stem = Path(safe_leaf_name(psyexp_path, "experiment.psyexp")).stem or "experiment"
    js_out = temp_path(outfile, default_name=f"{requested_stem}{suffix}", root=Path(roundtrip["paths"]["tempRoot"]))
    if js_out.suffix.lower() != suffix:
        js_out = js_out.with_suffix(suffix)

    required_resources: list[dict[str, Any]] = []
    stdout = io.StringIO()
    stderr = io.StringIO()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        if target == "PsychoJS":
            # Official Settings.writeInitCodeJS writes index.html whenever the
            # experiment has an expPath (set from outfile by writeScript).
            # Keep "HTML path" empty, as in official desktop local runs: with
            # an HTML folder set, official Flow.writeFlowSchedulerJS omits the
            # `resources:` list from psychoJS.start(), and the experiment then
            # cannot resolve stimuli/conditions when served statically.
            from psychopy import experiment

            exp = experiment.Experiment()
            exp.loadFromXML(str(infile))
            if "HTML path" in exp.settings.params:
                exp.settings.params["HTML path"].val = ""
            compileScript(exp, version=None, outfile=str(js_out))
            # official manifest of the files this experiment needs at runtime
            # (same source prepareResourcesJS uses when copying to an HTML dir)
            try:
                for res in exp.getResourceFiles():
                    if not isinstance(res, dict):
                        continue
                    if "https://" in str(res.get("abs", "")) or res.get("name") == "surveyId":
                        continue
                    required_resources.append({
                        "name": res.get("name"),
                        "rel": str(res.get("rel", "")).replace("\\", "/"),
                        "exists": bool(res.get("abs")) and Path(str(res.get("abs"))).is_file(),
                    })
            except Exception:
                logger.warning("Official getResourceFiles failed", exc_info=True)
        else:
            compileScript(str(infile), version=None, outfile=str(js_out))

    if not js_out.exists():
        raise OfficialBackendError(
            "official-compile-missing-output",
            "Official compileScript did not create the requested output file",
            target=target,
            outfile=str(js_out),
        )
    script = js_out.read_text(encoding="utf-8-sig")
    if not script.strip():
        raise OfficialBackendError(
            "official-compile-empty-output",
            "Official compileScript created an empty output file",
            target=target,
            outfile=str(js_out),
        )

    legacy = js_out.with_name(f"{js_out.stem}-legacy-browsers.js")
    html = js_out.parent / "index.html"
    if target == "PsychoJS" and not html.exists():
        raise OfficialBackendError(
            "official-html-missing",
            "Official PsychoJS compile did not create index.html",
            outfile=str(js_out),
            expectedHtml=str(html),
        )

    return {
        "ok": True,
        "mode": "official-compileScript",
        "target": target,
        "psyexpPath": str(infile),
        "outfile": str(js_out),
        "script": script,
        "legacyScript": legacy.read_text(encoding="utf-8-sig") if target == "PsychoJS" and legacy.exists() else None,
        "html": html.read_text(encoding="utf-8-sig") if target == "PsychoJS" and html.exists() else None,
        "psyexp": roundtrip.get("psyexp"),
        "paths": {
            **roundtrip["paths"],
            "clientOutfile": outfile,
            "clientOutfileIsVirtual": is_browser_virtual_path(outfile),
            "serverOutfile": str(js_out),
            "serverHtml": str(html) if target == "PsychoJS" else None,
            "serverLegacyOutfile": str(legacy) if target == "PsychoJS" else None,
        },
        "resourceFiles": roundtrip.get("resourceFiles", []),
        "requiredResources": json_safe(required_resources),
        "stdout": stdout.getvalue(),
        "stderr": stderr.getvalue(),
    }


def compile_psychojs(
    psyexp_content: str | None = None,
    psyexp_path: str | None = None,
    outfile: str | None = None,
    *,
    resources: Any = None,
) -> dict[str, Any]:
    """Compile .psyexp XML to PsychoJS JS and official index.html."""
    try:
        return _compile_official(
            target="PsychoJS",
            psyexp_content=psyexp_content,
            psyexp_path=psyexp_path,
            outfile=outfile,
            resources=resources,
        )
    except Exception as exc:
        return error_result(
            "official-compileScript",
            exc,
            target="PsychoJS",
            paths={
                "clientPsyexpPath": psyexp_path,
                "clientPsyexpPathIsVirtual": is_browser_virtual_path(psyexp_path),
                "clientOutfile": outfile,
                "clientOutfileIsVirtual": is_browser_virtual_path(outfile),
            },
        )


def compile_psychopy(
    psyexp_content: str | None = None,
    psyexp_path: str | None = None,
    outfile: str | None = None,
    *,
    resources: Any = None,
) -> dict[str, Any]:
    """Compile .psyexp XML to official PsychoPy Python code."""
    try:
        return _compile_official(
            target="PsychoPy",
            psyexp_content=psyexp_content,
            psyexp_path=psyexp_path,
            outfile=outfile,
            resources=resources,
        )
    except Exception as exc:
        return error_result(
            "official-compileScript",
            exc,
            target="PsychoPy",
            paths={
                "clientPsyexpPath": psyexp_path,
                "clientPsyexpPathIsVirtual": is_browser_virtual_path(psyexp_path),
                "clientOutfile": outfile,
                "clientOutfileIsVirtual": is_browser_virtual_path(outfile),
            },
        )


def _arg(args: list[Any], index: int, default: Any = None) -> Any:
    return args[index] if len(args) > index else default


def handle_command(command: str, args: list[Any], kwargs: dict[str, Any]) -> Any:
    if command == "ping":
        return "pong"
    if command in {"getElementProfiles", "psychopy.experiment:getElementProfiles"}:
        return official_component_profiles()
    if command in {"getLoopProfiles", "psychopy.experiment:getLoopProfiles"}:
        return official_loop_profiles()
    if command in {"getDeviceProfiles", "psychopy.experiment:getDeviceProfiles"}:
        return official_device_profiles()
    if command in {"roundtripPsyexp", "normalisePsyexp", "normalizePsyexp"}:
        return official_roundtrip_psyexp(
            psyexp_content=kwargs.get("psyexpContent"),
            psyexp_path=kwargs.get("psyexpPath") or _arg(args, 0),
            resources=kwargs.get("resources"),
        )
    if command in {"compilePsychoJS", "compileOnline"}:
        return compile_psychojs(
            psyexp_content=kwargs.get("psyexpContent"),
            psyexp_path=kwargs.get("psyexpPath") or _arg(args, 0),
            outfile=kwargs.get("outfile") or _arg(args, 1),
            resources=kwargs.get("resources"),
        )
    if command in {"compilePsychoPy", "compilePython"}:
        return compile_psychopy(
            psyexp_content=kwargs.get("psyexpContent"),
            psyexp_path=kwargs.get("psyexpPath") or _arg(args, 0),
            outfile=kwargs.get("outfile") or _arg(args, 1),
            resources=kwargs.get("resources"),
        )
    raise OfficialBackendError(
        "unsupported-command",
        f"Unsupported official web backend command: {command}",
        command=command,
        supported=[
            "ping",
            "psychopy.experiment:getElementProfiles",
            "psychopy.experiment:getLoopProfiles",
            "psychopy.experiment:getDeviceProfiles",
            "roundtripPsyexp",
            "compilePsychoJS",
            "compilePsychoPy",
        ],
    )


def handle_command_sync(command: str, args: list[Any], kwargs: dict[str, Any]) -> Any:
    """Backward-compatible sync entry point for validation scripts/importers."""
    return handle_command(command, args, kwargs)


def parse_command_message(message: str) -> tuple[Any, str, list[Any], dict[str, Any]]:
    try:
        data = json.loads(message)
    except json.JSONDecodeError as exc:
        raise OfficialBackendError("invalid-json", f"Message was not valid JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise OfficialBackendError("invalid-message", "Message must be a JSON object", receivedType=type(data).__name__)
    msg_id = data.get("id")
    cmd_data = data.get("command", {})
    if not isinstance(cmd_data, dict):
        raise OfficialBackendError("invalid-command-payload", "command must be an object", receivedType=type(cmd_data).__name__)

    command = cmd_data.get("command")
    args = cmd_data.get("args", [])
    kwargs = cmd_data.get("kwargs", {})
    if not isinstance(args, list):
        raise OfficialBackendError("invalid-command-args", "command.args must be a list", receivedType=type(args).__name__)
    if not isinstance(kwargs, dict):
        raise OfficialBackendError("invalid-command-kwargs", "command.kwargs must be an object", receivedType=type(kwargs).__name__)

    if command == "run" and args:
        command = str(args[0])
        args = args[1:]
    if not command:
        raise OfficialBackendError("missing-command", "Missing command")
    return msg_id, str(command), args, kwargs


# Browser POST bodies carry base64 resources, so allow a generous ceiling while
# still rejecting absurd payloads. Mirrors the old WebSocket max_size headroom.
MAX_BODY_BYTES = 64 * 1024 * 1024


def run_command_envelope(message: str) -> tuple[int, str]:
    """Run one JSON command envelope and return (http_status, json_body).

    Command logic is identical to the old WebSocket path; only the transport
    changed. Each request is independent, so no per-connection state is kept.
    """
    msg_id = None
    try:
        msg_id, command, args, kwargs = parse_command_message(message)
    except OfficialBackendError as exc:
        return 400, send_error(None, exc, include_traceback=False)
    except Exception as exc:
        logger.error("Failed to parse command message: %s", exc, exc_info=True)
        return 400, send_error(None, exc)
    try:
        response = handle_command(command, args, kwargs)
        return 200, send_ok(msg_id, response)
    except Exception as exc:
        logger.error("Command failed: %s", exc, exc_info=True)
        return 500, send_error(msg_id, exc)


class handler(BaseHTTPRequestHandler):  # noqa: N801 - EdgeOne handler-mode requires this exact lowercase name; this file is copied verbatim to the function's app.py
    """Stateless HTTP shell: POST runs a command, GET is a health probe.

    Named ``handler`` (not CapWords) on purpose: EdgeOne Pages' Python
    handler mode discovers the function by a top-level ``class handler`` that
    subclasses BaseHTTPRequestHandler. The local dev server below uses it too.
    """

    server_version = "OfficialPsychoPyWebBackend/1.0"
    protocol_version = "HTTP/1.1"

    def _set_cors_headers(self) -> None:
        # The old server accepted any WebSocket origin (origins=None); keep the
        # browser able to call the backend cross-origin (Vite :5173 → :8002).
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _write_json(self, status: int, body: str) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:  # noqa: N802 - http.server dispatch naming
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802 - http.server dispatch naming
        self._write_json(200, json.dumps(
            {"response": "pong", "service": "official-psychopy-web-backend"},
            ensure_ascii=False,
        ))

    def do_POST(self) -> None:  # noqa: N802 - http.server dispatch naming
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except (TypeError, ValueError):
            length = 0
        if length <= 0:
            self._write_json(400, send_error(
                None, OfficialBackendError("empty-request", "POST body was empty"),
                include_traceback=False,
            ))
            return
        if length > MAX_BODY_BYTES:
            self._write_json(413, send_error(
                None,
                OfficialBackendError("request-too-large", f"POST body exceeded {MAX_BODY_BYTES} bytes"),
                include_traceback=False,
            ))
            return
        raw = self.rfile.read(length)
        try:
            message = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            self._write_json(400, send_error(
                None, OfficialBackendError("invalid-encoding", f"POST body was not valid UTF-8: {exc}"),
                include_traceback=False,
            ))
            return
        status, body = run_command_envelope(message)
        self._write_json(status, body)

    def log_message(self, fmt: str, *args: Any) -> None:  # route through our logger
        logger.info("%s - %s", self.address_string(), fmt % args)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), handler)
    server.daemon_threads = True
    logger.info("Official PsychoPy web backend listening on http://%s:%s", HOST, PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down official PsychoPy web backend")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
