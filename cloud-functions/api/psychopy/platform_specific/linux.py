"""Linux platform stub for the EdgeOne serverless compile backend.

The real module exposes realtime-priority scheduling via ctypes; the
compile/profile command paths never call into it, so a no-op `rush` (matching
the fallback already defined in this package's __init__) is enough. Added by
scripts/build-edgeone-output.mjs because the macOS trace only kept darwin.py.
"""


def rush(value=False, realtime=False):
    """No-op: realtime priority is irrelevant for a stateless compile service."""
    return False
