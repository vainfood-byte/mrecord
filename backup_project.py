#!/usr/bin/env python3
"""Create a recoverable ZIP backup of the Mrecord project (sources + config)."""

from __future__ import annotations

import json
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Directory / file name segments to skip anywhere in the relative path
IGNORE_NAMES = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    ".cache",
    "cache",
    "temp",
    "tmp",
    ".tmp",
    ".turbo",
    ".vite",
    "coverage",
    ".nyc_output",
    "__pycache__",
    ".pytest_cache",
    ".idea",
    ".vscode",
    ".DS_Store",
    "Thumbs.db",
    ".electron-vite",
    "release",
    "releases",
}

# Skip previous backup archives in the project root
IGNORE_SUFFIXES = {".zip"}
IGNORE_PREFIXES = ("backup_",)


def read_version() -> str:
    pkg = ROOT / "package.json"
    try:
        data = json.loads(pkg.read_text(encoding="utf-8"))
        ver = str(data.get("version") or "unknown").strip()
        return ver.replace(" ", "_") if ver else "unknown"
    except (OSError, json.JSONDecodeError, TypeError):
        return "unknown"


def should_ignore(rel: Path) -> bool:
    parts = rel.parts
    if any(part in IGNORE_NAMES for part in parts):
        return True
    name = rel.name
    if name.startswith(IGNORE_PREFIXES) and rel.suffix.lower() in IGNORE_SUFFIXES:
        return True
    return False


def main() -> None:
    version = read_version()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_name = f"backup_{version}_{stamp}.zip"
    zip_path = ROOT / zip_name

    file_count = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT)
            if should_ignore(rel):
                continue
            if path.resolve() == zip_path.resolve():
                continue
            zf.write(path, arcname=str(rel).replace("\\", "/"))
            file_count += 1

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print("Backup complete.")
    print(f"  File : {zip_name}")
    print(f"  Path : {zip_path}")
    print(f"  Files: {file_count}")
    print(f"  Size : {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
