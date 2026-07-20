# EcoLeadBot

AI-assisted qualification and routing system для [ecolusspb.ru](https://ecolusspb.ru/).

Репозиторий объединяет **виджет квалификации лидов v1.4** (frontend + n8n) и **базу знаний RAG** для AI-ассистента по экологическому законодательству и услугам компании.

Master scope: [`dev documentation/EcoLeadBot-Scope-Freeze-v1.4.md`](dev%20documentation/EcoLeadBot-Scope-Freeze-v1.4.md)

---

## Структура проекта

```
├── app.js, index.html, styles.css              # Frontend виджет (v1.4)
├── assets/logo-eu.png                          # Логотип на кнопке и в popup
├── data/services_catalog_v1.4.json             # 32 услуги, вопросы, маршрутизация
├── data/mini_assessment_zones_v1.4.json        # Объект → зоны мини-оценки
├── kb/mini_assessment/                         # Шаблоны текстов зон
├── server.py, rag_service.py                   # Backend RAG + dev-сервер
├── docker-compose.yml, deploy/vps_install.sh   # Деплой на VPS
├── prompts/ecoleadbot_rag_system_prompt.md     # System prompt RAG Assistant
├── raw/                                        # Исходные НПА и FAQ (.txt, .md)
├── kb/                                         # База знаний для OpenAI Vector Store
├── future_extension/                           # Архив документов вне MVP-RAG
├── scripts/                                    # Обработка и загрузка KB
├── evaluation_runner.py                        # Полный evaluation RAG (35 вопросов)
├── evaluation_rerun_after_fixes.py             # Мини-проверка после правок KB
├── reports/                                    # Отчёты обработки (не для Vector Store)
├── evaluation/                                 # Тестовый набор EVAL-001…030
├── docs/VPS_DEPLOY_RU.md                       # Деплой на VPS (основной путь)
└── dev documentation/                          # Продуктовая документация
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
# → http://127.0.0.1:8000  (Ctrl+F5 после правок)
```

### 3. Загрузка базы знаний в Vector Store

```bash
python scripts/upload_kb_to_openai_vector_store.py          # первая загрузка
python scripts/upload_kb_to_openai_vector_store.py --force    # после правок kb/*.md
```

> Без `--force` скрипт пропускает уже загруженные файлы — RAG будет использовать **старое** содержимое.

Отчёт загрузки: `vector_store_upload_report.md`

---

## Frontend MVP v1.4

Виджет: HTML + CSS + Vanilla JavaScript, без сборки.

| Файл | Назначение |
|------|------------|
| `index.html` | Демо-страница-хост |
| `app.js` | Flow v1.4, мини-оценка, каталог 32 услуг, RAG, ES scoring, n8n payload |
| `styles.css` | Стили (префикс `.ecoleadbot-`) |
| `server.py` | FastAPI: статика + `/data/` + `/assets/` + `/kb/` + `POST /api/rag/ask` |

Webhook: `https://n8n.ecolusspb.ru/webhook/ecoleadbot`

### Сценарии виджета

| Вход | Что происходит |
|------|----------------|
| **Понять, что нужно по экологии** | Основной flow → мини-оценка по зонам → RAG «Подробнее» → контакты |
| **Нужна конкретная услуга / документ** | Каталог 32 услуг → квалификация по услуге → контакты |
| **Есть вопрос?** | RAG → ответ / «нет в базе» / техническая ошибка → контакты |

RAG: `POST /api/rag/ask` (OpenAI GPT-4.1 mini + Vector Store). Лиды только через Contact Screen → n8n → Bitrix24.

Payload включает блок **`v14`**: `es_scoring`, `bitrix_comment`, `service_title`, `mini_assessment_zones`, …

Ручные тесты: [`rag_manual_test.md`](rag_manual_test.md)

---

## RAG — база знаний

### Активная база (`kb/`)

~30 документов для Vector Store + `kb/mini_assessment/` (шаблоны зон, не в Vector Store).

Ключевые файлы: законы и приказы, `koap_eco.md`, `FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md`, `services.md`, `company_profile.md`.

### System prompt

`prompts/ecoleadbot_rag_system_prompt.md` — подхватывается backend при каждом запросе.

### Скрипты обработки

```bash
python scripts/process_kb.py       # raw/ → kb/
python scripts/rag_optimize.py     # koap_eco, chunking, future_extension
python scripts/scrape_services.py  # ecolusspb.ru → kb/services.md
```

### Тестирование RAG

```bash
py server.py
python evaluation_runner.py              # → evaluation_results.md
python evaluation_rerun_after_fixes.py   # → evaluation_rerun_after_fixes.md
```

Набор сценариев: `evaluation/evaluation_set.md`

---

## Деплой

**Основной путь — VPS:** пошаговая инструкция в [`docs/VPS_DEPLOY_RU.md`](docs/VPS_DEPLOY_RU.md).

```bash
# На VPS после git clone и .env:
bash deploy/vps_install.sh
curl http://127.0.0.1:8000/api/health   # → {"status":"ok"}
```

Локально через Docker:

```bash
docker compose up -d --build
```

---

## Важно

- В **Vector Store** загружать только `kb/*.md` (не `reports/`, не `future_extension/`, не `kb/mini_assessment/`).
- После правок `kb/*.md` — **`upload_kb_to_openai_vector_store.py --force`**.
- Каталог виджета: **`data/services_catalog_v1.4.json`** (источник правды для 32 услуг).
- n8n: webhook тот же; новые поля лида — в **`v14.*`** и **`contact.comment`** (готовый Bitrix-комментарий).
