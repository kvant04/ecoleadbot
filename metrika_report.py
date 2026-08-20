# -*- coding: utf-8 -*-
"""Weekly Yandex Metrika statistics report and SMTP delivery."""

from __future__ import annotations

import json
import logging
import os
import smtplib
import socket
import time
from datetime import date, datetime, time as datetime_time, timedelta
from email.message import EmailMessage
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger("ecoleadbot.metrika_report")

METRIKA_GOAL_NAMES = [
    "ecoleadbot_widget_opened",
    "ecoleadbot_quiz_started",
    "ecoleadbot_mini_result_viewed",
    "ecoleadbot_contact_form_viewed",
    "ecoleadbot_lead_submitted",
    "ecoleadbot_rag_question_submitted",
]

_GOAL_LABELS = {
    "ecoleadbot_widget_opened": "Открытия виджета",
    "ecoleadbot_quiz_started": "Начало квиза",
    "ecoleadbot_mini_result_viewed": "Просмотр мини-результата",
    "ecoleadbot_contact_form_viewed": "Просмотр формы контакта",
    "ecoleadbot_lead_submitted": "Отправка лида",
    "ecoleadbot_rag_question_submitted": "Вопрос к RAG",
}

_MANAGEMENT_URL = "https://api-metrika.yandex.net/management/v1/counter/{counter_id}/goals"
_STAT_URL = "https://api-metrika.yandex.net/stat/v1/data"
_REQUEST_ATTEMPTS = 3
_REQUEST_TIMEOUT = httpx.Timeout(connect=15.0, read=15.0, write=15.0, pool=15.0)
_missing_config_logged = False
ROOT = Path(__file__).resolve().parent
_CYCLES_PATH = ROOT / "data" / "corporate_cycles.json"
# Directory mount (not a bind-mounted file) so atomic replace works in Docker.
_STATE_DIR = ROOT / "data" / "metrika_state"
_STATE_PATH = _STATE_DIR / "state.json"


def _get_json(url: str, token: str, params: dict[str, str] | None = None) -> dict[str, Any] | None:
    """Fetch JSON from Metrika, retrying transient network and server errors."""
    headers = {"Authorization": f"OAuth {token}"}
    for attempt in range(1, _REQUEST_ATTEMPTS + 1):
        try:
            with httpx.Client(timeout=_REQUEST_TIMEOUT) as client:
                response = client.get(url, headers=headers, params=params)
                response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                logger.error("Metrika response is not a JSON object url=%s", url)
                return None
            return payload
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if 400 <= status < 500:
                logger.warning("Metrika request rejected status=%s url=%s", status, url)
                return None
            if attempt == _REQUEST_ATTEMPTS:
                logger.error("Metrika server error after retries status=%s url=%s", status, url)
                return None
            logger.warning("Metrika server error status=%s attempt=%s/%s", status, attempt, _REQUEST_ATTEMPTS)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            if attempt == _REQUEST_ATTEMPTS:
                logger.error("Metrika request failed after retries error=%s url=%s", type(exc).__name__, url)
                return None
            logger.warning("Metrika transient error=%s attempt=%s/%s", type(exc).__name__, attempt, _REQUEST_ATTEMPTS)
        except ValueError as exc:
            logger.error("Metrika returned invalid JSON error=%s url=%s", type(exc).__name__, url)
            return None
        except httpx.HTTPError as exc:
            logger.error("Metrika request failed error=%s url=%s", type(exc).__name__, url)
            return None
        time.sleep(2 ** (attempt - 1))
    return None


def get_goal_ids(counter_id: str, token: str, goal_names: list[str]) -> dict[str, int]:
    """Return IDs of exactly matching Metrika goals; absent goals are omitted."""
    payload = _get_json(_MANAGEMENT_URL.format(counter_id=counter_id), token)
    if payload is None:
        return {}
    result: dict[str, int] = {}
    wanted = set(goal_names)
    goals = payload.get("goals", [])
    if not isinstance(goals, list):
        logger.error("Metrika goals response has invalid goals field")
        return result
    for goal in goals:
        if not isinstance(goal, dict) or goal.get("name") not in wanted:
            continue
        try:
            result[str(goal["name"])] = int(goal["id"])
        except (KeyError, TypeError, ValueError):
            logger.warning("Skipping malformed Metrika goal entry")
    logger.info("Metrika goals matched=%s requested=%s", len(result), len(goal_names))
    return result


def fetch_period_stats(counter_id: str, token: str, goal_ids: dict[str, int], start: date, end: date) -> dict[str, Any]:
    """Fetch statistics for an inclusive date period."""
    metric_names = ["ym:s:visits", "ym:s:pageviews"]
    metric_names.extend(f"ym:s:goal{goal_id}reaches" for goal_id in goal_ids.values())
    payload = _get_json(
        _STAT_URL,
        token,
        params={
            "ids": counter_id,
            "date1": start.isoformat(),
            "date2": end.isoformat(),
            "metrics": ",".join(metric_names),
        },
    )
    stats: dict[str, Any] = {
        "date1": start.isoformat(),
        "date2": end.isoformat(),
        "visits": None,
        "pageviews": None,
    }
    if payload is None:
        return stats
    stats["date1"] = str(payload.get("date1") or start.isoformat())
    stats["date2"] = str(payload.get("date2") or end.isoformat())
    totals = payload.get("totals", [])
    if isinstance(totals, list) and totals:
        stats["visits"] = totals[0] if len(totals) > 0 else None
        stats["pageviews"] = totals[1] if len(totals) > 1 else None
        for index, name in enumerate(goal_ids, start=2):
            stats[name] = totals[index] if index < len(totals) else None
    else:
        logger.warning("Metrika stats response has no totals")
    return stats


def fetch_week_stats(counter_id: str, token: str, goal_ids: dict[str, int]) -> dict[str, Any]:
    end = date.today()
    return fetch_period_stats(counter_id, token, goal_ids, end - timedelta(days=6), end)


def format_report_text(stats: dict[str, Any], period_label: str, kind: str = "weekly") -> str:
    """Format a Russian weekly or corporate-cycle report."""
    visits = stats.get("visits")
    try:
        visits_number = float(visits) if visits is not None else 0.0
    except (TypeError, ValueError):
        visits_number = 0.0
    if kind not in {"weekly", "cycle"}:
        raise ValueError(f"Unsupported report kind: {kind}")
    title = "Отчёт Яндекс.Метрики за корпоративную неделю"
    if kind == "cycle":
        title = "Отчёт Яндекс.Метрики за корпоративный цикл"
        if stats.get("quarter"):
            title += f" ({stats['quarter']})"
    lines = [title, f"Период: {period_label}", "", f"Визиты: {stats.get('visits', 'нет данных')}", f"Просмотры страниц: {stats.get('pageviews', 'нет данных')}", "", "Цели:"]
    for goal_name in METRIKA_GOAL_NAMES:
        label = _GOAL_LABELS[goal_name]
        value = stats.get(goal_name)
        if value is None:
            lines.append(f"{label}: цель ещё не найдена в счётчике")
            continue
        try:
            count = float(value)
            count_text = str(int(count)) if count.is_integer() else str(count)
        except (TypeError, ValueError):
            lines.append(f"{label}: нет данных")
            continue
        conversion = f" ({count / visits_number * 100:.1f}%)" if visits_number > 0 else ""
        lines.append(f"{label}: {count_text}{conversion}")
    compared_to = "предыдущей неделей" if kind == "weekly" else "предыдущим циклом"
    lines.append(chr(10) + f"Сравнение с {compared_to}: пока не включено.")
    return chr(10).join(lines)


def send_report_email(subject: str, body: str, recipients_override: list[str] | None = None) -> bool:
    """Send the report over SMTP SSL, retrying transient SMTP/socket failures."""
    raw_recipients = os.getenv("METRIKA_REPORT_RECIPIENTS", "")
    recipients = recipients_override or [item.strip() for item in raw_recipients.split(",") if item.strip()]
    if not recipients:
        logger.warning("Metrika report email skipped: no recipients configured")
        return False
    host = os.getenv("SMTP_HOST", "").strip()
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", "").strip() or user
    try:
        port = int(os.getenv("SMTP_PORT", "465"))
    except ValueError:
        logger.error("Metrika report email skipped: invalid SMTP_PORT")
        return False
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message.set_content(body)
    for attempt in range(1, _REQUEST_ATTEMPTS + 1):
        try:
            with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
                smtp.login(user, password)
                smtp.send_message(message)
            logger.info("Metrika report email sent recipients=%s subject=%s", len(recipients), subject)
            return True
        except (smtplib.SMTPException, socket.timeout, OSError) as exc:
            if attempt == _REQUEST_ATTEMPTS:
                logger.error("Metrika report email failed after retries error=%s recipients=%s", type(exc).__name__, len(recipients))
                return False
            logger.warning("Metrika report email transient error=%s attempt=%s/%s", type(exc).__name__, attempt, _REQUEST_ATTEMPTS)
            time.sleep(2 ** (attempt - 1))
    return False



def _positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
        if value <= 0:
            raise ValueError
        return value
    except ValueError:
        logger.warning("Invalid %s; using %s", name, default)
        return default


def load_corporate_cycles() -> list[dict[str, str]]:
    config: dict[str, Any] = {}
    if _CYCLES_PATH.is_file():
        try:
            payload = json.loads(_CYCLES_PATH.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                config = payload
        except (OSError, ValueError):
            logger.exception("Unable to read cycle calendar; generating it")
    explicit = config.get("cycles")
    if isinstance(explicit, list) and explicit:
        return [{key: str(value) for key, value in item.items()} for item in explicit if isinstance(item, dict)]
    anchor_text = str(config.get("anchor_start") or os.getenv("METRIKA_CYCLE_ANCHOR_START", "2026-07-17"))
    try:
        anchor = date.fromisoformat(anchor_text)
    except ValueError:
        anchor = date(2026, 7, 17)
    days = int(config.get("cycle_days") or _positive_int_env("METRIKA_CYCLE_DAYS", 28))
    per_quarter = int(config.get("cycles_per_quarter") or _positive_int_env("METRIKA_CYCLES_PER_QUARTER", 3))
    result = []
    for index in range(12):
        start = anchor + timedelta(days=index * days)
        result.append({"id": f"{anchor.year}-C{index + 1:02d}", "start": start.isoformat(), "end": (start + timedelta(days=days - 1)).isoformat(), "quarter": f"{anchor.year}-Q{index // per_quarter + 1}"})
    return result


def load_report_state() -> dict[str, list[str]]:
    empty: dict[str, list[str]] = {"sent_cycle_ids": [], "sent_weekly_ids": []}
    try:
        payload = json.loads(_STATE_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return empty
        cycles = payload.get("sent_cycle_ids", [])
        weeks = payload.get("sent_weekly_ids", [])
        return {
            "sent_cycle_ids": [str(item) for item in cycles] if isinstance(cycles, list) else [],
            "sent_weekly_ids": [str(item) for item in weeks] if isinstance(weeks, list) else [],
        }
    except FileNotFoundError:
        return empty
    except (OSError, ValueError):
        logger.exception("Unable to read report state; using empty state")
        return empty


def save_report_state(state: dict[str, list[str]]) -> None:
    """Persist send ledger inside the mounted state directory."""
    _STATE_DIR.mkdir(parents=True, exist_ok=True)
    normalized = {
        "sent_cycle_ids": list(state.get("sent_cycle_ids", [])),
        "sent_weekly_ids": list(state.get("sent_weekly_ids", [])),
    }
    payload = json.dumps(normalized, ensure_ascii=False, indent=2) + "\n"
    temporary = _STATE_DIR / "state.tmp"
    temporary.write_text(payload, encoding="utf-8")
    try:
        temporary.replace(_STATE_PATH)
    except OSError:
        logger.warning("Atomic state replace failed; writing state.json directly")
        _STATE_PATH.write_text(payload, encoding="utf-8")
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            logger.warning("Unable to remove temporary Metrika state file")


def _with_state_lock(callback: Any) -> Any:
    """Serialize state reads/writes across scheduler + CLI on Linux."""
    _STATE_DIR.mkdir(parents=True, exist_ok=True)
    lock_path = _STATE_DIR / "state.lock"
    with lock_path.open("a+", encoding="utf-8") as lock_file:
        locked = False
        try:
            if os.name == "posix":
                import fcntl

                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
                locked = True
            return callback()
        finally:
            if locked:
                import fcntl

                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def _claim_key(bucket: str, key: str) -> bool:
    """Mark key as sent before SMTP. Returns False if already claimed."""

    def _claim() -> bool:
        state = load_report_state()
        ids = state.setdefault(bucket, [])
        if key in ids:
            return False
        ids.append(key)
        save_report_state(state)
        return True

    return bool(_with_state_lock(_claim))


def _unclaim_key(bucket: str, key: str) -> None:
    """Remove claim after failed SMTP so a later retry can send once."""

    def _unclaim() -> None:
        state = load_report_state()
        ids = state.get(bucket, [])
        if key in ids:
            ids.remove(key)
            state[bucket] = ids
            save_report_state(state)

    _with_state_lock(_unclaim)


def _cycle_report_hour() -> int:
    hour = _positive_int_env("METRIKA_CYCLE_REPORT_HOUR", 9)
    return hour if hour <= 23 else 9


def _cycle_send_at(cycle: dict[str, str]) -> datetime:
    return datetime.combine(
        date.fromisoformat(cycle["end"]) + timedelta(days=1),
        datetime_time(hour=_cycle_report_hour()),
    )


def _weekly_period_key(_stats: dict[str, Any] | None = None, when: date | None = None) -> str:
    """One send per ISO week (Mon–Sun), independent of exact Metrika date1/date2."""
    day = when or date.today()
    iso_year, iso_week, _ = day.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def run_cycle_report_job(cycle: dict[str, str], *, force: bool = False) -> bool:
    """Send one cycle report. Claims the cycle id before SMTP to prevent duplicates."""
    cycle_id = str(cycle.get("id") or "")
    if not cycle_id:
        logger.error("Cycle report skipped: missing cycle id")
        return False
    try:
        if not force and not _claim_key("sent_cycle_ids", cycle_id):
            logger.info("Cycle report skipped: already sent id=%s", cycle_id)
            return False

        token = os.getenv("YANDEX_METRIKA_TOKEN", "").strip()
        counter_id = os.getenv("YANDEX_METRIKA_COUNTER_ID", "").strip()
        if not token or not counter_id:
            logger.warning("Metrika cycle report disabled: required configuration is missing")
            if not force:
                _unclaim_key("sent_cycle_ids", cycle_id)
            return False

        stats = fetch_period_stats(
            counter_id,
            token,
            get_goal_ids(counter_id, token, METRIKA_GOAL_NAMES),
            date.fromisoformat(cycle["start"]),
            date.fromisoformat(cycle["end"]),
        )
        stats["quarter"] = cycle.get("quarter")
        period = f"{cycle_id}: {cycle['start']} — {cycle['end']}"
        raw = os.getenv("METRIKA_CYCLE_RECIPIENTS", "")
        override = [item.strip() for item in raw.split(",") if item.strip()] or None
        subject = f"EcoLeadBot: корпоративный цикл {period}"
        body = format_report_text(stats, period, "cycle")
        sent_ok = send_report_email(subject, body, override)
        if not sent_ok:
            if not force:
                _unclaim_key("sent_cycle_ids", cycle_id)
            return False
        if force:
            _claim_key("sent_cycle_ids", cycle_id)
        return True
    except Exception:
        logger.exception("Metrika cycle report job failed id=%s", cycle_id)
        if not force:
            _unclaim_key("sent_cycle_ids", cycle_id)
        return False


def run_due_cycle_reports(now: datetime | None = None) -> int:
    """Send each due cycle at most once. Ignores already-claimed ids."""
    current = now or datetime.now()
    # Safety: do not mass-resend ancient cycles if state was wiped (unless explicitly enabled).
    backfill_all = os.getenv("METRIKA_CYCLE_BACKFILL_ALL", "").strip() in {"1", "true", "yes"}
    try:
        grace_days = int(os.getenv("METRIKA_CYCLE_DUE_GRACE_DAYS", "3"))
    except ValueError:
        grace_days = 3
    grace_start = current - timedelta(days=max(0, grace_days))

    count = 0
    for cycle in load_corporate_cycles():
        send_at = _cycle_send_at(cycle)
        if send_at > current:
            continue
        if not backfill_all and send_at < grace_start:
            continue
        if run_cycle_report_job(cycle, force=False):
            count += 1
    return count


def next_cycle_report_at(now: datetime) -> datetime | None:
    slots = [_cycle_send_at(cycle) for cycle in load_corporate_cycles() if _cycle_send_at(cycle) > now]
    return min(slots) if slots else None


def run_weekly_report_job(*, force: bool = False) -> None:
    """Build and send one weekly report; claim period key before SMTP."""
    global _missing_config_logged
    try:
        token = os.getenv("YANDEX_METRIKA_TOKEN", "").strip()
        counter_id = os.getenv("YANDEX_METRIKA_COUNTER_ID", "").strip()
        if not token or not counter_id:
            if not _missing_config_logged:
                logger.warning("Metrika weekly report disabled: required configuration is missing")
                _missing_config_logged = True
            return
        goal_ids = get_goal_ids(counter_id, token, METRIKA_GOAL_NAMES)
        week_key = _weekly_period_key(when=date.today())
        if not force and not _claim_key("sent_weekly_ids", week_key):
            logger.info("Weekly report skipped: already sent period=%s", week_key)
            return
        stats = fetch_week_stats(counter_id, token, goal_ids)
        period_label = f"{stats['date1']} — {stats['date2']}"
        body = format_report_text(stats, period_label, "weekly")
        subject = f"EcoLeadBot: корпоративная неделя {period_label}"
        sent_ok = send_report_email(subject, body)
        if not sent_ok:
            if not force:
                _unclaim_key("sent_weekly_ids", week_key)
            return
        if force:
            _claim_key("sent_weekly_ids", week_key)
    except (httpx.HTTPError, smtplib.SMTPException, OSError, ValueError, KeyError, TypeError) as exc:
        logger.exception("Metrika weekly report job failed error=%s", type(exc).__name__)
    except Exception:
        logger.exception("Metrika weekly report job failed with unexpected error")

