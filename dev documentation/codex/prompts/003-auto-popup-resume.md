# Codex Prompt 003 — Auto-popup without mid-flow resume

## Role

Coding agent for EcoLeadBot. Fix aggressive auto-open that restores mid-quiz results in the center of the page. No git commit. Deploy is allowed only if this prompt says so — **this prompt: deploy AFTER build if changes look correct; orchestrator may also deploy.** Prefer: implement + build + report; orchestrator deploys.

Actually: **no deploy in this prompt** — orchestrator deploys after review.

## Product decisions (locked)

- Keep time auto-popup (~45s) and scroll auto-popup.
- Keep exit-intent banner (top-right).
- Do **not** disable `enableAutoPopup` globally.
- Auto/scroll must **never** resume mid-flow screens (mini_result, questions, rag_answer, contact, etc.).
- Session resume mid-flow is OK only when user **explicitly clicks** floating widget / inline CTA / exit-banner CTA.

## Masterplan

`dev documentation/codex/MASTERPLAN-auto-popup-resume.md`

## Required changes

### 1. Split open vs resume (`widget/src/13-popup.js` or equivalent)

- Add something like `openPopup(entryType, trigger, options)` where `options.resume !== false` by default for user clicks.
- For `auto_popup` and `scroll_popup` (and any non-click auto path): call with **`resume: false`**.
- When `resume: false`:
  - Do **not** call `routeOnOpen()` resume paths for mid-flow screens.
  - Show **intro** (`renderIntro()`), and reset navigation cursor enough so intro is coherent (e.g. set `current_screen` appropriately for intro / clear mid-flow display state without wiping entire localStorage session if avoidable — prefer soft reset for UI: `current_screen` to intro-friendly state, `question_index` 0 if starting fresh intro). Document choice in report.
- User-initiated opens (`floating_widget`, `inline_cta`, `exit_popup` from banner CTA, etc.): keep current `routeOnOpen()` resume behavior.

### 2. `beforeunload` cooldown (`widget/src/22-init.js`)

If overlay is open (not hidden) on unload/refresh:

- Set `state.popup_closed_at = now()` (same idea as `closePopup` cooldown).
- Persist so `inCooldown()` blocks auto/scroll/exit for `cooldownMinutes` after F5.

Do not break existing partial-save logic.

### 3. Auto triggers (`widget/src/21-auto-popup.js`)

- Keep timers/scroll/exit-banner as now.
- Ensure `openPopup("auto_popup"…)` / `scroll_popup` pass **no-resume**.
- Exit **banner** show stays as is; opening full popup from banner CTA must **allow resume** (user intent).

### 4. Version + build

- Bump `WIDGET_VERSION` patch (current should be `1.5.42` → `1.5.43`).
- `py scripts/build_widget.py`.

## Out of scope

- Disabling `enableAutoPopup`
- CSS isolation / copy text
- Changing cooldown duration unless needed for the unload fix

## Report

Write `dev documentation/codex/reports/003-auto-popup-resume.md`:

- Files changed
- How resume is gated (auto vs click)
- What beforeunload does
- New version
- Build result
- Suggested manual test steps for Alisa

## Done when

Code + build + report complete.
