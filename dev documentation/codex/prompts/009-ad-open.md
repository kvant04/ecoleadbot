# Codex Prompt 009 — Ad deep-link `?elb_open=1`

## Role

Coding agent for EcoLeadBot. Add URL deep-link that opens the widget popup immediately for Yandex Direct / ads. **No git commit.** Orchestrator deploys after review.

## Masterplan

`dev documentation/codex/MASTERPLAN-ad-open.md`

## Required behavior

1. After `buildDom()` / when the overlay exists (in `init` or `setupAutoTriggers`), if the page query has **`elb_open=1`** OR **`ecoleadbot_open=1`**:
   - Call `openPopup("direct", "url_open", { resume: false })` so the user sees **intro**, not a resumed mid-flow screen.
   - Set `autoTriggerUsed = true` so the 45s / scroll auto-open does not open a second time.
   - **Bypass** `inCooldown()` for this deep-link open (ad click must always show the bot).
   - If the overlay is already open, do nothing extra.
2. Helper e.g. `shouldOpenFromUrl()` reading `URLSearchParams` (guard try/catch like `detectTestBuild`).
3. Do not remove UTM params; do not rewrite the browser URL unless necessary (prefer leave query as-is).
4. No change to normal auto-popup / exit-banner rules when the param is absent.

## Version + build

- Bump `WIDGET_VERSION` `1.5.47` → `1.5.48`.
- `py scripts/build_widget.py`.

## Report

Write `dev documentation/codex/reports/009-ad-open.md`: files, param names, entry_type/trigger, version, manual test (`?elb_open=1` vs clean load).

## Out of scope

Deploy, git commit, Bitrix template edits, new landing HTML page.

## Done when

Code + build + report; version `1.5.48`.
