# Codex Prompt 007 — Individual gate + «Пройти заново» (H1 + H3)

## Role

Coding agent for EcoLeadBot. Implement product fixes from Polina’s feedback. **No git commit. No deploy** — orchestrator deploys after review.

## Masterplan

`dev documentation/codex/MASTERPLAN-polina-fixes.md` — blocks **H1** and **H3** (this prompt).  
Do **not** implement H2 (RAG prompt) or H4 (catalog ops) here.

## Context

- Widget sources live in `widget/src/*.js`; rebuild with `py scripts/build_widget.py` into root `app.js`.
- Current `WIDGET_VERSION` is `1.5.46` in `widget/src/01-config.js`.
- Client terms / gates: `widget/src/03a-document-gates.js` (`CLIENT_GATE_DEFS`, `CLIENT_TERMS_BLOCKS`, `evaluateClientTermsGate`, `renderClientGate`, `renderClientTerms`).
- Existing gates already **do not** create CRM leads; keep the same pattern for individuals.
- Session reset helper: `resetSessionForRetest` in `widget/src/03c-document-screens.js` (used today only under `IS_TEST_BUILD` on contact blocked).
- Contact blocked UI: `widget/src/18-contact-screen.js` → `renderContactBlocked`.
- Final/success UI: find `renderFinal` / success screen (likely `widget/src/20-final-screens.js`).
- Paid consultation URL (exact):  
  `https://ecolusspb.ru/services/konsultatsiya-ot-vedushchego-ekologa/`

## Required changes

### H1 — Question + stop for физлица

1. Add a **first** block to `CLIENT_TERMS_BLOCKS` (before contract/prepayment):
   - `id`: `client_entity_type`
   - `text`: `Вы обращаетесь как?`
   - `type`: `single`
   - options (exact labels):
     - `Юридическое лицо или ИП`
     - `Физическое лицо (лично / дача / для себя)`

2. Add `CLIENT_GATE_DEFS.disqualified_individual`:
   - `gate_id`: `disqualified_individual`
   - `gtm_event`: `disqualified_individual`
   - `title`: `Работаем с организациями и ИП`
   - `body`: short Russian text that the company does **not** provide services to individuals (eco docs are for business activity). Offer a paid consultation with the lead ecologist instead.
   - On `renderClientGate` for this gate (or generally if missing): show a primary/secondary link button **«Консультация ведущего эколога»** opening the URL above in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). Reuse existing gate layout patterns; if other gates have only text + home/edit, add the consultation CTA **at least** for `disqualified_individual`.

3. In `evaluateClientTermsGate()`:
   - If `client_entity_type` indicates individual (match the физлицо option label, or a stable substring like `Физическое лицо`) → return `disqualified_individual` **before** procurement / no-advance checks.
   - If unanswered, keep existing validation that blocks «Далее» until all terms answered.

4. Tracking: keep using `client_gate_shown` with `gate_id`. No new analytics framework.

5. Do not remove procurement / advance gates.

### H3 — «Пройти заново» in production

1. On `renderContactBlocked`: show **«Пройти заново»** for **all** builds (remove `IS_TEST_BUILD` wrapper around that button only). Wire to session reset → intro.
2. On success / thank-you final screen: add the same secondary button **«Пройти заново»** if not already present in prod.
3. Reset must clear session the same way as `resetSessionForRetest` (or rename/refactor to a shared `resetSessionToIntro` used by both). After reset, user sees intro and can start a new quiz.
4. **Do not** disable `antiDuplicateMinutes` / `isAlreadySubmitted()` in production. Restarting the quiz is allowed; submitting another lead within the anti-duplicate window must still hit the blocked screen.
5. Do not add «Пройти заново» on every mid-flow screen (`mini_teaser`, questions, etc.).

## Version + build

- Bump `WIDGET_VERSION` `1.5.46` → `1.5.47`.
- `py scripts/build_widget.py`.
- `node --check app.js` if node is available; otherwise skip and note in report.
- Optionally `py -c` / syntax sanity — do not break existing flows.

## Report

Write `dev documentation/codex/reports/007-individual-gate-and-restart.md`:

- Files changed.
- Exact question/options/gate copy and consultation URL.
- Where «Пройти заново» appears; confirmation anti-duplicate still applies.
- Version + build result.
- Manual test steps (client_terms → физлицо → stop + link; юрлицо path unchanged; success/blocked → restart → intro).

## Out of scope

- RAG system prompt (H2 — next prompt).
- Catalog / `assetBaseUrl` / Bitrix `?v=` (H4).
- Deploy, git commit.
- VK/MAX contacts.

## Done when

Code + build + report complete; version `1.5.47`; individual gate + prod restart button work as specified.
