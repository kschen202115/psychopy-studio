#!/usr/bin/env python3
"""Pure-deletion pruning of upstream psychopy to the traced 117-module core.

Operates on a copy; never edits .py contents. Keeps:
  - .py files whose dotted module name is in core_mods.txt
  - data files (.spec/.tmpl/.yaml/.json/.svg/VERSION/...) that live directly in
    a kept package dir, or one data-subdir level below it (e.g. alertsCatalogue/,
    locales/) — but NOT data subdirs hanging directly off the psychopy root.
Deletes everything else, then prunes empty dirs.
"""
import os, shutil, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent          # web_backend/pyodide
REPO = HERE.parents[1]                           # repo root

# upstream psychopy package (PSYCHOPY_CORE_SRC points at the checkout root that
# contains psychopy/, matching official_core.py and build_archive.sh).
CORE_SRC = Path(os.environ.get("PSYCHOPY_CORE_SRC") or REPO.parent / "psychopy-core-src")
SRC = CORE_SRC / "psychopy"
# output package dir (build_archive.sh points this straight at its stage dir).
DST = Path(os.environ.get("PRUNE_OUT") or "/tmp/prune/psychopy")
ROOT_PARENT = DST  # the psychopy package root

# the keep-set manifest lives next to this script (committed, reproducible).
MODS_FILE = Path(os.environ.get("PRUNE_MODS") or HERE / "core_modules.txt")

if not SRC.is_dir():
    sys.exit(f"upstream psychopy not found at {SRC}; set PSYCHOPY_CORE_SRC or run "
             f"build_archive.sh (which clones it)")

mods = [l.strip() for l in open(MODS_FILE) if l.strip()]

# fresh copy (only replaces DST itself, never touches siblings)
if DST.exists():
    shutil.rmtree(DST)
DST.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(SRC, DST)

# map kept module -> kept .py path (module file OR package __init__.py)
keep_py = set()
for m in mods:
    rel = m.split(".")[1:]  # drop leading 'psychopy'
    base = DST.joinpath(*rel) if rel else DST
    as_module = base.with_suffix(".py")
    as_pkg = base / "__init__.py"
    if as_module.is_file():
        keep_py.add(as_module)
    elif as_pkg.is_file():
        keep_py.add(as_pkg)
    else:
        print(f"  WARN: no file for module {m}", file=sys.stderr)

kept_pkg_dirs = {p.parent for p in keep_py}  # dirs that directly hold a kept .py

# Bitmap/source icon resources the backend never reads. NOTE: .svg is KEPT —
# getElementProfiles() does `iconSVG = cls.iconSVG.read_text()` and the Studio
# component palette renders that markup, so dropping .svg blanks the palette
# icons. .png (iconFile) is only returned as a path, never read, so it's dropped.
DROP_DATA_EXT = {".png", ".xcf", ".ico"}

def keep_data(f: Path) -> bool:
    if f.suffix.lower() in DROP_DATA_EXT:
        return False
    d = f.parent
    if d in kept_pkg_dirs:
        return True
    # one data-subdir level below a kept pkg dir, but not directly under root
    if d.parent in kept_pkg_dirs and d.parent != ROOT_PARENT:
        return True
    return False

deleted_py = kept = deleted_data = 0
for f in list(DST.rglob("*")):
    if not f.is_file():
        continue
    if f.suffix == ".py":
        if f in keep_py:
            kept += 1
        else:
            f.unlink(); deleted_py += 1
    else:
        if keep_data(f):
            pass
        else:
            f.unlink(); deleted_data += 1

# prune now-empty dirs (deepest first)
for d in sorted([p for p in DST.rglob("*") if p.is_dir()], key=lambda p: -len(p.parts)):
    try:
        d.rmdir()
    except OSError:
        pass

print(f"kept .py        : {kept}")
print(f"deleted .py     : {deleted_py}")
print(f"deleted data    : {deleted_data}")
print(f"remaining files : {sum(1 for _ in DST.rglob('*') if _.is_file())}")
