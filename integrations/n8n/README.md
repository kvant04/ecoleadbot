# n8n + Bitrix — интеграция EcoLeadBot v1.4.1

## Файлы (канон)

| Файл | Описание |
|------|----------|
| **`ecoleadbot-workflow.json`** | Единственный актуальный экспорт workflow **v1.4.1** |
| `ecoleadbot-workflow-v13-backup.json` | Legacy backup (не импортировать в прод) |
| **`normalize-scoring-v141.js`** | Scoring + route engine v1.4.1 (встраивается в workflow) |
| `SCORING_OWNERSHIP.md` | Кто источник правды: n8n vs виджет |
| `normalize-scoring-v14.js` | Устарел — только история / справка |
| `scoring-spec-v1.4.1.md` | SPEC: scoring, Bitrix Field Policy §19 |
| `../samples/payload-*-v14.json` | Тестовые payload |
| `../../data/bitrix_service_iblock_map.json` | `service_id` → iblock ID для «Название услуги» |

> Дубликат `ecoleadbot-workflow-v14.json` удалён — используйте только `ecoleadbot-workflow.json`.

## Импорт v1.4.1

1. n8n → Import → **`ecoleadbot-workflow.json`**
2. Нода **Normalize + Scoring v1.4.1** (не v1.4)
3. **Message a model** → credential OpenAI
4. **HTTP Request Bitrix24** — URL из env n8n: `BITRIX_WEBHOOK_URL` (см. ниже)
5. **Webhook** — Header Auth (см. ниже)
6. **Activate** workflow (webhook 404 = workflow не active)
7. Тест: `py scripts/test_webhook_v141.py` (env: `BITRIX_WEBHOOK_BASE`, `ECOLEADBOT_WEBHOOK_SECRET`)

Патч локально: `py scripts/patch_n8n_workflow_v141.py` (пишет только в `ecoleadbot-workflow.json`)

## Webhook

```
POST https://n8n.ecolusspb.ru/webhook/ecoleadbot
Header: X-EcoLeadBot-Secret: <тот же секрет, что в elb-config / ECOLEADBOT_SITE_CONFIG.webhookSecret>
```

### Обязательная настройка безопасности

1. **Bitrix inbound webhook**
   - В Bitrix создайте (или перевыпустите) входящий webhook с правом `crm`.
   - В n8n → Settings → Variables / Environment задайте:
     ```
     BITRIX_WEBHOOK_URL=https://YOUR_HOST/rest/1/YOUR_TOKEN/crm.lead.add.json
     ```
   - В экспорте workflow URL ноды Bitrix = `={{ $env.BITRIX_WEBHOOK_URL }}` (токена в git нет).
   - **Ротируйте** старый токен, если он когда-либо попадал в репозиторий.

2. **Секрет виджета → n8n**
   - Сгенерируйте длинную случайную строку.
   - В n8n: Webhook → Authentication → **Header Auth**
     - Name: `X-EcoLeadBot-Secret`
     - Value: ваш секрет
   - На сайте / VPS в `elb-config.js` (или `ECOLEADBOT_SITE_CONFIG`):
     ```js
     webhookSecret: "тот-же-секрет"
     ```
   - Без совпадения секрета заявки не должны приниматься.

3. Не публикуйте `elb-config.js` с секретом в публичный git; на сервере файл может лежать вне репо или в gitignored overlay.

## v1.4.1 vs v1.4.0

- Единый scoring для main + document flow
- Route R1–R11, `route_reason`, Потенциал ЭС в UF
- TITLE: `{деятельность} / {услуга?}` (источник EcoLeadBot — в SOURCE)
- COMMENTS: v1.4.2 thin (объект + запрос + следующий шаг)
- Edit Fields: `lead_title`, `comments_full` обязательны
- Upsell ЭС в `sales_hint` на всех лидах

## Bitrix

См. `scoring-spec-v1.4.1.md` §19. Lookup услуги: заполнить `data/bitrix_service_iblock_map.json`.

## Безопасность

- Токен Bitrix и `webhookSecret` — только в env / credentials / серверном конфиге.
- После ротации токена проверьте создание тестового лида.
