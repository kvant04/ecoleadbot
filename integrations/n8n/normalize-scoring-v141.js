/**
 * EcoLeadBot n8n — Normalize + Scoring v1.4.1
 * Spec: integrations/n8n/scoring-spec-v1.4.1.md
 */
const body = $json.body || $json;

const answers = body.answers || {};
const contact = body.contact || {};
const source = body.source || {};
const meta = body.meta || {};
const v14 = body.v14 || {};

const activityType =
  v14.activity_type || answers.activity_type || answers.object_type || "";
const featureLabels = Array.isArray(answers.object_signals)
  ? answers.object_signals
  : Array.isArray(answers.object_features)
    ? answers.object_features
    : [];
const signalIds = Array.isArray(v14.object_signals)
  ? v14.object_signals
  : Array.isArray(answers.object_signal_ids)
    ? answers.object_signal_ids
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
const selectedServiceId = v14.selected_service_id || "";
const serviceType = v14.service_type || "standalone";
const nvosCategory = v14.nvos_category || answers.nvos_category || "";
const esScoring = v14.es_scoring || {};
const esStatus = esScoring.status || "";
const esStatusLabel = esScoring.status_label || "";
const qualAnswers = v14.qualification_answers || answers.qualification_answers || {};
const bitrixComment = contact.comment || v14.bitrix_comment || "";
const ragEsSignal = String(answers.rag_es_signal || "").toLowerCase();

const miniZoneIds = Array.isArray(v14.mini_zone_ids)
  ? v14.mini_zone_ids.filter(Boolean)
  : Array.isArray(v14.mini_assessment_zones)
    ? v14.mini_assessment_zones.map((z) => z.id).filter(Boolean)
    : [];

/** Populated by scripts/patch_n8n_workflow_v141.py from data/bitrix_service_iblock_map.json */
const SERVICE_IBLOCK_MAP = /* INJECT_SERVICE_IBLOCK_MAP */ {};

const IDS = {
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
  es_potential: { Низкий: 3967, Средний: 3968, Высокий: 3969 },
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

const ES_UPSELL_HINT =
  "По стратегии компании — мягко предложить экосопровождение (ЭС), даже если клиент пришёл за разовой услугой.";

function normSites(raw) {
  const s = String(raw || "");
  if (s === "2–3" || s === "2-3" || s.includes("2")) return "2-3";
  if (s === "4 и более" || s === "4+" || s.includes("4")) return "4+";
  if (/не знаю/i.test(s)) return "unknown";
  return "1";
}

const sitesNorm = normSites(sitesCountRaw);
const multiSite = sitesNorm === "2-3" || sitesNorm === "4+";

function hasSignal(idSub, labelSub) {
  if (signalIds.some((id) => String(id).includes(idSub))) return true;
  return featureLabels.some((f) => String(f).toLowerCase().includes(labelSub));
}

const hasEmissions =
  signalIds.includes("emissions") ||
  featureLabels.some((f) => /выброс/i.test(f));
const hasDischarge =
  signalIds.includes("discharge_csv") ||
  signalIds.includes("discharge_own") ||
  featureLabels.some((f) => /сброс|сточн/i.test(f));
const hasOils =
  featureLabels.some((f) => /масл|вет/i.test(f)) ||
  signalIds.some((id) => /oil|masl/i.test(String(id)));

function qualMatchesBroad(qa) {
  const text = JSON.stringify(qa || {}).toLowerCase();
  return /полный|комплекс|все площадк/.test(text);
}

function qualMatchesUrgent(qa) {
  const text = JSON.stringify(qa || {}).toLowerCase();
  return /срочн|проверк|предпис/.test(text);
}

const thinMode =
  esStatus === "requires_dequalification" ||
  (typeof esScoring.data_points === "number" && esScoring.data_points <= 2) ||
  signalUncertain;

const comboTags = [];
let complexityScore = 0;

if (activityType === "Производство") complexityScore += 30;
if (activityType === "Стройка") complexityScore += 20;
if (activityType === "Автосервис / СТО" || activityType === "СТО") complexityScore += 15;
if (activityType === "Автомойка") complexityScore += 15;
if (activityType === "Склад") complexityScore += 10;
if (activityType === "Магазин / торговля" || activityType === "Торговля") complexityScore += 5;

if (hasSignal("tko", "мусор")) complexityScore += 10;
if (hasOils) complexityScore += 15;
if (hasSignal("production_waste", "производственн")) complexityScore += 15;
if (hasEmissions) complexityScore += 25;
if (hasDischarge) complexityScore += 35;
if (signalIds.includes("wells") || hasSignal("wells", "скважин")) complexityScore += 20;

if (sitesNorm === "2-3") complexityScore += 25;
if (sitesNorm === "4+") complexityScore += 40;
if (sitesNorm === "unknown") {
  complexityScore += 15;
  comboTags.push("sites_unknown");
}
if (signalUncertain) complexityScore += 25;

if (nvosCategory === "I") complexityScore += 20;
else if (nvosCategory === "II") complexityScore += 15;
else if (nvosCategory === "III") complexityScore += 10;
else if (/не знаю/i.test(nvosCategory)) complexityScore += 10;

if (miniZoneIds.length === 2) complexityScore += 10;
if (miniZoneIds.length >= 3) complexityScore += 20;
if (miniZoneIds.includes("ker_gee")) {
  complexityScore += 25;
  comboTags.push("ker_gee_zone");
}

const isAuto = activityType === "Автосервис / СТО" || activityType === "СТО";
if (isAuto && hasOils) {
  complexityScore += 15;
  comboTags.push("auto_waste");
}
if (activityType === "Производство" && hasOils) {
  complexityScore += 35;
  comboTags.push("production_waste");
}
if (activityType === "Производство" && hasEmissions) {
  complexityScore += 25;
  comboTags.push("emission_risk");
}
if (activityType === "Производство" && hasDischarge) {
  complexityScore += 35;
  comboTags.push("discharge_risk");
}
if (hasEmissions && hasDischarge) {
  complexityScore += 20;
  comboTags.push("air_water_combo");
}

if (isDocumentFlow && serviceType === "complex") {
  complexityScore += 30;
  comboTags.push("document_complex_service");
}
if (serviceType === "bridge") {
  complexityScore += 10;
  comboTags.push("bridge_service");
}
if (qualMatchesBroad(qualAnswers)) {
  complexityScore += 15;
  comboTags.push("broad_scope");
}
if ((nvosCategory === "I" || nvosCategory === "II") && multiSite) {
  complexityScore += 20;
  comboTags.push("multi_site_nvos");
}

let complexity = "Простой";
if (complexityScore >= 70) complexity = "Сложный";
else if (complexityScore >= 30) complexity = "Средний";

if (esScoring.mini_result_type === "complex" || esStatus === "complex_lead") {
  if (complexity === "Простой") complexity = "Средний";
}
if (comboTags.includes("air_water_combo") && activityType === "Производство") {
  complexity = "Сложный";
}
if (serviceType === "complex" && multiSite) {
  complexity = "Сложный";
}

let urgencyScore = 0;
if (urgencyRaw === "В этом году") urgencyScore += 10;
if (urgencyRaw === "В течение квартала") urgencyScore += 25;
if (urgencyRaw === "В течение месяца" || urgencyRaw === "В ближайшие недели") urgencyScore += 40;
if (urgencyRaw === "Срочно" || urgencyRaw === "Очень срочно") urgencyScore += 60;

if (situation === "Предстоящая проверка или предписание" || situation === "Проверка или предписание") {
  urgencyScore += 70;
}
if (situation === "Несколько вопросов сразу — нужна консультация") urgencyScore += 30;
if (situation === "Хотим навести порядок") urgencyScore += 20;
if (qualMatchesUrgent(qualAnswers)) urgencyScore += 40;

if (isDocumentFlow && !urgencyRaw) urgencyScore = Math.max(urgencyScore, 25);

let urgency = "Низкая";
if (urgencyScore >= 60) urgency = "Высокая";
else if (urgencyScore >= 20) urgency = "Средняя";

let esPotential = "Низкий";
if (thinMode) {
  esPotential = "Средний";
} else if (
  esStatus === "high_es_potential" ||
  helpFormat === "Чтобы кто-то полностью занимался экологией"
) {
  esPotential = "Высокий";
} else if (responsibleRaw === "Никто" && multiSite) {
  esPotential = "Высокий";
} else if (esStatus === "complex_lead") {
  esPotential = ["Директор", "Бухгалтер", "Никто"].includes(responsibleRaw)
    ? "Высокий"
    : "Средний";
} else if (
  esStatus === "qualified_lead" &&
  isDocumentFlow &&
  serviceType === "standalone" &&
  responsibleRaw === "Штатный эколог"
) {
  esPotential = "Низкий";
} else if (esStatus === "qualified_lead") {
  esPotential = "Средний";
} else {
  esPotential = "Низкий";
}

if (!thinMode && ["да", "yes", "high"].includes(ragEsSignal)) {
  if (esPotential === "Низкий") esPotential = "Средний";
  else if (esPotential === "Средний") esPotential = "Высокий";
}

let diyScore = 0;
if (helpFormat === "Разобраться самому" || helpFormat === "Хочу разобраться сам") diyScore += 60;
if (situation === "Пока изучаем / нет срочности" || situation === "Пока изучаем") diyScore += 20;

let diyLevel = "Низкий";
if (diyScore >= 60) diyLevel = "Высокий";
else if (diyScore >= 30) diyLevel = "Средний";

const inspectionSituation =
  situation === "Предстоящая проверка или предписание" ||
  situation === "Проверка или предписание";
const r2Triggered = inspectionSituation || urgency === "Высокая";

const intentBuyDocument = isDocumentFlow && !!selectedServiceId;
const intentNeedDiagnosis =
  thinMode ||
  signalUncertain ||
  situation === "Не знаем, что требуется по экологии" ||
  situation === "Не знаем что нужно сдавать";
const intentOutsource =
  esPotential === "Высокий" ||
  helpFormat === "Чтобы кто-то полностью занимался экологией";
const intentSelfServe = helpFormat === "Разобраться самому" && urgency === "Низкая";

let route = "Услуга";
let routeReason = "Стандартная обработка по услуге / первичная консультация";

if (thinMode) {
  route = "Консультация";
  routeReason = "Мало данных — уточнение при звонке";
} else if (r2Triggered) {
  route = "Консультация";
  routeReason = "Срочный или рисковый кейс — первичная диагностика";
} else if (complexity === "Сложный" || esStatus === "complex_lead") {
  route = "Консультация";
  routeReason = "Сложный кейс — консультация до КП";
} else if (comboTags.includes("air_water_combo")) {
  route = "Консультация";
  routeReason = "Выбросы и сбросы — комплексная диагностика";
} else if (
  multiSite &&
  (responsibleRaw === "Никто" || responsibleRaw === "Директор")
) {
  route = "Консультация";
  routeReason = "Несколько площадок — уточнить карту объектов";
} else if (signalUncertain) {
  route = "Консультация";
  routeReason = "Объект не определён — уточнить при звонке";
} else if (situation === "Несколько вопросов сразу — нужна консультация") {
  route = "Консультация";
  routeReason = "Клиент запросил комплексную консультацию";
} else if (intentNeedDiagnosis && !intentBuyDocument) {
  route = "Консультация";
  routeReason = "Клиент не определился с потребностью — первичная диагностика";
} else if (esPotential === "Высокий") {
  route = "Потенциал ЭС";
  routeReason = "Сигнал на экосопровождение — не ограничиваться разовой услугой";
} else if (
  intentBuyDocument &&
  serviceType === "standalone" &&
  complexity !== "Сложный" &&
  esPotential !== "Высокий"
) {
  route = "Услуга";
  routeReason = "Клиент выбрал конкретную услугу — КП по scope";
} else if (
  intentBuyDocument &&
  (serviceType === "complex" || complexity === "Сложный")
) {
  route = "Консультация";
  routeReason = "Сложная услуга или масштаб — сначала бриф";
} else if (intentSelfServe && !r2Triggered) {
  route = "Самостоятельно";
  routeReason = "Клиент хочет разобраться сам — материалы для самостоятельного изучения";
}

let priority = "Средний";
if (r2Triggered) priority = "Высокий";
else if (complexity === "Сложный") priority = "Высокий";
else if (esPotential === "Высокий") priority = "Высокий";
else if (intentSelfServe && route === "Самостоятельно") priority = "Низкий";

if (thinMode && priority === "Низкий") priority = "Средний";

let objectCount = "1 площадка";
if (sitesNorm === "2-3") objectCount = "2-3 площадки";
if (sitesNorm === "4+") objectCount = "4 и более площадок";

const tags = ["v14", "v141"];
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
if (inspectionSituation) tags.push("inspection_risk");
if (esPotential === "Высокий") tags.push("high_es");
if (thinMode) tags.push("dequal_required", "requires_dequalification");
if (multiSite) tags.push("multi_site");
if (serviceTitle) tags.push("service_selected");
if (answers.rag_question) tags.push("rag_used");
if (route === "Потенциал ЭС") tags.push("es_bridge");
comboTags.forEach((t) => {
  if (!tags.includes(t)) tags.push(t);
});

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
  featureLabels.length
    ? `На объекте: ${featureLabels.join(", ")}.`
    : signalUncertain
      ? "Объект: не определён (не знаю)."
      : "",
  situation ? `Актуально: ${situation}.` : "",
  urgencyRaw ? `Срок: ${urgencyRaw}.` : "",
  helpFormat ? `Формат помощи: ${helpFormat}.` : "",
  miniZoneIds.length ? `Зоны оценки: ${miniZoneIds.join(", ")}.` : "",
].filter(Boolean);

const summary = summaryParts.join(" ");

let adminHint = thinMode
  ? "Мало данных от виджета — уточнить при звонке: регион, юрлицо, объект, кто принимает решение, сроки, действующие документы."
  : serviceTitle
    ? `Клиент выбрал услугу «${serviceTitle}». Уточнить регион, юрлицо, категорию НВОС (если применимо), сроки и действующие документы.`
    : miniZoneIds.length
      ? "Есть предварительная оценка по зонам — уточнить приоритетное направление."
      : "Уточнить регион, юрлицо, кто принимает решение, есть ли действующие документы и сроки.";

let salesHint = thinMode
  ? "Не оценивать как «низкий потенциал» — цель звонка: уточнить данные при звонке. " + ES_UPSELL_HINT
  : route === "Потенциал ЭС"
    ? "Есть потенциал экосопровождения. Не продавать только разовую услугу. " + ES_UPSELL_HINT
    : serviceTitle
      ? `Клиент пришёл за «${serviceTitle}». Уточнить контекст и следующий шаг. ${ES_UPSELL_HINT}`
      : `Обработать по маршруту «${route}». ${ES_UPSELL_HINT}`;

const leadTitleParts = [activityType || "Без типа объекта"];
if (serviceTitle) leadTitleParts.push(serviceTitle);
const lead_title = leadTitleParts.join(" / ");

const service_iblock_id = selectedServiceId
  ? SERVICE_IBLOCK_MAP[selectedServiceId] || null
  : null;

function stripRedundantFromWidgetComment(text) {
  if (!text) return "";
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^ES scoring:/i.test(t)) return false;
      if (/^Оценка экосопровождения:/i.test(t)) return false;
      if (/^Вид деятельности:/i.test(t)) return false;
      if (/^Услуга интереса:/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shortAdminHint(text, maxLen) {
  const limit = maxLen || 220;
  const s = String(text || "").trim();
  if (!s) return "";
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit);
  const lastPeriod = cut.lastIndexOf(".");
  if (lastPeriod > 80) return cut.slice(0, lastPeriod + 1);
  return cut.trim() + "…";
}

function buildCommentsFullV142(opts) {
  const clientBlock = stripRedundantFromWidgetComment(opts.clientBlock || "");
  const route = opts.route || "—";
  const routeReason = opts.routeReason || "";
  const adminHint = shortAdminHint(opts.adminHint);
  const sessionId = opts.sessionId || "";
  const parts = [];
  if (clientBlock) parts.push(clientBlock);
  parts.push(
    "",
    "── Следующий шаг ──",
    routeReason ? `${route}: ${routeReason}` : route,
    adminHint
  );
  if (sessionId) {
    parts.push(
      "",
      "---",
      `Оценка заявки и подсказки менеджеру — в полях карточки · сессия ${sessionId}`
    );
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const commentsStructured = buildCommentsFullV142({
  clientBlock: bitrixComment || contact.comment || "",
  route,
  routeReason,
  adminHint: adminHint,
  sessionId: body.session_id || "",
});

return [
  {
    json: {
      session_id: body.session_id,
      name: contact.name,
      phone: contact.phone_or_whatsapp,
      telegram: contact.telegram || "",
      comment: bitrixComment || contact.comment || "",
      comments_full: commentsStructured,
      lead_title,
      activity_type: activityType,
      segment: activityType,
      segment_id: IDS.segment[activityType] || null,
      service_title: serviceTitle,
      service_iblock_id,
      selected_service_id: selectedServiceId,
      service_type: serviceType,
      nvos_category: nvosCategory,
      flow,
      es_status_label: esStatusLabel,
      route_reason: routeReason,
      complexity,
      complexity_id: IDS.complexity[complexity] || null,
      priority,
      priority_id: IDS.priority[priority] || null,
      es_potential: esPotential,
      es_potential_id: IDS.es_potential[esPotential] || null,
      route,
      route_id: IDS.route[route] || null,
      diy_level: diyLevel,
      diy_level_id: IDS.diy[diyLevel] || null,
      responsible: responsibleRaw,
      responsible_id: IDS.responsible[responsibleRaw] || null,
      urgency,
      urgency_id: IDS.urgency[urgency] || null,
      object_count: objectCount,
      object_count_id: IDS.object_count[objectCount] || null,
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
      thin_mode: thinMode,
    },
  },
];
