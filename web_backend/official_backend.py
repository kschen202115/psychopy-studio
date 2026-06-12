#!/usr/bin/env python3
"""Official PsychoPy backend glue for PsychoPy Studio Web.

This module intentionally delegates Builder semantics to PsychoPy's official
Python code. It should stay thin: request parsing, path isolation, JSON-safe
serialization, and calls into official `psychopy.experiment` APIs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import tempfile
import traceback
from pathlib import Path
from typing import Any

import websockets

CORE_SRC = Path(os.environ.get("PSYCHOPY_CORE_SRC", "/root/.openclaw/workspace/psychopy-core-src"))
PORT = int(os.environ.get("PSYCHOPY_WEB_BACKEND_PORT", "8002"))
HOST = os.environ.get("PSYCHOPY_WEB_BACKEND_HOST", "0.0.0.0")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("OfficialPsychoPyWebBackend")


def ensure_core_path() -> None:
    if CORE_SRC.exists() and str(CORE_SRC) not in sys.path:
        sys.path.insert(0, str(CORE_SRC))


def send_ok(msg_id: Any, response: Any) -> str:
    return json.dumps({"response": response, "evt": {"id": msg_id}})


def send_error(msg_id: Any, message: str, **extra: Any) -> str:
    return json.dumps({"error": {"message": message, **extra}, "evt": {"id": msg_id}})


def temp_path(value: str | None, default_name: str = "experiment.psyexp") -> Path:
    """Map browser/client paths to isolated server temp paths.

    Browser paths like `/webfs/foo.psyexp` are virtual and must never be used as
    absolute server paths.
    """
    root = Path(tempfile.mkdtemp(prefix="psychopy-official-web-"))
    name = Path(value or default_name).name or default_name
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def json_safe(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (list, tuple, set)):
        return [json_safe(v) for v in value]
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def param_profile(param: Any) -> dict[str, Any]:
    return {
        "val": json_safe(getattr(param, "val", None)),
        "valType": json_safe(getattr(param, "valType", None)),
        "inputType": json_safe(getattr(param, "inputType", None)),
        "categ": json_safe(getattr(param, "categ", None)),
        "updates": json_safe(getattr(param, "updates", None)),
        "allowedUpdates": json_safe(getattr(param, "allowedUpdates", None)),
        "allowedVals": json_safe(getattr(param, "allowedVals", [])),
        "allowedLabels": json_safe(getattr(param, "allowedLabels", [])),
        "ctrlParams": json_safe(getattr(param, "ctrlParams", {})),
        "label": json_safe(getattr(param, "label", "")),
        "hint": json_safe(getattr(param, "hint", "")),
        "plugin": json_safe(getattr(param, "plugin", None)),
        "depends": json_safe(getattr(param, "depends", {"shown": [], "enabled": []})),
    }


def official_component_profiles() -> dict[str, Any]:
    ensure_core_path()
    from psychopy import experiment
    from psychopy.experiment import components

    exp = experiment.Experiment()
    profiles: dict[str, Any] = {}
    for name, cls in components.getAllComponents(fetchIcons=False).items():
        # SettingsComponent is already represented by Experiment.settings and
        # does not share the normal Component constructor signature.
        if name == "SettingsComponent":
            continue
        try:
            instance = cls(exp=exp, parentName="trial", name=name.replace("Component", "").lower())
            profiles[name] = {
                "__class__": f"{cls.__module__}:{cls.__name__}",
                "__name__": name,
                "categories": json_safe(getattr(cls, "categories", getattr(instance, "categories", []))),
                "targets": json_safe(getattr(cls, "targets", getattr(instance, "targets", []))),
                "plugin": json_safe(getattr(cls, "plugin", getattr(instance, "plugin", None))),
                "iconFile": json_safe(getattr(cls, "iconFile", getattr(instance, "iconFile", None))),
                "tooltip": json_safe(getattr(cls, "tooltip", getattr(instance, "tooltip", ""))),
                "version": json_safe(getattr(cls, "version", getattr(instance, "version", "0.0.0"))),
                "beta": json_safe(getattr(cls, "beta", getattr(instance, "beta", False))),
                "validatorClasses": json_safe(getattr(cls, "validatorClasses", getattr(instance, "validatorClasses", []))),
                "hidden": json_safe(getattr(cls, "hidden", getattr(instance, "hidden", False))),
                "params": {key: param_profile(param) for key, param in instance.params.items()},
            }
        except Exception:
            logger.warning("Could not build official component profile for %s", name, exc_info=True)
    return profiles


def official_loop_profiles() -> dict[str, Any]:
    ensure_core_path()
    from psychopy import experiment
    from psychopy.experiment import loops

    exp = experiment.Experiment()
    profiles: dict[str, Any] = {}
    for cls in [loops.TrialHandler, loops.StairHandler, loops.MultiStairHandler]:
        instance = cls(exp=exp, name="trials")
        name = cls.__name__
        profiles[name] = {
            "__class__": f"{cls.__module__}:{cls.__name__}",
            "__name__": name,
            "targets": ["PsychoPy", "PsychoJS"],
            "params": {key: param_profile(param) for key, param in instance.params.items()},
        }
    return profiles


def official_roundtrip_psyexp(psyexp_content: str | None = None, psyexp_path: str | None = None) -> dict[str, Any]:
    ensure_core_path()
    from psychopy import experiment

    if psyexp_content is None:
        return {"ok": False, "mode": "official-roundtrip", "blocker": "psyexpContent is required"}
    infile = temp_path(psyexp_path)
    outfile = infile.with_name(infile.stem + ".official.psyexp")
    infile.write_text(psyexp_content, encoding="utf-8")

    exp = experiment.Experiment()
    exp.loadFromXML(str(infile))
    exp.saveToXML(str(outfile), makeLegacy=False)
    return {
        "ok": True,
        "mode": "official-roundtrip",
        "psyexp": outfile.read_text(encoding="utf-8-sig"),
        "input": str(infile),
        "outfile": str(outfile),
    }


def compile_psychojs(psyexp_content: str | None = None, psyexp_path: str | None = None, outfile: str | None = None) -> dict[str, Any]:
    ensure_core_path()
    from psychopy.scripts.psyexpCompile import compileScript

    roundtrip = official_roundtrip_psyexp(psyexp_content=psyexp_content, psyexp_path=psyexp_path)
    if not roundtrip.get("ok"):
        return roundtrip

    infile = Path(roundtrip["outfile"])
    js_out = temp_path(outfile, default_name=infile.with_suffix(".js").name)
    compileScript(str(infile), version=None, outfile=str(js_out))

    legacy = js_out.with_name(js_out.stem + "-legacy-browsers.js")
    html = js_out.parent / "index.html"
    return {
        "ok": True,
        "mode": "official-compileScript",
        "psyexpPath": str(infile),
        "outfile": str(js_out),
        "script": js_out.read_text(encoding="utf-8-sig") if js_out.exists() else "",
        "legacyScript": legacy.read_text(encoding="utf-8-sig") if legacy.exists() else None,
        "html": html.read_text(encoding="utf-8-sig") if html.exists() else None,
        "psyexp": roundtrip.get("psyexp"),
    }


async def handle_command(command: str, args: list[Any], kwargs: dict[str, Any]) -> Any:
    if command == "ping":
        return "pong"
    if command in {"getElementProfiles", "psychopy.experiment:getElementProfiles"}:
        return official_component_profiles()
    if command in {"getLoopProfiles", "psychopy.experiment:getLoopProfiles"}:
        return official_loop_profiles()
    if command in {"roundtripPsyexp", "normalisePsyexp", "normalizePsyexp"}:
        return official_roundtrip_psyexp(
            psyexp_content=kwargs.get("psyexpContent"),
            psyexp_path=kwargs.get("psyexpPath") or (args[0] if args else None),
        )
    if command in {"compilePsychoJS", "compileOnline"}:
        return compile_psychojs(
            psyexp_content=kwargs.get("psyexpContent"),
            psyexp_path=kwargs.get("psyexpPath") or (args[0] if args else None),
            outfile=kwargs.get("outfile") or (args[1] if len(args) > 1 else None),
        )
    raise ValueError(f"Unsupported official web backend command: {command}")


async def handler(websocket):
    logger.info("Accepted connection from %s", websocket.remote_address)
    async for message in websocket:
        msg_id = None
        try:
            data = json.loads(message)
            msg_id = data.get("id")
            cmd_data = data.get("command", {})
            command = cmd_data.get("command") if isinstance(cmd_data, dict) else None
            args = cmd_data.get("args", []) if isinstance(cmd_data, dict) else []
            kwargs = cmd_data.get("kwargs", {}) if isinstance(cmd_data, dict) else {}

            if command == "run" and args:
                command = str(args[0])
                args = args[1:]
            if not command:
                raise ValueError("Missing command")
            response = await asyncio.to_thread(handle_command_sync, command, args, kwargs)
            await websocket.send(send_ok(msg_id, response))
        except Exception as exc:
            logger.error("Command failed: %s", exc, exc_info=True)
            await websocket.send(send_error(msg_id, str(exc), traceback=traceback.format_exc(limit=12)))


def handle_command_sync(command: str, args: list[Any], kwargs: dict[str, Any]) -> Any:
    return asyncio.run(handle_command(command, args, kwargs))


async def main() -> None:
    async with websockets.serve(handler, HOST, PORT, origins=None, max_size=32 * 1024 * 1024):
        logger.info("Official PsychoPy web backend listening on %s:%s", HOST, PORT)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
