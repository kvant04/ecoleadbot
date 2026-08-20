# Codex Prompt 004 — Mobile close + catalog load (Alisa P0)

## Role

Coding agent for EcoLeadBot. Implement mobile close UX + resilient catalog loading. No git commit. **No deploy** — orchestrator deploys after review.

## Masterplan

`dev documentation/codex/MASTERPLAN-mobile-close-catalog.md`

## Context (do not ignore)

- Embed on `ecolusspb.ru` loads widget from `https://elb.ecolusspb.ru/`.
- Catalog JSON lives only on elb (`/data/...`); host origin returns 404.
- Screenshot: site header still visible while bot content shows — overlay often not true fullscreen; × hidden under Bitrix sticky header.
- `ASSET_BASE_URL` already captured at script parse time in `widget/src/02-data-layer.js` — keep it; add config fallback.

## E1 — Mobile close (P0)

Files: `widget/src/11-static-dom.js`, `widget/src/15-screens.js` (error/intro), `styles.css` (source of truth for widget CSS — same file used in deploy).

1. Make popup chrome always closable on mobile:
   - Sticky header row inside `.ecoleadbot-popup`: logo + large close control (min 44×44 tap target).
   - Close button must stay visible while body scrolls (`position: sticky` on header bar OR keep absolute close but ensure header bar has opaque background and high z-index).
   - Prefer restructuring so `.ecoleadbot-header` is a sticky top bar containing logo + close (move close into header if cleaner than absolute-only).
2. On `renderDocumentCatalogError`: add buttons **«Повторить»** (retry `openDocumentBranch` / `ensureCatalogThen`) and **«Закрыть»** (`closePopup`). Keep existing main-flow / RAG buttons.
3. On intro (`renderIntro`): add a compact text/secondary control **«Закрыть»** that calls `closePopup` (mobile escape hatch).
4. CSS mobile (`max-width: 767px`):
   - `.ecoleadbot-overlay { position: fixed !important; inset: 0 !important; z-index: 2147483646; }`
   - popup fullscreen; safe-area padding on header/close
   - close button high contrast, never `opacity: 0`

Do not remove overlay backdrop click-to-close on desktop.

## E2 — Catalog load (P0)

Files: `widget/src/01-config.js`, `widget/src/02-data-layer.js`, navigation/error as needed.

1. Add `assetBaseUrl: ""` to `ECOLEADBOT_CONFIG` (overridable via `ECOLEADBOT_SITE_CONFIG`).
2. In `getAssetBaseUrl()` / resolve path:
   - use script-dir `ASSET_BASE_URL` if set;
   - else `ECOLEADBOT_CONFIG.assetBaseUrl` if set;
   - else current location fallback.
3. Document in report: Andrey should set in site config:
   `assetBaseUrl: "https://elb.ecolusspb.ru/"`
4. `fetchJson`: use `credentials: "omit"`; simple retry (2 attempts, short backoff) on network/HTTP failure.
5. Same retry spirit for zone/podrobnee markdown fetches if trivial; at least catalog/zones/qualLabels via `fetchJson`.

Do **not** embed full catalog JSON into app.js in this task (optional later).

## Version + build

- Bump `WIDGET_VERSION` `1.5.44` → `1.5.45`
- `py scripts/build_widget.py`
- `node --check app.js`

## Report

Write `dev documentation/codex/reports/004-mobile-close-catalog.md`:

- Files changed
- How close works on mobile
- How assetBaseUrl fallback works
- Version + build result
- Manual test steps (iPhone + catalog)

## Out of scope

- Deploy, git commit
- Disabling auto-popup
- Changing n8n / Bitrix server-side

## Done when

Code + CSS + build + report complete; version 1.5.45.
