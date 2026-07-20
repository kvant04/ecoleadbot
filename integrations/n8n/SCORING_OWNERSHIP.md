# ES scoring: кто источник правды

## Два слоя (намеренно)

| Слой | Файл | Назначение |
|------|------|------------|
| **CRM / Bitrix** | `integrations/n8n/normalize-scoring-v141.js` (в ноде workflow) | Итоговый route, priority, es_potential, UF-поля лида |
| **Виджет (тизер)** | `widget/src/16b-es-scoring.js` → `computeEsScoring()` | Подсказки в UI / поля `v14.es_scoring` в payload |

Они **не обязаны** быть побайтово идентичны, но **не должны молча расходиться** по смыслу правил.

## Правила синхронизации

1. Меняете пороги / маршруты для менеджера → правите **n8n** `normalize-scoring-v141.js`, затем `py scripts/patch_n8n_workflow_v141.py` и переимпорт/патч workflow.
2. Меняете то, что пользователь видит в мини-оценке / уходит в `es_scoring` payload → правите **`16b-es-scoring.js`**, затем `py scripts/build_widget.py`.
3. После изменений с обеих сторон — короткий чеклист на 2 sample payload (`integrations/samples/payload-*-v14.json`):
   - совпал ли `es_potential` / thin_mode / multi-site сигнал по смыслу;
   - не пропал ли upsell ЭС в `sales_hint`.

## Канон для продакшена CRM

**n8n `normalize-scoring-v141.js`** — единственный источник для полей Bitrix.
Виджетный скоринг — входной сигнал и UX, не замена CRM-engine.
