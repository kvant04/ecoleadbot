# Widget sources (EcoLeadBot)

## Source of truth

Редактируйте файлы в `widget/src/`, затем собирайте артефакт:

```powershell
py scripts/build_widget.py
```

Результат: корневой **`app.js`** (его забирает VPS / SpaceWeb).

Порядок фрагментов задаёт `widget/MANIFEST.txt`.

## Первичная нарезка из монолита

Если нужно пересобрать фрагменты из текущего `app.js`:

```powershell
py scripts/split_widget_sources.py
py scripts/build_widget.py
```

После ручного дробления крупных кусков (`03a/b/c`, `16a/b/c`) `split_widget_sources.py` перезапишет `src/` — используйте осторожно.

## Модули (кратко)

| Префикс | Содержание |
|---------|------------|
| `01` | config |
| `02` | каталог / зоны |
| `03a–c` | document branch (gates, core, screens) |
| `04` | main flow |
| `15` | screens мини-оценки |
| `16a–c` | RAG API, ES scoring, RAG UI |
| `19` | payload / webhook |

Скоринг CRM: см. `integrations/n8n/SCORING_OWNERSHIP.md`.
