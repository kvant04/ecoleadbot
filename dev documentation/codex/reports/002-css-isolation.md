# Report 002 — CSS isolation

## Files created/changed

- Created `demo-host.css` with the demo page's global, `.site-*`, and `.article-*` rules.
- Updated `styles.css` so it contains widget styles only.
- Updated `index.html` to load `demo-host.css` first and `styles.css` second.
- Updated `deploy/deploy.ps1` to include `demo-host.css` in the root deployment package.
- Updated `widget/src/01-config.js` and rebuilt `app.js`.
- Updated `widget/src/22-init.js` with idempotent widget stylesheet auto-injection.

## CSS isolation

Confirmed that `styles.css` has no top-level `body`, universal `*`, `.site-header`, `.site-main`, `.site-footer`, or `.article-*` selectors. The widget-scoped rule remains:

```css
.ecoleadbot-root *,
.ecoleadbot-root *::before,
.ecoleadbot-root *::after { box-sizing: border-box; }
```

The former demo rules are present in `demo-host.css`.

## CSS auto-inject

Added. On initialization, the widget resolves `styles.css` using `resolveDataUrl()`, checks existing stylesheet links after removing query/hash parts, and injects one link only when the matching stylesheet is absent. It never injects `demo-host.css`.

## Version and build

- New `WIDGET_VERSION`: `1.5.42`.
- Build: `py scripts/build_widget.py` — passed; rebuilt `app.js` from 27 fragments (`212886` bytes).
- JavaScript syntax check: `node --check app.js` — passed.

## Exact HTML snippet for Andrey

Bitrix should link the widget stylesheet only; do not link `demo-host.css`:

```html
<link rel="stylesheet" href="https://elb.ecolusspb.ru/styles.css?v=1.5.42" />
<script src="https://elb.ecolusspb.ru/elb-config.js"></script>
<script src="https://elb.ecolusspb.ru/app.js?v=1.5.42" defer></script>
```
