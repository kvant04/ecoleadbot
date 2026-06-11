# Отчёт оптимизации RAG EcoLeadBot

**Дата:** 2026-06-11

## Сводка

| Показатель | Значение |
|---|---|
| Документов до оптимизации | 42 |
| Документов после оптимизации (активная kb/) | 28 |
| Перенесено в future_extension/ | 15 |
| Создано производных документов | 1 (`koap_eco.md`) |
| Статус валидации ФККО | OK |
| Оценочное число чанков (активная kb/) | ~853 |

## Выполненные задачи

1. **koap_eco.md** — выборка из КоАП: глава 8 + статьи 19.4, 19.4.1, 19.5, 19.6.1, 19.7 (77 статей). Исходный КоАП перенесён в future_extension/.
2. **future_extension/** — нерелевантные для 80% вопросов документы (см. ниже).
3. **pek_recommendation.md** — статусы ACTIVE / AMENDMENT / SUPERSEDED для документов ПЭК.
4. **fkko_validation_report.md** — проверено 25 записей, ошибок: 0.
5. **Chunking Recommendations** — добавлены во все активные документы kb/.

## Активная база kb/ (для Vector Store)

- `007-FZ-ohrane-okruzhayuschey-sredy.md`
- `074-Kodeks-vodnyy-kodeks-rossiyskoy-federacii.md`
- `089-FZ-othodah-proizvodstva-potrebleniya.md`
- `096-FZ-ohrane-atmosfernogo-vozduha.md`
- `1028-PR-Minprirody-utverzhdenii-poryadka-ucheta-oblasti-obrascheniya-othodami.md`
- `1043-PR-Minprirody-utverzhdenii-poryadka-predostavleniya-deklaracii-plate-za.md`
- `109-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md`
- `117-PR-Minprirody-utverzhdenii-formy-deklaracii-vozdeystvii-okruzhayuschuyu-sredu.md`
- `1200-03-SanPiN-sanitarno-zaschitnye-zony-sanitarnaya-klassifikaciya-predpriyatiy.md`
- `1322-03-SanPiN-gigienicheskie-trebovaniya-razmescheniyu-obezvrezhivaniyu-othodov-proizvodstva.md`
- `173-PR-Minprirody-utverzhdenii-formy-otcheta-organizacii-rezultatah-osuschestvleniya.md`
- `2398-PP-utverzhdenii-kriteriev-otneseniya-obektov-okazyvayuschih-nvos.md`
- `241-PR-Minprirody-deklaraciya-plate-za-negativnoe-vozdeystvie-okruzhayuschuyu.md`
- `242-PR-RPN-utverzhdenii-federalnogo-klassifikacionnogo-kataloga-othodov-fkko.md`
- `248-FZ-gosudarstvennom-kontrole-nadzore-municipalnom-kontrole-rossiyskoy.md`
- `262-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md`
- `416-FZ-vodosnabzhenii-vodootvedenii.md`
- `445-PR-Rosstat-utverzhdenii-formy-federalnogo-statisticheskogo-nablyudeniya-tp.md`
- `581-PR-Minprirody-utverzhdenii-metodiki-razrabotki-rascheta-ustanovleniya-ndv.md`
- `614-PR-Rosstat-utverzhdenii-formy-federalnogo-statisticheskogo-nablyudeniya-tp.md`
- `652-PR-Minprirody-utverzhdenii-poryadka-predostavleniya-prognoza-nmu.md`
- `661-PR-Rosstat-utverzhdenii-formy-federalnogo-statisticheskogo-nablyudeniya-forma.md`
- `662-PR-Minprirody-utverzhdenii-trebovaniy-planu-meropriyatiy-snizheniyu-vybrosov.md`
- `871-PR-Minprirody-utverzhdenii-poryadka-provedeniya-inventarizacii-stacionarnyh-istochnikov.md`
- `913-PP-stavkah-platy-za-negativnoe-vozdeystvie-okruzhayuschuyu.md`
- `FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md`
- `NVOS-Ref-perechni-dokumentacii-po-kategoriyam-obektov-nvos.md`
- `koap_eco.md`

## Исключённые документы (future_extension/)

- `019-PR-RPN-vnesenii-izmeneniy-federalnyy-klassifikacionnyy-katalog-othodov.md` — Приказ-изменение к ФККО; для RAG достаточен базовый каталог №242.
- `027-FZ-nedrah.md` — ФЗ о недрах — узкая тематика недропользования, не входит в 80% типовых вопросов EcoLeadBot.
- `052-FZ-sanitarno-epidemiologicheskom-blagopoluchii-naseleniya.md` — Общий санитарный закон; детализация в профильных СанПиН.
- `099-FZ-licenzirovanii-otdelnyh-vidov-deyatelnosti.md` — Общий закон о лицензировании; экологические лицензии покрываются профильными НПА.
- `1110-02-SanPiN-zony-sanitarnoy-ohrany-istochnikov-vodosnabzheniya-vodoprovodov.md` — ЗСО источников водоснабжения — специализированный водный блок.
- `150-PR-Minprirody-vnesenii-izmeneniy-trebovaniya-soderzhaniyu-programmy-pek.md` — Изменения к пр. №109; включены в актуальную цепочку через пр. №262.
- `174-FZ-ekologicheskoy-ekspertize.md` — Экологическая экспертиза — нишевый блок, редко в типовых консультациях MVP.
- `195-Kodeks-kodeks-administrativnyh-pravonarusheniyah.md` — Полный КоАП (~10k статей); для RAG создан производный koap_eco.md с экологическими статьями.
- `23-03-2003-SNiP-stroitelnye-normy-pravila-rossiyskoy-federacii-zaschita.md` — СНиП по защите от шума — строительная ниша, низкий приоритет для MVP.
- `359-PR-RPN-vnesenii-izmeneniy-federalnyy-klassifikacionnyy-katalog-othodov.md` — Приказ-изменение к ФККО; для RAG достаточен базовый каталог №242.
- `562-96-SanPiN-fizicheskie-faktory-proizvodstvennoy-sredy-okruzhayuschey-prirodnoy.md` — Физические факторы производственной среды — узкая санитарная тема.
- `573-96-SanPiN-gigienicheskie-trebovaniya-ispolzovaniyu-stochnyh-vod-osadkov.md` — Сточные воды для орошения — сельхоз-ниша.
- `723-PR-RPN-vnesenii-izmeneniy-federalnyy-klassifikacionnyy-katalog-othodov.md` — Приказ-изменение к ФККО; для RAG достаточен базовый каталог №242.
- `825-PR-Minprirody-vnesenii-izmeneniy-poryadok-ucheta-oblasti-obrascheniya.md` — Изменения к пр. №1028; базовый приказ об учёте отходов сохранён в kb/.
- `913-PP-federalnoy-gosudarstvennoy-informacionnoy-sisteme-ucheta-tverdyh.md` — ФГИС УТКО — муниципальная система учёта ТКО, нишевый контекст.

## Документы, требующие проверки

- Нет критических замечаний по активной базе.

## Рекомендации по загрузке в OpenAI Vector Store

1. Загружать только файлы из `kb/` (не `future_extension/`).
2. **Приоритет high:** 7-ФЗ, 89-ФЗ, 96-ФЗ, 416-ФЗ, 248-ФЗ, 2398-ПП, koap_eco.md, NVOS-Ref, FAQ.
3. **ФККО:** один файл `242-PR-RPN-...`; чанкинг registry_based, 100–150 записей.
4. **ПЭК:** primary — пр. №109 + №262; форма отчёта — пр. №173.
5. Использовать metadata из YAML frontmatter для фильтрации по topic/tags.
6. Модель: **GPT-4.1 mini**; temperature 0.1–0.3 для юридических ответов.

## Рекомендации по запуску MVP

- Начать с ~28 документов активной kb/ (~853 чанков).
- Прогнать 20–30 типовых вопросов из FAQ и проверить retrieval.
- Мониторить галлюцинации по ссылкам на утратившие силу НПА (раздел Warnings).
- После MVP расширять базу документами из future_extension/ по запросу пользователей.
