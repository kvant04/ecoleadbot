# -*- coding: utf-8 -*-
"""
EcoLeadBot RAG Evaluation Runner v1.0

Отправляет набор из 35 вопросов в POST /api/rag/ask и формирует отчёт
для ручной оценки product owner.

Запуск (backend должен быть доступен):
  py server.py
  python evaluation_runner.py

Опции:
  --base-url http://127.0.0.1:8000
  --timeout 120
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parent
REPORT_MD = ROOT / "evaluation_results.md"
REPORT_JSON = ROOT / "evaluation_results.json"

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
SESSION_PREFIX = "eval_run"

# Evaluation Runner v1.0 — фиксированный набор (35 вопросов, 5 блоков)
EVALUATION_CASES: list[dict[str, str]] = [
    # Блок 1 — Законодательство
    {"id": 1, "category": "Законодательство", "question": "Кто обязан сдавать 2-ТП отходы?"},
    {"id": 2, "category": "Законодательство", "question": "Нужно ли вести журнал учета отходов?"},
    {"id": 3, "category": "Законодательство", "question": "Что такое объект НВОС?"},
    {"id": 4, "category": "Законодательство", "question": "Когда подается декларация о плате за НВОС?"},
    {"id": 5, "category": "Законодательство", "question": "Нужно ли делать ПЭК?"},
    {"id": 6, "category": "Законодательство", "question": "Что такое ФККО?"},
    {"id": 7, "category": "Законодательство", "question": "Когда нужен план мероприятий при НМУ?"},
    {"id": 8, "category": "Законодательство", "question": "Кто обязан вести учет отходов?"},
    {"id": 9, "category": "Законодательство", "question": "Какие категории НВОС существуют?"},
    {"id": 10, "category": "Законодательство", "question": "Что будет за нарушение экологического законодательства?"},
    # Блок 2 — Услуги компании
    {"id": 11, "category": "Услуги компании", "question": "Что входит в экологическое сопровождение?"},
    {"id": 12, "category": "Услуги компании", "question": "Что такое ПЭК?"},
    {"id": 13, "category": "Услуги компании", "question": "Чем помогает экологический аудит?"},
    {"id": 14, "category": "Услуги компании", "question": "Делаете ли вы паспорта отходов?"},
    {"id": 15, "category": "Услуги компании", "question": "Работаете ли вы по всей России?"},
    {"id": 16, "category": "Услуги компании", "question": "Помогаете ли вы с НДВ?"},
    {"id": 17, "category": "Услуги компании", "question": "Делаете ли вы постановку на учет НВОС?"},
    {"id": 18, "category": "Услуги компании", "question": "Что такое лицензия на отходы?"},
    {"id": 19, "category": "Услуги компании", "question": "Можно ли заказать консультацию эколога?"},
    {"id": 20, "category": "Услуги компании", "question": "Какие услуги помогают подготовиться к проверке?"},
    # Блок 3 — Компания
    {"id": 21, "category": "Компания", "question": "С какого года работает компания?"},
    {"id": 22, "category": "Компания", "question": "Сколько проектов реализовано?"},
    {"id": 23, "category": "Компания", "question": "В каких регионах работает компания?"},
    {"id": 24, "category": "Компания", "question": "Какие преимущества у компании?"},
    {"id": 25, "category": "Компания", "question": "Как связаться с компанией?"},
    # Блок 4 — Вне области знаний
    {"id": 26, "category": "Вне области знаний", "question": "Какая погода завтра?"},
    {"id": 27, "category": "Вне области знаний", "question": "Как приготовить борщ?"},
    {"id": 28, "category": "Вне области знаний", "question": "Кто выиграет чемпионат мира?"},
    {"id": 29, "category": "Вне области знаний", "question": "Напиши бизнес-план."},
    {"id": 30, "category": "Вне области знаний", "question": "Что купить на фондовом рынке?"},
    # Блок 5 — Защита от AI-эколога
    {"id": 31, "category": "Защита от AI-эколога", "question": "Проверь мой ПНООЛР."},
    {"id": 32, "category": "Защита от AI-эколога", "question": "Проанализируй мой отчет ПЭК."},
    {"id": 33, "category": "Защита от AI-эколога", "question": "Скажи, есть ли ошибки в документах."},
    {"id": 34, "category": "Защита от AI-эколога", "question": "Рассчитай мне декларацию НВОС."},
    {"id": 35, "category": "Защита от AI-эколога", "question": "Подготовь экологическую отчетность."},
]

AI_ECOLOGIST_MARKERS = (
    "не могу анализировать",
    "не могу выполнять расч",
    "не могу ... официальн",
    "лучше обратиться к специалисту",
)


@dataclass
class EvalResult:
    id: int
    category: str
    question: str
    status: str = "error"
    answer: str = ""
    assistant_recommendation: str = ""
    confidence: str = ""
    sources: list[dict[str, Any]] = field(default_factory=list)
    error_message: str = ""
    response_time_ms: int = 0
    raw_response: dict[str, Any] = field(default_factory=dict)


def format_source(source: dict[str, Any]) -> str:
    parts = [
        str(source.get("title") or "").strip(),
        str(source.get("document_number") or "").strip(),
        str(source.get("section") or "").strip(),
    ]
    line = ", ".join(p for p in parts if p)
    if not line:
        line = str(source.get("file_name") or "").strip()
    return line or "—"


def is_ai_ecologist_refusal(result: EvalResult) -> bool:
    if result.category != "Защита от AI-эколога":
        return False
    if result.status != "ok":
        return False
    answer_lower = result.answer.lower()
    return any(marker in answer_lower for marker in AI_ECOLOGIST_MARKERS) or (
        result.assistant_recommendation == "offer_consultation"
    )


def ask_rag(
    client: httpx.Client,
    base_url: str,
    case: dict[str, str],
    run_id: str,
) -> EvalResult:
    result = EvalResult(
        id=int(case["id"]),
        category=case["category"],
        question=case["question"],
    )
    payload = {
        "question": case["question"],
        "session_id": f"{SESSION_PREFIX}_{run_id}_{case['id']:03d}",
        "page_url": "http://127.0.0.1:8000/evaluation",
        "page_title": "EcoLeadBot RAG Evaluation",
        "page_type": "other",
    }

    started = time.perf_counter()
    try:
        response = client.post(f"{base_url.rstrip('/')}/api/rag/ask", json=payload)
        result.response_time_ms = int((time.perf_counter() - started) * 1000)

        try:
            data = response.json()
        except json.JSONDecodeError:
            result.error_message = f"Invalid JSON (HTTP {response.status_code})"
            result.raw_response = {"http_status": response.status_code, "body": response.text[:500]}
            return result

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


def render_case_section(result: EvalResult) -> str:
    lines = [
        "---",
        "",
        f"# Вопрос №{result.id}",
        "",
        "Категория:",
        result.category,
        "",
        "Вопрос:",
        result.question,
        "",
        "Ответ RAG:",
        "",
        result.answer if result.answer else f"_(ошибка: {result.error_message or 'нет ответа'})_",
        "",
        "Источники:",
        "",
    ]

    if result.sources:
        for source in result.sources:
            lines.append(f"• {format_source(source)}")
    else:
        lines.append("• —")

    lines += [
        "",
        "Recommendation:",
        "",
        result.assistant_recommendation or "—",
        "",
        "Confidence:",
        "",
        result.confidence or "—",
        "",
        "Status:",
        "",
        result.status + (f" ({result.error_message})" if result.error_message and result.status != "ok" else ""),
        "",
        f"Response time: {result.response_time_ms} ms",
        "",
        "---",
        "",
        "## Оценка Product Owner",
        "",
        "Верность ответа:",
        "",
        "[ ] Верно",
        "",
        "[ ] Частично верно",
        "",
        "[ ] Неверно",
        "",
        "---",
        "",
        "Релевантность источников:",
        "",
        "[ ] Да",
        "",
        "[ ] Нет",
        "",
        "---",
        "",
        "Поведение системы:",
        "",
        "[ ] Корректно",
        "",
        "[ ] Некорректно",
        "",
        "---",
        "",
        "Комментарии:",
        "",
        "",
        "",
    ]
    return "\n".join(lines)


def compute_stats(results: list[EvalResult]) -> dict[str, int]:
    total = len(results)
    successful = sum(1 for r in results if r.status == "ok")
    errors = sum(1 for r in results if r.status != "ok")
    with_sources = sum(1 for r in results if r.status == "ok" and len(r.sources) > 0)
    offer_consultation = sum(
        1 for r in results if r.assistant_recommendation == "offer_consultation"
    )
    out_of_scope = sum(
        1 for r in results if r.assistant_recommendation == "out_of_scope"
    )
    ai_ecologist = sum(1 for r in results if is_ai_ecologist_refusal(r))

    return {
        "total": total,
        "successful": successful,
        "errors": errors,
        "with_sources": with_sources,
        "offer_consultation": offer_consultation,
        "out_of_scope": out_of_scope,
        "ai_ecologist": ai_ecologist,
    }


def render_summary(stats: dict[str, int], base_url: str, run_id: str) -> str:
    return "\n".join([
        "---",
        "",
        "# Итоговая сводка Evaluation Run",
        "",
        f"**Run ID:** `{run_id}`  ",
        f"**Backend:** `{base_url}`  ",
        f"**Дата (UTC):** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## Статистика",
        "",
        f"- Количество успешных запросов: **{stats['successful']}**",
        f"- Количество ошибок: **{stats['errors']}**",
        f"- Количество ответов с источниками: **{stats['with_sources']}**",
        f"- Количество рекомендаций offer_consultation: **{stats['offer_consultation']}**",
        f"- Количество отказов вне области знаний (out_of_scope): **{stats['out_of_scope']}**",
        f"- Количество отказов AI-эколог (блок 5): **{stats['ai_ecologist']}**",
        "",
        "## Таблица метрик",
        "",
        "| Метрика | Значение |",
        "| --- | --- |",
        f"| Всего тестов | {stats['total']} |",
        f"| Успешных | {stats['successful']} |",
        f"| Ошибок | {stats['errors']} |",
        f"| Источники найдены | {stats['with_sources']} |",
        f"| Offer consultation | {stats['offer_consultation']} |",
        f"| Out-of-scope отказов | {stats['out_of_scope']} |",
        f"| AI-эколог отказов | {stats['ai_ecologist']} |",
        "",
    ])


def write_reports(
    results: list[EvalResult],
    stats: dict[str, int],
    base_url: str,
    run_id: str,
) -> None:
    header = "\n".join([
        "# EcoLeadBot RAG — Evaluation Results",
        "",
        "**Runner:** evaluation_runner.py v1.0  ",
        f"**Run ID:** `{run_id}`  ",
        f"**Backend:** `{base_url}`  ",
        f"**Дата (UTC):** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "> Product owner: оцените только качество ответов в секциях «Оценка Product Owner».",
        "",
    ])

    body = "\n".join(render_case_section(r) for r in results)
    summary = render_summary(stats, base_url, run_id)
    REPORT_MD.write_text(header + body + summary, encoding="utf-8")

    json_payload = {
        "run_id": run_id,
        "base_url": base_url,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "results": [
            {
                **{k: v for k, v in asdict(r).items() if k != "raw_response"},
                "raw_response": r.raw_response,
            }
            for r in results
        ],
    }
    REPORT_JSON.write_text(
        json.dumps(json_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def run_evaluation(base_url: str, timeout: float) -> int:
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    results: list[EvalResult] = []

    print(f"EcoLeadBot RAG Evaluation Runner v1.0")
    print(f"Backend: {base_url}")
    print(f"Questions: {len(EVALUATION_CASES)}")
    print("")

    with httpx.Client(timeout=timeout) as client:
        try:
            health = client.get(f"{base_url.rstrip('/')}/api/health")
            if health.status_code != 200:
                print(f"Warning: /api/health returned HTTP {health.status_code}", file=sys.stderr)
        except httpx.RequestError as exc:
            print(f"Warning: backend health check failed: {exc}", file=sys.stderr)
            print("Continuing anyway — errors will be recorded in the report.", file=sys.stderr)

        for case in EVALUATION_CASES:
            print(f"[{case['id']:02d}/35] {case['question'][:60]}...", flush=True)
            result = ask_rag(client, base_url, case, run_id)
            results.append(result)
            if result.status == "ok":
                src_n = len(result.sources)
                print(f"       OK | {result.assistant_recommendation} | sources={src_n} | {result.response_time_ms}ms")
            else:
                print(f"       ERROR | {result.error_message}")

    stats = compute_stats(results)
    write_reports(results, stats, base_url, run_id)

    print("")
    print(f"Report: {REPORT_MD}")
    print(f"JSON:   {REPORT_JSON}")
    print(f"Stats:  {stats['successful']} OK, {stats['errors']} errors, {stats['with_sources']} with sources")
    return 0 if stats["errors"] == 0 else 2


def main() -> None:
    parser = argparse.ArgumentParser(description="EcoLeadBot RAG Evaluation Runner v1.0")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="RAG backend base URL")
    parser.add_argument("--timeout", type=float, default=120.0, help="HTTP timeout per question (seconds)")
    args = parser.parse_args()
    sys.exit(run_evaluation(args.base_url, args.timeout))


if __name__ == "__main__":
    main()
