# -*- coding: utf-8 -*-
"""
EcoLeadBot RAG — мини-проверка после правок evaluation (5 вопросов).

Запуск (backend должен быть доступен):
  py server.py
  python evaluation_rerun_after_fixes.py

После правок KB перезагрузите Vector Store:
  python scripts/upload_kb_to_openai_vector_store.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parent
REPORT_MD = ROOT / "evaluation_rerun_after_fixes.md"
REPORT_JSON = ROOT / "evaluation_rerun_after_fixes.json"

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
SESSION_PREFIX = "eval_rerun_fixes"

MINI_CASES: list[dict[str, str]] = [
    {
        "id": "1",
        "key": "nvos_rf",
        "label": "НВОС по РФ",
        "question": "\u0414\u0435\u043b\u0430\u0435\u0442\u0435 \u043b\u0438 \u0432\u044b \u043f\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0443 \u043d\u0430 \u0443\u0447\u0451\u0442 \u041d\u0412\u041e\u0421?",
    },
    {
        "id": "2",
        "key": "advantages",
        "label": "Преимущества + гарантии",
        "question": "Какие преимущества у компании?",
    },
    {
        "id": "3",
        "key": "contacts",
        "label": "Контакты",
        "question": "Как связаться с компанией?",
    },
    {
        "id": "4",
        "key": "passport_price",
        "label": "Цена паспорта отхода",
        "question": "Сколько стоит паспорт отхода?",
    },
    {
        "id": "5",
        "key": "nvos_calc",
        "label": "Декларация НВОС",
        "question": "Рассчитай мне декларацию НВОС.",
    },
]

OLD_PHONE_PATTERNS = (
    r"500[\s\-]?81[\s\-]?25",
    r"88005008125",
)
NEW_PHONE = "550-02-19"
PRICE_PATTERNS = (
    r"\b\d[\d\s]{2,}\s*(?:₽|руб)",
    r"от\s*\d[\d\s]*\s*руб",
    r"≈\s*\d",
    r"около\s*\d[\d\s]*",
)
NEUTRAL_PRICE_MARKERS = (
    "индивидуально",
    "зависит от особенностей",
    "зависит от",
    "уточнить детали",
    "уточнить у специалиста",
    "лучше уточнить",
)
AI_ECOLOGIST_MARKERS = (
    "не могу анализировать",
    "не могу выполнять расч",
    "не могу ... официальн",
    "лучше обратиться к специалисту",
    "не могу рассчит",
    "не выполняю расч",
)


@dataclass
class MiniResult:
    id: str
    key: str
    label: str
    question: str
    status: str = "error"
    answer: str = ""
    assistant_recommendation: str = ""
    confidence: str = ""
    sources: list[dict[str, Any]] = field(default_factory=list)
    error_message: str = ""
    response_time_ms: int = 0
    check_pass: bool = False
    check_comment: str = ""
    raw_response: dict[str, Any] = field(default_factory=dict)


def ask_rag(client: httpx.Client, base_url: str, case: dict[str, str], run_id: str) -> MiniResult:
    result = MiniResult(
        id=case["id"],
        key=case["key"],
        label=case["label"],
        question=case["question"],
    )
    payload = {
        "question": case["question"],
        "session_id": f"{SESSION_PREFIX}_{run_id}_{case['id']}",
        "page_url": "http://127.0.0.1:8000/evaluation-rerun",
        "page_title": "EcoLeadBot RAG Rerun After Fixes",
        "page_type": "other",
    }

    started = time.perf_counter()
    try:
        response = client.post(f"{base_url.rstrip('/')}/api/rag/ask", json=payload)
        result.response_time_ms = int((time.perf_counter() - started) * 1000)
        data = response.json()
        result.raw_response = data
        result.status = str(data.get("status") or "error")
        if result.status == "ok":
            result.answer = str(data.get("answer") or "")
            result.assistant_recommendation = str(data.get("assistant_recommendation") or "")
            result.confidence = str(data.get("confidence") or "")
            result.sources = data.get("sources") if isinstance(data.get("sources"), list) else []
        else:
            result.error_message = str(data.get("message") or f"HTTP {response.status_code}")
    except httpx.RequestError as exc:
        result.response_time_ms = int((time.perf_counter() - started) * 1000)
        result.error_message = f"{type(exc).__name__}: {exc}"
        result.raw_response = {"error": result.error_message}

    return result


def has_old_phone(text: str) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in OLD_PHONE_PATTERNS)


def has_service_price(text: str) -> bool:
    lower = text.lower()
    if re.search(r"\d[\d\s]*\s*(?:₽|руб\.?)", lower):
        return True
    if re.search(r"от\s*\d[\d\s]*\s*руб", lower):
        return True
    if re.search(r"≈\s*\d[\d\s]*", lower):
        return True
    if re.search(r"около\s*\d[\d\s]*\s*(?:₽|руб)", lower):
        return True
    return False


def validate_result(result: MiniResult) -> tuple[bool, str]:
    if result.status != "ok":
        return False, result.error_message or "нет ответа"

    answer = result.answer
    lower = answer.lower()

    if result.key == "nvos_rf":
        if re.search(r"санкт[\s-]?петербург.*москв|москв.*санкт[\s-]?петербург", lower):
            return False, "ограничение только СПб/Москва"
        if not re.search(r"по всей россии|по россии|всей россии|дистанцион", lower):
            return False, "нет формулировки о работе по РФ"
        return True, "услуга по РФ, без ограничения СПб/Москва"

    if result.key == "advantages":
        needed = ("опыт", "гарант", "сопровожд", "оператив")
        missing = [w for w in needed if w not in lower]
        if missing:
            return False, f"не хватает: {', '.join(missing)}"
        return True, "опыт, гарантии, сопровождение, оперативность"

    if result.key == "contacts":
        if has_old_phone(answer):
            return False, "найден старый телефон 500-81-25"
        if NEW_PHONE not in answer:
            return False, "нет актуального телефона 550-02-19"
        return True, "актуальный телефон, старого номера нет"

    if result.key == "passport_price":
        if has_service_price(answer):
            return False, "названа конкретная цена"
        if not any(m in lower for m in NEUTRAL_PRICE_MARKERS):
            return False, "нет нейтральной формулировки о стоимости"
        return True, "без конкретной цены, индивидуальный расчёт"

    if result.key == "nvos_calc":
        if has_service_price(answer):
            return False, "названа конкретная цена"
        if result.assistant_recommendation != "offer_consultation":
            return False, f"ожидался offer_consultation, получено: {result.assistant_recommendation or '—'}"
        if not any(m in lower for m in AI_ECOLOGIST_MARKERS) and "специалист" not in lower:
            return False, "нет отказа от расчёта / предложения консультации"
        return True, "offer_consultation, без расчёта и цены"

    return False, "неизвестный кейс"


def render_report(results: list[MiniResult], base_url: str, run_id: str) -> str:
    lines = [
        "# EcoLeadBot RAG — мини-проверка после правок",
        "",
        f"**Run ID:** `{run_id}`  ",
        f"**Backend:** `{base_url}`  ",
        f"**Дата (UTC):** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "> После правок KB нужно перезагрузить файлы в OpenAI Vector Store:",
        "> `python scripts/upload_kb_to_openai_vector_store.py`",
        "",
        "## Мини-проверка",
        "",
        "| Вопрос | Статус | Комментарий |",
        "| --- | --- | --- |",
    ]

    for r in results:
        mark = "✅" if r.check_pass else "❌"
        lines.append(f"| {r.label} | {mark} | {r.check_comment} |")

    lines.append("")
    for r in results:
        lines += [
            "---",
            "",
            f"## {r.id}. {r.label}",
            "",
            f"**Вопрос:** {r.question}",
            "",
            f"**Ответ:** {r.answer or '_(ошибка)_'}",
            "",
            f"**Recommendation:** {r.assistant_recommendation or '—'}",
            "",
            f"**Проверка:** {'PASS' if r.check_pass else 'FAIL'} — {r.check_comment}",
            "",
        ]

    passed = sum(1 for r in results if r.check_pass)
    lines += [
        "---",
        "",
        f"**Итого:** {passed}/{len(results)} пройдено",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="EcoLeadBot RAG mini rerun after KB fixes")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    results: list[MiniResult] = []

    with httpx.Client(timeout=args.timeout) as client:
        for case in MINI_CASES:
            result = ask_rag(client, args.base_url, case, run_id)
            passed, comment = validate_result(result)
            result.check_pass = passed
            result.check_comment = comment
            results.append(result)
            mark = "OK" if passed else "FAIL"
            print(f"[{mark}] {case['label']}: {comment}")

    report_md = render_report(results, args.base_url, run_id)
    REPORT_MD.write_text(report_md, encoding="utf-8")
    REPORT_JSON.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "base_url": args.base_url,
                "results": [asdict(r) for r in results],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"\nReport: {REPORT_MD}")
    failed = sum(1 for r in results if not r.check_pass)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
