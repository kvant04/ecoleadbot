# -*- coding: utf-8 -*-
"""
Деплой EcoLeadBot на Render.com через API.

Требуется RENDER_API_KEY в .env (Dashboard → Account Settings → API Keys).

Использование:
  python scripts/deploy_render.py
  python scripts/deploy_render.py --check
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

RENDER_API = "https://api.render.com/v1"
REPO = "https://github.com/kvant04/ecoleadbot"
SERVICE_NAME = "ecoleadbot"


def headers() -> dict[str, str]:
    key = os.getenv("RENDER_API_KEY", "").strip()
    if not key:
        raise SystemExit(
            "RENDER_API_KEY не найден в .env.\n"
            "Получите ключ: https://dashboard.render.com/u/settings#api-keys\n"
            "Или деплой в один клик: "
            "https://render.com/deploy?repo=https://github.com/kvant04/ecoleadbot"
        )
    return {"Authorization": f"Bearer {key}", "Accept": "application/json"}


def find_service(client: httpx.Client) -> dict | None:
    cursor = ""
    while True:
        params = {"limit": 100, "name": SERVICE_NAME}
        if cursor:
            params["cursor"] = cursor
        resp = client.get(f"{RENDER_API}/services", headers=headers(), params=params)
        resp.raise_for_status()
        data = resp.json()
        for item in data:
            svc = item.get("service") or item
            if svc.get("name") == SERVICE_NAME:
                return svc
        cursor = resp.headers.get("Cursor") or ""
        if not cursor or not data:
            break
    return None


def create_service(client: httpx.Client) -> dict:
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    vector_id = os.getenv("OPENAI_VECTOR_STORE_ID", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()

    if not openai_key or not vector_id:
        raise SystemExit("OPENAI_API_KEY и OPENAI_VECTOR_STORE_ID должны быть в .env")

    payload = {
        "type": "web_service",
        "name": SERVICE_NAME,
        "repo": REPO,
        "branch": "main",
        "region": "frankfurt",
        "plan": "free",
        "autoDeploy": "yes",
        "buildCommand": "pip install -r requirements.txt",
        "startCommand": "uvicorn server:app --host 0.0.0.0 --port $PORT",
        "healthCheckPath": "/api/health",
        "envVars": [
            {"key": "PYTHON_VERSION", "value": "3.12.7"},
            {"key": "OPENAI_MODEL", "value": model},
            {"key": "OPENAI_API_KEY", "value": openai_key},
            {"key": "OPENAI_VECTOR_STORE_ID", "value": vector_id},
        ],
    }
    resp = client.post(f"{RENDER_API}/services", headers=headers(), json=payload, timeout=60)
    if resp.status_code >= 400:
        raise SystemExit(f"Render API error {resp.status_code}: {resp.text}")
    return resp.json()


def wait_live(client: httpx.Client, service_id: str, timeout: int = 900) -> str:
    deadline = time.time() + timeout
    url = ""
    while time.time() < deadline:
        resp = client.get(f"{RENDER_API}/services/{service_id}", headers=headers())
        resp.raise_for_status()
        svc = resp.json()
        url = svc.get("serviceDetails", {}).get("url") or svc.get("service", {}).get("serviceDetails", {}).get("url") or ""
        status = svc.get("suspended") or svc.get("service", {}).get("suspended")
        deploy = svc.get("deployStatus") or ""
        print(f"  status: deploy={deploy} url={url or '—'}")
        if url:
            health = client.get(f"{url.rstrip('/')}/api/health", timeout=30)
            if health.status_code == 200:
                return url
        time.sleep(15)
    return url


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Только проверить URL сервиса")
    args = parser.parse_args()

    with httpx.Client(timeout=60) as client:
        svc = find_service(client)
        if svc:
            url = (svc.get("serviceDetails") or {}).get("url", "")
            print(f"Сервис найден: {svc.get('id')} → {url or '(ещё деплоится)'}")
            if args.check:
                return 0 if url else 1
            if url:
                print(f"\nПубличный URL: {url}")
                return 0

        if args.check:
            print("Сервис не найден на Render.")
            return 1

        print("Создание web service на Render...")
        created = create_service(client)
        service_id = created.get("id") or (created.get("service") or {}).get("id")
        print(f"Сервис создан: {service_id}")
        print("Ожидание деплоя (до 15 мин)...")
        url = wait_live(client, service_id)
        if url:
            print(f"\nПубличный URL: {url}")
            return 0
        print("Сервис создан, но URL ещё не отвечает. Проверьте Render Dashboard.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
