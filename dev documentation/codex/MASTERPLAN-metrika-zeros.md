# MASTERPLAN L: Метрика ELB — цели по нулям (Алиса 2026-08-24)

**Status:** ✅ deployed **v1.5.52** — live smoke Network goal hit confirmed (2026-08-24)  
**Дата:** 2026-08-24  
**Critic:** [Metrika critic](ffb70abd-52d2-42c9-8c77-fbb135f48502) — XOR API, retry-first, DoD goals/double-count  
**Повод:** Алиса — в Яндекс.Метрике по целям EcoLeadBot «всё по нулям»; еженедельный отчёт тоже нулевой.

## Диагностика (факт с диска + API + HTML сайта)

| Проверка | Результат |
|----------|-----------|
| Счётчик на ecolusspb.ru | **22994308** (подтверждён в HTML) |
| Как подключён | **Старый** `mc.yandex.ru/metrika/watch.js` + `new Ya.Metrika({id:22994308})` → `window.yaCounter22994308` |
| Современный `window.ym` (tag.js) | **Не найден** в HTML (нет `ym(`, нет `tag.js`) |
| Код виджета `07-analytics.js` | Шлёт цели **только** если `typeof window.ym === "function"` → `ym(id, "reachGoal", name)` |
| Цели в Метрике | Все 6 `ecoleadbot_*` **созданы** (id 594567114…562), type=`action` |
| Stat API 14 дней | visits=6828, pageviews=8206, **все 6 goal reaches = 0** |
| Виджет на проде | embed/app **1.5.51**, counterId в конфиге есть |

**Root cause:** сайт использует classic Metrika API (`yaCounterNNNN.reachGoal`), а виджет ждёт только новый `ym()`. Условие `typeof ym === "function"` ложно → **reachGoal никогда не вызывается** → в отчётах нули.

Вторичные риски (чинить в том же проходе):

1. Metrika грузится async — виджет может открыться раньше счётчика; нужен fallback/очередь через `yandex_metrika_callbacks` или повтор при появлении `yaCounter*`.
2. Автодетект `yaCounter*` есть, но до него код не доходит из‑за гейта на `ym`.
3. Отчёт F2/J исправен логически — нули из‑за отсутствия достижений, не из‑за SMTP.

**Не root cause:** отсутствие целей в кабинете (они есть); неверный counter id; «Андрей не обновил ?v=» (embed 1.5.51 на месте).

## Цель (метрика успеха)

После фикса: тестовое достижение `ecoleadbot_widget_opened` видно в Metrika Stat API / realtime (или ≥1 reach за сегодня после ручного смоука). Еженедельный отчёт перестаёт быть «все нули» при реальном трафике бота.

## Решение

### L1 — Classic + modern Metrika reachGoal (P0) — патчи критика

В `widget/src/07-analytics.js`:

1. **XOR на один counterId (анти-double-count):**  
   - если `typeof window.ym === "function"` → **только** `ym(counterId, "reachGoal", goalName)`;  
   - иначе если есть `window["yaCounter" + counterId]` с `.reachGoal` → **только** classic;  
   - **никогда** оба пути на один id за один `track()`.
2. Гейт **не** требует `ym` — classic достаточен.
3. **Политика счётчиков:** слать **только** в `ECOLEADBOT_CONFIG.yandexMetrikaCounterId` (22994308), плюс автодетект этого же id если объект уже есть. Не broadcast на все `yaCounter*` на странице (молчание критика).
4. **Async (retry-first):** если цель из allowlist, а API ещё не готов — pending queue + poll/retry **2–3 раза** в течение ~1–2 с до появления `yaCounter{id}` или `ym`; после успешного fire — clear/dedupe pending.  
   `yandex_metrika_callbacks` — **только опционально**, с пометкой «может быть no-op после drain watch.js»; основной путь = retry.
5. Без ПДн в параметрах reachGoal (только имя цели).
6. `dataLayer.push` без изменений.

### L2 — Версия / деплой

- Bump `WIDGET_VERSION` → **1.5.52**
- `py scripts/build_widget.py`
- Deploy VPS (`embed.js` сам обновит cache-bust)

### L3 — Самопроверка оркестратора (обязательна до сдачи Олегу)

1. После деплоя: `embed.js` VERSION=1.5.52.
2. В `app.js`: есть classic `yaCounter` path + XOR (нет «оба сразу»).
3. Pre-smoke live: на ecolusspb.ru `typeof ym !== "function"` **и** есть/появится `yaCounter22994308` (или задокументировать иное). Adblock = возможный ложный fail.
4. Management API: у 6 целей `ecoleadbot_*` condition identifier совпадает с именем `reachGoal` (exact или contain имени — зафиксировать факт).
5. Смоук: `?elb_open=1` → один hit на один open; Network proof = запрос к `mc.yandex.ru` / watch с goal (не OAuth URL в логах).
6. Stat API за **сегодня** по `ecoleadbot_widget_opened` — ideally > 0 (лаг до ~15–30 мин допустим, тогда STATUS с временем смоука).
7. Письмо SMTP Алисе **не** слать без ок Олега. Токен Метрики только из env, не в чат/STATUS.

### L4 — Документация / Алиса

Короткий STATUS + текст Алисе: причина (старый код Метрики на сайте vs новый API в боте), что починили, как проверить в кабинете (Цели / сегодня).

## Out of scope

- Перевод сайта ЭУ с `watch.js` на `tag.js` (это шаблон Bitrix — не наш репозиторий)
- GTM-триггеры / GA4
- Новые цели сверх текущих 6
- Смена счётчика
- Коммит/пуш — только по команде Олега после приёмки

## Очередь

| Шаг | Кто | Что |
|-----|-----|-----|
| 0 | Cursor | Masterplan + агент-критик |
| 1 | Codex | L1 + bump 1.5.52 + build + report `012-metrika-classic-reachgoal.md` |
| 2 | Cursor | Ревью кода vs DoD |
| 3 | Cursor | Deploy + L3 самопроверка API |
| 4 | Cursor | STATUS + текст Алисе |

## Success DoD

- [x] XOR: на один counterId за один track — либо `ym`, либо `yaCounter.reachGoal`
- [x] Работает без `window.ym` (classic path)
- [x] Retry/poll pending goals; без вечного спама; dedupe после fire
- [x] Только counter 22994308 (config), не все счётчики подряд
- [x] v1.5.52 на VPS
- [x] Goal conditions в API: `contain` + identifier = имени reachGoal (совпадает)
- [x] Live smoke: `ym` undefined, `yaCounter22994308` ok, dataLayer `ecoleadbot_widget_opened`, Network `watch/22994308?page-url=goal://…/ecoleadbot_widget_opened`
- [x] Report 012 + «что не удалось»
- [ ] Stat API today > 0 — возможен лаг 15–30 мин после смоука; перепроверить позже

## Caps / запреты

- Секреты (.env, webhook) не логировать и не светить в чат
- Не трогать Bitrix-шаблон сайта без явного ок
- Не слать маркетинговое письмо Алисе из SMTP без ок Олега
