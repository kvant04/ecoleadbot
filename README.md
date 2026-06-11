# EcoLeadBot

AI-assisted qualification and routing system для [ecolusspb.ru](https://ecolusspb.ru/).

Репозиторий объединяет **виджет квалификации лидов** (frontend + n8n) и **базу знаний RAG** для AI-ассистента по экологическому законодательству и услугам компании.

---

## Структура проекта

```
├── app.js, index.html, styles.css              # Frontend MVP (виджет)
├── server.py, rag_service.py, serve.py       # Backend RAG + dev-серверы
├── prompts/ecoleadbot_rag_system_prompt.md     # System prompt RAG Assistant
├── raw/                                        # Исходные НПА и FAQ (.txt, .md)
├── kb/                                         # База знаний для OpenAI Vector Store
├── future_extension/                           # Архив документов вне MVP-RAG
├── scripts/                                    # Обработка и загрузка
│   ├── process_kb.py                           # Первичная очистка raw/ → kb/
│   ├── rag_optimize.py                         # Оптимизация RAG (koap_eco, chunking)
│   ├── scrape_services.py                      # Парсинг услуг и профиля с сайта
│   └── upload_kb_to_openai_vector_store.py     # Загрузка kb/*.md в OpenAI Vector Store
├── evaluation_runner.py                        # Полный evaluation (35 вопросов)
├── evaluation_rerun_after_fixes.py             # Мини-проверка после правок KB (5 вопросов)
├── reports/                                    # Отчёты обработки (не для Vector Store)
├── evaluation/                                 # Тестовый набор EVAL-001…030
└── dev documentation/                          # Продуктовая документация (.docx)
```

---

## Быстрый старт

### 1. Настройка окружения

```bash
cp .env.example .env
# Заполните OPENAI_API_KEY и OPENAI_VECTOR_STORE_ID
```

### 2. Backend (виджет + RAG API)

```bash
py server.py
# → http://127.0.0.1:8000
```

### 3. Загрузка базы знаний в Vector Store

```bash
# Первая загрузка
python scripts/upload_kb_to_openai_vector_store.py

# После ЛЮБЫХ правок kb/*.md — обязательно с --force
python scripts/upload_kb_to_openai_vector_store.py --force
```

> **Важно:** без `--force` скрипт пропускает файлы, которые уже есть в Vector Store.
> Если вы видите `0 файлов загружено` — содержимое **не обновилось**. Используйте `--force`.

Отчёт загрузки: `vector_store_upload_report.md`

---

## Frontend MVP

Виджет квалификации лидов: HTML + CSS + Vanilla JavaScript, без сборки.

| Файл | Назначение |
|------|------------|
| `index.html` | Демо-страница-хост |
| `app.js` | Логика виджета, scoring, RAG-сценарий, отправка в n8n |
| `styles.css` | Стили (префикс `.ecoleadbot-`) |
| `server.py` | FastAPI: виджет + `POST /api/rag/ask` |
| `serve.py` | Только статика (без RAG API) |

Webhook: `https://n8n.ecolusspb.ru/webhook/ecoleadbot`

### RAG-сценарий в виджете (v1.3.2)

На стартовом экране три входа: **Проверить экологические риски**, **Нужен конкретный документ**, **Задать вопрос по экологии**.

RAG-вопросы идут на `POST /api/rag/ask` (OpenAI GPT-4.1 mini + Vector Store). Лиды по-прежнему только через Contact Screen → n8n → Bitrix24.

Ручные тесты: `rag_manual_test.md`

---

## RAG — база знаний

### Активная база (`kb/`)

~30 документов для Vector Store:

- федеральные законы и кодексы (7-ФЗ, 89-ФЗ, 96-ФЗ, 416-ФЗ, 248-ФЗ, Водный кодекс);
- приказы Минприроды, Росстата, Росприроднадзора;
- `koap_eco.md` — выборка экологических статей КоАП;
- `FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md`;
- `NVOS-Ref-perechni-dokumentacii-po-kategoriyam-obektov-nvos.md`;
- `services.md` — услуги компании (ecolusspb.ru);
- `company_profile.md` — профиль компании, контакты, преимущества.

### System prompt

`prompts/ecoleadbot_rag_system_prompt.md` — правила ответа RAG Assistant (в т.ч. запрет называть цены услуг). Подхватывается backend при каждом запросе, перезагрузка Vector Store не требуется.

### Загрузка в OpenAI Vector Store

```bash
python scripts/upload_kb_to_openai_vector_store.py          # первая загрузка / догрузка новых
python scripts/upload_kb_to_openai_vector_store.py --force  # перезаливка после правок kb/
```

| Режим | Когда использовать |
|-------|-------------------|
| без флагов | Первый запуск или в store ещё нет части файлов |
| `--force` | После любых изменений в `kb/*.md` — удаляет старые файлы из store и загружает заново |

**Типичная ошибка:** скрипт пишет `Уже в Vector Store (completed): 30` и `0 файлов загружено` — это не сбой API, а пропуск уже существующих файлов. RAG продолжит использовать **старое** содержимое. Решение: `--force`.

При геоблоке OpenAI (`403 unsupported_country_region_territory`) — VPN или прокси в `.env`:

```env
HTTPS_PROXY=http://user:pass@host:port
```

### Архив (`future_extension/`)

Документы, исключённые из MVP-RAG (полный КоАП, amendment-приказы, нишевые СанПиН и т.д.).

### Скрипты обработки

```bash
# Первичная обработка нормативки из raw/
python scripts/process_kb.py

# Оптимизация RAG (koap_eco, chunking, future_extension)
python scripts/rag_optimize.py

# Парсинг услуг и профиля компании с сайта
python scripts/scrape_services.py
```

### Отчёты (`reports/`)

| Файл | Содержание |
|------|------------|
| `Processing_kb_report.md` | Результат process_kb.py |
| `rag_optimization_report.md` | Итог RAG-оптимизации |
| `pek_recommendation.md` | Статусы документов ПЭК |
| `fkko_validation_report.md` | Валидация ФККО |
| `services_scraping_report.md` | Парсинг услуг |
| `company_profile_report.md` | Парсинг профиля компании |

### Тестирование RAG

```bash
# Backend должен быть запущен: py server.py

# Полный evaluation (35 вопросов)
python evaluation_runner.py
# → evaluation_results.md, evaluation_results.json

# Мини-проверка после правок KB (5 вопросов)
python evaluation_rerun_after_fixes.py
# → evaluation_rerun_after_fixes.md
```

Ручной набор сценариев: `evaluation/evaluation_set.md`  
Шаблон отчёта PO: `evaluation/evaluation_report_template.md`

---

## Деплой (публичный сервер)

Проект: [github.com/kvant04/ecoleadbot](https://github.com/kvant04/ecoleadbot)

### Render.com (рекомендуется)

1. [Deploy to Render](https://render.com/deploy?repo=https://github.com/kvant04/ecoleadbot) — Blueprint из `render.yaml`
2. В Render Dashboard задайте секреты:
   - `OPENAI_API_KEY`
   - `OPENAI_VECTOR_STORE_ID`
3. После деплоя URL вида: `https://ecoleadbot.onrender.com`

Health check: `GET /api/health`  
Виджет: корень `/`

### Docker

```bash
docker build -t ecoleadbot .
docker run -p 8000:8000 --env-file .env ecoleadbot
```

---

## Важно

- В **Vector Store** загружать только файлы из `kb/`, не `reports/` и не `future_extension/`.
- После правок `kb/*.md` — **всегда** `upload_kb_to_openai_vector_store.py --force`.
- Юридический смысл нормативных документов при обработке не изменялся.
- Frontend — тестовая публикация перед установкой на ecolusspb.ru; webhook и payload n8n не менять.
