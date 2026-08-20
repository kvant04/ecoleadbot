# Codex Prompt 010 — Metrika weekly recipients + corporate cycle reports

## Role

Coding agent for EcoLeadBot. Extend Metrika email reporting: fix recipients, add corporate cycle reports. **No git commit.** Deploy is for the orchestrator after review (you may update local `.env` recipients; do **not** print secret values).

## Masterplan

`dev documentation/codex/MASTERPLAN-cycle-reports.md`

## Corporate calendar (fixed)

- 1 cycle = 28 days (inclusive start…end = 28 calendar days → end = start + 27 days).
- 1 quarter = 3 cycles; 1 year = 12 cycles.
- Anchor: **2026-07-17** → first cycle **2026-07-17 … 2026-08-13**.

## Required code changes

### 1. `metrika_report.py`

- Replace week-only fetch with `fetch_period_stats(..., start: date, end: date)`.
- Keep `fetch_week_stats` as a thin wrapper **or** inline last-7-days in `run_weekly_report_job` using `date.today()` window consistent with current behavior (last 7 days ending today).
- `format_report_text(stats, period_label, kind="weekly"|"cycle")` — Russian titles differ:
  - weekly: «Еженедельный отчёт…»
  - cycle: «Отчёт за корпоративный цикл…» (+ optional quarter id if present)
- `load_corporate_cycles()`:
  - Read `data/corporate_cycles.json` if present.
  - If file has non-empty `cycles`, use those.
  - Else generate ≥12 cycles from `METRIKA_CYCLE_ANCHOR_START` (default `2026-07-17`) and `METRIKA_CYCLE_DAYS` (default 28), with ids `YYYY-Cnn` and quarter labels every 3 cycles (`cycles_per_quarter` default 3).
- State helpers: load/save `data/metrika_report_state.json` with `sent_cycle_ids: list[str]` (create dir/file safely; never log secrets).
- `run_cycle_report_job(cycle: dict) -> bool`: fetch period, email, mark id sent only after successful SMTP send; return whether sent.
- `run_due_cycle_reports(now: datetime | None = None) -> int`: for each cycle whose **send date** is `end + 1 day` at/before `now` (date part ≤ today and hour reached OR simply date ≤ today when called from scheduler morning), and id not in state → send. Also used for backfill of past due cycles (e.g. C01 ended 2026-08-13 → due since 2026-08-14).
- `next_cycle_report_at(now: datetime) -> datetime | None`: next future send slot among cycles.
- `send_report_email`: unchanged SMTP; recipients from env (see below). Optional override list param only if clean; otherwise one env is enough.
- Recipients: read `METRIKA_REPORT_RECIPIENTS`. Document that `office@` must not be listed. If `METRIKA_CYCLE_RECIPIENTS` set, cycle jobs use that; else same as weekly.

### 2. `data/corporate_cycles.json`

Create with explicit first quarter (so Alisa’s dates are “pre-written”):

```json
{
  "anchor_start": "2026-07-17",
  "cycle_days": 28,
  "cycles_per_quarter": 3,
  "cycles": [
    {"id": "2026-C01", "start": "2026-07-17", "end": "2026-08-13", "quarter": "2026-Q1"},
    {"id": "2026-C02", "start": "2026-08-14", "end": "2026-09-10", "quarter": "2026-Q1"},
    {"id": "2026-C03", "start": "2026-09-11", "end": "2026-10-08", "quarter": "2026-Q1"},
    {"id": "2026-C04", "start": "2026-10-09", "end": "2026-11-05", "quarter": "2026-Q2"},
    {"id": "2026-C05", "start": "2026-11-06", "end": "2026-12-03", "quarter": "2026-Q2"},
    {"id": "2026-C06", "start": "2026-12-04", "end": "2026-12-31", "quarter": "2026-Q2"},
    {"id": "2026-C07", "start": "2027-01-01", "end": "2027-01-28", "quarter": "2026-Q3"},
    {"id": "2026-C08", "start": "2027-01-29", "end": "2027-02-25", "quarter": "2026-Q3"},
    {"id": "2026-C09", "start": "2027-02-26", "end": "2027-03-25", "quarter": "2026-Q3"},
    {"id": "2026-C10", "start": "2027-03-26", "end": "2027-04-22", "quarter": "2026-Q4"},
    {"id": "2026-C11", "start": "2027-04-23", "end": "2027-05-20", "quarter": "2026-Q4"},
    {"id": "2026-C12", "start": "2027-05-21", "end": "2027-06-17", "quarter": "2026-Q4"}
  ]
}
```

Verify each cycle is exactly 28 days inclusive before writing. Fix dates if arithmetic is wrong.

### 3. `server.py` scheduler

Replace weekly-only loop with a unified loop:

1. Compute `next_weekly = _next_metrika_report_at(now)`.
2. Compute `next_cycle = next_cycle_report_at(now)` from `metrika_report`.
3. Sleep until the earlier one.
4. When waking: if weekly due → `run_weekly_report_job()`; always also call `run_due_cycle_reports()` (cheap no-op if nothing due). Or run only the due event type — but `run_due_cycle_reports` must catch backfills safely via state file.
5. On startup before loop (or first iteration): call `run_due_cycle_reports()` once so C01 backfill goes out after deploy.

Do not crash the app if Metrika/SMTP fails.

### 4. `.env.example`

Document new vars: `METRIKA_CYCLE_ANCHOR_START`, `METRIKA_CYCLE_DAYS`, `METRIKA_CYCLES_PER_QUARTER`, `METRIKA_CYCLE_REPORT_HOUR`, `METRIKA_CYCLE_RECIPIENTS` (optional), note about `data/corporate_cycles.json` and state file.

### 5. Local `.env` (no secrets in logs/report)

Update **only** `METRIKA_REPORT_RECIPIENTS` to:

`kvant04@mail.ru,marketolog@ecolusspb.ru`

(Remove `office@ecolusspb.ru`.) Do not echo SMTP passwords.

### 6. `scripts/send_metrika_report.py`

Support:

- default / `--weekly` → weekly job
- `--due-cycles` → `run_due_cycle_reports()`
- `--cycle-id 2026-C01` → force one cycle (still respect “already sent”? Prefer: force send and mark sent; document in report)

## Report

Write `dev documentation/codex/reports/010-cycle-reports.md`:

- Files changed
- Exact cycle table (id, start, end, send date)
- Recipients change
- How idempotency works
- Manual test commands
- Confirmation office@ removed from local `.env` recipients line (show new line only)

## Out of scope

- Deploy (orchestrator)
- Widget / RAG
- Git commit

## Done when

Code + JSON calendar + `.env.example` + local recipients updated + report written; `py -m py_compile` on touched Python files succeeds.
