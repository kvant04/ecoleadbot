# Report 011 — Bitrix user contact comment

## Root cause

The widget already merged the structured manager block, optional RAG block, and the textarea text into `contact.comment`, but `v14.bitrix_comment` contained only the structured manager block. n8n preferred this non-empty `v14.bitrix_comment`, so the full `contact.comment` never reached `comments_full` and Bitrix lead `COMMENTS`.

## Files changed

- `widget/src/19-payload.js` — `v14.bitrix_comment` now uses the same `mergedComment` as `contact.comment`; the textarea label `Комментарий пользователя:` and all structured/RAG fields remain unchanged.
- `integrations/n8n/normalize-scoring-v141.js` — CRM comment source now prefers the full `contact.comment`.
- `integrations/n8n/ecoleadbot-workflow.json` — embedded `jsCode` for **Normalize + Scoring v1.4.1** synchronized with the source logic.
- `widget/src/01-config.js` — version bumped to `1.5.51`.
- `app.js` — rebuilt with `py scripts/build_widget.py`.
- `embed.js` — baked cache-busting version bumped to `1.5.51`.
- `dev documentation/codex/reports/011-bitrix-user-comment.md` — this report.

`build-comments-v142.js` was not present as a separate file and no comment-stripping logic was changed.

## Exact before/after

Widget:

```js
// before
bitrix_comment: bitrixBlock,

// after
bitrix_comment: mergedComment,
```

n8n:

```js
// before
const bitrixComment = v14.bitrix_comment || contact.comment || "";

// after
const bitrixComment = contact.comment || v14.bitrix_comment || "";
```

The resulting `bitrixComment` is used for `comment` and as the `clientBlock` that builds `comments_full`, which is sent to Bitrix `COMMENTS`.

## Verification

- `py scripts/patch_n8n_workflow_v141.py` — embedded workflow Normalize code synchronized.
- `py scripts/build_widget.py` — successful; `app.js` rebuilt from 27 fragments.
- `node --check app.js` — passed.
- `node --check integrations/n8n/normalize-scoring-v141.js` — passed.
- Workflow JSON parsed successfully; embedded node contains the new `contact.comment` preference.

## Manual test

Fill the contact form with a unique value, for example `BITRIX-COMMENT-011-20260821-UNIQUE`, submit the lead, and inspect the resulting Bitrix lead. The lead `COMMENTS` must contain that exact value under `Комментарий пользователя:` together with the structured/RAG blocks when present.

After deployment, the live site picks up the new widget through `embed.js`; no Andrey `?v=` template change is needed because `embed.js` now requests assets with version `1.5.51`. The widget-only fix is sufficient for the current live n8n workflow if the deployed widget sends the full merged value in `v14.bitrix_comment`; importing the updated workflow JSON is still recommended if production n8n has the old Normalize code, so future payloads remain protected by the `contact.comment` preference.

No deploy, Bitrix UF change, git commit, or push was performed.
