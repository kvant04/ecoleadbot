# -*- coding: utf-8 -*-
"""
Split app.js into widget/src fragments and rebuild.

Usage:
  py scripts/split_widget_sources.py   # one-time / re-split from app.js
  py scripts/build_widget.py           # concat widget/src -> app.js

Source of truth after split: widget/src/*.js
Generated artifact for deploy: app.js
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "app.js"
SRC_DIR = ROOT / "widget" / "src"
MANIFEST = ROOT / "widget" / "MANIFEST.txt"

# Map first line of section comment -> slug
SECTION_SLUGS: list[tuple[str, str]] = [
    (r"1\.\s*CONFIGURATION", "01-config"),
    (r"1b\.\s*v1\.4 DATA LAYER", "02-data-layer"),
    (r"1c\.\s*v1\.4 DOCUMENT BRANCH", "03-document-branch"),
    (r"2\.\s*MAIN FLOW", "04-main-flow"),
    (r"3\.\s*CONTENT", "05-content"),
    (r"4\.\s*UTILITIES", "06-utilities"),
    (r"5\.\s*ANALYTICS", "07-analytics"),
    (r"6\.\s*SESSION STORAGE", "08-session"),
    (r"7\.\s*STATE", "09-state"),
    (r"8\.\s*DOM REFERENCES", "10-dom-refs"),
    (r"9\.\s*BUILD STATIC DOM", "11-static-dom"),
    (r"10\.\s*INLINE CTA", "12-inline-cta"),
    (r"11\.\s*POPUP OPEN", "13-popup"),
    (r"11b\.\s*NAVIGATION", "14-navigation"),
    (r"13\.\s*SCREENS", "15-screens"),
    (r"13b\.\s*RAG SCENARIO", "16-rag"),
    (r"14\.\s*CONTACT VALIDATION", "17-contact-validation"),
    (r"14b\.\s*CONTACT SCREEN", "18-contact-screen"),
    (r"15\.\s*PAYLOAD", "19-payload"),
    (r"16\.\s*LOADING / FINAL", "20-final-screens"),
    (r"17\.\s*AUTO POPUP", "21-auto-popup"),
    (r"18\.\s*INIT", "22-init"),
]


def _slug_for_header(header_line: str) -> str | None:
    for pattern, slug in SECTION_SLUGS:
        if re.search(pattern, header_line, re.I):
            return slug
    return None


def split_app_js() -> list[str]:
    text = APP_JS.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    if not lines:
        raise SystemExit("app.js is empty")

    # Find section starts: line with "/* ---" followed by title line
    section_starts: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        if "/* ----" in line and i + 1 < len(lines):
            title = lines[i + 1]
            slug = _slug_for_header(title)
            if slug:
                section_starts.append((i, slug))

    if not section_starts:
        raise SystemExit("No sections found in app.js")

    SRC_DIR.mkdir(parents=True, exist_ok=True)
    for old in SRC_DIR.glob("*.js"):
        old.unlink()

    # Prologue: everything before first section (file banner + IIFE open)
    first_idx = section_starts[0][0]
    prologue = "".join(lines[:first_idx])
    (SRC_DIR / "00-prologue.js").write_text(prologue, encoding="utf-8", newline="\n")

    order = ["00-prologue.js"]
    for n, (start, slug) in enumerate(section_starts):
        end = section_starts[n + 1][0] if n + 1 < len(section_starts) else len(lines)
        chunk = "".join(lines[start:end])
        name = f"{slug}.js"
        (SRC_DIR / name).write_text(chunk, encoding="utf-8", newline="\n")
        order.append(name)

    MANIFEST.write_text("\n".join(order) + "\n", encoding="utf-8", newline="\n")
    print(f"Split into {len(order)} files -> {SRC_DIR}")
    for name in order:
        size = (SRC_DIR / name).stat().st_size
        print(f"  {name}: {size} bytes")
    return order


if __name__ == "__main__":
    split_app_js()
