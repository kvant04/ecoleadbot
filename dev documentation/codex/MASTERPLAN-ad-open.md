# MASTERPLAN I: Deep-link open bot for ads (`?elb_open=1`)

**Status:** ✅ deployed **v1.5.48** on VPS — ждём `?v=1.5.48` у Андрея на ecolusspb.ru  
**Дата:** 2026-08-12  
**Повод:** Алиса — Яндекс.Директ на ecolusspb.ru, сразу открытое окно бота  

## Цель

Ссылка вида `https://ecolusspb.ru/?elb_open=1&utm_…` открывает popup бота **сразу** при загрузке страницы (intro), без ожидания 45 с и без клика по кнопке.

## Поведение

| Правило | Решение |
|---------|---------|
| Параметры | `elb_open=1` или `ecoleadbot_open=1` |
| Экран | intro (`resume: false`) — не середина опроса |
| Cooldown | **игнорировать** для этого открытия (рекламный клик) |
| Time/scroll auto | после deep-open не дублировать (`autoTriggerUsed = true`) |
| entry_type | `direct`, trigger `url_open` |
| UTM | как сейчас — читать из query |

## Очередь

| Шаг | Кто | Что |
|-----|-----|-----|
| 1 | Codex | код + bump **1.5.48** + build + report | ✅ |
| 2 | Cursor | ревью | ✅ |
| 3 | Deploy | VPS | ✅ |
| 4 | Андрей | `?v=1.5.48` на css/js | ⏳ |

## Success

- [x] `?elb_open=1` → popup intro сразу (код)
- [x] Без параметра — поведение без изменений
- [x] Deployed на VPS
- [ ] Смоук на ecolusspb.ru после `?v=` у Андрея

## Ссылка для рекламы

`https://ecolusspb.ru/?elb_open=1&utm_source=yandex&utm_medium=cpc&utm_campaign=elb_test`

Проверка до смены `?v=` на сайте: `https://elb.ecolusspb.ru/?elb_open=1`
