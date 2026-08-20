# MASTERPLAN J: Weekly → marketolog + corporate cycle reports

**Status:** in progress  
**Дата:** 2026-08-17  
**Повод:** Алиса — нет письма; нужен marketolog@; цикличная аналитика (квартал = 3 цикла × 28 дней)

## Corporate calendar

- 1 cycle = **28 days** (4 full weeks)
- 1 corporate quarter = **3 cycles**
- 1 corporate year = **4 quarters** (12 cycles)
- Current corporate quarter **ends 2026-09-10**; next quarter starts **2026-09-11**
- Anchor / Q1 cycles: **2026-06-19…07-16**, **07-17…08-13** (Alisa’s example), **08-14…09-10** (end of quarter)

## Requirements

1. Stop sending to `office@ecolusspb.ru`.
2. Weekly Monday report → include `marketolog@ecolusspb.ru` (keep `kvant04@mail.ru` unless removed in env).
3. Cycle reports: after each cycle ends, email stats for that exact date range; 3 per quarter; dates pre-defined via config.
4. One-shot: send completed cycle 2026-07-17…2026-08-13 if not yet recorded as sent.

## Implementation

### Config

- `.env` / `.env.example`:
  - `METRIKA_REPORT_RECIPIENTS=kvant04@mail.ru,marketolog@ecolusspb.ru`
  - `METRIKA_CYCLE_ANCHOR_START=2026-07-17`
  - `METRIKA_CYCLE_DAYS=28`
  - `METRIKA_CYCLES_PER_QUARTER=3`
  - `METRIKA_CYCLE_REPORT_HOUR=9` (local server time, day after cycle end)
  - Optional: `METRIKA_CYCLE_RECIPIENTS` — if empty, same as weekly recipients
- `data/corporate_cycles.json` — optional explicit list overriding generated cycles for a horizon, e.g.:
  ```json
  {
    "anchor_start": "2026-07-17",
    "cycle_days": 28,
    "cycles_per_quarter": 3,
    "cycles": [
      {"id": "2026-C01", "start": "2026-07-17", "end": "2026-08-13", "quarter": "2026-Q1"},
      {"id": "2026-C02", "start": "2026-08-14", "end": "2026-09-10", "quarter": "2026-Q1"},
      {"id": "2026-C03", "start": "2026-09-11", "end": "2026-10-08", "quarter": "2026-Q1"}
    ]
  }
  ```
  If `cycles` is non-empty, use it; else generate forward from anchor for at least 12 cycles.

### Code (`metrika_report.py`, `server.py`)

1. Refactor `fetch_week_stats` → `fetch_period_stats(counter_id, token, goal_ids, start, end)`.
2. `format_report_text(..., kind="weekly"|"cycle")` — different title lines.
3. `run_weekly_report_job()` — last 7 days inclusive logic as today (or document exact window).
4. `run_cycle_report_job(cycle)` — stats for cycle.start…cycle.end; subject includes cycle id and dates.
5. Cycle calendar helpers + load JSON.
6. State file `data/metrika_report_state.json` (on server): `{ "sent_cycle_ids": ["2026-C01", ...] }` — never resend.
7. Scheduler in `server.py`:
   - Keep weekly Monday loop **or** unify: sleep until earliest of (next weekly slot, next cycle send datetime).
   - Prefer **one unified loop** `_metrika_scheduler_loop` that computes next event.
   - Cycle send datetime = `end + 1 day` at `METRIKA_CYCLE_REPORT_HOUR`.
8. On startup (once): if previous cycle ended and id not in state → send backfill (log clearly).
9. CLI: `scripts/send_metrika_report.py` gains flags `--weekly` / `--cycle YYYY-MM-DD` (start) / `--backfill-due`.

### Ops

- Update `.env` on VPS (recipients + cycle env vars) via deploy `-IncludeEnv` **only if** user allows, else patch recipients in remote `.env` carefully without dumping secrets.
- Deploy code; run one manual weekly + backfill cycle to marketolog.
- Reply text for Alisa.

## Out of scope

- Widget version bump
- GA4
- Changing Metrika goals set

## Success

- [ ] office@ not in recipients
- [ ] marketolog@ receives weekly Mondays
- [ ] Cycle calendar documented; next 3 quarter cycle send dates scheduled
- [ ] Cycle 17.07–13.08 sent once (backfill)
- [ ] No duplicate cycle sends after restart
- [ ] Deployed + Alisa message
