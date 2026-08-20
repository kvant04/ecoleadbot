# Report 003 — Auto-popup without mid-flow resume

## Files changed

- `widget/src/13-popup.js` — split popup opening behavior with an optional `options.resume` flag.
- `widget/src/21-auto-popup.js` — time and scroll auto-open pass `{ resume: false }`; exit-banner CTA keeps the default resume behavior.
- `widget/src/22-init.js` — `beforeunload` records `popup_closed_at` when the overlay is open, while preserving partial-save behavior.
- `widget/src/01-config.js` — bumped `WIDGET_VERSION` to `1.5.43`.
- `app.js` — rebuilt deploy artifact.

## Resume gating

`openPopup(entryType, trigger, options)` resumes the saved screen by default (`options.resume !== false`). Explicit user opens from the floating widget, inline CTA, and exit-banner CTA therefore retain session resume.

Time and scroll auto-open pass `resume: false`. These paths show `renderIntro()` and softly reset only the UI cursor (`current_screen: "intro"`, `question_index: 0`). The rest of the session data is preserved, so the auto popup cannot display `mini_result`, quiz questions, RAG screens, contact screens, or another mid-flow screen.

## `beforeunload`

When the overlay is visible during refresh/navigation, the handler sets `state.popup_closed_at = now()` and persists it. This allows the existing `inCooldown()` check to block time, scroll, and exit-intent auto triggers after F5. Existing partial-save logic remains in place.

## Version and build

- Widget version: `1.5.44`.
- Build command: `py scripts/build_widget.py`.
- Result: successful; `app.js` built from 27 fragments.
- Verification: `node --check app.js` passed.

## Suggested manual test steps for Alisa

1. Clear the widget session once, open the site, and do not click the widget. Wait for the time popup or scroll to the trigger threshold: popup should open on the intro screen.
2. Start the quiz, reach a question or `mini_result`, close/refresh with the popup open, and wait for an auto trigger: it should be blocked by cooldown and must not reopen the saved mid-flow screen.
3. After cooldown, click the floating widget: the saved screen should resume.
4. Show the top-right exit-intent banner. Click its CTA: it should open the full popup and allow resume.
5. Confirm that closing the popup and refreshing still preserves the normal partial session save behavior.

## 003b fix — preserve the resume cursor during auto-open

The auto-open path now renders the intro for that opening without persisting an
`intro` cursor. It saves and restores the previous `current_screen` and
`question_index` around `renderIntro()`, so closing an untouched auto-open still
leaves `mini_result`, a question, or another resumable screen available to the
next explicit floating-widget click.

`beforeunload` remains compatible with this soft reset: while the overlay is
visible it sets `popup_closed_at` before the existing `persist()` call, which
stores both the cooldown timestamp and the restored resume cursor.

- Widget version: `1.5.44`.
