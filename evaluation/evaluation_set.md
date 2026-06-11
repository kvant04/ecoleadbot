# EcoLeadBot RAG — Evaluation Set

**Версия:** 1.0  
**Дата:** 2026-06-11  
**Назначение:** регрессионное тестирование RAG Assistant после обновления базы знаний, системного промпта или модели.

**Состав базы знаний (активная `kb/`):** нормативные документы РФ, `FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md`, `NVOS-Ref-perechni-dokumentacii-po-kategoriyam-obektov-nvos.md`, `koap_eco.md`, `services.md`, `company_profile.md`.

---

# Блок 1. Законодательство (10 сценариев)

---

## Test ID: EVAL-001

**Category:** Legislation

**Question:**

Обязательно ли предприятию вести учёт образования и движения отходов, если отходов немного?

**Expected Behaviour:**

EcoLeadBot отвечает на основании нормативной базы об обращении с отходами; объясняет общий принцип учёта отходов; не выдумывает исключения; при неясности категории объекта предлагает уточнить вид деятельности.

**Expected Sources:**

- `089-FZ-othodah-proizvodstva-potrebleniya.md`
- `1028-PR-Minprirody-utverzhdenii-poryadka-ucheta-oblasti-obrascheniya-othodami.md`
- `FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md`

**Expected Route:**

answer

**Pass Criteria:**

- Ответ опирается на требования к учёту отходов, а не на общие рассуждения.
- Указан или явно использован нормативный источник (ФЗ об отходах / приказ об учёте).
- Нет вымышленных штрафов, сроков или категорий.
- При недостатке данных — просьба уточнить, а не догадка.

---

## Test ID: EVAL-002

**Category:** Legislation

**Question:**

Нужно ли разрабатывать НДВ, если у нас объект III категории НВОС и есть выбросы?

**Expected Behaviour:**

EcoLeadBot объясняет связь категории НВОС и необходимости нормативов выбросов; упоминает нюанс по классам опасности веществ для объектов III категории; ссылается на нормативную базу; при сложном кейсе предлагает консультацию.

**Expected Sources:**

- `096-FZ-ohrane-atmosfernogo-vozduha.md`
- `581-PR-Minprirody-utverzhdenii-metodiki-razrabotki-rascheta-ustanovleniya-ndv.md`
- `2398-PP-utverzhdenii-kriteriev-otneseniya-obektov-okazyvayuschih-nvos.md`
- `NVOS-Ref-perechni-dokumentacii-po-kategoriyam-obektov-nvos.md`

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Упомянута категория объекта НВОС как фактор.
- Не утверждается однозначно «нужно всем» или «не нужно никому» без оговорок.
- Есть отсылка к нормативным документам по выбросам / НДВ.
- Сложный кейс завершается мягким предложением консультации, а не «продажей».

---

## Test ID: EVAL-003

**Category:** Legislation

**Question:**

Как понять, к какой категории относится наш объект НВОС?

**Expected Behaviour:**

EcoLeadBot описывает логику отнесения объектов к категориям I–IV; ссылается на критерии и справочник перечней документации; не подставляет категорию без данных о виде деятельности и воздействии.

**Expected Sources:**

- `2398-PP-utverzhdenii-kriteriev-otneseniya-obektov-okazyvayuschih-nvos.md`
- `NVOS-Ref-perechni-dokumentacii-po-kategoriyam-obektov-nvos.md`
- `007-FZ-ohrane-okruzhayuschey-sredy.md`

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Описаны категории I–IV или порядок их определения.
- Использован справочник НВОС или постановление о критериях.
- Бот запрашивает недостающие сведения вместо выдуманной категории.

---

## Test ID: EVAL-004

**Category:** Legislation

**Question:**

Нужно ли мне делать ПЭК, если у нас небольшое производство?

**Expected Behaviour:**

EcoLeadBot объясняет, что такое ПЭК и в каких случаях она требуется; опирается на приказы Минприроды; использует бытовую формулировку пользователя; при неопределённости категории объекта предлагает уточнение или консультацию.

**Expected Sources:**

- `109-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md`
- `262-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md`
- `FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md`

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Дано определение / назначение ПЭК из нормативного источника.
- Нет категоричного «да/нет» без привязки к типу объекта и деятельности.
- Упомянут актуальный приказ №109 (с учётом изменений №262).

---

## Test ID: EVAL-005

**Category:** Legislation

**Question:**

Что такое НМУ и какие документы нужны при неблагоприятных метеоусловиях?

**Expected Behaviour:**

EcoLeadBot объясняет понятие НМУ; перечисляет связанные документы (прогноз, план мероприятий и т.п.) по базе знаний; не придумывает региональные особенности.

**Expected Sources:**

- `652-PR-Minprirody-utverzhdenii-poryadka-predostavleniya-prognoza-nmu.md`
- `662-PR-Minprirody-utverzhdenii-trebovaniy-planu-meropriyatiy-snizheniyu-vybrosov.md`
- `096-FZ-ohrane-atmosfernogo-vozduha.md`

**Expected Route:**

answer

**Pass Criteria:**

- Расшифровано НМУ или дано нормативное определение.
- Назван хотя бы один документ из базы (прогноз НМУ / план мероприятий).
- Ответ не смешивает НМУ с другими режимами (СЗЗ, ПДВ и т.д.).

---

## Test ID: EVAL-006

**Category:** Legislation

**Question:**

Какие отчёты по экологии нужно сдавать в Росстат — 2-ТП?

**Expected Behaviour:**

EcoLeadBot перечисляет формы статистической отчётности 2-ТП по тематикам (отходы, воздух, водхоз); указывает, что набор зависит от вида воздействия; ссылается на приказы Росстата.

**Expected Sources:**

- `661-PR-Rosstat-utverzhdenii-formy-federalnogo-statisticheskogo-nablyudeniya-forma.md`
- `614-PR-Rosstat-utverzhdenii-formy-federalnogo-statisticheskogo-nablyudeniya-tp.md`
- `445-PR-Rosstat-utverzhdenii-formy-federalnogo-statisticheskogo-nablyudeniya-tp.md`
- `FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md`

**Expected Route:**

answer

**Pass Criteria:**

- Упомянуты формы 2-ТП или их тематики (отходы / воздух / водное хозяйство).
- Есть ссылка на приказ Росстата или FAQ.
- Не названы формы, отсутствующие в базе знаний.

---

## Test ID: EVAL-007

**Category:** Legislation

**Question:**

Как часто нужно проводить инвентаризацию выбросов на предприятии?

**Expected Behaviour:**

EcoLeadBot отвечает по порядку инвентаризации стационарных источников; указывает нормативную основу; не подменяет инвентаризацию выбросов инвентаризацией отходов.

**Expected Sources:**

- `871-PR-Minprirody-utverzhdenii-poryadka-provedeniya-inventarizacii-stacionarnyh-istochnikov.md`
- `096-FZ-ohrane-atmosfernogo-vozduha.md`

**Expected Route:**

answer

**Pass Criteria:**

- Ответ относится к инвентаризации выбросов / стационарных источников.
- Использован пр. №871 или 96-ФЗ.
- Периодичность или порядок взяты из источника, а не выдуманы.

---

## Test ID: EVAL-008

**Category:** Legislation

**Question:**

Какой штраф грозит за невыполнение предписания Росприроднадзора?

**Expected Behaviour:**

EcoLeadBot отвечает по статьям КоАП об административной ответственности и/или о неисполнении предписаний надзорных органов; приводит диапазоны санкций из koap_eco; не смешивает с уголовной ответственностью.

**Expected Sources:**

- `koap_eco.md` (ст. 8.x, 19.5, 19.4)
- `248-FZ-gosudarstvennom-kontrole-nadzore-municipalnom-kontrole-rossiyskoy.md`

**Expected Route:**

answer

**Pass Criteria:**

- Указана административная ответственность (не уголовная).
- Санкции или виды ответственности соответствуют тексту koap_eco.
- Есть disclaimer, что точная сумма зависит от состава правонарушения и субъекта.

---

## Test ID: EVAL-009

**Category:** Legislation

**Question:**

Что такое государственный экологический контроль и чем он отличается от производственного?

**Expected Behaviour:**

EcoLeadBot разграничивает государственный контроль (надзор) и производственный экологический контроль; опирается на 248-ФЗ и документы о ПЭК; не путает с экологическим сопровождением компании.

**Expected Sources:**

- `248-FZ-gosudarstvennom-kontrole-nadzore-municipalnom-kontrole-rossiyskoy.md`
- `109-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md`
- `007-FZ-ohrane-okruzhayuschey-sredy.md`

**Expected Route:**

answer

**Pass Criteria:**

- Чётко разделены понятия «государственный контроль» и «ПЭК / производственный контроль».
- Использован 248-ФЗ и/или приказ о ПЭК.
- Нет вымышленных полномочий или органов.

---

## Test ID: EVAL-010

**Category:** Legislation

**Question:**

Как по коду ФККО понять, к какому классу опасности относится отход?

**Expected Behaviour:**

EcoLeadBot объясняет структуру кода ФККО и связь с классом опасности; ссылается на каталог ФККО; не присваивает конкретный код без данных от пользователя.

**Expected Sources:**

- `242-PR-RPN-utverzhdenii-federalnogo-klassifikacionnogo-kataloga-othodov-fkko.md`
- `089-FZ-othodah-proizvodstva-potrebleniya.md`

**Expected Route:**

answer

**Pass Criteria:**

- Описана структура кода или порядок работы с ФККО.
- Использован каталог ФККО (пр. №242).
- Бот не выдаёт вымышленный код отхода для конкретного описания без оснований.

---

# Блок 2. Услуги компании (10 сценариев)

---

## Test ID: EVAL-011

**Category:** Services

**Question:**

У нас только офис, нам что-то нужно по экологии?

**Expected Behaviour:**

EcoLeadBot объясняет типовые обязательства даже для «простых» объектов (отходы, учёт, отчётность); использует FAQ и услуги; не запугивает; при необходимости предлагает диагностику / консультацию.

**Expected Sources:**

- `FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md`
- `company_profile.md` (FAQ)
- `services.md` (Быстрая диагностика по экологии)

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Упомянуты отходы и/или базовая отчётность для офиса.
- Использован FAQ или услуга «Быстрая диагностика».
- Нет навязчивой продажи без объяснения сути.

---

## Test ID: EVAL-012

**Category:** Services

**Question:**

Сколько стоит экологическое сопровождение у вас?

**Expected Behaviour:**

EcoLeadBot отвечает по данным services.md и company_profile.md; указывает, что стоимость зависит от объёма работ; приводит ориентир из базы (если есть); предлагает консультацию для расчёта.

**Expected Sources:**

- `services.md` (Экологическое сопровождение бизнеса)
- `company_profile.md` (FAQ «Сколько стоит экологическое сопровождение?»)

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Указана зависимость цены от объёма / категории объекта.
- Приведён ориентир из базы (например, «от 6 500 руб./мес» или «от 6000 руб./мес») — без выдуманных цифр.
- Предложена консультация / уточнение данных.

---

## Test ID: EVAL-013

**Category:** Services

**Question:**

Вы можете разработать программу ПЭК для нашего предприятия?

**Expected Behaviour:**

EcoLeadBot подтверждает услугу разработки ПЭК; кратко описывает суть; ссылается на services.md; при complex-кейсе рекомендует консультацию.

**Expected Sources:**

- `services.md` (Разработать программу ПЭК)
- `109-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md` (контекст)

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Подтверждена услуга разработки ПЭК.
- Описание совпадает с services.md, а не выдумано.
- Recommended Route ведёт к консультации / заявке при необходимости.

---

## Test ID: EVAL-014

**Category:** Services

**Question:**

Нужен проект ПДВ — вы этим занимаетесь и сколько это примерно стоит?

**Expected Behaviour:**

EcoLeadBot описывает услугу ПДВ/НДВ; указывает для кого она актуальна; приводит ориентир стоимости из services.md; предлагает консультацию.

**Expected Sources:**

- `services.md` (Проект ПДВ и НДВ)

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Услуга ПДВ/НДВ идентифицирована корректно.
- Указана целевая аудитория (категории НВОС / выбросы) из services.md.
- Стоимость — только из базы (например, «от 82 000 руб.»), без выдумок.

---

## Test ID: EVAL-015

**Category:** Services

**Question:**

Поможете оформить паспорт на отходы III класса опасности?

**Expected Behaviour:**

EcoLeadBot подтверждает услугу паспортизации отходов; объясняет суть услуги; использует services.md; уточняет, что детали зависят от вида отхода.

**Expected Sources:**

- `services.md` (Паспорт отходов 1–4 класса опасности)

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Подтверждена услуга паспорта отходов.
- Класс опасности III не игнорируется.
- Нет вымышленных сроков или обязательных документов вне базы.

---

## Test ID: EVAL-016

**Category:** Services

**Question:**

Нужна лицензия на транспортировку отходов — как вы помогаете?

**Expected Behaviour:**

EcoLeadBot описывает услугу лицензирования деятельности с опасными отходами; использует services.md; не обещает гарантий, не указанных на сайте.

**Expected Sources:**

- `services.md` (Лицензия на транспортирование отходов 1–4 классов опасности)

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Услуга лицензирования идентифицирована.
- Описание соответствует services.md.
- Сложный кейс → предложение консультации.

---

## Test ID: EVAL-017

**Category:** Services

**Question:**

Как поставить объект на учёт в реестре НВОС через вас?

**Expected Behaviour:**

EcoLeadBot описывает услугу постановки на экологический учёт; объясняет, кому она нужна; ссылается на services.md и при необходимости на нормативку по НВОС.

**Expected Sources:**

- `services.md` (Постановка на учет объектов негативного воздействия)
- `2398-PP-utverzhdenii-kriteriev-otneseniya-obektov-okazyvayuschih-nvos.md`

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Услуга постановки на учёт НВОС названа корректно.
- Есть связь с реестром / категорией объекта.
- Нет выдуманного порядка подачи документов.

---

## Test ID: EVAL-018

**Category:** Services

**Question:**

Можно заказать у вас экологический аудит перед проверкой?

**Expected Behaviour:**

EcoLeadBot описывает услугу «Быстрая диагностика по экологии» / экологический аудит; объясняет ценность; использует services.md; предлагает следующий шаг (консультация / заявка).

**Expected Sources:**

- `services.md` (Быстрая диагностика по экологии)

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Услуга аудита / диагностики найдена в services.md.
- Описание не путается с госэкспертизой или ПЭК.
- Предложен логичный следующий шаг (консультация).

---

## Test ID: EVAL-019

**Category:** Services

**Question:**

Сможете сдать за нас отчёты 2-ТП?

**Expected Behaviour:**

EcoLeadBot подтверждает услугу по статистической отчётности 2-ТП; описывает, что входит; использует services.md; уточняет, какие формы нужны конкретному клиенту.

**Expected Sources:**

- `services.md` (Отчет по форме 2-ТП)
- `661-PR-Rosstat-utverzhdenii-formy-federalnogo-statisticheskogo-nablyudeniya-forma.md`

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Услуга 2-ТП идентифицирована.
- Уточняется вид отчётности (отходы / воздух / водхоз).
- Нет обещания «сдать любые отчёты» без уточнения.

---

## Test ID: EVAL-020

**Category:** Services

**Question:**

Нужен проект санитарно-защитной зоны для производства — делаете?

**Expected Behaviour:**

EcoLeadBot описывает услугу проекта СЗЗ; объясняет назначение; использует services.md; при complex-кейсе рекомендует консультацию.

**Expected Sources:**

- `services.md` (Проект СЗЗ)
- `1200-03-SanPiN-sanitarno-zaschitnye-zony-sanitarnaya-klassifikaciya-predpriyatiy.md`

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Услуга СЗЗ идентифицирована.
- Кратко объяснено назначение СЗЗ.
- Описание согласовано с services.md.

---

# Блок 3. Компания (5 сценариев)

---

## Test ID: EVAL-021

**Category:** Company

**Question:**

Кто вы такие и сколько лет на рынке?

**Expected Behaviour:**

EcoLeadBot отвечает по company_profile.md; называет компанию «Экологические услуги»; указывает год основания (2008); не придумывает дополнительные факты.

**Expected Sources:**

- `company_profile.md` (раздел «Кто мы»)

**Expected Route:**

answer

**Pass Criteria:**

- Названа компания «Экологические услуги».
- Указано основание в 2008 году (или «с 2008 года»).
- Нет вымышленных наград, сертификатов, цифр.

---

## Test ID: EVAL-022

**Category:** Company

**Question:**

Сколько проектов вы уже сделали и сколько клиентов на сопровождении?

**Expected Behaviour:**

EcoLeadBot приводит подтверждённые показатели из company_profile.md (8000+ проектов, ~100 компаний на сопровождении); не округляет и не exaggerates сверх текста базы.

**Expected Sources:**

- `company_profile.md` (раздел «Наш опыт»)

**Expected Route:**

answer

**Pass Criteria:**

- Упомянуто «более 8000 проектов» или эквивалент из базы.
- Упомянуто «около 100 компаний» на сопровождении.
- Цифры не изменены произвольно.

---

## Test ID: EVAL-023

**Category:** Company

**Question:**

Вы работаете только в Петербурге или по всей России?

**Expected Behaviour:**

EcoLeadBot отвечает по разделу «География работы»; указывает работу по регионам РФ и дистанционный формат; упоминает оговорку об исключениях, если она есть в базе.

**Expected Sources:**

- `company_profile.md` (раздел «География работы»)
- `company_profile.md` (FAQ «Вы работаете по всей России?»)

**Expected Route:**

answer

**Pass Criteria:**

- Указана работа по регионам РФ.
- Упомянут дистанционный формат (если есть в базе).
- Не заявлено «только СПб», если база говорит об обратном.

---

## Test ID: EVAL-024

**Category:** Company

**Question:**

Как с вами связаться — телефон и почта?

**Expected Behaviour:**

EcoLeadBot приводит контакты из company_profile.md; указывает телефон 8 (800) 550-02-19 и/или office@ecolusspb.ru; не выдумывает мессенджеры или адреса, отсутствующие в базе.

**Expected Sources:**

- `company_profile.md` (раздел «Контакты»)

**Expected Route:**

answer

**Pass Criteria:**

- Указан телефон из базы: 8 (800) 550-02-19.
- Указан email office@ecolusspb.ru.
- Адрес офиса соответствует базе (СПб, Бухарестская).

---

## Test ID: EVAL-025

**Category:** Company

**Question:**

Почему мне стоит обратиться именно к вам, а не нанять эколога в штат?

**Expected Behaviour:**

EcoLeadBot использует подтверждённые преимущества из company_profile.md и FAQ; сравнивает аутсорсинг и штатный эколог без выдуманных аргументов; может предложить консультацию.

**Expected Sources:**

- `company_profile.md` (разделы «Почему нам доверяют», «Преимущества», FAQ)
- `services.md` (Экологическое сопровождение бизнеса)

**Expected Route:**

answer → lead_capture

**Pass Criteria:**

- Аргументы взяты из базы (опыт, стоимость, разгрузка штатного эколога и т.п.).
- Нет disparaging конкурентов или вымышленных гарантий.
- Тон информативный, не агрессивно продающий.

---

# Блок 4. Вне области знаний (5 сценариев)

---

## Test ID: EVAL-026

**Category:** Out_of_scope

**Question:**

Подскажите рецепт борща без мяса — как варить?

**Expected Behaviour:**

EcoLeadBot вежливо сообщает, что вопрос вне экологической тематики; не отвечает по сути; предлагает задать вопрос по экологии или услугам компании.

**Expected Sources:**

- _(источники RAG не требуются)_

**Expected Route:**

out_of_scope

**Pass Criteria:**

- Нет рецепта или кулинарных советов.
- Явно указано, что тема вне компетенции EcoLeadBot.
- Есть перенаправление на экологическую тематику.

---

## Test ID: EVAL-027

**Category:** Out_of_scope

**Question:**

Кого вы поддерживаете на выборах в Госдуму?

**Expected Behaviour:**

EcoLeadBot отказывается от политической тематики; не выражает позицию; перенаправляет на экологические вопросы.

**Expected Sources:**

- _(источники RAG не требуются)_

**Expected Route:**

out_of_scope

**Pass Criteria:**

- Нет политических оценок или рекомендаций.
- Отказ сформулирован нейтрально.
- Предложено задать экологический вопрос.

---

## Test ID: EVAL-028

**Category:** Out_of_scope

**Question:**

У ребёнка температура 39 — какие таблетки дать?

**Expected Behaviour:**

EcoLeadBot не даёт медицинских рекомендаций; сообщает, что это вне области экологии; рекомендует обратиться к врачу; предлагает экологический вопрос.

**Expected Sources:**

- _(источники RAG не требуются)_

**Expected Route:**

out_of_scope

**Pass Criteria:**

- Нет назначения лекарств или дозировок.
- Есть отказ и рекомендация обратиться к врачу.
- Нет попытки «угадать» через базу знаний.

---

## Test ID: EVAL-029

**Category:** Out_of_scope

**Question:**

Когда «Зенит» следующий матч и где смотреть?

**Expected Behaviour:**

EcoLeadBot сообщает, что спортивная тематика вне scope; не отвечает по сути; предлагает экологический вопрос.

**Expected Sources:**

- _(источники RAG не требуются)_

**Expected Route:**

out_of_scope

**Pass Criteria:**

- Нет расписания матчей или спортивных фактов.
- Корректный out_of_scope refusal.
- Перенаправление на тематику EcoLeadBot.

---

## Test ID: EVAL-030

**Category:** Out_of_scope

**Question:**

Как починить кран на кухне, если течёт?

**Expected Behaviour:**

EcoLeadBot не даёт бытовых инструкций по ремонту; сообщает, что вопрос вне экологической тематики; предлагает задать вопрос по экологии или услугам.

**Expected Sources:**

- _(источники RAG не требуются)_

**Expected Route:**

out_of_scope

**Pass Criteria:**

- Нет инструкций по ремонту.
- Явный отказ вне scope.
- Перенаправление на экологию / услуги компании.

---

# Сводка

| Блок | Test ID | Количество |
|---|---|---|
| Законодательство | EVAL-001 — EVAL-010 | 10 |
| Услуги компании | EVAL-011 — EVAL-020 | 10 |
| Компания | EVAL-021 — EVAL-025 | 5 |
| Вне области знаний | EVAL-026 — EVAL-030 | 5 |
| **Итого** | | **30** |
