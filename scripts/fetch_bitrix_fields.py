# -*- coding: utf-8 -*-
"""One-off: fetch Bitrix lead field labels (needs inbound webhook in env or arg)."""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "integrations" / "n8n" / "bitrix-lead-fields.txt"


def _webhook_base() -> str:
    """Base URL like https://host/rest/1/token — from env or CLI arg."""
    if len(sys.argv) > 1 and sys.argv[1].strip():
        return sys.argv[1].rstrip("/")
    raw = (os.getenv("BITRIX_WEBHOOK_BASE") or os.getenv("BITRIX_WEBHOOK_URL") or "").strip()
    if not raw:
        raise SystemExit(
            "Set BITRIX_WEBHOOK_BASE or BITRIX_WEBHOOK_URL, or pass base URL as argv[1]"
        )
    for suffix in ("/crm.lead.add.json", "/crm.lead.fields.json"):
        if raw.endswith(suffix):
            raw = raw[: -len(suffix)]
            break
    return raw.rstrip("/")


def main() -> None:
    base = _webhook_base()
    url = f"{base}/crm.lead.fields.json"
    with urllib.request.urlopen(url, timeout=25) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    fields = data.get("result") or {}
    lines: list[str] = []
    for key in sorted(fields):
        meta = fields[key]
        label = meta.get("listLabel") or meta.get("formLabel") or meta.get("title") or ""
        ftype = meta.get("type") or ""
        if (
            key.startswith("UF_CRM_178004")
            or key in ("TITLE", "COMMENTS", "SOURCE_ID", "NAME")
            or "услуг" in label.lower()
            or "деятель" in label.lower()
            or "квалиф" in label.lower()
        ):
            lines.append(f"{key}\t{label}\t{ftype}")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {len(lines)} fields -> {OUT}")


if __name__ == "__main__":
    main()
