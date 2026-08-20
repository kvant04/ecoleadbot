# Step 1 — Copy fixes (A) + exit-banner lower (B)

## Files changed

- `widget/src/11-static-dom.js` — A1.
- `widget/src/16c-rag-ui.js` — A2.
- `widget/src/15-screens.js` — A3 and A4.
- `styles.css` — B.
- `widget/src/01-config.js` — version bump.
- `app.js` — rebuilt artifact.

## Before / after

| ID | Before | After |
|---|---|---|
| A1 | `Уходите? За 2 минуты — что нужно по экологии` | `Уходите? Узнайте за 2 минуты — что нужно по экологии` |
| A2 | `Отвечу по базе знаний компании и нормативным документам. Если вопрос сложный — предложу консультацию специалиста.` | `Отвечу на основании базы знаний и нормативных документов. Если вопрос сложный — предложу консультацию специалиста.` |
| A3 | `Для подготовки к разговору с нашим специалистом` | `Для подготовки к разговору с нашим специалистом могут понадобиться:` |
| A4 | `Оставьте контакты — специалист уточнит детали по вашему объекту` | `Оставьте контакты для более предметного разговора с нашим специалистом` |
| B | `.ecoleadbot-exit-banner { top: 12px; }` | `.ecoleadbot-exit-banner { top: calc(72px + env(safe-area-inset-top, 0px)); }` |

Exit-banner `right`, width, z-index, mobile `display: none`, and visible-state `transform: translateY(0)` remain unchanged.

## Version and build

`WIDGET_VERSION`: `1.5.40` → `1.5.41` (`widget/src/01-config.js:34`; built artifact: `app.js:47`).

Build command:

```text
py scripts/build_widget.py
```

Result: `Built ... app.js from 27 fragments (211811 bytes)`.

## Grep proof

New strings are present in both sources and the built artifact:

- A1: `widget/src/11-static-dom.js:63`, `app.js:2600`
- A2: `widget/src/16c-rag-ui.js:47-48`, `app.js:4110`
- A3: `widget/src/15-screens.js:544`, `app.js:3615`
- A4: `widget/src/15-screens.js:515`, `app.js:3586`
- B: `styles.css:156`
- Visible state: `styles.css:172`; mobile hide: `styles.css:230`

Exact old A1, A2, and A4 strings are absent from sources and `app.js`; the old A3 title literal is replaced by the new title with the required suffix.
