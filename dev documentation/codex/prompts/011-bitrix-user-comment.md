# Codex Prompt 011 — Bitrix: user contact comment missing

## Role

Coding agent for EcoLeadBot. Fix bug: free-text comment from the contact form textarea does not appear in Bitrix lead COMMENTS. **No git commit. No deploy.**

## Masterplan

`dev documentation/codex/MASTERPLAN-bitrix-user-comment.md`

## Root cause (confirmed)

- Widget `widget/src/19-payload.js`: `contact.comment` merges structured + RAG + user textarea; `v14.bitrix_comment` is **only** `buildBitrixManagerComment()` (no user text).
- n8n `integrations/n8n/normalize-scoring-v141.js`: `bitrixComment = v14.bitrix_comment || contact.comment` — structured wins, user text dropped.
- Merge AI Summary rebuilds `comments_full` from `base.comment` (same truncated value) → Bitrix `COMMENTS`.

## Required changes

### 1. Widget (`widget/src/19-payload.js`)

- Set `v14.bitrix_comment` to the **same merged string** used for `contact.comment` (structured + optional RAG block + optional `Комментарий пользователя:\n…`).
- Keep label `Комментарий пользователя:` for the textarea part (already used today).
- Do not remove fields from structured/RAG blocks.

### 2. n8n (source + workflow JSON)

- In `integrations/n8n/normalize-scoring-v141.js` (and mirrored helpers if any): prefer **full** comment for CRM:
  - `const bitrixComment = contact.comment || v14.bitrix_comment || "";`
  - Use that for `comment`, `comments_full` clientBlock.
- Sync the same logic into the embedded jsCode of node **Normalize + Scoring v1.4.1** in `integrations/n8n/ecoleadbot-workflow.json`.
- Merge AI already uses `base.comment` — after Normalize fix it will inherit; no need to change Merge unless broken.
- Update `integrations/n8n/build-comments-v142.js` only if needed for consistency/docs; do not strip lines starting with `Комментарий пользователя`.

### 3. Version + build

- Bump `WIDGET_VERSION` in `widget/src/01-config.js`: `1.5.50` → **`1.5.51`**.
- Run `py scripts/build_widget.py` so `app.js` / baked `embed.js` VERSION match.

## Report

Write `dev documentation/codex/reports/011-bitrix-user-comment.md`:

- Root cause in 2–3 sentences
- Files changed
- Exact before/after for `v14.bitrix_comment` / n8n preference
- Manual test: fill contact form with a unique comment → lead COMMENTS must contain it
- Note: after deploy, live site picks up via `embed.js` (no Andrey `?v=`); n8n workflow JSON may need paste/re-import if production n8n still has old Normalize code — say whether **widget-only** fix is enough for current live n8n (yes, if bitrix_comment becomes full merge)

## Out of scope

Deploy, git commit/push, Bitrix UF changes, renaming COMMENTS field.

## Done when

Code + build + report; version `1.5.51`; user textarea text flows into `v14.bitrix_comment` and n8n prefers `contact.comment`.
