# Report 013 — KB update Sep 2026 (orders 227, 182, FKKO 242)

## Root / decision

Сводка законодательства + файлы Олега. Вариант **A**.  
**Hard gate 182:** приказ № 182 признаёт утратившими силу № 1043, № 624 и № 241 → оба `1043` и `241` вынесены из активного `kb/` в `future_extension/`.  
**227:** признаёт утратившими силу № 1028 и № 825 → `1028` в `future_extension/`.  
Письмо РПН 30.06.2026 — только FAQ + Warning в `581` (не отдельный `kb/*.md`).

## Files changed (active KB)

- **New:** `kb/227-PR-Minprirody-utverzhdenii-poryadka-ucheta-oblasti-obrascheniya-othodami.md`
- **New:** `kb/182-PR-Minprirody-utverzhdenii-poryadka-predstavleniya-deklaracii-plate-za.md`
- **Replaced:** `kb/242-PR-RPN-…fkko.md` (редакция с изм. до пр. РПН № 341 от 08.06.2026)
- **FAQ / services / NVOS-Ref / 581:** актуализация ссылок 1028→227, 1043→182; блок «с 01.09.2026»; разъяснение НДВ
- **Retired → `future_extension/`:** `1028-…`, `1043-…`, `241-…` (+ archived superseded `raw/`)

## Vector Store

- Command: `py scripts/upload_kb_to_openai_vector_store.py --force`
- Store: `vs_6a2ac9effa28819182feb2834e04428f`
- **29 / 29 completed** (включая ранее проблемный `416-FZ`)
- В VS есть `182`, `227`, новый `242`; нет `1028`/`1043`/`241`

## Critic patches applied

- Изолированный батч (`raw_batch_sep2026`), без полного `process_kb` по всему `raw/`
- Письмо не в корне `kb/`
- Один stem `242-*.md`
- Даты силы из текста приказов (01.09.2026)

## Что не удалось

- Полноценный live smoke RAG-вопросов в UI не гонялся в этом отчёте (VS зелёный; при необходимости — ручной вопрос в боте про №227/№182).
- Временные helper-скрипты `scripts/_convert_letter_odt.py`, `scripts/_patch_kb_sep2026_refs.py` можно удалить после приёмки; `build_kb_sep2026_batch.py` оставлен как воспроизводимый батч.

## Manual smoke (рекомендуется Алисе/Олегу)

1. «Какой приказ по учёту отходов с сентября 2026?» → № 227, не № 1028 как действующий.  
2. «Форма декларации о плате за НВОС?» → № 182.  
3. «Нужно ли корректировать старые НДВ?» → письмо РПН 30.06.2026: корректировка не предусмотрена, нужны новые НДВ.
