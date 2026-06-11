# -*- coding: utf-8 -*-
"""
EcoLeadBot — FastAPI backend + static frontend.

Запуск:
  py server.py
  → http://127.0.0.1:8000  (виджет + POST /api/rag/ask)

Для только статики без RAG по-прежнему можно использовать serve.py.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Literal

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from rag_service import ask_rag

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ecoleadbot.server")

app = FastAPI(title="EcoLeadBot", version="1.3.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PageType = Literal[
    "seo_article", "service_page", "homepage", "landing", "other"
]


class RagAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1500)
    session_id: str = Field(..., min_length=3, max_length=128)
    page_url: str = Field(default="", max_length=2048)
    page_title: str = Field(default="", max_length=512)
    page_type: PageType = "other"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/rag/ask")
def rag_ask(body: RagAskRequest) -> dict:
    return ask_rag(
        question=body.question,
        session_id=body.session_id,
        page_url=body.page_url,
        page_title=body.page_title,
        page_type=body.page_type,
    )


@app.get("/")
def index_page():
    return FileResponse(ROOT / "index.html")


@app.get("/app.js")
def app_js():
    return FileResponse(ROOT / "app.js", media_type="application/javascript")


@app.get("/styles.css")
def styles_css():
    return FileResponse(ROOT / "styles.css", media_type="text/css")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    logger.info("EcoLeadBot server -> http://%s:%d", host, port)
    uvicorn.run("server:app", host=host, port=port, reload=False)
