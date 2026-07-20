/**
 * EcoLeadBot n8n — Normalize + Scoring v1.4
 * DEPRECATED: use normalize-scoring-v141.js + ecoleadbot-workflow.json (v1.4.1).
 * Kept for history / diff only — do not paste into production n8n.
 * Paste into node "Normalize + Scoring v1.4" or loaded by patch script.
 */
const body = $json.body || $json;

const answers = body.answers || {};
const contact = body.contact || {};
const source = body.source || {};
const meta = body.meta || {};
const v14 = body.v14 || {};

const activityType =
  v14.activity_type ||
  answers.activity_type ||
  answers.object_type ||
  "";
const features = Array.isArray(answers.object_signals)
  ? answers.object_signals
  : Array.isArray(answers.object_features)
    ? answers.object_features
    : [];
const signalUncertain = answers.object_signal_uncertain === true;
const sitesCountRaw = String(v14.sites_count || answers.sites_count || "1");
const responsibleRaw = answers.ecology_responsible || "";
const situation = v14.main_situation || answers.main_situation || "";
const urgencyRaw = answers.urgency || "";
const helpFormat = answers.help_format || "";
const flow = v14.flow || "";
const isDocumentFlow = flow === "document";
const serviceTitle = v14.service_title || "";
const nvosCategory = v14.nvos_category || answers.nvos_category || "";
const esScoring = v14.es_scoring || {};
const esStatusLabel = esScoring.status_label || "";
const isThinLead = esScoring.status === "requires_dequalification";
const bitrixComment = v14.bitrix_comment || contact.comment || "";
const miniZones = Array.isArray(v14.mini_assessment_zones)
  ? v14.mini_assessment_zones.map((z) => z.title).filter(Boolean)
  : [];

const ids = {
  segment: {
    Производство: 3948,
    Склад: 3949,
    Стройка: 3950,
    "Автосервис / СТО": 3951,
    СТО: 3951,
    Автомойка: 3952,
    "Магазин / торговля": 3953,
    Торговля: 3953,
    Офис: 3954,
    ЖКХ: 3955,
    Сельхоз: 3956,
    Другое: 3957,
  },
  complexity: { Простой: 3958, Средний: 3959, Сложный: 3960 },
  priority: { Низкий: 3964, Средний: 3965, Высокий: 3966 },
  route: {
    Услуга: 3970,
    Консультация: 3971,
    Самостоятельно: 3972,
    "Потенциал ЭС": 3973,
  },
  diy: { Низкий: 3974, Средний: 3975, Высокий: 3976 },
  responsible: {
    "Штатный эколог": 3987,
    Бухгалтер: 3988,
    Директор: 3989,
    "Охрана труда": 3990,
    "Специалист по охране труда": 3990,
    Подрядчик: 3991,
    Никто: 3992,
  },
  urgency: { Низкая: 3993, Средняя: 3994, Высокая: 3995 },
  object_count: {
    "1 площадка": 3996,
    "2-3 площадки": 3997,
    "4 и более площадок": 3998,
  },
};

function normSites(raw) {
  if (raw === "2–3" || raw === "2-3" || raw.includes("2")) return "2-3";
  if (raw === "4 и более" || raw === "4+" || raw.includes("4")) return "4+";
  return "1";
}

const sitesNorm = normSites(sitesCountRaw);
const multiSite = sitesNorm === "2-3" || sitesNorm === "4+";

function mapEsPotentialFromV14() {
  if (isThinLead) return "Средний";
  const st = esScoring.status || "";
  if (st === "high_es_potential") return "Высокий";
  if (st === "complex_lead") return "Средний";
  if (st === "qualified_lead") return "Средний";
  return "Низкий";
}

let complexityScore = 0;
if (signalUncertain) complexityScore += 25;
if (!isDocumentFlow && !signalUncertain) {
  if (activityType === "Производство") complexityScore += 30;
  if (activityType === "Стройка") complexityScore += 20;
  if (activityType === "Автосервис / СТО" || activityType === "СТО") complexityScore += 15;
  if (activityType === "Автомойка") complexityScore += 15;
  if (activityType === "Склад") complexityScore += 10;
  if (activityType === "Магазин / торговля" || activityType === "Торговля") complexityScore += 5;

  if (features.includes("Мусор и упаковка")) complexityScore += 10;
  if (features.some((f) => f.includes("Масла") || f.includes("ветош"))) complexityScore += 15;
  if (features.includes("Производственные отходы")) complexityScore += 15;
  if (features.includes("Выбросы в атмосферу") || features.includes("Выбросы в воздух"))
    complexityScore += 25;
  if (
    features.includes("Сброс воды в канализацию") ||
    features.includes("Сброс воды") ||
    features.includes("Сточные воды")
  )
    complexityScore += 35;

  if (sitesNorm === "2-3") complexityScore += 25;
  if (sitesNorm === "4+") complexityScore += 40;
  if (miniZones.length >= 3) complexityScore += 15;
  if (isDocumentFlow && serviceTitle) complexityScore += 10;
  if (nvosCategory === "I") complexityScore += 20;
  if (nvosCategory === "II") complexityScore += 15;
}

let complexity = "Простой";
if (complexityScore >= 70 || esScoring.mini_result_type === "complex") complexity = "Сложный";
else if (complexityScore >= 30) complexity = "Средний";

let urgencyScore = 0;
if (!isDocumentFlow) {
  if (urgencyRaw === "В этом году" || urgencyRaw === "Не срочно") urgencyScore += 10;
  if (urgencyRaw === "В течение квартала") urgencyScore += 25;
  if (urgencyRaw === "В течение месяца" || urgencyRaw === "В ближайшие недели") urgencyScore += 40;
  if (urgencyRaw === "Срочно" || urgencyRaw === "Очень срочно") urgencyScore += 60;
  if (
    situation === "Предстоящая проверка или предписание" ||
    situation === "Проверка или предписание"
  )
    urgencyScore += 70;
}

let urgency = "Низкая";
if (urgencyScore >= 60) urgency = "Высокая";
else if (urgencyScore >= 20) urgency = "Средняя";

let esPotential = v14.es_scoring ? mapEsPotentialFromV14() : "Низкий";
if (!v14.es_scoring && !isDocumentFlow) {
  let esScore = 0;
  if (responsibleRaw === "Подрядчик") esScore += 10;
  if (responsibleRaw === "Охрана труда" || responsibleRaw === "Специалист по охране труда")
    esScore += 20;
  if (responsibleRaw === "Бухгалтер") esScore += 35;
  if (responsibleRaw === "Директор") esScore += 40;
  if (responsibleRaw === "Никто") esScore += 45;
  if (helpFormat === "Чтобы кто-то полностью занимался экологией") esScore += 60;
  if (helpFormat === "Чтобы специалист сделал конкретный документ") esScore += 25;
  if (helpFormat === "Чтобы специалист подсказал, что нужно") esScore += 20;
  if (
    situation === "Предстоящая проверка или предписание" ||
    situation === "Проверка или предписание"
  )
    esScore += 30;
  if (multiSite && responsibleRaw === "Никто") esScore += 30;
  if (esScore >= 70) esPotential = "Высокий";
  else if (esScore >= 30) esPotential = "Средний";
}

let diyScore = 0;
if (helpFormat === "Разобраться самому" || helpFormat === "Хочу разобраться сам") diyScore += 60;
if (situation === "Пока изучаем / нет срочности" || situation === "Пока изучаем") diyScore += 20;

let diyLevel = "Низкий";
if (diyScore >= 60) diyLevel = "Высокий";
else if (diyScore >= 30) diyLevel = "Средний";

const hasEmissions =
  features.includes("Выбросы в атмосферу") || features.includes("Выбросы в воздух");
const hasDischarge =
  features.includes("Сброс воды в канализацию") ||
  features.includes("Сброс воды") ||
  features.includes("Сточные воды");

let route = "Услуга";
if (isDocumentFlow && serviceTitle) {
  route = "Услуга";
} else if (
  complexity === "Сложный" ||
  esScoring.status === "complex_lead" ||
  (hasEmissions && hasDischarge) ||
  (multiSite &&
    (responsibleRaw === "Никто" ||
      situation === "Не знаем, что требуется по экологии" ||
      situation === "Не знаем что нужно сдавать"))
) {
  route = "Консультация";
} else if (esPotential === "Высокий" || esScoring.status === "high_es_potential") {
  route = "Потенциал ЭС";
} else if (diyLevel === "Высокий" && urgency !== "Высокая") {
  route = "Самостоятельно";
}

let priority = "Средний";
if (
  situation === "Предстоящая проверка или предписание" ||
  situation === "Проверка или предписание" ||
  urgency === "Высокая" ||
  complexity === "Сложный" ||
  esPotential === "Высокий"
) {
  priority = "Высокий";
} else if (diyLevel === "Высокий" && urgency === "Низкая") {
  priority = "Низкий";
}

let objectCount = "1 площадка";
if (sitesNorm === "2-3") objectCount = "2-3 площадки";
if (sitesNorm === "4+") objectCount = "4 и более площадок";

const tags = ["v14"];
if (flow === "main") tags.push("flow_main");
if (flow === "document") tags.push("flow_document");
if (activityType === "Производство") tags.push("production");
if (activityType === "Склад") tags.push("warehouse");
if (activityType === "Стройка") tags.push("construction");
if (activityType === "Автосервис / СТО" || activityType === "СТО") tags.push("car_service");
if (activityType === "Автомойка") tags.push("car_wash");
if (signalUncertain) tags.push("object_uncertain");
if (responsibleRaw === "Никто") tags.push("no_ecologist");
if (responsibleRaw === "Директор") tags.push("director_responsible");
if (urgency === "Высокая") tags.push("urgent");
if (esPotential === "Высокий") tags.push("high_es");
if (isThinLead) tags.push("requires_dequalification");
if (multiSite) tags.push("multi_site");
if (serviceTitle) tags.push("service_selected");
if (answers.rag_question) tags.push("rag_used");

const flowLabel =
  flow === "document"
    ? "Конкретная услуга / документ"
    : flow === "main"
      ? "Основной сценарий"
      : "Не указан";

const summaryParts = [
  `Сценарий: ${flowLabel}.`,
  activityType ? `Вид деятельности: ${activityType}.` : "",
  serviceTitle ? `Услуга интереса: ${serviceTitle}.` : "",
  responsibleRaw ? `Ответственный за экологию: ${responsibleRaw}.` : "",
  features.length ? `На объекте: ${features.join(", ")}.` : signalUncertain ? "Объект: не определён (не знаю)." : "",
  situation ? `Актуально: ${situation}.` : "",
  urgencyRaw ? `Срок: ${urgencyRaw}.` : "",
  helpFormat ? `Формат помощи: ${helpFormat}.` : "",
  miniZones.length ? `Зоны оценки: ${miniZones.join("; ")}.` : "",
  esStatusLabel ? `ES scoring: ${esStatusLabel}.` : "",
].filter(Boolean);

const summary = summaryParts.join(" ");

const adminHint = isThinLead
  ? "Мало данных от виджета — уточнить при звонке: регион, юрлицо, объект, кто принимает решение, сроки, действующие документы."
  : serviceTitle
    ? `Клиент выбрал услугу «${serviceTitle}». Уточнить регион, юрлицо, категорию НВОС (если применимо), сроки и действующие документы.`
    : miniZones.length
      ? "Есть предварительная оценка по зонам — уточнить, какое направление приоритетно, и собрать данные для первичной консультации."
      : "Уточнить регион, юрлицо, кто принимает решение, есть ли действующие документы и сроки.";

const salesHint = isThinLead
  ? "Не оценивать как «низкий потенциал» — данных мало. Цель звонка: доqualification и понимание потребности."
  : esScoring.status === "high_es_potential" || esPotential === "Высокий"
    ? "Есть потенциал экосопровождения. Не продавать только разовую услугу — мягко вывести на консультацию."
    : serviceTitle
      ? `Клиент пришёл за «${serviceTitle}». Уточнить контекст объекта и предложить следующий шаг по услуге.`
      : "Обработать по маршруту, уточнить потребность и ближайший следующий шаг.";

const leadTitleParts = ["EcoLeadBot", activityType || "Без типа объекта"];
if (serviceTitle) leadTitleParts.push(serviceTitle);
leadTitleParts.push(isThinLead ? "Требует доqualification" : `ES: ${esPotential}`);
const lead_title = leadTitleParts.join(" / ");

const commentsStructured = [
  "=== EcoLeadBot v1.4 ===",
  "",
  bitrixComment || summary,
  "",
  "--- Scoring (для админа) ---",
  `Вид деятельности: ${activityType || "—"}`,
  serviceTitle ? `Услуга интереса: ${serviceTitle}` : "",
  nvosCategory ? `Категория НВОС: ${nvosCategory}` : "",
  `Сложность: ${complexity}`,
  `Приоритет: ${priority}`,
  `Потенциал ЭС (rule): ${esPotential}`,
  esStatusLabel ? `ES scoring (виджет): ${esStatusLabel}` : "",
  `Маршрут: ${route}`,
  `Самостоятельность: ${diyLevel}`,
  responsibleRaw ? `Эколог: ${responsibleRaw}` : "",
  `Срочность (score): ${urgency}`,
  `Площадки: ${objectCount}`,
  "",
  "Резюме:",
  summary,
  "",
  "Подсказка администратору:",
  adminHint,
  "",
  "Подсказка менеджеру:",
  salesHint,
  "",
  `Теги: ${tags.join(", ")}`,
  `ID сессии: ${body.session_id || ""}`,
  meta.widget_version ? `Виджет: ${meta.widget_version}` : "",
].filter((line) => line !== "").join("\n");

return [
  {
    json: {
      session_id: body.session_id,
      name: contact.name,
      phone: contact.phone_or_whatsapp,
      telegram: contact.telegram || "",
      comment: contact.comment || "",
      comments_full: commentsStructured,
      lead_title,
      activity_type: activityType,
      segment: activityType,
      segment_id: ids.segment[activityType] || null,
      service_title: serviceTitle,
      nvos_category: nvosCategory,
      flow,
      es_status_label: esStatusLabel,
      complexity,
      complexity_id: ids.complexity[complexity] || null,
      priority,
      priority_id: ids.priority[priority] || null,
      es_potential: esPotential,
      es_potential_id: null,
      route,
      route_id: ids.route[route] || null,
      diy_level: diyLevel,
      diy_level_id: ids.diy[diyLevel] || null,
      responsible: responsibleRaw,
      responsible_id: ids.responsible[responsibleRaw] || null,
      urgency,
      urgency_id: ids.urgency[urgency] || null,
      object_count: objectCount,
      object_count_id: ids.object_count[objectCount] || null,
      tags: tags.join(","),
      summary,
      admin_hint: adminHint,
      sales_hint: salesHint,
      entry_type: source.entry_type,
      page_url: source.page_url,
      page_title: source.page_title,
      page_type: source.page_type,
      started_at: meta.started_at,
      completed_at: meta.completed_at,
      device: meta.device,
      widget_version: meta.widget_version || "",
    },
  },
];
