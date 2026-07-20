# -*- coding: utf-8 -*-
"""Concatenate widget/src fragments into app.js (deploy artifact)."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "widget" / "src"
MANIFEST = ROOT / "widget" / "MANIFEST.txt"
APP_JS = ROOT / "app.js"
README = ROOT / "widget" / "README.md"


def build() -> None:
    if not MANIFEST.is_file():
        raise SystemExit(f"Missing {MANIFEST}. Run: py scripts/split_widget_sources.py")
    names = [
        line.strip()
        for line in MANIFEST.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    parts: list[str] = []
    for name in names:
        path = SRC_DIR / name
        if not path.is_file():
            raise SystemExit(f"Missing fragment: {path}")
        parts.append(path.read_text(encoding="utf-8"))
        if not parts[-1].endswith("\n"):
            parts[-1] += "\n"
    APP_JS.write_text("".join(parts), encoding="utf-8", newline="\n")
    print(f"Built {APP_JS} from {len(names)} fragments ({APP_JS.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
