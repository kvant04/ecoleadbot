# Codex Prompt 003b — Fix: auto-open must not wipe resume cursor

## Role

Hotfix after 003. No deploy in this prompt. No git commit.

## Bug

In `widget/src/13-popup.js`, when `resume: false` (auto/scroll), the code does:

```js
state.current_screen = "intro";
state.question_index = 0;
persist();
renderIntro();
```

This **overwrites** the saved mid-flow screen in `localStorage`. After auto-open, a later **click** on the floating widget can no longer resume `mini_result` / questions — contradicts product rule and report 003 claim: "After cooldown, click the floating widget: the saved screen should resume."

## Required fix

When `options.resume === false`:

1. Show intro for this open only (`renderIntro()`).
2. **Do not** persist a change that destroys the previous `current_screen` / `question_index` used for resume.
3. Prefer: leave stored resume cursor intact; only render intro visually. If `renderIntro()` itself writes `current_screen`/`persist`, adjust so auto path does not wipe resume — e.g. restore previous screen/index into state after renderIntro for persistence purposes, or teach renderIntro a flag `persistScreen: false`, or save/restore around the call.

Recommended pattern:

```js
} else {
  // Show intro without destroying resumable mid-flow cursor in session.
  var resumeScreen = state.current_screen;
  var resumeIndex = state.question_index;
  renderIntro(); // may set intro in memory for UI
  state.current_screen = resumeScreen;
  state.question_index = resumeIndex;
  persist(); // keep mid-flow cursor; entry_type/trigger already persisted above
}
```

Or cleaner if `renderIntro` always persists intro — then restore after:

```js
} else {
  var resumeScreen = state.current_screen;
  var resumeIndex = state.question_index;
  renderIntro();
  state.current_screen = resumeScreen;
  state.question_index = resumeIndex;
  persist();
}
```

Ensure: while intro is shown, UI works (buttons start quiz etc.). When user starts a new flow from auto-intro, normal navigation may overwrite cursor — that's OK. When user **closes** without interacting, next **click** must still resume previous mid-flow.

Also verify `beforeunload` still persists `popup_closed_at` when overlay open (already in 003) — if soft-reset restore leaves `current_screen` as mini_result, persist still must include `popup_closed_at`. Quick check that branch.

## Also

- Bump `WIDGET_VERSION` `1.5.43` → `1.5.44`
- `py scripts/build_widget.py`
- Update report `dev documentation/codex/reports/003-auto-popup-resume.md` with a short "003b fix" section, or write `003b-auto-popup-resume-cursor.md`

## Done when

Click resume still works after a no-resume auto-open that was closed; auto never shows mid-flow; build OK.
