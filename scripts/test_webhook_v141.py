# -*- coding: utf-8 -*-
"""Send v1.4.1 sample payloads to n8n webhook and verify Bitrix leads sequentially."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

WEBHOOK = os.getenv("ECOLEADBOT_WEBHOOK_URL", "https://n8n.ecolusspb.ru/webhook/ecoleadbot")
WEBHOOK_SECRET = os.getenv("ECOLEADBOT_WEBHOOK_SECRET", "").strip()
BITRIX = (os.getenv("BITRIX_WEBHOOK_BASE") or "").rstrip("/")
ROOT = Path(__file__).resolve().parents[1]

POLL_INTERVAL_SEC = 3
MAX_WAIT_SEC = 120

UF_FIELDS = [
    "UF_CRM_1780045640",
    "UF_CRM_1780045381",
    "UF_CRM_1780045704",
    "UF_CRM_1780045750",
    "UF_CRM_1780045778",
    "UF_CRM_1780045805",
    "UF_CRM_1780047226",
    "UF_CRM_1780047272",
    "UF_CRM_1780047302",
    "UF_CRM_1780045834",
    "UF_CRM_1780045115",
    "UF_CRM_1780045861",
    "UF_CRM_1780045878",
    "UF_CRM_1780046722",
]

CASES = [
    {
        "label": "main",
        "sample": ROOT / "integrations/samples/payload-main-flow-v14.json",
        "expected_title": "Автосервис / СТО",
    },
    {
        "label": "document",
        "sample": ROOT / "integrations/samples/payload-document-service-v14.json",
        "expected_title": "Производство / Производственный экологический контроль (ПЭК)",
    },
]


def post_json(url: str, data: dict) -> tuple[int, str]:
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if WEBHOOK_SECRET:
        headers["X-EcoLeadBot-Secret"] = WEBHOOK_SECRET
    req = urllib.request.Request(
        url, data=body, headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def bitrix_get(method: str, params: dict) -> dict:
    if not BITRIX:
        raise SystemExit(
            "Set BITRIX_WEBHOOK_BASE=https://host/rest/1/token before running"
        )
    q = urllib.parse.urlencode(params)
    url = f"{BITRIX}/{method}.json?{q}"
    with urllib.request.urlopen(url, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def bitrix_lead_get(lead_id: str) -> dict | None:
    """crm.lead.get — эквивалент проверки result из crm.lead.add."""
    try:
        res = bitrix_get("crm.lead.get", {"id": lead_id})
    except urllib.error.HTTPError:
        return None
    if res.get("error"):
        return None
    return res.get("result") or None


def wait_for_lead(session_id: str) -> tuple[str | None, float]:
    """Poll Bitrix until lead with session_id exists and crm.lead.get succeeds."""
    started = time.time()
    while time.time() - started < MAX_WAIT_SEC:
        res = bitrix_get(
            "crm.lead.list",
            {
                "filter[UF_CRM_1780045115]": session_id,
                "select[]": ["ID"],
            },
        )
        items = res.get("result") or []
        if items:
            lead_id = str(items[0]["ID"])
            lead = bitrix_lead_get(lead_id)
            if (
                lead
                and lead.get("UF_CRM_1780045115") == session_id
                and lead.get("TITLE")
            ):
                return lead_id, time.time() - started
        time.sleep(POLL_INTERVAL_SEC)
    return None, time.time() - started


def verify_lead(lead_id: str, session_id: str, expected_title: str) -> dict:
    lead = bitrix_lead_get(lead_id)
    if not lead:
        return {
            "bitrix_result_ok": False,
            "error": f"crm.lead.get failed for ID {lead_id}",
        }

    comments = lead.get("COMMENTS") or ""
    uf_filled = sum(1 for f in UF_FIELDS if lead.get(f) not in (None, "", "0", 0))
    title = lead.get("TITLE") or ""

    return {
        "bitrix_result_ok": True,
        "bitrix_lead_id": lead_id,
        "session": lead.get("UF_CRM_1780045115"),
        "session_ok": lead.get("UF_CRM_1780045115") == session_id,
        "title": title,
        "title_ok": title == expected_title and "EcoLeadBot" not in title,
        "comments_ok": (
            "── Следующий шаг ──" in comments
            and "Оценка заявки и подсказки менеджеру" in comments
            and "--- Scoring ---" not in comments
        ),
        "es_potential": lead.get("UF_CRM_1780045750"),
        "segment": lead.get("UF_CRM_1780045640"),
        "complexity": lead.get("UF_CRM_1780045381"),
        "priority": lead.get("UF_CRM_1780045704"),
        "route": lead.get("UF_CRM_1780045778"),
        "uf_fields_filled": uf_filled,
        "summary_len": len(lead.get("UF_CRM_1780045861") or ""),
        "comments_preview": comments[:150],
    }


def checks_pass(checks: dict) -> bool:
    return bool(
        checks.get("bitrix_result_ok")
        and checks.get("session_ok")
        and checks.get("title_ok")
        and checks.get("comments_ok")
        and checks.get("es_potential") not in (None, "", "0", 0)
        and checks.get("uf_fields_filled", 0) >= 10
    )


def run_case(case: dict, session_id: str) -> dict:
    payload = json.loads(case["sample"].read_text(encoding="utf-8"))
    payload["session_id"] = session_id
    payload["meta"]["is_test_build"] = True
    payload["meta"]["widget_version"] = "1.5.4"

    print(f"\n=== POST {case['label']} ({session_id}) ===")
    http_status, raw = post_json(WEBHOOK, payload)
    print(f"Webhook HTTP {http_status}: {raw[:200] if raw else '(empty)'}")

    if http_status != 200:
        return {"label": case["label"], "error": "webhook failed", "http": http_status, "raw": raw[:300]}

    print(f"Waiting for Bitrix lead (poll every {POLL_INTERVAL_SEC}s, max {MAX_WAIT_SEC}s)...")
    lead_id, waited = wait_for_lead(session_id)
    print(f"Waited {waited:.1f}s")

    if not lead_id:
        return {
            "label": case["label"],
            "error": "lead not found in Bitrix within timeout",
            "session_id": session_id,
            "waited_sec": round(waited, 1),
        }

    print(f"Bitrix crm.lead.add result equivalent: lead ID {lead_id}")
    checks = verify_lead(lead_id, session_id, case["expected_title"])
    checks["label"] = case["label"]
    checks["waited_sec"] = round(waited, 1)
    print(json.dumps(checks, ensure_ascii=False, indent=2))
    return checks


def main() -> int:
    ts = int(time.time())
    results: list[dict] = []

    print("Sequential test: second webhook runs only after first lead exists in Bitrix.")

    for i, case in enumerate(CASES):
        session_id = f"eco_test_{case['label']}_v141_{ts}"
        checks = run_case(case, session_id)
        results.append(checks)

        if i == 0 and not checks.get("bitrix_result_ok"):
            print("\nSTOP: first lead not confirmed in Bitrix — skipping second webhook.")
            break

        if i == 0:
            print("\nFirst lead confirmed — sending second webhook.")

    print("\n=== SUMMARY ===")
    all_ok = True
    for checks in results:
        label = checks.get("label", "?")
        if "error" in checks:
            all_ok = False
            print(f"{label}: FAIL -> {checks}")
            continue
        ok = checks_pass(checks)
        if not ok:
            all_ok = False
        print(
            f"{label}: {'PASS' if ok else 'FAIL'} -> "
            f"Bitrix #{checks.get('bitrix_lead_id')} "
            f"({checks.get('waited_sec')}s) "
            f"title={checks.get('title')!r}"
        )

    if len(results) < len(CASES):
        all_ok = False

    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
