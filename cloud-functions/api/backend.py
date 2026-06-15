"""EdgeOne Pages serverless entry for the official PsychoPy web backend.

Route: ``/api/backend`` — GET is a health probe, POST runs one compile/profile
command (same JSON envelope the browser client sends).

NOTE: this file is intentionally NOT named ``psychopy.py`` — a module named
``psychopy`` would shadow the vendored ``psychopy`` package on sys.path and
break ``from psychopy import experiment``.

The heavy parts are NOT committed. ``scripts/prepare-cloud-functions.mjs``
vendors them into ``../_vendor`` at build/package time:

    _vendor/psychopy/            pruned official PsychoPy source (git `dev`)
    _vendor/official_backend.py  copy of this project's backend logic

EdgeOne invokes the module-level ``handler`` class (a BaseHTTPRequestHandler),
so this file only fixes up the import paths and re-exports it.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_VENDOR = os.path.normpath(os.path.join(_HERE, "..", "_vendor"))

# Make the vendored backend importable, and point PsychoPy resolution at the
# vendored source. PSYCHOPY_CORE_SRC is read at official_backend import time, so
# it must be set before the import below.
if _VENDOR not in sys.path:
    sys.path.insert(0, _VENDOR)
os.environ.setdefault("PSYCHOPY_CORE_SRC", _VENDOR)

from official_backend import CommandRequestHandler as handler  # noqa: E402

__all__ = ["handler"]
