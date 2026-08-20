# Codex Prompt 008 — RAG filter for individuals / dacha (H2)

## Role

Coding agent for EcoLeadBot. Tighten the RAG system prompt so questions from private individuals (физлица / дача / «для себя») do **not** get misleading “project is mandatory on your dacha” answers. Prefer company policy + paid consultation CTA. **No git commit. No deploy.**

## Masterplan

`dev documentation/codex/MASTERPLAN-polina-fixes.md` — block **H2** only.  
H1/H3 already done in 007 (widget 1.5.47). Do **not** change widget JS in this step unless `server.py` must reload the prompt path (it already loads `prompts/ecoleadbot_rag_system_prompt.md`).

## Context

- System prompt file: `prompts/ecoleadbot_rag_system_prompt.md`
- Company FAQ already states we do not work with individuals: `kb/company_profile.md` section «Я – физическое лицо, могу ли приобрести услуги?»
- Paid consultation URL:  
  `https://ecolusspb.ru/services/konsultatsiya-ot-vedushchego-ekologa/`
- Polina’s failing example: question about ЗСО for a simple dacha → model answered “if you have a well, ZSO is mandatory” instead of “we only serve юрлица/ИП”.
- Better example she accepted: well license for физлицо correctly distinguished individuals vs entities — keep that style of clarity, but **lead with company scope** when the user is clearly not a business.

## Required changes

### 1. Add a dedicated section to the system prompt (Russian or bilingual OK; rules must be unambiguous)

Title e.g. **«Клиент — физлицо / бытовой контекст»**.

Rules:

1. Detect signals such as: «физлицо», «физическое лицо», «дачник», «дача», «для себя», «лично», «частный дом» **without** enterprise / ИП / ООО / производство / объект НВОС context.
2. **First** in the answer: компания «Экологические услуги» работает **только с юридическими лицами и ИП**; услуги (проекты, отчёты, сопровождение) физлицам **не оказываем**.
3. Do **not** instruct a private person that they “must order” ЗСО / ПДВ/НДВ / лицензии / отчётность as if we will sell them that package for a dacha.
4. A **short** general normative note is allowed (e.g. requirements usually apply to organizations / water intake facilities), without turning into a how-to for ordering our project on a dacha.
5. Explicitly offer the paid consultation page with the **exact URL** above (plain URL in the answer text is fine).
6. Set `assistant_recommendation` to `offer_consultation` (or `out_of_scope` if the question is purely personal and unrelated to B2B eco compliance). Prefer `offer_consultation` when pointing to the paid consult page.
7. If the user clarifies they represent an organization / ИП — answer normally from the knowledge base.

### 2. Priority of sources

In the existing «Приоритет источников» / rules: when individual/dacha signals are present, **company_profile / company policy outranks** pure normative excerpts for the *framing* of the answer (still cite norms briefly if useful).

### 3. Optional tiny KB tweak

Only if needed for retrieval: ensure `kb/company_profile.md` FAQ about физлица remains clear (already present — do not duplicate long text). No Vector Store upload in this step (orchestrator may run upload later).

### 4. Do not bump WIDGET_VERSION

Prompt-only change. No `build_widget.py` required.

## Report

Write `dev documentation/codex/reports/008-rag-individual-filter.md`:

- Files changed.
- Summary of the new prompt rules (bullet list).
- Exact consultation URL embedded.
- Suggested manual tests:
  1. «нужен ли проект зсо если у меня просто дача»
  2. «нужно ли мне делать лицензию на скважину если я физ. лицо? просто дачник»
  3. Control: «нужен ли ПЭК для производства III категории НВОС» (should still answer normally).
- Note that Vector Store re-upload is **not** required for system prompt changes (prompt is loaded by backend each request); mention if any KB file was edited.

## Out of scope

- Widget gates / restart (done in 007).
- Catalog / deploy / git commit.
- Rewriting the full evaluation set.
- Changing model name or temperature.

## Done when

System prompt updated; report written; no widget version bump.
