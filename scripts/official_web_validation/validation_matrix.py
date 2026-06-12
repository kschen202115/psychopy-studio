#!/usr/bin/env python3
"""Validation matrix for PsychoPy Studio's official-first web rebuild.

The checks are intentionally script-only and do not modify app logic. They
exercise the thin official backend against local official PsychoPy sources,
verify Svelte/static build output, scan for browser bundle residuals, and leave
an optional browser smoke command for humans/CI environments with a browser.
"""

from __future__ import annotations

import argparse
import html.parser
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CORE_SRC = Path(os.environ.get("PSYCHOPY_CORE_SRC", "/root/.openclaw/workspace/psychopy-core-src"))
OFFICIAL_BACKEND = REPO_ROOT / "web_backend" / "official_backend.py"
DIST_DIR = REPO_ROOT / "dist"


@dataclass
class CheckResult:
    name: str
    ok: bool
    details: str = ""
    data: dict[str, Any] = field(default_factory=dict)


class MatrixFailure(RuntimeError):
    pass


class DistHTMLParser(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.scripts: list[str] = []
        self.stylesheets: list[str] = []
        self.modulepreloads: list[str] = []
        self.icons: list[str] = []
        self.bases: list[dict[str, str | None]] = []
        self.meta_viewport = False
        self.service_worker_registration = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "script":
            src = attr.get("src")
            if src:
                self.scripts.append(src)
        elif tag == "link":
            rel = (attr.get("rel") or "").lower()
            href = attr.get("href")
            if rel == "stylesheet" and href:
                self.stylesheets.append(href)
            elif rel == "modulepreload" and href:
                self.modulepreloads.append(href)
            elif rel == "icon" and href:
                self.icons.append(href)
        elif tag == "base":
            self.bases.append(attr)
        elif tag == "meta" and (attr.get("name") or "").lower() == "viewport":
            self.meta_viewport = True

    def handle_data(self, data: str) -> None:
        if "navigator.serviceWorker.register" in data:
            self.service_worker_registration = True


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise MatrixFailure(message)


def import_official_backend(core_src: Path):
    require(OFFICIAL_BACKEND.exists(), f"missing backend module: {rel(OFFICIAL_BACKEND)}")
    os.environ["PSYCHOPY_CORE_SRC"] = str(core_src)
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    if str(core_src) not in sys.path:
        sys.path.insert(0, str(core_src))
    import web_backend.official_backend as backend

    backend.CORE_SRC = core_src
    backend.ensure_core_path()
    return backend


def run_command(command: list[str], timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )


def make_official_fixture(core_src: Path) -> str:
    """Build a tiny official .psyexp using official PsychoPy APIs.

    This avoids relying on hand-written XML while keeping the fixture small and
    deterministic. The Experiment-info value is static so PsychoJS output is
    parseable by the official compiler.
    """

    if str(core_src) not in sys.path:
        sys.path.insert(0, str(core_src))
    from psychopy import experiment
    from psychopy.experiment.components.text import TextComponent
    from psychopy.experiment.loops import TrialHandler
    from psychopy.experiment.routines import Routine

    exp = experiment.Experiment()
    exp.settings.params["Experiment info"].val = "{'participant':'001','session':'001'}"
    exp.settings.params["Show info dlg"].val = "False"
    routine = Routine(name="trial", exp=exp)
    text = TextComponent(exp=exp, parentName="trial", name="text")
    text.params["text"].val = "Hello official web"
    text.params["startVal"].val = "0"
    text.params["stopVal"].val = "0.25"
    routine.addComponent(text)
    exp.routines["trial"] = routine
    loop = TrialHandler(exp=exp, name="trials")
    loop.params["nReps"].val = "1"
    exp.flow.addRoutine(routine, 0)
    exp.flow.addLoop(loop, 0, 1)

    with tempfile.TemporaryDirectory(prefix="psychopy-web-fixture-") as tmp:
        psyexp_path = Path(tmp) / "official_fixture.psyexp"
        exp.saveToXML(str(psyexp_path), makeLegacy=False)
        return psyexp_path.read_text(encoding="utf-8-sig")


def strip_quoted_strings(source: str) -> str:
    """Remove quoted/template strings before token scans."""

    # Good enough for residual identifier scans; keeps line structure stable.
    string_re = re.compile(
        r"""
        (?:'(?:\\.|[^'\\])*')
        |(?:"(?:\\.|[^"\\])*")
        |(?:`(?:\\.|[^`\\])*`)
        """,
        re.VERBOSE | re.DOTALL,
    )
    return string_re.sub("''", source)


def assert_no_residual_js_tokens(source: str, label: str) -> dict[str, int]:
    scrubbed = strip_quoted_strings(source)
    forbidden = {
        # Do not flag generic `import ...`: repository/client JS uses ES modules.
        # Python-only forms below still catch common accidental transpilation or
        # backend-string leakage.
        "python from-import keyword": r"(^|[^.$\w])from\s+[A-Za-z_][\w.]*\s+import\s+",
        "python def keyword": r"(^|[^.$\w])def\s+[A-Za-z_]\w*\s*\(",
        "python class keyword": r"(^|[^.$\w])class\s+[A-Za-z_]\w*\s*[:(]",
        "python None literal": r"(^|[^.$\w])None([^\w]|$)",
        "python True literal": r"(^|[^.$\w])True([^\w]|$)",
        "python False literal": r"(^|[^.$\w])False([^\w]|$)",
        "python self reference": r"(^|[^.$\w])self\.",
        "python print call": r"(^|[^.$\w])print\s*\(",
        "python lambda keyword": r"(^|[^.$\w])lambda\s+",
        "python raise keyword": r"(^|[^.$\w])raise\s+",
        "python except keyword": r"(^|[^.$\w])except\s+",
        "python try keyword": r"(^|[^.$\w])try\s*:",
        "python elif keyword": r"(^|[^.$\w])elif\s+",
        "python pass keyword": r"(^|[^.$\w])pass([^\w]|$)",
    }
    counts = {name: len(re.findall(pattern, scrubbed, flags=re.MULTILINE)) for name, pattern in forbidden.items()}
    offenders = {name: count for name, count in counts.items() if count}
    require(not offenders, f"{label} has Python residual tokens: {offenders}")
    return counts


def validate_generated_html(html: str, expected_stem: str) -> dict[str, Any]:
    parser = DistHTMLParser()
    parser.feed(html)
    require(parser.meta_viewport, "compiled PsychoJS HTML is missing viewport meta")
    require(parser.stylesheets, "compiled PsychoJS HTML is missing stylesheet links")
    require(any("psychojs" in href for href in parser.stylesheets), "compiled HTML does not include PsychoJS stylesheet")
    require(any(src.endswith(f"/{expected_stem}.js") or src == f"./{expected_stem}.js" for src in parser.scripts), f"compiled HTML does not load ./{expected_stem}.js")
    require(any(src.endswith(f"/{expected_stem}-legacy-browsers.js") or src == f"./{expected_stem}-legacy-browsers.js" for src in parser.scripts), "compiled HTML does not load legacy PsychoJS script")
    require(any("jquery" in src for src in parser.scripts), "compiled HTML is missing expected jQuery dependency")
    require(any("preloadjs" in src for src in parser.scripts), "compiled HTML is missing expected preloadjs dependency")
    return {
        "script_count": len(parser.scripts),
        "stylesheet_count": len(parser.stylesheets),
        "scripts": parser.scripts,
    }


def resolve_dist_reference(html_file: Path, reference: str) -> Path | None:
    if reference.startswith(("http://", "https://", "//", "data:", "#")):
        return None
    cleaned = reference.split("#", 1)[0].split("?", 1)[0]
    if not cleaned:
        return None
    if cleaned.startswith("/"):
        return (DIST_DIR / cleaned.lstrip("/")).resolve()
    return (html_file.parent / cleaned).resolve()


def validate_official_static_html() -> dict[str, Any]:
    html_files = [DIST_DIR / name / "index.html" for name in ("builder", "coder", "runner")]
    html_files.insert(0, DIST_DIR / "index.html")
    html_files.append(DIST_DIR / "404.html")
    for html_file in html_files:
        require(html_file.exists(), f"missing built HTML: {rel(html_file)}")

    parsed: dict[str, Any] = {}
    missing_refs: list[str] = []
    for html_file in html_files:
        html = html_file.read_text(encoding="utf-8")
        parser = DistHTMLParser()
        parser.feed(html)
        require("<base target=\"_blank\">" in html or "<base target='_blank'>" in html, f"{rel(html_file)} missing official static base target")
        require(parser.meta_viewport, f"{rel(html_file)} missing viewport meta")
        require(parser.modulepreloads, f"{rel(html_file)} missing Svelte modulepreload links")
        require(parser.icons, f"{rel(html_file)} missing favicon link")
        require(parser.stylesheets, f"{rel(html_file)} missing stylesheet links")
        for ref in [*parser.scripts, *parser.stylesheets, *parser.modulepreloads, *parser.icons]:
            target = resolve_dist_reference(html_file, ref)
            if target is not None and not target.exists():
                missing_refs.append(f"{rel(html_file)} -> {ref}")
        parsed[rel(html_file)] = {
            "modulepreloads": len(parser.modulepreloads),
            "stylesheets": len(parser.stylesheets),
            "scripts": len(parser.scripts),
            "icons": parser.icons,
        }

    service_worker = DIST_DIR / "webfs-sw.js"
    require(service_worker.exists(), "missing dist/webfs-sw.js")
    sw_text = service_worker.read_text(encoding="utf-8")
    require("/webfs/" in sw_text and "indexedDB" in sw_text, "webfs service worker missing isolated /webfs IndexedDB handling")
    layout_source = (REPO_ROOT / "src" / "routes" / "+layout.svelte").read_text(encoding="utf-8")
    require("navigator.serviceWorker.register(\"/webfs-sw.js\"" in layout_source, "layout does not register /webfs-sw.js")
    require(not missing_refs, "built HTML has missing local references:\n" + "\n".join(missing_refs[:20]))
    return parsed


def check_backend_imports(core_src: Path) -> CheckResult:
    try:
        backend = import_official_backend(core_src)
        require(importlib.util.find_spec("websockets") is not None, "websockets package is not importable")
        require((core_src / "psychopy" / "experiment").exists(), f"official core source missing experiment package: {core_src}")
        require(backend.temp_path("/webfs/nested/demo.psyexp").name == "demo.psyexp", "temp_path did not isolate browser path to basename")
        return CheckResult("backend import/path isolation", True, f"core={core_src}")
    except Exception as exc:
        return CheckResult("backend import/path isolation", False, str(exc))


def check_profiles(core_src: Path) -> CheckResult:
    try:
        backend = import_official_backend(core_src)
        components = backend.official_component_profiles()
        loops = backend.official_loop_profiles()
        required_components = {"TextComponent", "KeyboardComponent", "UnknownComponent"}
        missing_components = sorted(required_components.difference(components))
        require(not missing_components, f"missing required component profiles: {missing_components}")
        require("TrialHandler" in loops, "missing TrialHandler loop profile")
        text = components["TextComponent"]
        require(text["__class__"].startswith("psychopy.experiment.components"), "TextComponent profile is not official psychopy class")
        require("text" in text.get("params", {}), "TextComponent profile missing text param")
        require("nReps" in loops["TrialHandler"].get("params", {}), "TrialHandler profile missing nReps param")
        return CheckResult(
            "backend official profiles",
            True,
            f"components={len(components)} loops={len(loops)}",
            {"component_count": len(components), "loop_count": len(loops)},
        )
    except Exception as exc:
        return CheckResult("backend official profiles", False, str(exc))


def check_roundtrip_compile(core_src: Path) -> CheckResult:
    try:
        backend = import_official_backend(core_src)
        fixture = make_official_fixture(core_src)
        roundtrip = backend.official_roundtrip_psyexp(fixture, "/webfs/projects/demo.psyexp")
        require(roundtrip.get("ok") is True, f"roundtrip returned not-ok: {roundtrip}")
        psyexp = roundtrip.get("psyexp") or ""
        require("<TextComponent" in psyexp, "roundtrip output lost TextComponent")
        require("<LoopInitiator" in psyexp and "<LoopTerminator" in psyexp, "roundtrip output lost TrialHandler loop")
        require(not Path(roundtrip["input"]).is_relative_to(Path("/webfs")) if hasattr(Path(roundtrip["input"]), "is_relative_to") else True, "roundtrip used browser path as server path")

        compiled = backend.compile_psychojs(fixture, "/webfs/projects/demo.psyexp", outfile="demo.js")
        require(compiled.get("ok") is True, f"compile returned not-ok: {compiled}")
        script = compiled.get("script") or ""
        legacy = compiled.get("legacyScript") or ""
        html = compiled.get("html") or ""
        require("PsychoJS" in script, "compiled script missing PsychoJS")
        require("Hello official web" in script, "compiled script missing fixture text")
        require("TrialHandler" in script, "compiled script missing TrialHandler")
        require(legacy and "function" in legacy, "legacy PsychoJS script missing or empty")
        js_path = Path(compiled["outfile"])
        require(js_path.name == "demo.js", f"compile outfile did not respect isolated basename: {js_path.name}")
        require(js_path.exists(), f"compiled JS file missing: {js_path}")
        html_data = validate_generated_html(html, "demo")
        residual_counts = assert_no_residual_js_tokens(script, "compiled PsychoJS script")
        return CheckResult(
            "backend roundtrip/compile + JS residual scan",
            True,
            f"psyexp={len(psyexp)}B js={len(script)}B legacy={len(legacy)}B html_scripts={html_data['script_count']}",
            {"html": html_data, "residual_counts": residual_counts},
        )
    except Exception as exc:
        return CheckResult("backend roundtrip/compile + JS residual scan", False, str(exc))


def check_repository_js_residuals() -> CheckResult:
    try:
        targets = [
            REPO_ROOT / "src" / "lib" / "experiment",
            REPO_ROOT / "src" / "routes" / "builder",
            REPO_ROOT / "web_backend",
        ]
        scanned = 0
        for root in targets:
            for path in root.rglob("*.js"):
                scanned += 1
                assert_no_residual_js_tokens(path.read_text(encoding="utf-8"), rel(path))
        return CheckResult("repository JS residual scan", True, f"scanned={scanned} JS files")
    except Exception as exc:
        return CheckResult("repository JS residual scan", False, str(exc))


def check_frontend_build(skip_build: bool) -> CheckResult:
    try:
        if not skip_build:
            result = run_command(["npm", "run", "svelte:build"], timeout=240)
            require(result.returncode == 0, "npm run svelte:build failed:\n" + result.stdout[-4000:])
        validate_official_static_html()
        detail = "validated existing dist" if skip_build else "npm run svelte:build passed; dist validated"
        return CheckResult("frontend build + official static HTML", True, detail)
    except Exception as exc:
        return CheckResult("frontend build + official static HTML", False, str(exc))


def check_optional_browser_script() -> CheckResult:
    try:
        script = REPO_ROOT / "scripts" / "official_web_validation" / "browser_smoke.mjs"
        require(script.exists(), f"missing optional browser smoke script: {rel(script)}")
        text = script.read_text(encoding="utf-8")
        require("playwright" in text.lower(), "browser smoke script should document/use Playwright")
        require("npm run official-web:browser-smoke" in text, "browser smoke script missing package command hint")
        return CheckResult("optional browser smoke instructions", True, rel(script))
    except Exception as exc:
        return CheckResult("optional browser smoke instructions", False, str(exc))


def print_result(result: CheckResult) -> None:
    symbol = "PASS" if result.ok else "FAIL"
    print(f"[{symbol}] {result.name}")
    if result.details:
        print(textwrap.indent(result.details, "       "))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run official web rebuild validation matrix.")
    parser.add_argument("--core-src", type=Path, default=DEFAULT_CORE_SRC, help="Path to official psychopy source checkout")
    parser.add_argument("--skip-build", action="store_true", help="Validate existing dist instead of running npm run svelte:build")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable results")
    args = parser.parse_args(argv)

    checks: list[Callable[[], CheckResult]] = [
        lambda: check_backend_imports(args.core_src),
        lambda: check_profiles(args.core_src),
        lambda: check_roundtrip_compile(args.core_src),
        check_repository_js_residuals,
        lambda: check_frontend_build(args.skip_build),
        check_optional_browser_script,
    ]
    results: list[CheckResult] = []
    # Run checks serially: profile/compile import the official core and the build
    # can update dist, so parallelism would hide useful failure boundaries.
    for check in checks:
        result = check()
        results.append(result)
        if not args.json:
            print_result(result)

    payload = {
        "ok": all(result.ok for result in results),
        "results": [result.__dict__ for result in results],
    }
    if args.json:
        print(json.dumps(payload, indent=2))
    elif not payload["ok"]:
        print("\nValidation matrix failed.")
    else:
        print("\nValidation matrix passed.")
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
