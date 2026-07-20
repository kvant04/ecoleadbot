# EcoLeadBot — Scoring & Route Engine v1.4.1

**Статус:** SPEC (для согласования и реализации)  
**Дата:** 2026-06-26  
**Заменяет:** rule-based слой в `normalize-scoring-v14.js` (Stage 4 v1.0 + v1.4 patches)  
**Не меняет:** UX-экраны виджета, AI Summary (только текст), webhook URL

---

## 1. Цель

Единая rule-based модель для n8n, согласованная с UX v1.4:

- один **маршрут продаж** на лид (Bitrix enum «Маршрут»);
- один **ES potential** (без дубля «виджет vs rule» в CRM);
- document-flow и main-flow считаются **одинаково**, без `skip scoring`;
- thin leads → уточнение при звонке, не «низкий потенциал».

**Widget** остаётся источником ответов и `v14.es_scoring` (4 статуса).  
**n8n** — единственный источник решений для CRM-полей.

---

## 2. Архитектура

```
Webhook payload
    │
    ├─► [L0] Data quality gate (thin lead?)
    │
    ├─► [L1] Complexity score (0–100)
    ├─► [L2] Urgency score (0–100)
    ├─► [L3] ES potential (Низкий / Средний / Высокий)
    ├─► [L4] Intent (BUY_DOCUMENT | NEED_DIAGNOSIS | OUTSOURCE | SELF_SERVE)
    │
    ├─► Route Engine (R1–R11)
    ├─► Priority Engine (P1–P5)
    ├─► Tags
    │
    └─► AI Summary (текст only) → Bitrix
```

### Принцип приоритета маршрута (из Этап 4, уточнён)

```
Консультация > Потенциал ЭС > Услуга > Самостоятельно
```

При HIGH urgency или проверке/предписании маршрут **Самостоятельно** запрещён.

---

## 3. Входные поля payload

### 3.1 Обязательные (уже есть)

| Поле | Путь | Назначение |
|------|------|------------|
| Flow | `v14.flow` | `main` \| `document` |
| Вид деятельности | `v14.activity_type` / `answers.activity_type` | сегмент, complexity |
| Сигналы (labels) | `answers.object_signals[]` | complexity, combo |
| Сигналы (ids) | `v14.object_signals[]` / `answers.object_signal_ids[]` | tags, zones |
| Неопределённость | `answers.object_signal_uncertain` | thin, complexity |
| Эколог | `answers.ecology_responsible` | ES, route |
| Ситуация | `v14.main_situation` / `answers.main_situation` | urgency, route |
| Срочность | `answers.urgency` | urgency, priority |
| Формат помощи | `answers.help_format` | ES, DIY, intent |
| НВОС | `v14.nvos_category` | complexity |
| Площадки | `v14.sites_count` | complexity, multi-site |
| Оценка экосопровождения (виджет) | `v14.es_scoring.*` | primary ES status |
| Услуга | `v14.service_title`, `v14.selected_service_id` | intent, route |
| Qual | `v14.qualification_answers` | complexity (document) |
| Мини-зоны | `v14.mini_assessment_zones[]` | complexity |
| RAG | `answers.rag_question`, `answers.rag_es_signal` | tags, ES bump |
| Session | `session_id`, `meta.widget_version` | audit |

### 3.2 Новые поля (добавить в widget → `v14`)

| Поле | Тип | Источник | Зачем |
|------|-----|----------|-------|
| `service_type` | string | `services_catalog_v1.4.json` | `standalone` \| `complex` \| `bridge` |
| `service_direction` | string | catalog `direction` | tags, upsell |
| `mini_zone_ids` | string[] | ids зон (не только title) | `ker_gee`, count |

Если `service_type` отсутствует — n8n fallback: `standalone`.

---

## 4. Слой L0 — Data quality gate

| ID | Условие | Эффект |
|----|---------|--------|
| L0-1 | `v14.es_scoring.status === "requires_dequalification"` | thin mode ON |
| L0-2 | `v14.es_scoring.data_points <= 2` | thin mode ON |
| L0-3 | `answers.object_signal_uncertain === true` | thin mode ON |

**Thin mode (если любое L0-*):**

| Поле | Значение |
|------|----------|
| Route | **Консультация** (unless R2 inspection — then still Консультация + HOT) |
| ES potential | **Средний** (never Низкий) |
| Priority | **минимум Средний** |
| Tag | `dequal_required`, `requires_dequalification` |
| `route_reason` | «Мало данных от виджета — первичный звонок для уточнения объекта и потребности» |

Дальнейшие правила R3–R11 **не понижают** priority ниже Среднего в thin mode.

---

## 5. Слой L1 — Complexity score

**Диапазоны:**

| Score | Complexity | Bitrix id |
|-------|------------|-----------|
| 0–29 | Простой | 3958 |
| 30–69 | Средний | 3959 |
| 70+ | Сложный | 3960 |

### 5.1 Базовые факторы (суммируются)

| Фактор | Значение | Баллы |
|--------|----------|-------|
| Вид: Производство | | +30 |
| Вид: Стройка | | +20 |
| Вид: Автосервис / СТО, СТО | | +15 |
| Вид: Автомойка | | +15 |
| Вид: Склад | | +10 |
| Вид: Магазин / торговля, Торговля | | +5 |
| Вид: Офис, ЖКХ, Сельхоз, Другое | | 0 |
| Сигнал: Мусор и упаковка | | +10 |
| Сигнал: масла / ветosh (substring match) | | +15 |
| Сигнал: Производственные отходы | | +15 |
| Сигнал: Выбросы в атмосферу / воздух | | +25 |
| Сигнал: Сброс воды (ЦСВ, канализация, сточные) | | +35 |
| Сигнал: Сброс в водные объекты | | +35 |
| Сигнал: Скважина / недропользование | | +20 |
| Площадки: 2–3 | | +25 |
| Площадки: 4 и более | | +40 |
| Площадки: Не знаю | | +15, tag `sites_unknown` |
| НВОС: I | | +20 |
| НВОС: II | | +15 |
| НВОС: III | | +10 |
| НВОС: Не знаю | | +10 |
| object_uncertain | | +25 |
| mini_zone_ids.length === 2 | | +10 |
| mini_zone_ids.length >= 3 | | +20 |
| mini_zone_ids includes `ker_gee` | | +25, tag `ker_gee_zone` |

### 5.2 Комбинационные правила (Stage 4 §8.3)

| Комбинация | Доп. баллы | Tag |
|------------|------------|-----|
| (СТО или Автосервис) + масла/ветosh | +15 | `auto_waste` |
| Производство + масла/ветosh | +35 | `production_waste` |
| Производство + выбросы | +25 | `emission_risk` |
| Производство + любой сброс воды | +35 | `discharge_risk` |
| выбросы + любой сброс воды | +20 | `air_water_combo` |

### 5.3 Document-flow дополнения

| Условие | Баллы | Tag |
|---------|-------|-----|
| `v14.flow === "document"` && `service_type === "complex"` | +30 | `document_complex_service` |
| `service_type === "bridge"` | +10 | `bridge_service` |
| qual value matches `/полный|комплекс|все площадк/i` | +15 | `broad_scope` |
| nvos cat I or II && sites 2–3 or 4+ | +20 | `multi_site_nvos` |

### 5.4 Override complexity

| Условие | Минимум complexity |
|---------|-------------------|
| `v14.es_scoring.mini_result_type === "complex"` | Средний |
| `v14.es_scoring.status === "complex_lead"` | Средний |
| air_water_combo + Производство | **Сложный** |
| `service_type === "complex"` && sites 2–3+ | **Сложный** |

---

## 6. Слой L2 — Urgency score

**Диапазоны:**

| Score | Urgency | Bitrix id |
|-------|---------|-----------|
| 0–19 | Низкая | 3993 |
| 20–59 | Средняя | 3994 |
| 60+ | Высокая | 3995 |

### 6.1 Факторы

| Фактор | Баллы |
|--------|-------|
| urgency: В этом году | +10 |
| urgency: В течение квартала | +25 |
| urgency: В течение месяца, В ближайшие недели | +40 |
| urgency: Срочно, Очень срочно | +60 |
| situation: Предстоящая проверка или предписание | +70 |
| situation: Несколько вопросов сразу — нужна консультация | +30 |
| situation: Хотим навести порядок | +20 |
| situation: Пока изучаем / нет срочности | 0 |
| qual answer matches `/срочн|проверк|предпис/i` | +40 |

### 6.2 Document-flow default

Если `flow === "document"` и `answers.urgency` пуст:

- urgency score = **25** (Средняя), не Низкая.

---

## 7. Слой L3 — ES Potential

**Bitrix:** `UF_CRM_1780045750` — заполнять (ids: LOW=?, MEDIUM=?, HIGH=? — сверить с `bitrix-lead-fields.txt`).

### 7.1 Алгоритм

```
1. IF thin mode → Средний, STOP
2. IF es_scoring.status === "high_es_potential" → Высокий
3. IF help_format === "Чтобы кто-то полностью занимался экологией" → Высокий
4. IF ecology_responsible === "Никто" AND multi_site → Высокий
5. IF es_scoring.status === "complex_lead"
     AND ecology_responsible IN (Директор, Бухгалтер, Никто) → Высокий
     ELSE → Средний
6. IF es_scoring.status === "qualified_lead"
     AND flow === "document" AND service_type === "standalone"
     AND ecology_responsible === "Штатный эколог" → Низкий
     ELSE → Средний
7. IF rag_es_signal IN (да, yes, high) → поднять на 1 уровень (max Высокий)
8. DEFAULT → Низкий
```

### 7.2 Маппинг es_scoring.status → ES potential (справочно)

| status (widget) | ES potential (CRM) |
|-----------------|-------------------|
| requires_dequalification | Средний |
| high_es_potential | Высокий |
| complex_lead | Средний–Высокий (см. п.7.1) |
| qualified_lead | Низкий–Средний |

---

## 8. Слой L4 — Intent (внутренний, не Bitrix)

| Intent | Условие |
|--------|---------|
| `BUY_DOCUMENT` | `flow === "document"` && `selected_service_id` |
| `NEED_DIAGNOSIS` | situation «Не знаем…» OR object_uncertain OR thin mode |
| `OUTSOURCE` | ES Высокий OR help «полностью занимались экологией» |
| `SELF_SERVE` | help «Разобраться самому» AND urgency Низкая |
| `EXPLORE` | situation «Пока изучаем / нет срочности» |

---

## 9. Route Engine (R1–R11)

Проверять **сверху вниз**, первое совпадение wins.

| ID | Условие | Route | Bitrix id | route_reason (шаблон) |
|----|---------|-------|-----------|------------------------|
| **R1** | thin mode | Консультация | 3971 | Мало данных — уточнение при звонке |
| **R2** | situation = проверка/предписание OR urgency = Высокая | Консультация | 3971 | Срочный или рисковый кейс — первичная диагностика |
| **R3** | complexity = Сложный OR es_status = complex_lead | Консультация | 3971 | Сложный кейс — консультация до КП |
| **R4** | tag air_water_combo | Консультация | 3971 | Выбросы и сбросы — комплексная диагностика |
| **R5** | multi_site AND ecology IN (Никто, Директор) OR object_uncertain | Консультация | 3971 | Несколько площадок / неопределённость объекта |
| **R6** | situation = «Несколько вопросов сразу…» | Консультация | 3971 | Клиент запросил комплексную консультацию |
| **R7** | ES potential = Высокий | Потенциал ЭС | 3973 | Сигнал на экосопровождение — не ограничиваться разовой услугой |
| **R8** | intent = BUY_DOCUMENT AND service_type = standalone AND complexity != Сложный AND ES != Высокий | Услуга | 3970 | Клиент выбрал конкретную услугу — КП по scope |
| **R9** | intent = BUY_DOCUMENT AND (service_type = complex OR complexity = Сложный) | Консультация | 3971 | Сложная услуга или масштаб — сначала бриф |
| **R10** | intent = SELF_SERVE AND urgency != Высокая AND NOT R2 | Самостоятельно | 3972 | Клиент хочет разобраться сам — материалы для самостоятельного изучения |
| **R11** | default | Услуга | 3970 | Стандартная обработка по услуге / первичная консультация |

### 9.1 Запреты

- R10 **не применяется**, если сработал R2 (проверка/высокая срочность).
- R8 **не применяется**, если сработал R1 (thin) — только R1.

---

## 10. Priority Engine (P1–P5)

| ID | Условие | Priority | Bitrix id |
|----|---------|----------|-----------|
| **P1** | R2 (проверка / HIGH urgency) | Высокий | 3966 |
| **P2** | complexity = Сложный | Высокий | 3966 |
| **P3** | ES = Высокий | Высокий | 3966 |
| **P4** | R10 (DIY route) | Низкий | 3964 |
| **P5** | default | Средний | 3965 |

**Override:** thin mode → priority = max(Средний, result).

### SLA (из Этап 4, для будущих n8n-нод)

| Priority | SLA |
|----------|-----|
| Высокий | 15 мин |
| Средний | 1 раб. день |
| Низкий | 3 раб. дня / самостоятельное сопровождение |

---

## 11. DIY Level (уровень самостоятельности)

Сохранить Stage 4 §8.6 для поля Bitrix «Уровень самостоятельности».

| Фактор | Баллы |
|--------|-------|
| help «Разобраться самому» | +60 |
| situation «Пока изучаем / нет срочности» | +20 |

| Score | DIY |
|-------|-----|
| 0–29 | Низкий |
| 30–59 | Средний |
| 60+ | Высокий |

---

## 12. Tags v1.4.1

Базовые (из v1.4): `v14`, `flow_main`, `flow_document`, `production`, `car_service`, …

Новые:

| Tag | Когда |
|-----|-------|
| `dequal_required` | thin mode |
| `air_water_combo` | выбросы + сброс |
| `ker_gee_zone` | зона KER/GEE в мини-оценке |
| `sites_unknown` | площадки «Не знаю» |
| `document_complex_service` | service_type complex |
| `bridge_service` | service_type bridge |
| `broad_scope` | qual «полный/комплекс» |
| `multi_site_nvos` | cat I–II + multi site |
| `emission_risk` | combo production+emissions |
| `discharge_risk` | combo production+discharge |
| `auto_waste` | STO+oils |
| `production_waste` | production+oils |
| `es_bridge` | route = Потенциал ЭС |
| `service_selected` | есть service_title |
| `rag_used` | rag_question |

---

## 13. Выход n8n → Bitrix

### 13.1 TITLE

Формат (согласовано с ОП 26.06.2026):

```
EcoLeadBot / {activity_type} / {service_title}
```

- **Document flow:** услуга **обязательна** в TITLE (лид пришёл с конкретной услуги).
- **Main flow без услуги:** `EcoLeadBot / {activity_type}`.
- Маршрут и приоритет — в UF-полях и COMMENTS, **не** в TITLE (фильтрация в Bitrix по своим спискам).

Примеры:

- `EcoLeadBot / Производство / Производственный экологический контроль (ПЭК)`
- `EcoLeadBot / Автосервис / СТО`

### 13.2 COMMENTS (структура)

```
=== EcoLeadBot v1.4.1 ===

{v14.bitrix_comment}

--- Scoring ---
Вид деятельности: …
Услуга интереса: … (если есть)
Сложность: …
Срочность: …
Потенциал ЭС: …
Маршрут: …
Приоритет: …
Причина маршрута: {route_reason}
ES scoring (виджет): {es_scoring.status_label}

Резюме: …
Подсказка администратору: …
Подсказка менеджеру: …

Теги: …
ID сессии: …
```

**Убрать** дублирующую строку «Потенциал ЭС (rule)» vs «ES scoring (виджет)» — одна шкала в CRM, виджет-status только как справка.

### 13.3 UF-поля (production)

| Поле CRM | Код | Источник n8n |
|----------|-----|--------------|
| Сегмент → **«Вид деятельности»** (подпись в CRM) | `UF_CRM_1780045640` | activity_type → segment_id |
| Сложность | `UF_CRM_1780045381` | complexity_id |
| Приоритет | `UF_CRM_1780045704` | priority_id |
| **Потенциал ЭС** | `UF_CRM_1780045750` | es_potential_id |
| Маршрут | `UF_CRM_1780045778` | route_id |
| Уровень самостоятельности | `UF_CRM_1780045805` | diy_level_id |
| Кто занимается экологией | `UF_CRM_1780047226` | responsible_id |
| Срочность | `UF_CRM_1780047272` | urgency_id |
| Количество площадок | `UF_CRM_1780047302` | object_count_id |
| Теги EcoLeadBot | `UF_CRM_1780045834` | tags string |
| ID сессии | `UF_CRM_1780045115` | session_id |
| Резюме | `UF_CRM_1780045861` | summary (+ AI) |
| Подсказка администратору | `UF_CRM_1780045878` | admin_hint (+ AI) |
| Подсказка менеджеру | `UF_CRM_1780046722` | sales_hint (+ AI) |
| **Название услуги** | `UF_CRM_1744184298` | iblock element ID (lookup) |

Подробная политика — **§19**.

### 13.4 sales_hint — стратегия допродажи ЭС

**Согласовано (26.06.2026):** всем обратившимся **всегда** предлагать экосопровождение.

- `sales_hint` — базовая фраза про возможность ЭС **для всех** лидов, включая маршрут «Услуга».
- Маршрут «Потенциал ЭС» — для сильных ES-сигналов; не отменяет обязательный upsell на остальных.
- Поле **«Предложение по ЭС»** — **отдельная автоматизация** (контроль факта предложения); n8n **не заполняет**.

---

## 14. Playbook ОП (кратко)

| Route | Админ | МОП |
|-------|-------|-----|
| **Консультация** | регион, юрлицо, LPR, документы, сроки | диагностика, не прайс с порога |
| **Услуга** | сверить scope услуги | КП по услуге ≤24ч |
| **Потенциал ЭС** | не фиксировать «только документ» | экосопровождение, не upsell мелочи |
| **Самостоятельно** | опциональный контакт | EcoCompass / nurture |

---

## 15. Тест-кейсы (acceptance)

### TC-01 Main: автосервис, 3 зоны, «не знаем что нужно»

| | Ожидание v1.4.1 |
|---|-----------------|
| complexity | Средний (65+) |
| route | **Консультация** (R6 or situation) |
| priority | Средний |
| ES | Средний |

### TC-02 Document: ПЭК, II cat, 2–3 площадки, полный ПЭК

| | Ожидание |
|---|----------|
| complexity | **Сложный** |
| route | **Консультация** (R9) |
| priority | Высокий (P2) |
| widget es_status | complex_lead (ok) |

### TC-03 Document: договор с РО, торговля, 1 площадка

| | Ожидание |
|---|----------|
| route | **Услуга** (R8) |
| complexity | Простой |
| priority | Средний |

### TC-04 Thin: только имя+телефон+1 поле

| | Ожидание |
|---|----------|
| route | Консультация (R1) |
| ES | Средний (not Низкий) |
| priority | Средний min |
| tag | dequal_required |

### TC-05 ES: «полностью занимались экологией», директор, 2 площадки

| | Ожидание |
|---|----------|
| route | **Потенциал ЭС** (R7) |
| priority | Высокий (P3) |

### TC-06 DIY: «разобраться самому», «в этом году»

| | Ожидание |
|---|----------|
| route | **Самостоятельно** (R10) |
| priority | Низкий (P4) |

### TC-07 Проверка + document ПЭК

| | Ожидание |
|---|----------|
| route | **Консультация** (R2 beats R8) |
| priority | **Высокий** (P1) |

### TC-08 Lead integrity после webhook

| | Ожидание |
|---|----------|
| TITLE | `EcoLeadBot / …` (не автоген «Лид #ID») |
| COMMENTS | не пустой, содержит `=== EcoLeadBot v1.4.1 ===` |
| UF scoring | segment, route, summary заполнены |
| SESSION | `session_id` из payload |

---

## 16. План реализации

| # | Задача | Файл |
|---|--------|------|
| 1 | Реализовать engine по этому spec | `integrations/n8n/normalize-scoring-v14.js` → `normalize-scoring-v141.js` |
| 2 | Обновить patch script | `scripts/patch_n8n_workflow_v14.py` |
| 3 | Добавить `service_type`, `mini_zone_ids` в payload | `app.js` `buildPayload()` |
| 4 | Document-aware `computeEsScoring()` | `app.js` |
| 5 | Получить enum ids для Потенциал ЭС | `scripts/fetch_bitrix_fields.py` |
| 6 | Lookup `selected_service_id` → `UF_CRM_1744184298` | `data/bitrix_service_iblock_map.json` (создать) |
| 7 | Fix Edit Fields: `lead_title`, `comments_full` | `ecoleadbot-workflow-v14.json` |
| 8 | Обновить sample payloads | `integrations/samples/` |
| 9 | Переимпорт workflow в n8n | `ecoleadbot-workflow-v14.json` |
| 10 | Прогнать TC-01…TC-08 | curl + Bitrix API |

---

## 17. Changelog vs v1.4.0 n8n

| Тема | v1.4.0 | v1.4.1 |
|------|--------|--------|
| Document flow scoring | skipped | full scoring |
| Document route | always Услуга if service | R8/R9 split |
| ES in Bitrix | не заполнен | UF Потенциал ЭС |
| Два ES в comment | rule + widget | одна шкала + widget label |
| main_situation v1.4 | частично | все 6 вариантов |
| Combo rules Stage 4 | нет | §5.2 |
| route_reason | нет | да |
| ker_gee / zone ids | нет | да |

---

## 18. Согласование

- [x] ОП: фильтры по услуге — **в Bitrix**, отдельно в n8n не реализовывать
- [x] ОП: «Предложение по ЭС» — **другая автоматизация**; стратегия — всем допродавать ЭС
- [x] ОП: **TITLE + «Название услуги»** — каноническое место для услуги; `UF_CRM_1605607758` не использовать
- [x] ОП: **Категория НВОС** — только COMMENTS, отдельное UF не нужно
- [ ] ОП: маршруты R7/R8/R9 (ПЭК → консультация при multi-site)
- [ ] ОП: thin lead = Средний priority, не LOW
- [ ] CRM: ids для Потенциал ЭС enum
- [ ] CRM: lookup-таблица 32 услуги → iblock ID для `UF_CRM_1744184298`
- [ ] Dev: реализация n8n + widget payload

---

## 19. Bitrix Field Policy v1.4 (FINAL)

**Дата фиксации:** 26.06.2026  
**Источник:** согласование с ОП + `bitrix-lead-fields.txt` + production workflow

### 19.1 Три слоя полей

| Слой | Кто заполняет | Примеры |
|------|---------------|---------|
| **A. Стандарт CRM** | n8n при создании | TITLE, NAME, PHONE, SOURCE, COMMENTS |
| **B. EcoLeadBot auto** | n8n из scoring | UF `178004*` (14 полей) + Название услуги |
| **C. ОП вручную** | админ / МОП / другие автоматизации | квалификация, Предложение по ЭС |

### 19.2 n8n заполняет автоматически

**Стандарт:**

- `TITLE` — формат §13.1
- `NAME`, `PHONE`, `SOURCE_ID` (`UC_KQYSW1` = EcoLeadBot)
- `COMMENTS` — полный блок §13.2
- `ASSIGNED_BY_ID` — 13860 (как сейчас)

**UF EcoLeadBot (`UF_CRM_178004*`):**

| UF | Подпись в CRM | v1.4 |
|----|---------------|------|
| 1780045115 | ID сессии EcoLeadBot | ✅ |
| 1780045640 | Сегмент → переименовать UI в **«Вид деятельности»** | ✅ |
| 1780045381 | Сложность кейса | ✅ |
| 1780045704 | Приоритет | ✅ |
| 1780045750 | Потенциал ЭС | ✅ v1.4.1 |
| 1780045778 | Маршрут | ✅ |
| 1780045805 | Уровень самостоятельности | ✅ |
| 1780047226 | Кто занимается экологией | ✅ |
| 1780047272 | Срочность | ✅ |
| 1780047302 | Количество площадок | ✅ |
| 1780045834 | Теги EcoLeadBot | ✅ |
| 1780045861 | Резюме EcoLeadBot | ✅ |
| 1780045878 | Подсказка администратору | ✅ |
| 1780046722 | Подсказка менеджеру | ✅ |

**Услуга (iblock):**

| UF | Подпись | v1.4 |
|----|---------|------|
| **1744184298** | **Название услуги** | ✅ целевое поле (lookup iblock ID) |
| 1605607758 | Услуга | ❌ **legacy / дубль** — не заполнять, скрыть в карточке |

### 19.3 n8n НЕ заполняет (оставить в CRM)

| UF / поле | Назначение |
|-----------|------------|
| **Предложение по ЭС** | Отдельная автоматизация — контроль, что каждому лиду предложили ЭС |
| `UF_CRM_1723014858` | Описание квалификации администратора — после звонка |
| `UF_CRM_1723014891` | Описание квалификации МОП — после разговора |
| `UF_LIST` | Название услуги (АРХИВ) — не использовать |

### 19.4 Не создавать в v1.4

| Поле | Причина |
|------|---------|
| UF_ECO_* (план Этап 4) | Уже есть `UF_CRM_178004*` |
| UF «Категория НВОС» | Достаточно COMMENTS + qual-блок |
| UF для зон мини-оценки, RAG, UTM | Достаточно COMMENTS + tags |
| Отдельные UF «для фильтрации» | Фильтры уже есть в Bitrix |

### 19.5 Название услуги — каноническое место

1. **TITLE лида** — `EcoLeadBot / {вид деятельности} / {название услуги}`.
2. **`UF_CRM_1744184298`** — iblock element ID (для фильтров/отчётов CRM).
3. **COMMENTS** — текст `Услуга интереса: …` в блоке «Цель обращения».

До готовности lookup iblock: TITLE + COMMENTS заполнены; UF 1744184298 может быть пустым.

### 19.6 Категория НВОС

Только в **COMMENTS** (блок «Характеристика объекта») и qual-ответах document-flow. Отдельное UF **не создавать**.

### 19.7 Стратегия экосопровождения

| Механизм | Роль |
|----------|------|
| n8n `sales_hint` | Напоминание МОП про ЭС на **каждом** лиде |
| n8n route «Потенциал ЭС» | Явные ES-сигналы (help format, Никто, multi-site…) |
| CRM «Предложение по ЭС» | Контроль факта предложения — **не n8n** |

---

## 20. n8n workflow — что остаётся / что убрать

### 20.1 MVP v1.4 (оставить)

```
Webhook → Normalize + Scoring → Message a model → Merge AI → Edit Fields → Bitrix
```

| Нода | Статус |
|------|--------|
| Webhook | ✅ |
| Normalize + Scoring | ✅ → v1.4.1 engine |
| Message a model | ✅ (`onError: continueRegularOutput`) |
| Merge AI Summary | ✅ |
| Edit Fields | ✅ обязательно пробрасывает `lead_title`, `comments_full` |
| HTTP Bitrix24 | ✅ |

### 20.2 Не входит в v1.4 (backlog, не удалять из spec)

- Create Admin Task, SLA engine, Respond to Webhook, nurture-сегменты, error retry branch

### 20.3 Убрать из логики / не делать

- Дублирующий iblock `UF_CRM_1605607758`
- Два ES scoring в COMMENTS («rule» + «виджет»)
- `if (!isDocumentFlow) skip scoring`
- Заполнение «Предложение по ЭС»
- Legacy v1.3 paths (`object_features` без fallback)

### 20.4 Известный дефект v1.4.0 (исправлен в JSON, нужен re-import)

**Симптом:** лид создаётся, UF scoring заполнены, но **COMMENTS пустой** и **TITLE = «Лид #ID»**.

**Причина:** нода Edit Fields не пробрасывала `lead_title` и `comments_full` в HTTP Bitrix.

**Fix:** `integrations/n8n/ecoleadbot-workflow-v14.json` — поля + `includeOtherFields: true`.

**Acceptance:** TC-08.

**Примечание:** лиды #45076–45078 (API test без UF) — не n8n; удалить вручную.

---

## 21. Changelog spec

| Версия | Дата | Изменение |
|--------|------|-----------|
| v1.4.1 draft | 26.06.2026 | Scoring engine, route R1–R11 |
| v1.4.1 + §19 | 26.06.2026 | Bitrix Field Policy FINAL, ES upsell, TITLE format |

После галочек §18 — переход к задаче #1 в §16.
