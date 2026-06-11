# -*- coding: utf-8 -*-
"""Загрузка Markdown-базы знаний EcoLeadBot в OpenAI Vector Store."""

from __future__ import annotations

import datetime
import os
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import APIConnectionError, AuthenticationError, OpenAI, PermissionDeniedError

ROOT = Path(__file__).resolve().parent.parent
KB_DIR = ROOT / "kb"
REPORT_PATH = ROOT / "vector_store_upload_report.md"
ENV_EXAMPLE_PATH = ROOT / ".env.example"
ENV_PATH = ROOT / ".env"

VECTOR_STORE_NAME = "EcoLeadBot RAG KB v1.0"
POLL_INTERVAL_SEC = 3
POLL_TIMEOUT_SEC = 3600


def parse_args() -> argparse.Namespace:
    import argparse

    parser = argparse.ArgumentParser(
        description="Загрузка kb/*.md в OpenAI Vector Store для EcoLeadBot RAG",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Удалить все файлы из Vector Store и загрузить kb/*.md заново "
        "(нужно после правок базы знаний)",
    )
    return parser.parse_args()


def load_env() -> None:
    load_dotenv(ENV_PATH)


def load_api_key() -> str:
    load_env()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit(
            "OPENAI_API_KEY не найден. Создайте файл .env в корне проекта "
            "(см. .env.example)."
        )
    return api_key


def create_openai_client(api_key: str) -> OpenAI:
    """Клиент OpenAI с опциональным base_url, прокси и таймаутами."""
    import httpx

    kwargs: dict = {"api_key": api_key}
    timeout = httpx.Timeout(connect=60.0, read=600.0, write=600.0, pool=60.0)

    base_url = os.getenv("OPENAI_BASE_URL", "").strip()
    if base_url:
        kwargs["base_url"] = base_url

    proxy = (
        os.getenv("HTTPS_PROXY", "").strip()
        or os.getenv("HTTP_PROXY", "").strip()
        or os.getenv("OPENAI_PROXY", "").strip()
    )
    kwargs["http_client"] = httpx.Client(
        proxy=proxy or None,
        timeout=timeout,
    )

    return OpenAI(**kwargs)


def extract_openai_error(exc: Exception) -> tuple[str, str]:
    code = str(getattr(exc, "code", "") or "")
    message = str(exc)

    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        if "error" in body and isinstance(body["error"], dict):
            err = body["error"]
            code = str(err.get("code", code) or code)
            message = str(err.get("message", message) or message)
        else:
            code = str(body.get("code", code) or code)
            message = str(body.get("message", message) or message)

    return code, message


def report_openai_error(exc: Exception) -> None:
    code, message = extract_openai_error(exc)

    if code == "unsupported_country_region_territory":
        print("OpenAI API недоступен из вашего региона (403 unsupported_country_region_territory).")
        print("Это ограничение OpenAI, а не ошибка скрипта или ключа.")
        print("")
        print("Что можно сделать:")
        print("  1. Включить VPN в поддерживаемую страну (EU/US) и запустить скрипт снова.")
        print("  2. Указать прокси в .env:")
        print("       HTTPS_PROXY=http://user:pass@host:port")
        print("     или OPENAI_PROXY=http://user:pass@host:port")
        print("  3. Загрузить kb/*.md вручную в Vector Store через platform.openai.com (с VPN).")
        return

    if isinstance(exc, AuthenticationError) or code == "invalid_api_key":
        print("Ошибка авторизации OpenAI (401). Проверьте OPENAI_API_KEY в .env.")
        return

    if isinstance(exc, APIConnectionError):
        print(f"Не удалось подключиться к OpenAI API: {message}")
        print("Проверьте интернет, VPN/прокси и OPENAI_BASE_URL (если задан).")
        return

    label = code or type(exc).__name__
    print(f"OpenAI API ошибка ({label}): {message}")


def collect_kb_files() -> list[Path]:
    if not KB_DIR.is_dir():
        raise SystemExit(f"Папка kb/ не найдена: {KB_DIR}")
    files = sorted(KB_DIR.glob("*.md"))
    if not files:
        raise SystemExit(f"В {KB_DIR} нет файлов .md для загрузки.")
    return files


def get_or_create_vector_store(client: OpenAI) -> str:
    existing_id = os.getenv("OPENAI_VECTOR_STORE_ID", "").strip()
    if existing_id:
        try:
            vector_store = client.vector_stores.retrieve(existing_id)
            print(
                f"Используется существующий Vector Store: {vector_store.id} "
                f"({vector_store.name!r})"
            )
            return vector_store.id
        except Exception:
            print(
                f"Vector Store {existing_id!r} не найден — создаём новый "
                f"{VECTOR_STORE_NAME!r}..."
            )

    print(f"Создание Vector Store: {VECTOR_STORE_NAME!r}...")
    vector_store = client.vector_stores.create(name=VECTOR_STORE_NAME)
    print(f"vector_store_id: {vector_store.id}")
    return vector_store.id


def list_vector_store_file_entries(
    client: OpenAI,
    vector_store_id: str,
) -> list[dict]:
    """Список файлов Vector Store с именами из Files API."""
    entries: list[dict] = []
    page = client.vector_stores.files.list(vector_store_id=vector_store_id, limit=100)

    for vs_file in page.data:
        filename = vs_file.id
        try:
            oai_file = client.files.retrieve(vs_file.id)
            filename = getattr(oai_file, "filename", None) or vs_file.id
        except Exception:
            pass
        entries.append({
            "filename": filename,
            "vector_store_file_id": vs_file.id,
            "status": vs_file.status,
            "last_error": getattr(vs_file, "last_error", None),
        })

    entries.sort(key=lambda item: item["filename"])
    return entries


def get_completed_filenames(client: OpenAI, vector_store_id: str) -> set[str]:
    return {
        entry["filename"]
        for entry in list_vector_store_file_entries(client, vector_store_id)
        if entry.get("status") == "completed"
    }


def clear_vector_store(client: OpenAI, vector_store_id: str) -> int:
    """Удалить все файлы из Vector Store (перед принудительной перезаливкой)."""
    entries = list_vector_store_file_entries(client, vector_store_id)
    if not entries:
        return 0

    print(f"Удаление {len(entries)} файлов из Vector Store (--force)...")
    removed = 0
    for entry in entries:
        file_id = entry["vector_store_file_id"]
        name = entry["filename"]
        try:
            client.vector_stores.files.delete(
                vector_store_id=vector_store_id,
                file_id=file_id,
            )
            removed += 1
            print(f"  удалён: {name}")
        except Exception as exc:
            code, message = extract_openai_error(exc)
            print(f"  ! не удалось удалить {name}: {code or message}")

    return removed


def wait_for_vector_store_file(
    client: OpenAI,
    vector_store_id: str,
    file_id: str,
) -> tuple[str, str | None]:
    """Дождаться индексации одного файла в Vector Store."""
    deadline = time.time() + POLL_TIMEOUT_SEC

    while time.time() < deadline:
        vs_file = client.vector_stores.files.retrieve(
            vector_store_id=vector_store_id,
            file_id=file_id,
        )
        if vs_file.status == "completed":
            return "completed", None
        if vs_file.status == "failed":
            return "failed", str(getattr(vs_file, "last_error", None) or "unknown error")
        if vs_file.status == "cancelled":
            return "cancelled", "cancelled"

        time.sleep(POLL_INTERVAL_SEC)

    return "timeout", f"таймаут {POLL_TIMEOUT_SEC} с"


def upload_single_file(
    client: OpenAI,
    vector_store_id: str,
    path: Path,
) -> tuple[str, str | None]:
    """Загрузить один .md файл и дождаться completed."""
    with path.open("rb") as handle:
        oai_file = client.files.create(
            file=(path.name, handle),
            purpose="assistants",
        )

    client.vector_stores.files.create(
        vector_store_id=vector_store_id,
        file_id=oai_file.id,
    )

    return wait_for_vector_store_file(client, vector_store_id, oai_file.id)


def upload_kb_files(
    client: OpenAI,
    vector_store_id: str,
    kb_files: list[Path],
    *,
    force: bool = False,
) -> tuple[list[str], list[str]]:
    """Загрузить файлы по одному с прогрессом; пропустить уже completed (если не force)."""
    completed_names: set[str] = set()
    if not force:
        completed_names = get_completed_filenames(client, vector_store_id)
        if completed_names:
            print(f"Уже в Vector Store (completed): {len(completed_names)}")
            print("  Подсказка: после правок kb/*.md запускайте с --force")
    else:
        print("Режим --force: все локальные файлы будут загружены заново.")

    uploaded_names: list[str] = []
    newly_uploaded: list[str] = []
    errors: list[str] = []

    pending = [path for path in kb_files if force or path.name not in completed_names]
    skipped = len(kb_files) - len(pending)
    if skipped:
        print(f"Пропущено (без изменений в store): {skipped}")

    total = len(kb_files)

    for index, path in enumerate(pending, start=1):
        print(f"[{index}/{len(pending)}] {path.name} ...", flush=True)
        try:
            status, err = upload_single_file(client, vector_store_id, path)
        except Exception as exc:
            code, message = extract_openai_error(exc)
            errors.append(f"{path.name}: {code or type(exc).__name__} — {message}")
            print(f"  ошибка: {message}")
            continue

        if status == "completed":
            uploaded_names.append(path.name)
            newly_uploaded.append(path.name)
            print("  completed")
        else:
            errors.append(f"{path.name}: {status} — {err}")
            print(f"  {status}: {err}")

    if not force:
        uploaded_names = sorted(set(uploaded_names) | completed_names)

    return uploaded_names, errors, newly_uploaded


def write_report(
    *,
    vector_store_id: str,
    vector_store_name: str,
    uploaded_files: list[Path],
    file_entries: list[dict],
    upload_errors: list[str],
    newly_uploaded: list[str] | None = None,
    force: bool = False,
) -> None:
    today = datetime.date.today().isoformat()
    completed = sum(1 for entry in file_entries if entry.get("status") == "completed")
    new_count = len(newly_uploaded or [])
    all_ok = (
        completed == len(uploaded_files)
        and len(file_entries) == len(uploaded_files)
        and not upload_errors
        and (force or new_count > 0 or not file_entries)
    )

    lines = [
        "# Отчёт загрузки EcoLeadBot KB в OpenAI Vector Store",
        "",
        f"**Дата:** {today}",
        f"**Vector Store:** {vector_store_name}",
        f"**vector_store_id:** `{vector_store_id}`",
        f"**Загружено файлов (в store):** {len(uploaded_files)}",
        f"**Новых файлов в этом запуске:** {new_count}",
        f"**Completed:** {completed}",
        f"**Итог:** {'OK' if all_ok else 'REQUIRES REVIEW'}",
        "",
    ]

    if not force and new_count == 0 and not upload_errors:
        lines += [
            "> **Внимание:** 0 файлов загружено в этом запуске. Содержимое Vector Store "
            "**не обновлено**. После правок `kb/*.md` запустите скрипт с `--force`.",
            "",
        ]

    lines += [
        "## Файлы в Vector Store",
        "",
        "| Файл | VS file id | Статус |",
        "|---|---|---|",
    ]

    for entry in file_entries:
        lines.append(
            f"| `{entry['filename']}` | `{entry['vector_store_file_id']}` "
            f"| {entry['status']} |"
        )

    lines += ["", "## Локальные файлы (kb/*.md)", ""]
    for path in uploaded_files:
        lines.append(f"- `{path.name}`")

    if upload_errors:
        lines += ["", "## Ошибки", ""]
        for err in upload_errors:
            lines.append(f"- {err}")

    lines += [
        "",
        "## Следующие шаги",
        "",
        f"1. Добавьте в `.env`: `OPENAI_VECTOR_STORE_ID={vector_store_id}`",
        "2. Подключите Vector Store к EcoLeadBot RAG Assistant в OpenAI Platform.",
        "3. После правок `kb/*.md` перезаливайте: "
        "`python scripts/upload_kb_to_openai_vector_store.py --force`",
        "4. Прогоните `python evaluation_rerun_after_fixes.py` для быстрой проверки.",
        "",
    ]

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def update_env_example(vector_store_id: str) -> None:
    template = """# OpenAI — EcoLeadBot RAG
OPENAI_API_KEY=sk-your-api-key-here

# ID Vector Store (заполняется после upload_kb_to_openai_vector_store.py)
OPENAI_VECTOR_STORE_ID={vector_store_id}

# Опционально: если OpenAI API недоступен из региона (403 unsupported_country_region_territory)
# HTTPS_PROXY=http://user:pass@host:port
# OPENAI_PROXY=http://user:pass@host:port
# OPENAI_BASE_URL=https://api.openai.com/v1
"""
    if ENV_EXAMPLE_PATH.exists():
        content = ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
        if "OPENAI_VECTOR_STORE_ID=" in content:
            content = re.sub(
                r"OPENAI_VECTOR_STORE_ID=.*",
                f"OPENAI_VECTOR_STORE_ID={vector_store_id}",
                content,
            )
            ENV_EXAMPLE_PATH.write_text(content, encoding="utf-8")
            return

    ENV_EXAMPLE_PATH.write_text(
        template.format(vector_store_id=vector_store_id),
        encoding="utf-8",
    )


def persist_vector_store_id(vector_store_id: str) -> None:
    """Сохранить vector_store_id в .env для повторных запусков."""
    if not ENV_PATH.exists():
        return

    content = ENV_PATH.read_text(encoding="utf-8")
    if re.search(r"^OPENAI_VECTOR_STORE_ID=", content, flags=re.MULTILINE):
        content = re.sub(
            r"^OPENAI_VECTOR_STORE_ID=.*$",
            f"OPENAI_VECTOR_STORE_ID={vector_store_id}",
            content,
            flags=re.MULTILINE,
        )
    else:
        if content and not content.endswith("\n"):
            content += "\n"
        content += f"OPENAI_VECTOR_STORE_ID={vector_store_id}\n"

    ENV_PATH.write_text(content, encoding="utf-8")


def main() -> None:
    args = parse_args()
    vector_store_id = ""

    try:
        api_key = load_api_key()
        kb_files = collect_kb_files()
        client = create_openai_client(api_key)

        try:
            vector_store_id = get_or_create_vector_store(client)
        except (PermissionDeniedError, AuthenticationError, APIConnectionError) as exc:
            report_openai_error(exc)
            sys.exit(1)
        except Exception as exc:
            report_openai_error(exc)
            sys.exit(1)

        persist_vector_store_id(vector_store_id)

        if args.force:
            clear_vector_store(client, vector_store_id)

        print(f"Файлов для загрузки: {len(kb_files)}")
        uploaded_names, upload_errors, newly_uploaded = upload_kb_files(
            client,
            vector_store_id,
            kb_files,
            force=args.force,
        )

        file_entries = list_vector_store_file_entries(client, vector_store_id)

        write_report(
            vector_store_id=vector_store_id,
            vector_store_name=VECTOR_STORE_NAME,
            uploaded_files=kb_files,
            file_entries=file_entries,
            upload_errors=upload_errors,
            newly_uploaded=newly_uploaded,
            force=args.force,
        )
        update_env_example(vector_store_id)

        print("")
        print(f"vector_store_id: {vector_store_id}")
        print(f"Новых файлов загружено: {len(newly_uploaded)} / {len(kb_files)}")
        print(f"Всего в Vector Store: {len(uploaded_names)} / {len(kb_files)}")
        print("Файлы:")
        for path in kb_files:
            mark = "OK" if path.name in uploaded_names else "—"
            print(f"  [{mark}] {path.name}")

        if upload_errors:
            print("\nОшибки:")
            for err in upload_errors:
                print(f"  ! {err}")
            print(f"\nОтчёт: {REPORT_PATH}")
            sys.exit(1)

        if not args.force and len(newly_uploaded) == 0:
            print("")
            print("=" * 60)
            print("ВНИМАНИЕ: 0 файлов загружено в этом запуске.")
            print("Содержимое Vector Store НЕ обновлено — используются старые версии.")
            print("После правок kb/*.md запустите:")
            print("  python scripts/upload_kb_to_openai_vector_store.py --force")
            print("=" * 60)
            print(f"\nОтчёт: {REPORT_PATH}")
            sys.exit(2)

        print(f"\nВсе файлы: completed. Отчёт: {REPORT_PATH}")

    except KeyboardInterrupt:
        print("\n\nПрервано (Ctrl+C).")
        if vector_store_id:
            print(f"vector_store_id сохранён: {vector_store_id}")
            print("Повторный запуск продолжит загрузку с того места, где остановились.")
            print(f"Убедитесь, что в .env есть: OPENAI_VECTOR_STORE_ID={vector_store_id}")
        sys.exit(130)


if __name__ == "__main__":
    main()
