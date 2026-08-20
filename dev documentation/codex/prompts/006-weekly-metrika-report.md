# Codex Prompt 006 — Weekly Yandex Metrika email digest (F2)

## Role

Coding agent for EcoLeadBot backend (`server.py` + new modules). No git commit. **No deploy** — orchestrator deploys after review.

## Masterplan

`dev documentation/codex/MASTERPLAN-analytics.md` (block F2).

## Context

- Backend is FastAPI (`server.py`), single uvicorn process, single Docker container (`docker-compose.yml`, `restart: unless-stopped`), no multi-worker setup — safe to run an in-process asyncio background scheduler without duplicate-run risk.
- `.env` (gitignored, already populated locally, will be deployed with `-IncludeEnv`) now has:
  - `YANDEX_METRIKA_TOKEN` — Yandex OAuth token, scope `metrika:read` (read-only; do **not** assume write/management access beyond reading goals list).
  - `YANDEX_METRIKA_COUNTER_ID` — numeric counter id (currently `22994308`, confirmed working against Yandex Metrika Stat API).
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — mail.ru SMTP over SSL (port 465), confirmed working with a manual test send.
  - `METRIKA_REPORT_RECIPIENTS` — comma-separated email list (currently 2 addresses).
- Six Yandex Metrika goals (type "JS-событие") are being created manually in the Metrika UI with **both name and JS-event identifier** set to these exact strings (goal creation may lag behind this code task — code must tolerate goals not existing yet, see below):

```
ecoleadbot_widget_opened
ecoleadbot_quiz_started
ecoleadbot_mini_result_viewed
ecoleadbot_contact_form_viewed
ecoleadbot_lead_submitted
ecoleadbot_rag_question_submitted
```

- These correspond 1:1 to goals already fired client-side by the widget via `ym(counterId, "reachGoal", goalName)` (block F1, already deployed as `WIDGET_VERSION 1.5.46`). Do not touch widget/src files in this task — this prompt is backend-only.
- Existing project conventions to follow (user rules, mandatory):
  - `logging` module only, never `print()`. Reuse the existing logger pattern from `server.py` (`logging.getLogger("ecoleadbot.<module>")`).
  - All network calls wrapped in try/except with **specific** exception types, timeouts (connect+read), and retry with exponential backoff (3 attempts) for transient failures.
  - No secrets hardcoded — read only from `os.getenv(...)`, already loaded via `load_dotenv()` in `server.py`.
  - A failure in this feature must **never** crash the FastAPI app or block other functionality (isolate failures, log with context, continue).
  - Type hints on all functions; docstrings on public functions; keep new files ≤300 lines (split if needed).

## Required implementation

### 1. New module `metrika_report.py` (repo root, alongside `server.py`)

Functions (exact names flexible, but keep this shape):

- `get_goal_ids(counter_id: str, token: str, goal_names: list[str]) -> dict[str, int]`
  - Calls Yandex Metrika **Management API**: `GET https://api-metrika.yandex.net/management/v1/counter/{counter_id}/goals` with header `Authorization: OAuth {token}`, timeout ~15s, retry on transient errors (network/5xx), no retry on 4xx (log and treat as "no goals found yet" instead of crashing).
  - Response has a `goals` list; each goal has at least `id` and `name`. Match goals where `goal["name"]` exactly equals one of `goal_names`. Return a dict mapping matched name -> numeric id. Names not found are simply absent from the returned dict (do not error).

- `fetch_week_stats(counter_id: str, token: str, goal_ids: dict[str, int]) -> dict`
  - Calls Yandex Metrika **Stat API**: `GET https://api-metrika.yandex.net/stat/v1/data` with header `Authorization: OAuth {token}`, params `ids=counter_id`, `date1=7daysAgo`, `date2=today`, and `metrics` = `ym:s:visits,ym:s:pageviews` plus `ym:s:goal{ID}reaches` for each id in `goal_ids.values()` (comma-joined, single request; Stat API supports multiple metrics in one call).
  - Timeout ~15s, retry on transient errors (3 attempts, exponential backoff), specific exception handling (`httpx.HTTPError` family — check what's already imported/used elsewhere in this repo, e.g. `rag_service.py`, for the existing HTTP client + retry convention and reuse the same style/library for consistency).
  - Parse `totals` array (order matches the `metrics` string) into a flat dict: `{"visits": ..., "pageviews": ..., "ecoleadbot_widget_opened": ..., ...}`. Goals absent from `goal_ids` simply won't appear (value `None` or omitted — handle gracefully in formatting).
  - Also return the actual `date1`/`date2` echoed by the API (for the email subject/body) if present in the response, else fall back to the computed local dates.

- `format_report_text(stats: dict, period_label: str) -> str`
  - Russian-language plain text. Include: period, `Визиты`, `Просмотры страниц`, then each of the 6 goals with a short Russian label and count, plus conversion (goal count / visits * 100, one decimal, `%`) when visits > 0. If a goal wasn't found (missing from `stats`), show a friendly note like `— цель ещё не создана в Метрике` instead of `0` (so early runs before goals exist don't look like "zero activity").
  - Russian labels mapping (use exactly this Russian text for each goal):
    - `ecoleadbot_widget_opened` → "Открытие бота"
    - `ecoleadbot_quiz_started` → "Старт опроса"
    - `ecoleadbot_mini_result_viewed` → "Просмотр мини-результата"
    - `ecoleadbot_contact_form_viewed` → "Просмотр формы контактов"
    - `ecoleadbot_lead_submitted` → "Отправка лида"
    - `ecoleadbot_rag_question_submitted` → "Вопрос через RAG"

- `send_report_email(subject: str, body: str) -> None`
  - Uses `smtplib.SMTP_SSL` (mirrors the manual test already run: `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM`), recipients from `METRIKA_REPORT_RECIPIENTS` (split on comma, strip whitespace, skip empties).
  - Wrap in try/except (`smtplib.SMTPException`, `OSError`/`socket.timeout`), retry up to 3 times with short backoff, log outcome (success/failure) with context (recipient count, subject) but never log the SMTP password.
  - If `METRIKA_REPORT_RECIPIENTS` is empty/unset, log a warning and return without error (don't crash).

- `run_weekly_report_job() -> None`
  - Orchestrates: check required env vars present (`YANDEX_METRIKA_TOKEN`, `YANDEX_METRIKA_COUNTER_ID`); if missing, log a warning once and return (feature disabled, no crash).
  - Calls `get_goal_ids` → `fetch_week_stats` → `format_report_text` → `send_report_email`.
  - Any exception anywhere in this chain must be caught, logged with context, and swallowed — this function must never raise.

### 2. Scheduler wiring in `server.py`

- Add an async background task started from the existing `lifespan` context manager (do not replace/break the existing `lifespan` body — extend it).
- Config via env (all optional, with sane defaults so it works out of the box): `METRIKA_REPORT_WEEKDAY` (0=Monday .. 6=Sunday, default `0`), `METRIKA_REPORT_HOUR` (24h local server time, default `9`).
- Implement `async def _weekly_metrika_scheduler_loop()`:
  - Loop forever: compute seconds until the next occurrence of the configured weekday+hour (use `datetime`, handle "today already past that time" by rolling to next week), `await asyncio.sleep(...)`, then run the job.
  - Run `run_weekly_report_job()` via `await asyncio.to_thread(run_weekly_report_job)` (it's sync/blocking due to smtplib + sync HTTP calls) so it never blocks the event loop.
  - Wrap the loop body in try/except so one failed iteration doesn't kill the background task (log and continue to the next iteration).
- Start this as an `asyncio.create_task(...)` inside `lifespan`, store a reference, and cancel it cleanly on shutdown (after `yield`), consistent with existing shutdown handling (`close_openai_client()`).
- Skip starting the task entirely (log an info message) if `YANDEX_METRIKA_TOKEN` is not set — no point scheduling a job that will always no-op.

### 3. Manual test CLI: `scripts/send_metrika_report.py`

- Small script (`py scripts/send_metrika_report.py`) that loads `.env` from repo root and calls `run_weekly_report_job()` once, immediately — for manual verification without waiting for the weekly schedule. Print nothing sensitive; rely on the module's own logging (configure basic logging to console in this script's `__main__` block so log output is visible when run manually).

### 4. `.env.example` already documents the new variables (already updated by orchestrator) — verify it matches the variable names you actually use in code (`YANDEX_METRIKA_TOKEN`, `YANDEX_METRIKA_COUNTER_ID`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `METRIKA_REPORT_RECIPIENTS`, plus new optional `METRIKA_REPORT_WEEKDAY`, `METRIKA_REPORT_HOUR`). Add the two new optional ones to `.env.example` with comments if missing.

### 5. `requirements.txt`

Only add a new dependency if strictly necessary (e.g. if you need `pytz`/timezone handling beyond stdlib `zoneinfo`, which is already available in Python 3.12 — prefer stdlib `zoneinfo` for Europe/Moscow, no new dependency needed for that). Do not add unrelated packages.

## Out of scope

- Modifying `widget/src/*` (F1 already deployed, don't touch).
- Creating goals in Yandex Metrika UI (manual, done by the orchestrator/product owner).
- Week-over-week comparison / trend charts (v1 is a single-period snapshot; note as a possible future enhancement in the report, don't build it now).
- Any new public HTTP endpoint exposing this functionality (CLI script is sufficient for manual testing).
- Deploy, git commit.

## Report

Write `dev documentation/codex/reports/006-weekly-metrika-report.md`:

- Files added/changed.
- Exact env vars used (names only, no values).
- How retries/timeouts/error isolation are implemented (cite specific try/except blocks).
- How the scheduler computes "next Monday 9:00" and how it's started/stopped with app lifespan.
- Confirmation no secrets are logged or hardcoded.
- Manual test instructions: `py scripts/send_metrika_report.py` and what output/log lines to expect on success vs when goals don't exist yet.

## Done when

Code complete, no syntax errors (`py -c "import server"` should succeed, or note if it can't run due to missing OpenAI deps locally — at minimum confirm `py -m py_compile server.py metrika_report.py scripts/send_metrika_report.py` passes), report written.
