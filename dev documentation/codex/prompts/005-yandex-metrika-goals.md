# Codex Prompt 005 — Yandex Metrika goals (F1)

## Role

Coding agent for EcoLeadBot. Add direct Yandex Metrika goal tracking so key funnel events are visible in Metrika without needing GTM configuration. No git commit. **No deploy** — orchestrator deploys after review.

## Masterplan

`dev documentation/codex/MASTERPLAN-analytics.md` (block F1).

## Context

- `widget/src/07-analytics.js` has `track(event, data)` which pushes `{ event: "ecoleadbot_" + event, ...data }` to `window.dataLayer`. Keep this untouched — it's used for GTM/future GA4.
- The host site (`ecolusspb.ru`) already has Yandex Metrika loaded (via GTM or inline) — `window.ym` is a global function once Metrika's tag has loaded: `ym(counterId, "reachGoal", goalName, params)`.
- We do **not** know for certain which counter ID the marketer (Alisa) actually monitors, and we must **not hardcode** a counter ID in the widget. Yandex Metrika's snippet registers loaded counters; auto-detect at runtime instead (see below).
- This must be defensive: if `window.ym` doesn't exist yet, or Metrika hasn't finished loading, or counter id can't be found, tracking must fail silently (no console errors, no thrown exceptions bubbling up, no impact on the rest of the widget).

## Required change

### 1. Counter auto-detection (new small helper, e.g. in `widget/src/07-analytics.js`)

Yandex Metrika exposes loaded counter objects at `window["yaCounter" + counterId]` for every counter that has initialized on the page (standard Metrika behavior). Implement a helper that:

1. Scans `window` keys matching `/^yaCounter(\d+)$/` and collects the numeric counter ids found.
2. Caches the result (recompute only if none found yet, since Metrika may load asynchronously after our script runs — don't scan on every single `track()` call forever; simple lazy re-scan is fine, e.g. only rescan if cache is empty).
3. Returns an array of counter ids (could be empty, one, or multiple).

Do not add any new config field that stores a hardcoded counter id. Do not fetch or guess ids from the page URL, cookies, or network calls — window-object scan only.

### 2. Fire goals for a curated key-event allowlist only

Do **not** forward all ~50 `track()` events to Metrika goals (avoid spam / goal-limit issues in Metrika). Add an allowlist of exactly these 6 (map internal event name -> Metrika goal name; keep goal names short, ASCII, consistent prefix):

| internal `track()` event | Metrika goal name |
|---|---|
| `widget_opened` | `ecoleadbot_widget_opened` |
| `quiz_started` | `ecoleadbot_quiz_started` |
| `mini_result_viewed` | `ecoleadbot_mini_result_viewed` |
| `contact_form_viewed` | `ecoleadbot_contact_form_viewed` |
| `lead_submitted` | `ecoleadbot_lead_submitted` |
| `rag_question_submitted` | `ecoleadbot_rag_question_submitted` |

Inside `track(event, data)`, after the existing `dataLayer.push`, if `event` is in the allowlist:

- For each detected counter id, call `window.ym(counterId, "reachGoal", goalName)` wrapped in try/catch (Metrika API can throw if misused; never let this break the widget).
- Do not pass full `data` payload as Metrika goal params (avoid leaking PII like phone/session details into Metrika); at most pass small non-PII fields already safe for dataLayer if genuinely useful, but simplest and safest is to pass no params for v1.

### 3. Guard conditions

- Skip entirely if `typeof window.ym !== "function"`.
- Skip entirely if no counter ids detected (don't throw, don't log to console in production — a single `console.debug` guarded by `IS_TEST_BUILD` is fine for local debugging, nothing in production console).

## Version + build

- Bump `WIDGET_VERSION` `1.5.45` → `1.5.46`.
- `py scripts/build_widget.py`.
- `node --check app.js`.

## Report

Write `dev documentation/codex/reports/005-yandex-metrika-goals.md`:

- Files changed.
- How counter auto-detection works (exact regex / window scan logic).
- The 6-event allowlist mapping (internal event -> Metrika goal name).
- Confirmation that no counter id is hardcoded anywhere in `widget/src` or `app.js`.
- Confirmation that failures are silent (no thrown errors, no console noise in production).
- Version + build result.
- Manual test steps: how to verify goals fire (e.g. open devtools on `ecolusspb.ru`, check `window.yaCounterXXXXXXX`, trigger `ecoleadbot_widget_opened` by opening the bot, check Metrika "Вебвизор"/"Цели" realtime report).

## Out of scope

- Server-side weekly email digest (separate future block F2 — needs Yandex Metrika API token + SMTP credentials from the product owner, not available yet).
- GTM configuration, GA4.
- Changing which events exist in `track()` calls elsewhere in the codebase.
- Deploy, git commit.

## Done when

Code + build + report complete; version `1.5.46`; no hardcoded counter id anywhere.
