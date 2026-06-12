#!/usr/bin/env python3
"""Smoke-test the official PsychoPy web backend glue.

This is intentionally backend-only: it validates path isolation, official profile
delegation, .psyexp roundtrip, PsychoJS compile with official index.html, and
PsychoPy Python code generation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from web_backend import official_backend as backend  # noqa: E402


MINIMAL_PSYEXP = '''<?xml version="1.0" ?>
<PsychoPy2experiment encoding="utf-8" version="2026.1.0">
  <Settings>
    <Param name="expName" val="smoke" valType="str"/>
    <Param name="Use version" val="" valType="str"/>
  </Settings>
  <Routines>
    <Routine name="trial"/>
  </Routines>
  <Flow>
    <Routine name="trial"/>
  </Flow>
</PsychoPy2experiment>
'''


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def result_summary(name: str, result: dict) -> None:
    printable = {
        "ok": result.get("ok"),
        "mode": result.get("mode"),
        "target": result.get("target"),
        "blocker": result.get("blocker"),
        "scriptBytes": len(result.get("script") or ""),
        "htmlBytes": len(result.get("html") or ""),
        "psyexpBytes": len(result.get("psyexp") or ""),
        "paths": result.get("paths"),
    }
    print(f"{name}: {json.dumps(printable, default=str, ensure_ascii=False)}")


def main() -> int:
    virtual_in = "/webfs/projects/../smoke/smoke.psyexp"
    virtual_out_js = "http://localhost:5173/webfs/exports/../../smoke.js"
    virtual_out_py = "C:/fakepath/smoke.py"

    check(backend.is_browser_virtual_path(virtual_in), "WebFS paths must be detected as browser-virtual")
    mapped = backend.temp_path(virtual_in)
    check(str(mapped).startswith("/tmp/psychopy-official-web-"), f"Virtual path mapped outside temp root: {mapped}")
    check("webfs" not in mapped.parts, f"Virtual WebFS segment leaked into server path: {mapped}")
    check(mapped.name == "smoke.psyexp", f"Unexpected sanitized filename: {mapped.name}")

    elements = backend.official_component_profiles()
    print(f"element profiles: {len(elements)}")
    check("TextComponent" in elements, "Official element profiles did not include TextComponent")
    check("params" in elements["TextComponent"], "TextComponent profile missing params")

    loops = backend.official_loop_profiles()
    print(f"loop profiles: {len(loops)}")
    check("TrialHandler" in loops, "Official loop profiles did not include TrialHandler")

    try:
        devices = backend.official_device_profiles()
        print(f"device profiles: {len(devices)}")
    except backend.OfficialBackendError as exc:
        # Some CI/container images do not have optional hardware/UI deps such as pyglet.
        # The backend still passes if the failure is explicit and coded.
        print(f"device profiles unavailable (explicit): {exc.code}: {exc}")
        check(exc.code == "official-device-profiles-failed", "Device profile failure was not explicit")

    missing = backend.official_roundtrip_psyexp(None, virtual_in)
    result_summary("missing-content roundtrip", missing)
    check(not missing.get("ok"), "Missing browser/WebFS content should fail explicitly")
    check(missing.get("error", {}).get("code") == "virtual-psyexp-content-required", "Missing-content error code mismatch")

    roundtrip = backend.official_roundtrip_psyexp(MINIMAL_PSYEXP, virtual_in)
    result_summary("roundtrip", roundtrip)
    check(roundtrip.get("ok"), f"Roundtrip failed: {roundtrip.get('blocker')}")
    check("PsychoPy2experiment" in roundtrip.get("psyexp", ""), "Roundtrip output is not .psyexp XML")
    check(roundtrip["paths"]["clientPsyexpPathIsVirtual"], "Roundtrip did not mark WebFS input virtual")
    check("/webfs" not in roundtrip["paths"]["serverInput"], "Roundtrip used WebFS as a server path")

    js = backend.compile_psychojs(MINIMAL_PSYEXP, virtual_in, virtual_out_js)
    result_summary("compile PsychoJS", js)
    check(js.get("ok"), f"PsychoJS compile failed: {js.get('blocker')}")
    check("psychoJS" in js.get("script", "") or "PsychoJS" in js.get("script", ""), "Official JS script missing PsychoJS code")
    check("<html" in (js.get("html") or "").lower(), "Official PsychoJS compile did not return index.html")
    check(js["paths"]["clientOutfileIsVirtual"], "PsychoJS outfile did not mark WebFS output virtual")
    check("/webfs" not in js["paths"]["serverOutfile"], "PsychoJS compile used WebFS as a server path")

    py = backend.compile_psychopy(MINIMAL_PSYEXP, virtual_in, virtual_out_py)
    result_summary("compile PsychoPy", py)
    check(py.get("ok"), f"PsychoPy compile failed: {py.get('blocker')}")
    check("psychopy" in py.get("script", "").lower(), "Official Python script missing PsychoPy code")
    check(py["paths"]["clientOutfileIsVirtual"], "PsychoPy outfile did not mark browser fake path virtual")
    check("/webfs" not in py["paths"]["serverOutfile"], "PsychoPy compile used WebFS as a server path")

    command = backend.handle_command("compilePsychoPy", [], {
        "psyexpContent": MINIMAL_PSYEXP,
        "psyexpPath": virtual_in,
        "outfile": virtual_out_py,
    })
    check(command.get("ok") and command.get("target") == "PsychoPy", "compilePsychoPy command did not return official Python code")

    print("official backend smoke: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
