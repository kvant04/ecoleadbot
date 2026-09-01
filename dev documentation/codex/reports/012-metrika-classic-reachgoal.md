# Отчёт 012 — classic Metrika reachGoal

## Root cause

Сайт использует классический `watch.js` и объект `window.yaCounter22994308`, а виджет проверял только современный API `window.ym()`. Поэтому цели не отправлялись и в статистике оставались нулевыми.

## Files changed

- `widget/src/07-analytics.js` — classic/modern reachGoal, target counter и retry-очередь.
- `widget/src/01-config.js` — версия виджета `1.5.52`.
- `app.js` — пересобранный артефакт.
- `embed.js` — baked cache-bust version `1.5.52`.

## XOR + retry behavior

- Используется только `ECOLEADBOT_CONFIG.yandexMetrikaCounterId` (`22994308`). Broadcast по другим `yaCounter*` удалён.
- Для одного `track()` вызывается ровно один путь: если есть `window.ym`, используется только `ym(counterId, "reachGoal", goalName)`; иначе используется только `window.yaCounter22994308.reachGoal(goalName)`.
- Если API ещё не готов, цель попадает в дедуплицируемую pending-очередь. Выполняются три повтора через `500`, `1000` и `1500` мс; после успешной отправки pending очищается. При ошибках Metrika виджет продолжает работать.
- В `reachGoal` передаётся только имя цели, без PII. `dataLayer.push` сохранён без изменений.

## Version

`1.5.52`.

Build: `py scripts/build_widget.py` — успешно, 27 фрагментов.

## Manual test steps on ecolusspb.ru

После деплоя:

1. Открыть `https://ecolusspb.ru/?elb_open=1` в DevTools.
2. Убедиться, что `typeof window.ym !== "function"`, а `window.yaCounter22994308` существует и содержит `reachGoal`.
3. Открыть виджет и выполнить одно действие, например открыть виджет (`ecoleadbot_widget_opened`).
4. Вызвать `window.dataLayer` и Network: должен быть один goal-hit в запросах Metrika, без PII и без двойного вызова modern/classic API.
5. Проверить в кабинете Metrika realtime/Stat API цель `ecoleadbot_widget_opened` после обычной задержки обработки данных.
6. Для retry-теста временно выполнить действие до появления `yaCounter22994308`, затем создать объект счётчика в течение 1–2 секунд и убедиться, что queued goal отправлен один раз.

## Что не удалось

Ничего в рамках локального кода и сборки. Live-smoke на `ecolusspb.ru`, проверка Metrika Stat API, деплой и отправка SMTP письма не выполнялись: они явно находятся вне scope этой задачи.
