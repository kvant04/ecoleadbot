# Codex Prompt 002 — CSS isolation (block C)

## Role

Coding agent for EcoLeadBot. Implement CSS isolation so embedding `styles.css` on ecolusspb.ru no longer overrides host site styles. No git commit. No deploy (orchestrator deploys after review).

## Masterplan

`dev documentation/codex/MASTERPLAN.md` — block **C**, steps 3–5 combined.

## Problem

`styles.css` starts with **global** demo-host rules that break ecolusspb.ru when Bitrix links `https://elb.ecolusspb.ru/styles.css`:

- `* { box-sizing: border-box; }`
- `body { margin, font-family, color, background, line-height }`
- `.site-header`, `.site-main`, `.article-content`, `.site-footer`, etc.

Widget rules (`.ecoleadbot-*`) are already prefixed. Demo page `index.html` currently has a single `<link href="styles.css">`.

`app.js` does **not** inject CSS today — host must `<link>` the stylesheet.

## Required implementation

### 1. Split CSS

- Create **`demo-host.css`**: move all demo/global rules from the top of `styles.css` (`*`, `body`, `.site-*`, `.article-*`, etc.).
- Keep **`styles.css`** = **widget-only** styles (everything under `.ecoleadbot-*` / widget comments). No bare `body`, no universal `*`, no `.site-*`.
- Widget already has `.ecoleadbot-root *, .ecoleadbot-root *::before, .ecoleadbot-root *::after { box-sizing: border-box; }` — keep that; do **not** reintroduce global `*`.

### 2. Wire demo page

In **`index.html`**:

```html
<link rel="stylesheet" href="demo-host.css" />
<link rel="stylesheet" href="styles.css" />
```

(demo first, then widget)

### 3. Embed path (Bitrix)

- Prefer: Bitrix keeps linking **`styles.css` only** (now safe). Document in report the exact snippet for Andrey, including cache bust, e.g.:

```html
<link rel="stylesheet" href="https://elb.ecolusspb.ru/styles.css?v=1.5.42" />
<script src="https://elb.ecolusspb.ru/elb-config.js"></script>
<script src="https://elb.ecolusspb.ru/app.js?v=1.5.42" defer></script>
```

- Optional hardening (recommended if easy): in `widget/src` init, **idempotently inject** `styles.css` via `<link>` resolved with `getAssetBaseUrl()` / `resolveDataUrl("styles.css")` if no existing link to ecoleadbot styles is found. Avoid double-loading if a matching link already exists. Do **not** inject `demo-host.css` on embed.

### 4. Deploy packaging

Ensure `demo-host.css` is included if deploy packs CSS from repo root (check `deploy/deploy.ps1` `includeItems` — add `demo-host.css` if only `styles.css` is listed today). Demo file needed on VPS for `index.html` demo; Bitrix does not need it.

### 5. Version + build

- Bump `WIDGET_VERSION` in `widget/src/01-config.js` (e.g. `1.5.41` → `1.5.42`).
- Run `py scripts/build_widget.py`.

### 6. Sanity check

- Grep `styles.css`: must **not** match `^body\s*\{` or a top-level `* {` or `.site-header`.
- Grep `demo-host.css`: must contain former demo rules.
- Demo `index.html` still loads both files.

## Out of scope

- Shadow DOM
- Redesign
- Deploy / SSH
- Changing Bitrix yourself

## Report

Write `dev documentation/codex/reports/002-css-isolation.md` with:

- Files created/changed
- Confirmation no global `body`/`*`/`.site-*` in `styles.css`
- Whether CSS auto-inject was added
- New `WIDGET_VERSION`
- Build result
- Exact HTML snippet for Andrey (JS + CSS with `?v=`)

## Done when

Split done, demo wired, embed-safe `styles.css`, version bumped, built, report written.
