# MASTERPLAN K: Комментарий из формы контактов → Bitrix COMMENTS

**Status:** ✅ deployed **v1.5.51** on VPS (2026-08-21)  
**Дата:** 2026-08-21  
**Повод:** Алиса — в Bitrix не видно комментарий, который клиент оставил в textarea на экране контактов EcoLeadBot.

## Root cause

Виджет в `19-payload.js`:

- `contact.comment` = structured-блок + RAG + **«Комментарий пользователя»** (textarea)
- `v14.bitrix_comment` = **только** structured `buildBitrixManagerComment()` (без textarea)

n8n `normalize-scoring-v141.js`:

```js
const bitrixComment = v14.bitrix_comment || contact.comment || "";
```

Если `v14.bitrix_comment` непустой (почти всегда), `contact.comment` **не используется**.  
Merge AI берёт `base.comment` (= тот же bitrixComment) → `COMMENTS` в Bitrix без текста клиента.

## Fix

1. **Widget (обязательно, чинит прод без правок n8n UI):**  
   `v14.bitrix_comment` должен включать тот же merged текст, что и `contact.comment` (structured + RAG + user textarea), **или** как минимум append блока `Комментарий пользователя:\n…` к `bitrix_comment`.
2. **n8n source (защита на будущее):**  
   предпочитать `contact.comment` (полный merge) над `v14.bitrix_comment`, синхронизировать встроенный код в `ecoleadbot-workflow.json` (Normalize + при необходимости Merge AI).
3. Bump `WIDGET_VERSION` → **1.5.51**, `py scripts/build_widget.py`.
4. Deploy VPS после ревью (embed.js сам обновит `?v=`).

## Success

- [x] Текст из textarea «Комментарий» попадает в Bitrix поле COMMENTS (via `v14.bitrix_comment` = merged)
- [x] Structured-блоки и «Следующий шаг» не ломаются
- [x] Build зелёный, report 011
- [x] Deployed v1.5.51

## Out of scope

- Новые UF в Bitrix
- Изменение Comment Policy v1.4.2 (thin COMMENTS) кроме включения user text
- Git commit / push (оркестратор) — по запросу
- Re-import n8n workflow (рекомендуется, но widget-only уже чинит прод)