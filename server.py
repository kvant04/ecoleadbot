# -*- coding: utf-8 -*-
"""
EcoLeadBot — FastAPI backend + static frontend.

Запуск:
  py server.py
  → http://127.0.0.1:8000  (виджет + POST /api/rag/ask)
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from rag_service import ask_rag, close_openai_client

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ecoleadbot.server")

_RAG_VALIDATION_REASONS = frozenset({"empty_question", "too_long"})
_RAG_CONFIG_REASONS = frozenset({"missing_vector_store_id", "missing_api_key"})


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("EcoLeadBot API starting")
    yield
    close_openai_client()
    logger.info("EcoLeadBot API stopped")


app = FastAPI(title="EcoLeadBot", version="1.4.0", lifespan=lifespan)

# --- CORS ---
_DEFAULT_CORS = (
    "http://127.0.0.1:8000,"
    "http://localhost:8000,"
    "https://elb.ecolusspb.ru,"
    "https://ecolusspb.ru,"
    "https://www.ecolusspb.ru"
)


def _parse_cors_origins() -> list[str]:
    """Whitelist origins from CORS_ORIGINS (comma-separated)."""
    raw = os.getenv("CORS_ORIGINS", _DEFAULT_CORS).strip()
    return [part.strip() for part in raw.split(",") if part.strip()]


_cors_origins = _parse_cors_origins()
_cors_credentials = "*" not in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
logger.info(
    "CORS origins=%s credentials=%s",
    _cors_origins,
    _cors_credentials,
)

# --- RAG rate limit (in-memory, per worker) ---
_RAG_RATE_LIMIT = int(os.getenv("RAG_RATE_LIMIT", "20"))
_RAG_RATE_WINDOW_SEC = int(os.getenv("RAG_RATE_WINDOW_SEC", "60"))
_rag_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """Best-effort client IP (honours first X-Forwarded-For hop)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _check_rate_limit(bucket_key: str, limit: int, window_sec: int) -> bool:
    """Return True if request is allowed; False if over limit."""
    now = time.monotonic()
    hits = _rag_hits[bucket_key]
    while hits and (now - hits[0]) > window_sec:
        hits.popleft()
    if len(hits) >= limit:
        return False
    hits.append(now)
    return True


PageType = Literal[
    "seo_article", "service_page", "homepage", "landing", "other"
]


class RagAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1500)
    session_id: str = Field(..., min_length=3, max_length=128)
    page_url: str = Field(default="", max_length=2048)
    page_title: str = Field(default="", max_length=512)
    page_type: PageType = "other"
    quiz_context: str = Field(default="", max_length=3000)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/rag/ask", response_model=None)
def rag_ask(body: RagAskRequest, request: Request):
    ip = _client_ip(request)
    # Limit by IP and by session to slow both spray and single-session spam.
    for key in (f"ip:{ip}", f"sid:{body.session_id}"):
        if not _check_rate_limit(key, _RAG_RATE_LIMIT, _RAG_RATE_WINDOW_SEC):
            logger.warning(
                "RAG rate limit exceeded key=%s ip=%s session_id=%s",
                key,
                ip,
                body.session_id[:16],
            )
            raise HTTPException(
                status_code=429,
                detail="Слишком много запросов. Подождите минуту и попробуйте снова.",
            )
    result = ask_rag(
        question=body.question,
        session_id=body.session_id,
        page_url=body.page_url,
        page_title=body.page_title,
        page_type=body.page_type,
        quiz_context=body.quiz_context,
    )
    if result.get("status") == "error":
        reason = str(result.get("reason") or "")
        if reason in _RAG_VALIDATION_REASONS:
            status_code = 400
        elif reason in _RAG_CONFIG_REASONS:
            status_code = 503
        else:
            status_code = 502
        # Do not leak internal reason to the browser.
        payload = {
            "status": "error",
            "message": result.get("message")
            or "Сейчас не удалось получить ответ. Можете попробовать позже "
            "или оставить заявку специалисту.",
        }
        return JSONResponse(status_code=status_code, content=payload)
    return result


@app.get("/")
def index_page():
    return FileResponse(ROOT / "index.html")


@app.get("/app.js")
def app_js():
    return FileResponse(ROOT / "app.js", media_type="application/javascript")


@app.get("/elb-config.js")
def elb_config_js():
    """Site overrides (webhook secret). Prefer root file; fallback to template without secret."""
    primary = ROOT / "elb-config.js"
    fallback = ROOT / "deploy" / "sweb" / "elb-config.js"
    target = primary if primary.is_file() else fallback
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(target, media_type="application/javascript")


@app.get("/styles.css")
def styles_css():
    return FileResponse(ROOT / "styles.css", media_type="text/css")


@app.get("/data/{file_path:path}")
def data_route(file_path: str):
    return data_file(file_path)


@app.get("/assets/{file_path:path}")
def assets_route(file_path: str):
    target = (ROOT / "assets" / file_path).resolve()
    assets_root = (ROOT / "assets").resolve()
    if not str(target).startswith(str(assets_root)) or not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    media_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
    }
    media = media_map.get(target.suffix.lower(), "application/octet-stream")
    return FileResponse(target, media_type=media)


@app.get("/kb/{file_path:path}")
def kb_file(file_path: str):
    target = (ROOT / "kb" / file_path).resolve()
    kb_root = (ROOT / "kb").resolve()
    if not str(target).startswith(str(kb_root)) or not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    media = "text/markdown; charset=utf-8" if target.suffix == ".md" else "application/octet-stream"
    return FileResponse(target, media_type=media)


def data_file(file_path: str):
    target = (ROOT / "data" / file_path).resolve()
    data_root = (ROOT / "data").resolve()
    if not str(target).startswith(str(data_root)) or not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    media = "application/json" if target.suffix == ".json" else "application/octet-stream"
    return FileResponse(target, media_type=media)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    logger.info(
        "EcoLeadBot server -> http://%s:%d (RAG limit %d/%ds)",
        host,
        port,
        _RAG_RATE_LIMIT,
        _RAG_RATE_WINDOW_SEC,
    )
    uvicorn.run("server:app", host=host, port=port, reload=False)
