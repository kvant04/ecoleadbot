# SpaceWeb / статическая выгрузка EcoLeadBot

## Source of truth

Актуальный код виджета — **корень репозитория** (`app.js`, `index.html`, `data/`, `kb/mini_assessment/`).

Каталог `deploy/sweb/dist/` — **снимок для загрузки на SpaceWeb**, не источник правок.

| Путь | Роль |
|------|------|
| корень репо | разработка + деплой на VPS (`deploy/deploy.ps1`) |
| `deploy/sweb/elb-config.js` | шаблон конфига **без секрета** (`webhookSecret: ""`) |
| `deploy/sweb/dist/` | результат `pack_sweb_static.ps1` |

## Сборка dist

Из корня проекта:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/pack_sweb_static.ps1
```

Скрипт пересобирает `dist/` из корня и пишет ZIP.  
**Перед заливкой на SpaceWeb** всегда запускайте pack — не правьте файлы внутри `dist/` вручную.

## Секрет webhook

`webhookSecret` задавайте только на сервере / в панели хостинга, не коммитьте реальное значение.  
Шаблон: `deploy/sweb/elb-config.js`.
