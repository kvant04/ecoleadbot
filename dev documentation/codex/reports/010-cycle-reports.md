# Cycle reports implementation report

## Files changed

- metrika_report.py — arbitrary-period statistics, weekly wrapper, cycle calendar/state helpers, cycle delivery and due/next scheduling.
- server.py — unified weekly/cycle scheduler with startup backfill.
- scripts/send_metrika_report.py — default/--weekly, --due-cycles, and forced --cycle-id modes.
- data/corporate_cycles.json — explicit twelve-cycle corporate year.
- .env.example — cycle variables, calendar/state documentation, and recipient warning.
- .env — only METRIKA_REPORT_RECIPIENTS was changed.

## Exact cycle table

| ID | Start | End | Send date (09:00 local) |
|---|---|---|---|
| 2026-C01 | 2026-07-17 | 2026-08-13 | 2026-08-14 |
| 2026-C02 | 2026-08-14 | 2026-09-10 | 2026-09-11 |
| 2026-C03 | 2026-09-11 | 2026-10-08 | 2026-10-09 |
| 2026-C04 | 2026-10-09 | 2026-11-05 | 2026-11-06 |
| 2026-C05 | 2026-11-06 | 2026-12-03 | 2026-12-04 |
| 2026-C06 | 2026-12-04 | 2026-12-31 | 2027-01-01 |
| 2026-C07 | 2027-01-01 | 2027-01-28 | 2027-01-29 |
| 2026-C08 | 2027-01-29 | 2027-02-25 | 2027-02-26 |
| 2026-C09 | 2027-02-26 | 2027-03-25 | 2027-03-26 |
| 2026-C10 | 2027-03-26 | 2027-04-22 | 2027-04-23 |
| 2026-C11 | 2027-04-23 | 2027-05-20 | 2027-05-21 |
| 2026-C12 | 2027-05-21 | 2027-06-17 | 2027-06-18 |

Every range was verified as exactly 28 calendar days inclusive.

## Recipients

Weekly recipients now include marketolog and exclude office. Cycle reports use METRIKA_CYCLE_RECIPIENTS when non-empty, otherwise the weekly list.

`METRIKA_REPORT_RECIPIENTS=kvant04@mail.ru,marketolog@ecolusspb.ru`

Confirmed: office@ was removed from the local .env recipients line. No other local .env line was intentionally changed.

## Idempotency

Sent cycle IDs are stored in data/metrika_report_state.json under sent_cycle_ids. Due processing skips recorded IDs. State is written atomically only after SMTP reports success. Startup due processing backfills C01 after deployment if it is not recorded. `--cycle-id` intentionally force-sends the selected configured cycle even if already recorded, then ensures its ID is recorded.

## Manual test commands

```powershell
py -m py_compile metrika_report.py server.py scripts/send_metrika_report.py
py scripts/send_metrika_report.py --help
py scripts/send_metrika_report.py --weekly
py scripts/send_metrika_report.py --due-cycles
py scripts/send_metrika_report.py --cycle-id 2026-C01
```

The last three commands send real email when credentials are configured; they were not executed during implementation.
