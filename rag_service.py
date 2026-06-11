# -*- coding: utf-8 -*-
"""EcoLeadBot RAG — OpenAI Responses API + safety rules."""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

from openai import APIConnectionError, APITimeoutError, OpenAI

ROOT = Path(__file__).resolve().parent
PROMPT_PATH = ROOT / "prompts" / "ecoleadbot_rag_system_prompt.md"
MAX_QUESTION_LEN = 1500
MAX_ANSWER_LEN = 1200

logger = logging.getLogger("ecoleadbot.rag")

USER_ERROR_MESSAGE = (
    "Сейчас не удалось получить ответ. Можете попробовать позже "
    "или оставить заявку специалисту."
)

BLOCKED_PATTERNS = [
    r"провер(?:ь|ьте|ить)\s+(?:мой|наш|этот|данный|прикрепл|у\s+меня)",
    r"провер(?:ь|ьте)\s+(?:документ|отч[её]т|пноолр|программ)",
    r"проанализиру(?:й|йте|й)\s+(?:мой|наш|файл|документ|отч[её]т|пноолр|программ)",
    r"анализ(?:а|)\s+(?:документ|файл|отч[её]т|пноолр)",
    r"оцен(?:и|ите|ить)\s+(?:мой|наш|этот|данный)\s+(?:отч[её]т|документ|программ|пноолр)",
    r"\bпноолр\b",
    r"загруз(?:и|ите|ить)\s+(?:файл|документ)",
    r"прикреп(?:ил|ила|ить|ляю)",
    r"во\s*вложени",
    r"рассчит(?:ай|айте|ать)(?:\s+за\s+меня|\s+мне)?",
    r"рассчит(?:ай|айте|ать)\s+(?:отч[её]т|декларац|пэк|ндв|плат)",
    r"подготов(?:ь|ьте|ить)\s+(?:официальн|заключен|экспертн|экологическ)",
    r"подготов(?:ь|ьте|ить).*(?:отчётност|отчетност)",
    r"официальн(?:ое|ый)\s+заключен",
    r"дай\s+официальн",
    r"сделай\s+(?:за\s+меня\s+)?(?:отч[её]т|декларац|пэк)",
]

PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions",
    r"игнориру(?:й|йте)\s+(?:все\s+)?инструкц",
    r"раскрой\s+(?:системн|промпт|инструкц)",
    r"reveal\s+(?:system|hidden)\s+prompt",
    r"system\s+prompt",
    r"jailbreak",
    r"ответ(?:ь|айте)\s+без\s+(?:базы|источник|документ)",
    r"не\s+использ(?:уй|уйте)\s+(?:базу|vector|file_search)",
]

ES_SIGNAL_PATTERNS = [
    r"делегир",
    r"аутсорс",
    r"передать\s+специалист",
    r"полностью\s+занимал",
    r"экологическ(?:ое|ий)\s+сопровожден",
    r"кто[\-\s]?то\s+заним",
]

BLOCKED_RESPONSE = {
    "status": "ok",
    "answer": (
        "Я не могу анализировать документы, выполнять расчёты или готовить "
        "официальные заключения. Для такой задачи лучше обратиться к специалисту."
    ),
    "sources": [],
    "assistant_recommendation": "offer_consultation",
    "confidence": "high",
    "es_signal": "неизвестно",
}


def load_system_prompt() -> str:
    if not PROMPT_PATH.is_file():
        raise FileNotFoundError(f"System prompt not found: {PROMPT_PATH}")
    return PROMPT_PATH.read_text(encoding="utf-8").strip()


def _matches_any(text: str, patterns: list[str]) -> bool:
    lowered = text.lower()
    return any(re.search(p, lowered, re.IGNORECASE) for p in patterns)


def validate_question(question: str) -> str | None:
    q = (question or "").strip()
    if not q:
        return "empty_question"
    if len(q) > MAX_QUESTION_LEN:
        return "too_long"
    return None


def check_safety(question: str) -> dict[str, Any] | None:
    if _matches_any(question, BLOCKED_PATTERNS):
        result = dict(BLOCKED_RESPONSE)
        result["es_signal"] = detect_es_signal(question)
        return result
    if _matches_any(question, PROMPT_INJECTION_PATTERNS):
        result = dict(BLOCKED_RESPONSE)
        result["answer"] = (
            "Я отвечаю только по базе знаний компании по экологии. "
            "Для сложных задач лучше обратиться к специалисту."
        )
        result["es_signal"] = detect_es_signal(question)
        return result
    return None


def detect_es_signal(question: str) -> str:
    if _matches_any(question, ES_SIGNAL_PATTERNS):
        return "да"
    eco_markers = ("пэк", "отход", "нвос", "nvos", "отчёт", "отчет", "декларац", "выброс")
    lowered = question.lower()
    if any(m in lowered for m in eco_markers):
        return "неизвестно"
    return "нет"


def create_openai_client() -> OpenAI:
    import httpx

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    timeout = httpx.Timeout(connect=60.0, read=120.0, write=120.0, pool=60.0)
    proxy = (
        os.getenv("HTTPS_PROXY", "").strip()
        or os.getenv("HTTP_PROXY", "").strip()
        or os.getenv("OPENAI_PROXY", "").strip()
    )
    kwargs: dict[str, Any] = {
        "api_key": api_key,
        "http_client": httpx.Client(proxy=proxy or None, timeout=timeout),
    }
    base_url = os.getenv("OPENAI_BASE_URL", "").strip()
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


def _build_user_message(
    question: str,
    *,
    page_url: str,
    page_title: str,
    page_type: str,
) -> str:
    return (
        f"Контекст страницы:\n"
        f"- page_type: {page_type or 'other'}\n"
        f"- page_title: {page_title or '—'}\n"
        f"- page_url: {page_url or '—'}\n\n"
        f"Вопрос пользователя:\n{question.strip()}\n\n"
        "Ответь строго в JSON по формату из системных инструкций."
    )


def _extract_output_text(response: Any) -> str:
    parts: list[str] = []
    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", None) != "message":
            continue
        for content in getattr(item, "content", []) or []:
            if getattr(content, "type", None) == "output_text":
                parts.append(getattr(content, "text", "") or "")
    return "".join(parts).strip()


def _filename_to_title(filename: str) -> str:
    name = Path(filename).stem
    name = name.replace("-", " ").replace("_", " ")
    return re.sub(r"\s+", " ", name).strip()


def _guess_document_number(filename: str) -> str:
    match = re.match(r"^(\d+(?:-\d+)?-FZ|[0-9]+-PR|[0-9]+-03-SanPiN)", filename, re.I)
    return match.group(1).upper().replace("-FZ", "-ФЗ") if match else ""


def _extract_citation_sources(response: Any, answer_text: str) -> list[dict[str, str]]:
    """Извлечь источники из file_search annotations (fallback к JSON модели)."""
    sources: list[dict[str, str]] = []
    seen: set[str] = set()

    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", None) != "message":
            continue
        for content in getattr(item, "content", []) or []:
            if getattr(content, "type", None) != "output_text":
                continue
            for annotation in getattr(content, "annotations", []) or []:
                ann_type = getattr(annotation, "type", None)
                filename = ""
                snippet = ""

                if ann_type == "file_citation":
                    filename = getattr(annotation, "filename", "") or ""
                elif ann_type == "container_file_citation":
                    filename = getattr(annotation, "filename", "") or ""

                if not filename or filename in seen:
                    continue
                seen.add(filename)

                title = _filename_to_title(filename)
                doc_num = _guess_document_number(filename)
                sources.append({
                    "title": title,
                    "file_name": filename,
                    "document_number": doc_num,
                    "section": "",
                    "snippet": snippet,
                })

    return sources[:8]


def _parse_json_response(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("Response is not a JSON object")
    return data


def _normalize_sources(raw_sources: Any) -> list[dict[str, str]]:
    if not isinstance(raw_sources, list):
        return []
    out: list[dict[str, str]] = []
    for item in raw_sources[:8]:
        if not isinstance(item, dict):
            continue
        out.append({
            "title": str(item.get("title") or "").strip()[:300],
            "file_name": str(item.get("file_name") or "").strip()[:200],
            "document_number": str(item.get("document_number") or "").strip()[:120],
            "section": str(item.get("section") or "").strip()[:200],
            "snippet": str(item.get("snippet") or "").strip()[:200],
        })
    return [s for s in out if any(s.values())]


def _merge_sources(
    json_sources: list[dict[str, str]],
    citation_sources: list[dict[str, str]],
) -> list[dict[str, str]]:
    merged = list(json_sources)
    known = {
        (s.get("file_name") or s.get("title") or "").lower()
        for s in merged
    }
    for source in citation_sources:
        key = (source.get("file_name") or source.get("title") or "").lower()
        if key and key not in known:
            merged.append(source)
            known.add(key)
    return merged[:8]


def _normalize_recommendation(value: Any) -> str:
    allowed = {"answer_only", "offer_consultation", "out_of_scope", "insufficient_info"}
    v = str(value or "").strip()
    return v if v in allowed else "insufficient_info"


def _normalize_confidence(value: Any) -> str:
    allowed = {"high", "medium", "low"}
    v = str(value or "").strip()
    return v if v in allowed else "medium"


def _truncate_answer(text: str) -> str:
    text = (text or "").strip()
    if len(text) <= MAX_ANSWER_LEN:
        return text
    return text[: MAX_ANSWER_LEN - 1].rstrip() + "…"


def _error_response(session_id: str, question: str, reason: str, started: float) -> dict[str, Any]:
    elapsed = int((time.perf_counter() - started) * 1000)
    logger.error(
        "rag_fail session=%s qlen=%d reason=%s ms=%d",
        session_id,
        len(question),
        reason,
        elapsed,
    )
    return {"status": "error", "message": USER_ERROR_MESSAGE}


def ask_rag(
    *,
    question: str,
    session_id: str,
    page_url: str = "",
    page_title: str = "",
    page_type: str = "other",
) -> dict[str, Any]:
    started = time.perf_counter()

    validation_error = validate_question(question)
    if validation_error:
        logger.info(
            "rag_validation session=%s qlen=%d error=%s ms=%d",
            session_id,
            len(question or ""),
            validation_error,
            int((time.perf_counter() - started) * 1000),
        )
        return _error_response(session_id, question, validation_error, started)

    blocked = check_safety(question)
    if blocked:
        elapsed = int((time.perf_counter() - started) * 1000)
        logger.info(
            "rag_blocked session=%s qlen=%d recommendation=%s confidence=%s ms=%d",
            session_id,
            len(question),
            blocked["assistant_recommendation"],
            blocked["confidence"],
            elapsed,
        )
        return {
            "status": "ok",
            "answer": blocked["answer"],
            "sources": blocked["sources"],
            "assistant_recommendation": blocked["assistant_recommendation"],
            "confidence": blocked["confidence"],
            "es_signal": blocked.get("es_signal", detect_es_signal(question)),
        }

    vector_store_id = os.getenv("OPENAI_VECTOR_STORE_ID", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini"
    if not vector_store_id:
        return _error_response(session_id, question, "missing_vector_store_id", started)

    try:
        client = create_openai_client()
        system_prompt = load_system_prompt()
        user_message = _build_user_message(
            question,
            page_url=page_url,
            page_title=page_title,
            page_type=page_type,
        )

        response = client.responses.create(
            model=model,
            instructions=system_prompt,
            input=user_message,
            tools=[{
                "type": "file_search",
                "vector_store_ids": [vector_store_id],
            }],
        )

        raw_text = _extract_output_text(response)
        if not raw_text:
            return _error_response(session_id, question, "empty_model_response", started)

        parsed = _parse_json_response(raw_text)
        answer = _truncate_answer(str(parsed.get("answer") or ""))
        if not answer:
            return _error_response(session_id, question, "empty_answer", started)

        json_sources = _normalize_sources(parsed.get("sources"))
        citation_sources = _extract_citation_sources(response, answer)
        sources = _merge_sources(json_sources, citation_sources)

        recommendation = _normalize_recommendation(parsed.get("assistant_recommendation"))
        if not sources and recommendation == "answer_only":
            recommendation = "insufficient_info"

        result = {
            "status": "ok",
            "answer": answer,
            "sources": sources,
            "assistant_recommendation": recommendation,
            "confidence": _normalize_confidence(parsed.get("confidence")),
            "es_signal": detect_es_signal(question),
        }

        elapsed = int((time.perf_counter() - started) * 1000)
        logger.info(
            "rag_ok session=%s qlen=%d recommendation=%s confidence=%s sources=%d ms=%d",
            session_id,
            len(question),
            result["assistant_recommendation"],
            result["confidence"],
            len(sources),
            elapsed,
        )
        return result

    except json.JSONDecodeError:
        return _error_response(session_id, question, "json_parse_error", started)
    except (APIConnectionError, APITimeoutError):
        return _error_response(session_id, question, "openai_unavailable", started)
    except Exception as exc:
        reason = type(exc).__name__
        if "timeout" in str(exc).lower():
            reason = "timeout"
        return _error_response(session_id, question, reason, started)
