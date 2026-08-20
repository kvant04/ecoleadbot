# F1 — Yandex Metrika goals

## Files changed

- `widget/src/07-analytics.js` — added defensive counter auto-detection and the six-goal allowlist; existing `dataLayer.push` behavior is unchanged.
- `widget/src/01-config.js` — bumped `WIDGET_VERSION` from `1.5.45` to `1.5.46`.
- `app.js` — regenerated with `py scripts/build_widget.py`.
- `dev documentation/codex/reports/005-yandex-metrika-goals.md` — this report.

## Counter auto-detection

`getMetrikaCounterIds()` scans `Object.keys(window)` for keys matching the exact regex `/^yaCounter(\d+)$/`. Each numeric capture is converted with `Number()` and de-duplicated. The result is cached once at least one ID is found; while the cache is empty, the helper may rescan so counters initialized asynchronously after widget startup can be detected.

Tracking first checks `typeof window.ym === "function"`. If the API is unavailable or no counters are detected, no Metrika call is made.

## Goal allowlist

| Internal `track()` event | Metrika goal |
| --- | --- |
| `widget_opened` | `ecoleadbot_widget_opened` |
| `quiz_started` | `ecoleadbot_quiz_started` |
| `mini_result_viewed` | `ecoleadbot_mini_result_viewed` |
| `contact_form_viewed` | `ecoleadbot_contact_form_viewed` |
| `lead_submitted` | `ecoleadbot_lead_submitted` |
| `rag_question_submitted` | `ecoleadbot_rag_question_submitted` |

Only these six events call `window.ym(counterId, "reachGoal", goalName)`. No event data or potentially identifying parameters are sent to Metrika.

## Safety checks

- No counter ID is hardcoded anywhere in `widget/src` or `app.js`; only the generic `yaCounter` key pattern is present.
- Counter scanning and every Metrika call are wrapped defensively. Exceptions are swallowed, with no production console output.
- The existing dataLayer event and payload flow remains intact.

## Version and build

- Widget version: `1.5.46`.
- Build: `py scripts/build_widget.py` — passed; `app.js` regenerated from 27 source fragments.
- Syntax check: `node --check app.js` — passed.
- No deploy or git commit performed.

## Manual verification

1. Open `https://ecolusspb.ru` with DevTools.
2. Confirm that a loaded counter is exposed as `window.yaCounterXXXXXXX` (the digits depend on the marketer's configured counter).
3. Confirm `typeof window.ym === "function"`.
4. Open the EcoLeadBot widget and verify the corresponding `ecoleadbot_widget_opened` event in `window.dataLayer`.
5. In DevTools, temporarily observe/call behavior through the loaded Metrika counter or use the Metrika realtime goals/report interface to confirm `ecoleadbot_widget_opened` is received.
6. Repeat the funnel actions for the other five allowlisted events and check the corresponding Metrika realtime report. Goal processing can be delayed by Metrika.

