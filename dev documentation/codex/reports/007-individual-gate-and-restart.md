# 007 — Individual gate and restart

## Files changed

- widget/src/01-config.js
- widget/src/03a-document-gates.js
- widget/src/03c-document-screens.js
- widget/src/18-contact-screen.js
- widget/src/20-final-screens.js
- app.js (rebuilt)
- dev documentation/codex/reports/007-individual-gate-and-restart.md

## H1 — individual client gate

The first client_terms block is:

- id: client_entity_type
- question: «Вы обращаетесь как?»
- type: single
- option 1: «Юридическое лицо или ИП»
- option 2: «Физическое лицо (лично / дача / для себя)»

Gate definition:

- gate id / GTM event: disqualified_individual
- title: «Работаем с организациями и ИП»
- body: «Наша компания не оказывает услуги физическим лицам: экологические документы оформляются для предпринимательской деятельности.»
- second paragraph: «Вместо этого вы можете воспользоваться платной консультацией ведущего эколога.»
- CTA: «Консультация ведущего эколога»
- URL: https://ecolusspb.ru/services/konsultatsiya-ot-vedushchego-ekologa/
- link attributes: target="_blank" and rel="noopener noreferrer"

evaluateClientTermsGate() checks the individual answer before procurement and prepayment. The existing procurement and no-advance gates remain. The screen still tracks client_gate_shown with gate_id; as with the other client gates, it does not submit a CRM lead.

The client-terms intro and validation hint now refer to three/all questions.

## H3 — production restart

«Пройти заново» is shown as a secondary button on:

- the contact anti-duplicate blocked screen;
- the successful thank-you/final screen.

Both call the shared resetSessionToIntro(), which clears quiz/session UI state, creates a new session id, and renders the intro.

The reset deliberately preserves already_submitted_at. Production isAlreadySubmitted() and antiDuplicateMinutes are unchanged, so restarting is allowed but another submission during the anti-duplicate window is still blocked. The restart button was not added to intermediate screens.

## Version and build

- Widget version: 1.5.47
- Build command: py scripts/build_widget.py
- Result: success; app.js built from 27 fragments (218490 bytes)
- node --check app.js: skipped because node is unavailable in the environment

## Manual test steps

1. Open a clean production-like session and proceed to client_terms.
2. Confirm «Вы обращаетесь как?» is the first of three required questions.
3. Leave any terms answer empty, click «Далее», and confirm validation blocks progress.
4. Select «Физическое лицо (лично / дача / для себя)», answer the other questions, and click «Далее».
5. Confirm the individual stop screen appears before procurement/prepayment gates and no CRM lead is created.
6. Confirm the consultation CTA opens the exact consultation URL in a new tab.
7. Click «Изменить ответы», choose «Юридическое лицо или ИП», and verify the existing direct-contract/advance path remains unchanged.
8. Complete a successful submission and confirm «Пройти заново» is present; click it and confirm the intro appears.
9. Walk through the quiz again during the anti-duplicate window and confirm submission/contact progression reaches the existing blocked screen.
10. On that blocked screen, confirm «Пройти заново» is present in a production build and returns to the intro.