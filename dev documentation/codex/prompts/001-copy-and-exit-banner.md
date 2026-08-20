# Codex Prompt 001 — Copy fixes (A) + exit-banner lower (B)

## Role

Coding agent for EcoLeadBot. Minimal edits only. No commit. No deploy.

## Masterplan

`dev documentation/codex/MASTERPLAN.md` — **Step 1** (blocks A + B).

## A — Copy

### `widget/src/11-static-dom.js`

- From: `Уходите? За 2 минуты — что нужно по экологии`
- To: `Уходите? Узнайте за 2 минуты — что нужно по экологии`

### `widget/src/16c-rag-ui.js`

- From: `Отвечу по базе знаний компании и нормативным документам. Если вопрос сложный — предложу консультацию специалиста.`
- To: `Отвечу на основании базы знаний и нормативных документов. Если вопрос сложный — предложу консультацию специалиста.`

### `widget/src/15-screens.js`

Checklist title:

- From: `Для подготовки к разговору с нашим специалистом`
- To: `Для подготовки к разговору с нашим специалистом могут понадобиться:`

`buildMiniNextSteps()` item 3:

- From: `Оставьте контакты — специалист уточнит детали по вашему объекту`
- To: `Оставьте контакты для более предметного разговора с нашим специалистом`

## B — Exit banner position

### `styles.css`

`.ecoleadbot-exit-banner`:

- From: `top: 12px;`
- To: `top: calc(72px + env(safe-area-inset-top, 0px));`

Keep `right`, width, z-index, mobile `display: none`. Visible state must stay `transform: translateY(0)`.

## Version + build

- Bump `WIDGET_VERSION` in `widget/src/01-config.js` (patch +1).
- Run `py scripts/build_widget.py`.
- Confirm new strings and new `top` value appear in built artifacts / sources as expected.

## Out of scope

- CSS isolation / splitting demo globals (MASTERPLAN block C)
- Deploy

## Report

Write `dev documentation/codex/reports/001-copy-and-exit-banner.md`:

- Files changed
- Before/after for A1–A4 and B
- New `WIDGET_VERSION`
- Build result
- Grep proof in `app.js` / `styles.css`

## Done when

A+B done, version bumped, built, report written.
