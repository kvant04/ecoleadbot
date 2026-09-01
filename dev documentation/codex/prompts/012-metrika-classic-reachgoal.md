# Codex Prompt 012 — Metrika classic reachGoal (zeros fix)

## Role

Coding agent for EcoLeadBot. Fix Yandex Metrika goals stuck at zero because the site uses classic `watch.js` / `yaCounter*` while the widget only calls modern `ym()`. **No git commit. No deploy. No SMTP email to Alisa.**

## Masterplan (patched after critic)

Read and follow: `dev documentation/codex/MASTERPLAN-metrika-zeros.md`

## Required implementation (`widget/src/07-analytics.js`)

1. Keep `dataLayer.push` unchanged.
2. Keep the same 6-goal allowlist (`METRIKA_GOALS`).
3. **XOR reachGoal per counterId per track call:**
   - If `typeof window.ym === "function"` → call only `ym(counterId, "reachGoal", goalName)`.
   - Else if `window["yaCounter" + counterId]` has `reachGoal` → call only that.
   - Never call both for the same id in one track.
4. Use **only** `ECOLEADBOT_CONFIG.yandexMetrikaCounterId` (22994308) as the target counter (detect/wait for that id’s classic object; do not broadcast to every yaCounter on the page).
5. If Metrika not ready yet: pending queue + **retry/poll 2–3 times over ~1–2s**; clear pending after successful fire (dedupe). Optional `yandex_metrika_callbacks` is secondary only.
6. Swallow Metrika errors; never break the widget; no PII in reachGoal params.
7. Bump `WIDGET_VERSION` `1.5.51` → **`1.5.52`** in `widget/src/01-config.js`.
8. Run `py scripts/build_widget.py` (ensure `app.js` and baked `embed.js` VERSION=1.5.52).

## Report

Write `dev documentation/codex/reports/012-metrika-classic-reachgoal.md`:

- Root cause (1–2 sentences)
- Files changed
- XOR + retry behavior
- Version
- Manual test steps on ecolusspb.ru
- Section **«что не удалось»** (required; say if none)

## Out of scope

Deploy, git commit/push, Bitrix template, GTM, goal recreation in Metrika UI, SMTP weekly email send.

## Done when

Code + build + report; version 1.5.52; classic path works without `window.ym`.
