/* =========================================================================
   EcoLeadBot — Frontend MVP v1.4
   Реализация строго по документам:
     - EcoLeadBot-Scope-Freeze-v1.4.md (master scope)
     - Этап 2  UX Wireframe Specification v2.1 CLEAN
     - Этап 3  Frontend Technical Specification v1.1 FINAL
     - Этап 4  n8n Workflow Architecture FINAL (источник вопросов и payload)
   На реальном сайте файл подключается как один скрипт (widget.js) —
   он сам строит floating widget, inline CTA и popup.
   ========================================================================= */
(function () {
  "use strict";

  /* -----------------------------------------------------------------------
     1. CONFIGURATION (Frontend Spec §35, §45)
     ----------------------------------------------------------------------- */
  var ECOLEADBOT_CONFIG = {
    webhookUrl: "https://n8n.ecolusspb.ru/webhook/ecoleadbot",
    /** Shared secret for n8n Header Auth. Set via ECOLEADBOT_SITE_CONFIG — never commit real value. */
    webhookSecret: "",
    ragApiUrl: "",
    /** Static widget/data origin for embeds. Override via ECOLEADBOT_SITE_CONFIG. */
    /** Fallback when script URL cannot be detected (Bitrix may remove <script>). */
    assetBaseUrl: "https://elb.ecolusspb.ru/",
    logoUrl: "",
    logoAlt: "Экологические услуги",
    popupDelayMs: 45000,
    cooldownMinutes: 60,
    antiDuplicateMinutes: 60,
    sessionTtlDays: 180,
    enableInlineCta: true,
    enableFloatingWidget: true,
    enableAutoPopup: true,
    scrollDepthTrigger: 0.5,
    loadingMinMs: 700,
    /** Client-side abort for RAG fetch (ms). Server read timeout is higher. */
    ragFetchTimeoutMs: 90000,
    /**
     * Public Yandex Metrika counter on ecolusspb.ru (fallback when GTM has not
     * yet created window.yaCounterXXXX). Not a secret.
     */
    yandexMetrikaCounterId: 22994308
  };

  /** Переопределение с хоста (deploy/sweb/elb-config.js на elb.ecolusspb.ru). */
  if (typeof window !== "undefined" && window.ECOLEADBOT_SITE_CONFIG) {
    Object.keys(window.ECOLEADBOT_SITE_CONFIG).forEach(function (key) {
      if (window.ECOLEADBOT_SITE_CONFIG[key] !== undefined) {
        ECOLEADBOT_CONFIG[key] = window.ECOLEADBOT_SITE_CONFIG[key];
      }
    });
  }

  var STORAGE_KEY = "ecoleadbot_session";
  var WIDGET_VERSION = "1.5.50";

  /* Тестовая сборка: ?elb_test=1 или localhost / GitHub Pages demo.
     В test build отключена anti-duplicate; кнопка «Пройти заново» доступна во всех сборках. */
  function detectTestBuild() {
    try {
      var params = new URLSearchParams(location.search);
      if (params.get("elb_test") === "1" || params.get("ecoleadbot_test") === "1") return true;
    } catch (e) { /* старые браузеры без URLSearchParams */ }
    var h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h.indexOf("github.io") !== -1;
  }
  var IS_TEST_BUILD = detectTestBuild();

  /** Advertising deep-link: open the popup immediately without consuming UTM params. */
  function shouldOpenFromUrl() {
    try {
      var params = new URLSearchParams(location.search);
      return params.get("elb_open") === "1" || params.get("ecoleadbot_open") === "1";
    } catch (e) {
      return false;
    }
  }

  var V14_DATA_PATHS = {
    catalog: "data/services_catalog_v1.4.json",
    zones: "data/mini_assessment_zones_v1.4.json",
    qualLabels: "data/qual_question_labels_ru.json"
  };

  /* Встроенный fallback, если JSON не загрузился (офлайн / file://). */
  var FALLBACK_OBJECT_SIGNALS = [
    { id: "tko", label: "Мусор и упаковка", zones: ["otkhody"] },
    { id: "production_waste", label: "Производственные отходы", zones: ["otkhody"] },
    { id: "emissions", label: "Выбросы в атмосферу", zones: ["vozduh", "nvos"] },
    { id: "discharge_csv", label: "Сброс воды в канализацию", zones: ["voda", "nvos"] },
    { id: "discharge_own", label: "Сброс воды в водные объекты", zones: ["voda", "nvos"] },
    { id: "wells", label: "Скважина / недропользование", zones: ["voda"] },
    { id: "transport", label: "Спецтехника / транспорт / парковка", zones: ["vozduh", "otkhody"] },
    { id: "kitchen", label: "Кухня", zones: ["otkhody", "voda"] },
    { id: "agriculture", label: "Сельское хозяйство", zones: ["otkhody", "voda", "nvos"] },
    { id: "import_packaging", label: "Импорт / производство товаров и/или упаковки", zones: ["ekosbor"] }
  ];

  var FALLBACK_ZONES_META = {
    zone_display_order: ["otkhody", "vozduh", "voda", "nvos", "ekosbor", "ker_gee"],
    zone_titles: {
      otkhody: "Отходы",
      vozduh: "Воздух",
      voda: "Вода и недра",
      nvos: "НВОС, учёт и отчётность",
      ekosbor: "Экологический сбор за товары и упаковку",
      ker_gee: "Сложные экологические разрешения (КЭР, ГЭЭ)"
    },
    zone_templates: {
      otkhody: {
        kb_zone_key: "zone_otkhody",
        rag_podrobnee_prompt: "Что проверить предприятию по обращению с отходами: ТКО и производственные отходы?"
      },
      vozduh: {
        kb_zone_key: "zone_vozduh",
        rag_podrobnee_prompt: "Что проверить по выбросам в атмосферу: учёт НВОС, НДВ, инвентаризация источников?"
      },
      voda: {
        kb_zone_key: "zone_voda",
        rag_podrobnee_prompt: "Что нужно при сбросах и водопользовании: ЦСВ, собственный сброс, лицензия на воду?"
      },
      nvos: {
        kb_zone_key: "zone_nvos",
        rag_podrobnee_prompt: "Что проверить по учёту НВОС, отчётности и экологическому сопровождению?"
      },
      ekosbor: {
        kb_zone_key: "zone_ekosbor",
        rag_podrobnee_prompt: "Нужно ли платить экологический сбор за товары и упаковку?"
      },
      ker_gee: {
        kb_zone_key: "zone_ker_gee",
        rag_podrobnee_prompt: "Когда нужны КЭР или госэкологическая экспертиза и с чего начать?"
      }
    },
    zone_kb_template_prefix: "mini_assessment",
    fallback_zone: {
      id: "general",
      kb_zone_key: "zone_general",
      title: "Общая оценка",
      rag_podrobnee_prompt: "С чего начать приведение экологии предприятия в порядок?"
    }
  };

  /** Встроенные тексты зон, если kb/*.md недоступны. */
  var FALLBACK_ZONE_TEMPLATE_TEXTS = {
    zone_otkhody: "На объекте есть признаки по отходам: ТКО и производственные отходы. Стоит проверить договор, учёт и отчётность.",
    zone_ekosbor: "Есть импорт или производство товаров и/или упаковки — проверьте, нужно ли платить экологический сбор и сдавать отчётность.",
    zone_vozduh: "Есть выбросы в атмосферу. Обычно проверяют учёт НВОС, инвентаризацию источников и разрешительную документацию.",
    zone_voda: "Есть сбросы или водопользование. Зависит от схемы: ЦСВ, собственный сброс или недра.",
    zone_nvos: "Объект может попадать под требования НВОС: учёт и отчётность.",
    zone_ker_gee: "Возможны сложные разрешения: КЭР, ГЭЭ — нужна детальная проработка с экспертом.",
    zone_general: "Пока мало конкретных признаков — имеет смысл уточнить процессы на площадке и цель обращения."
  };

  var zoneTemplateCache = {};
  var podrobneeTemplateCache = {};

  /** Приоритет шаблонов «Подробнее» по признакам объекта внутри зоны. */
  var PODROBBNEE_SIGNAL_PRIORITY = {
    otkhody: ["tko", "production_waste", "kitchen", "agriculture"],
    ekosbor: ["import_packaging"],
    vozduh: ["emissions", "transport"],
    voda: ["discharge_csv", "discharge_own", "wells", "kitchen"],
    nvos: ["emissions", "discharge_csv", "discharge_own"],
    ker_gee: []
  };

  var KOAP_SNIPPETS = {
    otkhody_tko: "ст. 8.2 КоАП — нарушение правил обращения с отходами.",
    otkhody_production_waste: "ст. 8.2 и 8.5 КоАП — обращение с отходами и паспорта отходов.",
    otkhody_default: "ст. 8.2 КоАП — типовые нарушения при обращении с отходами.",
    ekosbor_import_packaging: "ст. 8.28 КоАП — неуплата экологического сбора.",
    ekosbor_default: "ст. 8.28 КоАП — неуплата экологического сбора.",
    vozduh_emissions: "ст. 8.1 и 8.21 КоАП — выбросы и учёт НВОС.",
    vozduh_default: "ст. 8.1 КоАП — нарушения по выбросам.",
    voda_discharge_csv: "ст. 8.13 КоАП — нарушение правил водопользования.",
    voda_discharge_own: "ст. 8.13–8.14 КоАП — сбросы и водопользование.",
    voda_wells: "ст. 8.10 и 8.13 КоАП — недра и водопользование.",
    voda_default: "ст. 8.13 КоАП — водопользование.",
    nvos_default: "ст. 8.21 КоАП — нарушение требований при НВОС."
  };

  var catalogV14 = null;
  var zonesV14 = null;
  var qualQuestionLabelsRu = null;
  var catalogLoadError = null;
  var catalogLoadPromise = null;
  /* -----------------------------------------------------------------------
     1b. v1.4 DATA LAYER (Phase 0 — catalog + mini-assessment zones)
     ----------------------------------------------------------------------- */
  /**
   * Capture while this script executes (defer-safe). Later Bitrix/DOM cleanup
   * may remove <script> tags — then getElementsByTagName no longer finds app.js
   * and assets wrongly resolve to the host page origin (ecolusspb.ru → 404 logo).
   */
  var ASSET_BASE_URL = (function () {
    var scripts = document.getElementsByTagName("script");
    var i;
    for (i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || "";
      if (/\/(?:app|widget)\.js(?:\?|#|$)/i.test(src) || /ecoleadbot[^/]*\.js(?:\?|#|$)/i.test(src)) {
        return src.split("?")[0].split("#")[0].replace(/\/[^/]+$/, "/");
      }
    }
    return "";
  })();

  function getScriptDirectoryUrl() {
    if (ASSET_BASE_URL) return ASSET_BASE_URL;
    var scripts = document.getElementsByTagName("script");
    var i;
    for (i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || "";
      if (/\/(?:app|widget)\.js(?:\?|#|$)/i.test(src) || /ecoleadbot[^/]*\.js(?:\?|#|$)/i.test(src)) {
        return src.split("?")[0].split("#")[0].replace(/\/[^/]+$/, "/");
      }
    }
    return "";
  }

  function getAssetBaseUrl() {
    var scriptBase = getScriptDirectoryUrl();
    if (scriptBase) return scriptBase;
    if (ECOLEADBOT_CONFIG.assetBaseUrl) {
      return /\/$/.test(ECOLEADBOT_CONFIG.assetBaseUrl)
        ? ECOLEADBOT_CONFIG.assetBaseUrl
        : ECOLEADBOT_CONFIG.assetBaseUrl + "/";
    }
    if (location.origin && location.protocol.indexOf("http") === 0) {
      return location.origin + "/";
    }
    var path = location.pathname.replace(/\/[^/]*$/, "/");
    if (path.charAt(path.length - 1) !== "/") path += "/";
    return location.origin + path;
  }

  function resolveDataUrl(relativePath) {
    if (/^https?:\/\//i.test(relativePath)) return relativePath;
    return getAssetBaseUrl() + relativePath;
  }

  function getWidgetLogoUrl() {
    if (ECOLEADBOT_CONFIG.logoUrl) return ECOLEADBOT_CONFIG.logoUrl;
    return resolveDataUrl("assets/logo-eu.png");
  }

  function createWidgetLogoImg(className, sizePx) {
    var img = el("img", className);
    img.src = getWidgetLogoUrl();
    img.alt = "";
    img.width = sizePx;
    img.height = sizePx;
    img.setAttribute("decoding", "async");
    img.setAttribute("aria-hidden", "true");
    return img;
  }

  function fetchWithRetry(url, options, parseResponse, attempts) {
    var attempt = 0;
    var maxAttempts = attempts || 2;
    function run() {
      attempt += 1;
      return fetch(url, options).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
        return parseResponse(res);
      }).catch(function (err) {
        if (attempt >= maxAttempts) throw err;
        return new Promise(function (resolve) {
          setTimeout(resolve, 250 * attempt);
        }).then(run);
      });
    }
    return run();
  }

  function fetchJson(url) {
    return fetchWithRetry(url, { credentials: "omit" }, function (res) {
      return res.json();
    }, 2);
  }

  function loadV14Data() {
    if (catalogLoadPromise) return catalogLoadPromise;
    catalogLoadPromise = Promise.all([
      fetchJson(resolveDataUrl(V14_DATA_PATHS.catalog)),
      fetchJson(resolveDataUrl(V14_DATA_PATHS.zones)),
      fetchJson(resolveDataUrl(V14_DATA_PATHS.qualLabels))
    ]).then(function (results) {
      catalogV14 = results[0];
      zonesV14 = results[1];
      qualQuestionLabelsRu = results[2];
      catalogLoadError = null;
      return { catalog: catalogV14, zones: zonesV14, qualLabels: qualQuestionLabelsRu };
    }).catch(function (err) {
      catalogLoadError = err && err.message ? err.message : String(err);
      catalogV14 = null;
      zonesV14 = null;
      qualQuestionLabelsRu = null;
      /* Allow retry after network/transient failure (do not cache rejected promise). */
      catalogLoadPromise = null;
      throw err;
    });
    return catalogLoadPromise;
  }

  function isCatalogReady() {
    return !!(catalogV14 && zonesV14);
  }

  function getZonesConfig() { return zonesV14; }

  function getDirections() {
    if (!catalogV14 || !Array.isArray(catalogV14.directions)) return [];
    return catalogV14.directions.slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
  }

  function getServicesByDirection(directionId) {
    if (!catalogV14 || !Array.isArray(catalogV14.services)) return [];
    return catalogV14.services.filter(function (s) { return s.direction === directionId; });
  }

  function getServiceById(serviceId) {
    if (!catalogV14 || !Array.isArray(catalogV14.services)) return null;
    for (var i = 0; i < catalogV14.services.length; i++) {
      if (catalogV14.services[i].id === serviceId) return catalogV14.services[i];
    }
    return null;
  }

  function getObjectSignalOptions() {
    var list = (zonesV14 && Array.isArray(zonesV14.object_signals))
      ? zonesV14.object_signals
      : FALLBACK_OBJECT_SIGNALS;
    return list.map(function (s) {
      return { id: s.id, label: s.label, zones: s.zones || [] };
    });
  }

  function getObjectSignalById(signalId) {
    var list = (zonesV14 && Array.isArray(zonesV14.object_signals))
      ? zonesV14.object_signals
      : FALLBACK_OBJECT_SIGNALS;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === signalId) return list[i];
    }
    return null;
  }

  function getZonesMeta() {
    if (zonesV14) {
      return {
        zone_display_order: zonesV14.zone_display_order,
        zone_titles: zonesV14.zone_titles,
        zone_templates: zonesV14.zone_templates,
        zone_kb_template_prefix: zonesV14.zone_kb_template_prefix,
        fallback_zone: zonesV14.fallback_zone
      };
    }
    return FALLBACK_ZONES_META;
  }

  function getZoneTemplateMeta(zid) {
    var meta = getZonesMeta();
    var templates = meta.zone_templates || {};
    return templates[zid] || null;
  }

  function stripMarkdownFrontmatter(text) {
    var t = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (/^---\s*\n/.test(t)) {
      var end = t.indexOf("\n---\n", 4);
      if (end !== -1) return t.slice(end + 5).trim();
    }
    return t.trim();
  }

  /** Пункты списка в шаблоне зоны — только по отмеченным признакам объекта. */
  var ZONE_BULLET_SIGNAL_MAP = {
    otkhody: [
      { re: /ТКО/i, signals: ["tko", "kitchen"] },
      { re: /Производственные отходы/i, signals: ["production_waste", "kitchen", "agriculture", "transport"] }
    ],
    ekosbor: [
      { re: /Экологический сбор|экосбор/i, signals: ["import_packaging"] }
    ],
    voda: [
      { re: /ЦСВ|БВВ|канализац/i, signals: ["discharge_csv", "kitchen"] },
      { re: /Декларация/i, signals: ["discharge_csv", "kitchen"] },
      { re: /водные объекты/i, signals: ["discharge_own"] },
      { re: /Скважина|недра/i, signals: ["wells"] }
    ]
  };

  function filterZoneMarkdownBySignals(md, zoneId, signalIds) {
    var text = stripMarkdownFrontmatter(md);
    var rules = ZONE_BULLET_SIGNAL_MAP[zoneId];
    if (!rules || !Array.isArray(signalIds) || !signalIds.length) return text;
    var sigSet = {};
    signalIds.forEach(function (s) { sigSet[s] = true; });
    var lines = text.split("\n");
    var out = [];
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!/^[-*]\s/.test(trimmed)) {
        out.push(line);
        return;
      }
      var keep = false;
      for (var i = 0; i < rules.length; i++) {
        if (!rules[i].re.test(trimmed)) continue;
        for (var j = 0; j < rules[i].signals.length; j++) {
          if (sigSet[rules[i].signals[j]]) { keep = true; break; }
        }
        if (keep) break;
      }
      if (keep) out.push(line);
    });
    var result = out.join("\n").trim();
    if (rules && signalIds.length && !/^\s*[-*]\s/m.test(result)) {
      return stripMarkdownFrontmatter(md);
    }
    return result;
  }

  function applySitesCountWording(text, sitesCount) {
    var t = String(text || "");
    if (!t || !sitesCount) return t;
    var multi = sitesCount === "2–3" || sitesCount === "4 и более";
    if (multi) {
      return t.replace(/\bдоговор\b/gi, "договоры");
    }
    return t.replace(/\bдоговоры\b/gi, "договор").replace(/\bдоговоров\b/gi, "договор");
  }

  function markdownToDisplayHtml(md) {
    var text = stripMarkdownFrontmatter(md);
    if (!text) return "";
    var lines = text.split("\n");
    var html = "";
    var inList = false;
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) {
        if (inList) { html += "</ul>"; inList = false; }
        return;
      }
      if (/^#{1,3}\s/.test(trimmed)) {
        if (inList) { html += "</ul>"; inList = false; }
        html += "<h3 class=\"ecoleadbot-zone-block__heading\">" +
          escapeHtml(trimmed.replace(/^#+\s*/, "")) + "</h3>";
      } else if (/^[-*]\s/.test(trimmed)) {
        if (!inList) { html += "<ul class=\"ecoleadbot-zone-block__list\">"; inList = true; }
        var item = trimmed.replace(/^[-*]\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1");
        html += "<li>" + escapeHtml(item) + "</li>";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        var plain = trimmed.replace(/\*\*(.+?)\*\*/g, "$1");
        html += "<p class=\"ecoleadbot-zone-block__p\">" + escapeHtml(plain) + "</p>";
      }
    });
    if (inList) html += "</ul>";
    return html;
  }

  function extractPlainSummary(md) {
    var text = stripMarkdownFrontmatter(md);
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || /^#/.test(line)) continue;
      if (/^[-*]\s/.test(line)) return line.replace(/^[-*]\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1");
      return line.replace(/\*\*(.+?)\*\*/g, "$1");
    }
    return text.slice(0, 200);
  }

  function loadZoneTemplate(kbKey) {
    if (!kbKey) return Promise.reject(new Error("no kb key"));
    if (zoneTemplateCache[kbKey]) return Promise.resolve(zoneTemplateCache[kbKey]);
    var meta = getZonesMeta();
    var prefix = meta.zone_kb_template_prefix || "mini_assessment";
    var url = resolveDataUrl("kb/" + prefix + "/" + kbKey + ".md");
    return fetchWithRetry(url, { credentials: "omit" }, function (res) {
      return res.text();
    }).then(function (text) {
      zoneTemplateCache[kbKey] = text;
      return text;
    });
  }

  function resolvePodrobneeTemplateKey(zoneId, signalIds) {
    var priorities = PODROBBNEE_SIGNAL_PRIORITY[zoneId] || [];
    var i;
    for (i = 0; i < priorities.length; i++) {
      if (signalIds.indexOf(priorities[i]) !== -1) {
        return "podrobnee/" + zoneId + "_" + priorities[i];
      }
    }
    return "podrobnee/" + zoneId + "_default";
  }

  function loadPodrobneeTemplate(templateKey) {
    if (!templateKey) return Promise.reject(new Error("no podrobnee key"));
    if (podrobneeTemplateCache[templateKey]) {
      return Promise.resolve(podrobneeTemplateCache[templateKey]);
    }
    var url = resolveDataUrl("kb/mini_assessment/" + templateKey + ".md");
    return fetchWithRetry(url, { credentials: "omit" }, function (res) {
      return res.text();
    }).then(function (text) {
      podrobneeTemplateCache[templateKey] = text;
      return text;
    });
  }

  function isPodrobneeTemplateUsable(md) {
    var body = stripMarkdownFrontmatter(md);
    return body.length >= 80;
  }

  function buildQuizContextForRag() {
    syncMainFlowStateFromAnswers();
    var a = state.answers || {};
    var lines = [];
    var activity = (state.activity_type || a.activity_type || a.object_type || "").trim();
    if (activity) lines.push("Вид деятельности: " + activity);
    var signalIds = getActiveObjectSignals();
    if (signalIds.length) {
      lines.push("Признаки на объекте: " + signalIds.map(getObjectSignalLabel).join("; "));
    }
    var nvos = (state.nvos_category || a.nvos_category || "").trim();
    if (nvos) lines.push("Категория НВОС: " + nvos);
    var sites = resolveSitesCount();
    if (sites) lines.push("Число площадок: " + sites);
    if (a.main_situation) lines.push("Актуальная ситуация: " + a.main_situation);
    if (a.urgency) lines.push("Срочность: " + a.urgency);
    return lines.join("\n");
  }

  function buildPodrobneeRagQuestion(zone, basePrompt) {
    var ctx = buildQuizContextForRag();
    var zoneTitle = zone && zone.title ? zone.title : "экология";
    var parts = [
      "Дай краткий экспертный ответ для блока «Подробнее» по направлению «" + zoneTitle + "».",
      "Формат: «Вы отметили … → проверьте …» короткими пунктами.",
      "Учитывай только то, что пользователь указал в опросе.",
      "Если уверенность medium или high — добавь 1–2 статьи КоАП по теме.",
      "",
      "Вопрос: " + (basePrompt || "")
    ];
    if (ctx) {
      parts.push("", "Контекст ответов пользователя:", ctx);
    }
    return parts.join("\n");
  }

  function maybeAppendKoapToAnswer(answer, templateKey, confidence) {
    var text = String(answer || "").trim();
    if (!text) return text;
    if (confidence !== "high" && confidence !== "medium") return text;
    if (/коап|ст\.\s*8\./i.test(text)) return text;
    var snippet = KOAP_SNIPPETS[templateKey.replace(/^podrobnee\//, "")] ||
      KOAP_SNIPPETS[templateKey.split("_").slice(0, 2).join("_")];
    if (!snippet) return text;
    return text + "\n\n**Ответственность (КоАП):** " + snippet;
  }

  function showPodrobneeFromTemplate(zone, md, templateKey) {
    state.mini_zone_rag_id = zone.id || "";
    state.mini_zone_rag_title = zone.title || "";
    /* CRM/payload: human topic, not internal rag_podrobnee_prompt */
    state.rag_question = zone.title
      ? ("Подробнее: " + zone.title)
      : "Подробнее (мини-оценка)";
    state.rag_entry_type = "podrobnee";
    state.rag_from_template = true;
    state.rag_podrobnee_template_key = templateKey || "";
    var body = stripMarkdownFrontmatter(md);
    state.rag_answer = body;
    state.rag_answer_html = markdownToDisplayHtml(body);
    state.rag_answer_summary = summarizeRagAnswer(extractPlainSummary(body));
    state.rag_assistant_recommendation = "answer_only";
    state.rag_confidence = "high";
    state.rag_sources = [];
    state.rag_sources_titles = ["Готовый текст EcoLeadBot"];
    state.rag_error_kind = "";
    persist();
    track("mini_zone_podrobnee_template", {
      session_id: state.session_id,
      zone_id: zone.id,
      template_key: templateKey
    });
    renderRagAnswer();
  }

  function enrichMiniZonesWithTemplates(zones) {
    var signals = getActiveObjectSignals();
    var sites = resolveSitesCount();
    return Promise.all(zones.map(function (zone) {
      var key = zone.kb_zone_key;
      return loadZoneTemplate(key).then(function (md) {
        var filtered = filterZoneMarkdownBySignals(md, zone.id, signals);
        filtered = applySitesCountWording(filtered, sites);
        var copy = {};
        Object.keys(zone).forEach(function (k) { copy[k] = zone[k]; });
        copy.body_text = extractPlainSummary(filtered);
        copy.body_html = markdownToDisplayHtml(filtered);
        return copy;
      }).catch(function () {
        var fb = applySitesCountWording(FALLBACK_ZONE_TEMPLATE_TEXTS[key] || zone.title || "", sites);
        var copy = {};
        Object.keys(zone).forEach(function (k) { copy[k] = zone[k]; });
        copy.body_text = fb;
        copy.body_html = markdownToDisplayHtml(fb);
        return copy;
      });
    }));
  }

  function getQuestionTemplate(templateId) {
    if (!catalogV14 || !catalogV14.question_templates) return null;
    return catalogV14.question_templates[templateId] || null;
  }

  function getUxRules() {
    return (catalogV14 && catalogV14.ux_rules) ? catalogV14.ux_rules : {};
  }
  /* -----------------------------------------------------------------------
     1c. v1.4 DOCUMENT BRANCH (Phase 4)
     ----------------------------------------------------------------------- */
  var NVOS_GROUP_LABELS = {
    first: "Сначала",
    standalone: "Отдельно",
    complex: "Комплекс",
    bridge: "Консультация"
  };

  var DOCUMENT_QUAL_SKIP_IDS = {
    sites_count: true,
    nvos_category: true,
    nvos_registry: true,
    nvos_registry_status: true,
    pek_nvos_cat: true,
    eco_on_registry: true,
    eco_sites: true,
    aero_confirm: true
  };

  /** В COMMENTS — только в «Характеристика объекта», не в «Уточнения». */
  var BITRIX_OBJECT_FIELD_QUAL_IDS = {
    nvos_category: true,
    sites_count: true,
    eco_sites: true,
    pek_nvos_cat: true,
    nvos_registry: true,
    nvos_registry_status: true,
    eco_on_registry: true
  };

  /** Скрытые ответы квалификации при выборе услуги (не показываем в UI). */
  var DOCUMENT_SERVICE_IMPLICIT_QUAL = {
    "dogovor-regional-operator": ["tko_contract_status"]
  };

  /**
   * Стоп-экраны (фаза 2): без заявки в CRM, событие в GTM (dataLayer).
   * gate_id совпадает с gtm_event для единообразия аналитики.
   */
  var SERVICE_GATE_DEFS = {
    disqualified_pdv_ndv_iv: {
      gate_id: "disqualified_pdv_ndv_iv",
      gtm_event: "disqualified_pdv_ndv_iv",
      title: "Проект НДВ, скорее всего, не нужен",
      body: "Для объектов IV категории НВОС (негативное воздействие на окружающую среду) нормативы допустимых выбросов (НДВ) обычно не разрабатывают.\n\nМы не оформляем онлайн-заявку на эту услугу для IV категории. Выберите другую услугу или начните с общей консультации."
    },
    disqualified_pnool_iii_iv: {
      gate_id: "disqualified_pnool_iii_iv",
      gtm_event: "disqualified_pnool_iii_iv",
      title: "ПНООЛР обычно не требуется",
      body: "Проект нормативов образования отходов и лимитов на их размещение (ПНООЛР) актуален для объектов I–II категории НВОС.\n\nДля III–IV категории эта услуга, как правило, не нужна. Выберите другую услугу — при необходимости менеджер уточнит нюансы на звонке."
    },
    disqualified_zso_surface: {
      gate_id: "disqualified_zso_surface",
      gtm_event: "disqualified_zso_surface",
      title: "Поверхностный водозабор — не наш профиль",
      body: "Проект санитарной охраны водозабора (ЗСО) для поверхностных источников (река, озеро) мы не оказываем.\n\nМожем помочь со скважинами и подземными источниками — выберите другую услугу в разделе «ВОДА»."
    },
    disqualified_dsv_not_csv: {
      gate_id: "disqualified_dsv_not_csv",
      gtm_event: "disqualified_dsv_not_csv",
      title: "Декларация нужна только при сбросе в ЦСВ",
      body: "Декларация о составе и свойствах сточных вод подаётся при сбросе в централизованную канализацию (ЦСВ — сети Водоканала).\n\nПри сбросе в собственный водный объект нужны другие документы. Выберите услугу «Проект НДС» или «Общая консультация»."
    }
  };

  /**
   * Фильтры из скрипта администратора: закупка и аванс.
   * Без заявки в CRM; события disqualified_procurement / disqualified_no_advance.
   */
  var CLIENT_GATE_DEFS = {
    disqualified_individual: {
      gate_id: "disqualified_individual",
      gtm_event: "disqualified_individual",
      title: "Работаем с организациями и ИП",
      body: "Наша компания не оказывает услуги физическим лицам: экологические документы оформляются для предпринимательской деятельности.\n\nВместо этого вы можете воспользоваться платной консультацией ведущего эколога."
    },
    disqualified_procurement: {
      gate_id: "disqualified_procurement",
      gtm_event: "disqualified_procurement",
      title: "Работаем только по прямым договорам",
      body: "К сожалению, мы не участвуем в электронных закупках и работаем только по прямым договорам с юридическими лицами и ИП.\n\nСпасибо за понимание!"
    },
    disqualified_no_advance: {
      gate_id: "disqualified_no_advance",
      gtm_event: "disqualified_no_advance",
      title: "Нужен аванс по договору",
      body: "К сожалению, мы работаем только с авансом — без отсрочки и оплаты только по факту выполнения работ.\n\nСпасибо за понимание!"
    }
  };

  var CLIENT_CONTRACT_OPTIONS = [
    "Прямой договор с нашей компанией",
    "Через электронную закупку (44-ФЗ / 223-ФЗ / ЕИС / торговая площадка)",
    "Пока не знаю"
  ];

  var CLIENT_PREPAYMENT_OPTIONS = [
    "Да",
    "Нет / только по факту / без аванса",
    "Пока не знаю"
  ];

  var CLIENT_TERMS_BLOCKS = [
    {
      id: "client_entity_type",
      text: "Вы обращаетесь как?",
      type: "single",
      options: [
        "Юридическое лицо или ИП",
        "Физическое лицо (лично / дача / для себя)"
      ]
    },
    {
      id: "client_contract",
      text: "Как планируете заключать договор?",
      type: "single",
      options: CLIENT_CONTRACT_OPTIONS
    },
    {
      id: "client_prepayment",
      text: "Предусмотрено ли авансирование по договору?",
      type: "single",
      options: CLIENT_PREPAYMENT_OPTIONS
    }
  ];

  function ensureClientTermsAnswers() {
    if (!state.client_terms_answers || typeof state.client_terms_answers !== "object") {
      state.client_terms_answers = {};
    }
    return state.client_terms_answers;
  }

  function saveClientTermsAnswer(id, val) {
    var qa = ensureClientTermsAnswers();
    qa[id] = val;
    persist();
  }

  function isProcurementContractAnswer(answer) {
    return !!(answer && answer.indexOf("закупк") !== -1);
  }

  function isNoPrepaymentAnswer(answer) {
    return !!(answer && /^Нет/.test(answer));
  }

  function isIndividualClientAnswer(answer) {
    return !!(answer && answer.indexOf("Физическое лицо") !== -1);
  }

  function evaluateClientTermsGate() {
    var qa = state.client_terms_answers || {};
    if (isIndividualClientAnswer(qa.client_entity_type)) {
      return CLIENT_GATE_DEFS.disqualified_individual;
    }
    if (isProcurementContractAnswer(qa.client_contract)) {
      return CLIENT_GATE_DEFS.disqualified_procurement;
    }
    if (isNoPrepaymentAnswer(qa.client_prepayment)) {
      return CLIENT_GATE_DEFS.disqualified_no_advance;
    }
    return null;
  }

  function proceedToContact() {
    if (isAlreadySubmitted()) {
      renderContactBlocked();
      return;
    }
    if (!state.client_terms_ok) {
      if (!state.before_client_terms_screen) {
        state.before_client_terms_screen = state.previous_screen || state.current_screen || "intro";
        persist();
      }
      renderClientTerms();
      return;
    }
    renderContact();
  }

  function showClientGate(gate, previousScreen) {
    if (!gate) return false;
    state.last_client_gate_id = gate.gate_id || "";
    state.previous_screen = previousScreen || "client_terms";
    persist();
    renderClientGate(gate);
    return true;
  }

  function renderClientGate(gate) {
    setScreen("client_gate");
    hideProgress();
    scrollBodyTop();

    track("client_gate_shown", {
      session_id: state.session_id,
      gate_id: gate.gate_id
    });
    track(gate.gtm_event || "disqualified_client", {
      session_id: state.session_id,
      gate_id: gate.gate_id
    });

    var screen = el("div", "ecoleadbot-screen ecoleadbot-service-gate");
    prependBackButton(screen);

    var icon = el("div", "ecoleadbot-service-gate__icon");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "ℹ";
    screen.appendChild(icon);

    screen.appendChild(el("h2", "ecoleadbot-title", escapeHtml(gate.title)));
    String(gate.body || "").split("\n\n").forEach(function (para) {
      if (para.trim()) {
        screen.appendChild(el("p", "ecoleadbot-subtitle ecoleadbot-service-gate__p",
          escapeHtml(para.trim())));
      }
    });

    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    if (gate.gate_id === "disqualified_individual") {
      var consultationLink = el("a",
        "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block",
        "Консультация ведущего эколога");
      consultationLink.href = "https://ecolusspb.ru/services/konsultatsiya-ot-vedushchego-ekologa/";
      consultationLink.target = "_blank";
      consultationLink.rel = "noopener noreferrer";
      actions.appendChild(consultationLink);
    }
    var editBtn = el("button",
      "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block",
      "Изменить ответы");
    editBtn.type = "button";
    editBtn.addEventListener("click", function () {
      track("client_gate_edit_answers", {
        session_id: state.session_id,
        gate_id: gate.gate_id
      });
      state.client_terms_ok = false;
      persist();
      renderClientTerms();
    });
    actions.appendChild(editBtn);

    var homeBtn = el("button",
      "ecoleadbot-btn ecoleadbot-btn--ghost ecoleadbot-btn--block",
      "На главную");
    homeBtn.type = "button";
    homeBtn.addEventListener("click", function () {
      track("client_gate_home", {
        session_id: state.session_id,
        gate_id: gate.gate_id
      });
      resetFlowToHome();
    });
    actions.appendChild(homeBtn);

    screen.appendChild(actions);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderClientTerms() {
    setScreen("client_terms");
    hideProgress();
    scrollBodyTop();
    track("client_terms_viewed", { session_id: state.session_id });

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Условия сотрудничества"));
    screen.appendChild(el("p", "ecoleadbot-subtitle",
      "Три коротких вопроса — чтобы сразу понять, сможем ли мы помочь в вашем формате."));

    CLIENT_TERMS_BLOCKS.forEach(function (block) {
      var section = el("div", "ecoleadbot-clarify-block");
      section.setAttribute("data-qual-block", block.id);
      section.appendChild(el("h3", "ecoleadbot-clarify-block__title", escapeHtml(block.text)));

      var optionsWrap = el("div", "ecoleadbot-options ecoleadbot-options--compact");
      wireOptionCardsGroup({
        container: optionsWrap,
        blockId: block.id,
        qType: "single",
        options: block.options || [],
        compact: true,
        getAnswers: function () { return ensureClientTermsAnswers(); },
        setAnswer: function (id, val) { saveClientTermsAnswer(id, val); },
        onAnswerChange: function () { clearQualValidationUi(screen); }
      });
      section.appendChild(optionsWrap);
      screen.appendChild(section);
    });

    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    var hint = el("p", "ecoleadbot-actions__hint ecoleadbot-hidden");
    var nextBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Далее");
    nextBtn.type = "button";
    nextBtn.addEventListener("click", function () {
      var answersNow = ensureClientTermsAnswers();
      if (!validateQualBlocks(screen, CLIENT_TERMS_BLOCKS, answersNow, {
        nextBtn: nextBtn,
        hintEl: hint,
        hintText: "Ответьте на все вопросы выше"
      })) {
        return;
      }
      var gate = evaluateClientTermsGate();
      if (gate) {
        showClientGate(gate, "client_terms");
        return;
      }
      state.client_terms_ok = true;
      state.previous_screen = "client_terms";
      persist();
      renderContact();
    });
    actions.appendChild(hint);
    actions.appendChild(nextBtn);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function isCsvDischargePoint(value) {
    return String(value || "").indexOf("ЦСВ") !== -1;
  }

  function isOwnDischargePoint(value) {
    return String(value || "").indexOf("Собственный") !== -1;
  }

  function evaluateServiceGate(svc) {
    if (!svc || state.flow !== "document") return null;
    var qa = state.qualification_answers || {};
    var cat = resolveNvosCategory();

    if (svc.id === "pdv-ndv" && cat === "IV") {
      return SERVICE_GATE_DEFS.disqualified_pdv_ndv_iv;
    }
    if (svc.id === "pnool" && (cat === "III" || cat === "IV")) {
      return SERVICE_GATE_DEFS.disqualified_pnool_iii_iv;
    }
    if (svc.id === "zso" && qa.zso_water_source === "Поверхностный водозабор") {
      return SERVICE_GATE_DEFS.disqualified_zso_surface;
    }
    if (svc.id === "deklaraciya-stochnyh-vod") {
      var pt = qa.dsv_discharge_point || "";
      if (isOwnDischargePoint(pt)) {
        return SERVICE_GATE_DEFS.disqualified_dsv_not_csv;
      }
    }
    return null;
  }

  function showServiceGate(gate, previousScreen) {
    if (!gate) return false;
    state.last_service_gate_id = gate.gate_id || "";
    state.previous_screen = previousScreen || state.previous_screen || "document_services";
    persist();
    renderServiceGate(gate);
    return true;
  }

  function proceedDocumentBranchOrGate(afterStepId) {
    var svc = getServiceById(state.selected_service_id);
    var gate = evaluateServiceGate(svc);
    if (gate) {
      var prev = afterStepId ? documentStepToScreen(afterStepId) : "document_services";
      return showServiceGate(gate, prev);
    }
    advanceDocumentBranch(afterStepId);
    return false;
  }

  function renderServiceGate(gate) {
    setScreen("service_gate");
    hideProgress();
    scrollBodyTop();

    var svc = getServiceById(state.selected_service_id);
    track("service_gate_shown", {
      session_id: state.session_id,
      gate_id: gate.gate_id,
      service_id: state.selected_service_id || "",
      service_title: svc ? svc.title : ""
    });
    track(gate.gtm_event || "disqualified_service", {
      session_id: state.session_id,
      gate_id: gate.gate_id,
      service_id: state.selected_service_id || "",
      service_title: svc ? svc.title : ""
    });

    var screen = el("div", "ecoleadbot-screen ecoleadbot-service-gate");
    prependBackButton(screen);

    var icon = el("div", "ecoleadbot-service-gate__icon");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "ℹ";
    screen.appendChild(icon);

    screen.appendChild(el("h2", "ecoleadbot-title", escapeHtml(gate.title)));
    var bodyParts = String(gate.body || "").split("\n\n");
    bodyParts.forEach(function (para) {
      if (para.trim()) {
        screen.appendChild(el("p", "ecoleadbot-subtitle ecoleadbot-service-gate__p",
          escapeHtml(para.trim())));
      }
    });

    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    var servicesBtn = el("button",
      "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block",
      "Выбрать другую услугу");
    servicesBtn.type = "button";
    servicesBtn.addEventListener("click", function () {
      track("service_gate_back_to_services", {
        session_id: state.session_id,
        gate_id: gate.gate_id
      });
      renderDocumentServices();
    });
    actions.appendChild(servicesBtn);

    var consultBtn = el("button",
      "ecoleadbot-btn ecoleadbot-btn--ghost ecoleadbot-btn--block",
      "Нужна общая консультация");
    consultBtn.type = "button";
    consultBtn.addEventListener("click", function () {
      track("service_gate_consultation_click", {
        session_id: state.session_id,
        gate_id: gate.gate_id
      });
      state.selected_service_id = "konsultaciya-ekologa";
      state.selected_direction = "nvos";
      state.last_service_gate_id = "";
      persist();
      startDocumentBranchAfterService();
    });
    actions.appendChild(consultBtn);

    screen.appendChild(actions);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  /* -----------------------------------------------------------------------
     1c2. DOCUMENT BRANCH CORE (steps, qual helpers)
     ----------------------------------------------------------------------- */
  function needsDocumentRegistryQuestion(svc) {
    return !!(svc && svc.registry_instead_of_category === true);
  }

  function needsDocumentNvosCategory(svc) {
    if (!svc) return false;
    if (svc.needs_nvos_category_in_branch === true) return true;
    return false;
  }

  function hasDocumentNvosCategoryAnswer() {
    var qa = state.qualification_answers || {};
    return !!(state.nvos_category || (state.answers && state.answers.nvos_category) || qa.nvos_category);
  }

  function hasDocumentSitesAnswer() {
    var qa = state.qualification_answers || {};
    return !!(state.sites_count || (state.answers && state.answers.sites_count) || qa.sites_count || qa.eco_sites);
  }

  function needsDocumentSites(svc) {
    if (!svc) return false;
    if (svc.skip_sites_in_branch === true) return false;
    return true;
  }

  function getDocumentBranchSteps(svc) {
    if (!svc) return ["contact"];
    var steps = [];
    if (needsDocumentRegistryQuestion(svc)) steps.push("registry");
    if (needsDocumentNvosCategory(svc)) steps.push("nvos_category");
    if (needsDocumentSites(svc)) steps.push("sites");
    if (getServiceQualificationQuestions(svc).length) steps.push("qualification");
    steps.push("contact");
    return steps;
  }

  function documentStepToScreen(stepId) {
    if (stepId === "registry") return "document_registry";
    if (stepId === "nvos_category") return "document_nvos_category";
    if (stepId === "sites") return "document_sites";
    if (stepId === "qualification") return "document_qualification";
    return "contact";
  }

  function getPreviousDocumentBranchStep(currentStepId) {
    var svc = getServiceById(state.selected_service_id);
    var steps = getDocumentBranchSteps(svc);
    var idx = steps.indexOf(currentStepId);
    if (idx <= 0) return null;
    return steps[idx - 1];
  }

  function advanceDocumentBranch(afterStepId) {
    var svc = getServiceById(state.selected_service_id);
    var steps = getDocumentBranchSteps(svc);
    var idx = afterStepId ? steps.indexOf(afterStepId) : -1;
    var next = steps[idx + 1] || "contact";
    if (next === "contact") {
      var gate = evaluateServiceGate(svc);
      if (gate) {
        var prevStep = idx >= 0 ? steps[idx] : "document_services";
        showServiceGate(gate, documentStepToScreen(prevStep));
        return;
      }
      var prevStep = idx >= 0 ? steps[idx] : "document_services";
      state.previous_screen = documentStepToScreen(prevStep);
      if (state.previous_screen === "contact") state.previous_screen = "document_services";
      persist();
      proceedToContact();
      return;
    }
    if (next === "registry") renderDocumentRegistryOnAccount();
    else if (next === "nvos_category") renderDocumentNvosCategory();
    else if (next === "sites") renderDocumentSites();
    else if (next === "qualification") renderDocumentQualification();
  }

  function startDocumentBranchAfterService() {
    state.previous_screen = "document_services";
    persist();
    advanceDocumentBranch(null);
  }

  function getNvosListGroup(svc) {
    if (!svc) return "standalone";
    if (svc.id === "postanovka-nvos") return "first";
    if (svc.service_type === "complex") return "complex";
    if (svc.service_type === "bridge") return "bridge";
    return "standalone";
  }

  function getNvosGroupOrder(registry) {
    if (registry === "Да") return ["standalone", "complex", "first", "bridge"];
    if (registry === "Нет") return ["first", "standalone", "complex", "bridge"];
    return ["first", "standalone", "complex", "bridge"];
  }

  function getServiceQualificationQuestions(svc) {
    if (!svc || !Array.isArray(svc.qualification_questions)) return [];
    var out = [];
    svc.qualification_questions.forEach(function (q) {
      if (!q || !q.id) return;
      if (DOCUMENT_QUAL_SKIP_IDS[q.id]) return;
      if ((q.id === "nvos_registry" || q.id === "nvos_registry_status" || q.id === "plata_on_registry") &&
          state.document_nvos_registry) return;
      if (q.id === "eco_on_registry" && state.document_nvos_registry) return;
      if (q.id === "pek_nvos_cat" && hasDocumentNvosCategoryAnswer()) return;
      if (q.id === "nvos_category" && hasDocumentNvosCategoryAnswer()) return;
      if (q.id === "sites_count" && hasDocumentSitesAnswer()) return;
      if (q.id === "eco_sites" && hasDocumentSitesAnswer()) return;
      out.push(q);
    });
    return out.slice(0, 3);
  }

  function hasDocumentQualificationStep() {
    var svc = state.selected_service_id ? getServiceById(state.selected_service_id) : null;
    return getServiceQualificationQuestions(svc).length > 0;
  }

  function resolveNvosCategory() {
    var a = state.answers || {};
    var qa = state.qualification_answers || {};
    return String(
      state.nvos_category || a.nvos_category || qa.nvos_category || qa.pek_nvos_cat || ""
    ).trim();
  }

  function resolveSitesCount() {
    var a = state.answers || {};
    var qa = state.qualification_answers || {};
    return String(
      state.sites_count || a.sites_count || qa.sites_count || qa.eco_sites || ""
    ).trim();
  }

  function syncObjectFieldsFromQual() {
    var answers = ensureAnswers();
    var nvos = resolveNvosCategory();
    var sites = resolveSitesCount();
    if (nvos) {
      state.nvos_category = nvos;
      answers.nvos_category = nvos;
    }
    if (sites) {
      state.sites_count = sites;
      answers.sites_count = sites;
    }
  }

  function buildQualQuestionLabelMap() {
    var map = {};
    if (qualQuestionLabelsRu && typeof qualQuestionLabelsRu === "object") {
      Object.keys(qualQuestionLabelsRu).forEach(function (id) {
        map[id] = qualQuestionLabelsRu[id];
      });
    }
    if (catalogV14 && catalogV14.question_templates) {
      Object.keys(catalogV14.question_templates).forEach(function (tid) {
        var t = catalogV14.question_templates[tid];
        if (t && t.id) map[t.id] = t.text || t.id;
      });
    }
    if (catalogV14 && Array.isArray(catalogV14.services)) {
      catalogV14.services.forEach(function (svc) {
        (svc.qualification_questions || []).forEach(function (q) {
          if (q && q.id) map[q.id] = q.text || q.id;
        });
      });
    }
    return map;
  }

  function getQualQuestionLabel(questionId, labelMap) {
    if (labelMap && labelMap[questionId]) return labelMap[questionId];
    if (qualQuestionLabelsRu && qualQuestionLabelsRu[questionId]) {
      return qualQuestionLabelsRu[questionId];
    }
    return "Дополнительный вопрос";
  }

  function isLatinSlug(text) {
    return /^[a-z0-9_]+$/i.test(String(text || ""));
  }

  function getClarifyQualAllowlist() {
    var allowed = {};
    getClarifyBlocks(getActiveObjectSignals()).forEach(function (b) {
      if (b && b.id) allowed[b.id] = true;
    });
    return allowed;
  }

  function getAllowedQualIdsForCurrentPath() {
    var allowed = getClarifyQualAllowlist();
    var svc = state.selected_service_id ? getServiceById(state.selected_service_id) : null;
    if (svc) {
      getServiceQualificationQuestions(svc).forEach(function (q) {
        if (q && q.id) allowed[q.id] = true;
      });
      (DOCUMENT_SERVICE_IMPLICIT_QUAL[svc.id] || []).forEach(function (qid) {
        allowed[qid] = true;
      });
    }
    return allowed;
  }

  function pruneQualificationAnswers(allowedMap) {
    var qa = ensureQualificationAnswers();
    Object.keys(qa).forEach(function (k) {
      if (!allowedMap[k]) delete qa[k];
    });
    state.qualification_answers = qa;
    persist();
  }

  function resetQualForDocumentDirectionChange() {
    pruneQualificationAnswers(getClarifyQualAllowlist());
  }

  function resetQualForDocumentServiceChange(serviceId) {
    var allowed = getClarifyQualAllowlist();
    var svc = getServiceById(serviceId);
    if (svc) {
      getServiceQualificationQuestions(svc).forEach(function (q) {
        if (q && q.id) allowed[q.id] = true;
      });
      (DOCUMENT_SERVICE_IMPLICIT_QUAL[svc.id] || []).forEach(function (qid) {
        allowed[qid] = true;
      });
    }
    pruneQualificationAnswers(allowed);
  }

  function getFilteredQualificationAnswersObject() {
    var qa = state.qualification_answers || {};
    var allowed = getAllowedQualIdsForCurrentPath();
    var out = {};
    Object.keys(qa).forEach(function (k) {
      if (BITRIX_OBJECT_FIELD_QUAL_IDS[k]) return;
      if (!allowed[k]) return;
      var v = qa[k];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
      out[k] = v;
    });
    return out;
  }

  var NVOS_CATEGORY_OPTIONS = ["I", "II", "III", "IV", "Не знаю"];
  var SITES_COUNT_OPTIONS = ["1", "2–3", "4 и более", "Не знаю"];
  var REGISTRY_ON_ACCOUNT_OPTIONS = ["Да", "Нет", "Не знаю"];

  function qualBlockType(block) {
    if (!block) return "single";
    if (block.type === "multi" || block.type === "multiple") return "multi";
    if (block.type === "text") return "text";
    return "single";
  }

  function getQualBlockValue(block, answersNow, screenEl) {
    if (qualBlockType(block) === "text") {
      var ta = screenEl.querySelector('textarea[data-question-id="' + block.id + '"]');
      return ta ? ta.value.trim() : "";
    }
    return answersNow[block.id];
  }

  function isQualAnswerValid(block, val) {
    var t = qualBlockType(block);
    if (t === "text") return !!String(val || "").trim();
    if (t === "multi") return Array.isArray(val) && val.length > 0;
    return !!val;
  }

  /**
   * Проверка блоков qual/clarify; подсветка секций и подсказка у «Далее».
   * saveTextAnswers(saveFn) — опционально сохранить text-ответы при успехе.
   */
  function validateQualBlocks(screenEl, blocks, answersNow, opts) {
    opts = opts || {};
    var allOk = true;
    var firstBad = null;
    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b];
      var section = screenEl.querySelector('[data-qual-block="' + blk.id + '"]');
      var val = getQualBlockValue(blk, answersNow, screenEl);
      var ok = isQualAnswerValid(blk, val);
      if (section) section.classList.toggle("ecoleadbot-clarify-block--error", !ok);
      if (qualBlockType(blk) === "text") {
        var ta = screenEl.querySelector('textarea[data-question-id="' + blk.id + '"]');
        if (ta) ta.classList.toggle("is-error", !ok);
      }
      if (!ok) {
        allOk = false;
        if (!firstBad) firstBad = section;
      } else if (qualBlockType(blk) === "text" && opts.saveTextAnswer) {
        opts.saveTextAnswer(blk.id, val);
      }
    }
    if (opts.nextBtn) opts.nextBtn.classList.toggle("is-error", !allOk);
    if (opts.hintEl) {
      opts.hintEl.textContent = allOk ? "" : (opts.hintText || "Выберите ответ на все вопросы");
      opts.hintEl.classList.toggle("ecoleadbot-hidden", allOk);
    }
    if (!allOk && firstBad && firstBad.scrollIntoView) {
      firstBad.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    return allOk;
  }

  function clearQualValidationUi(screenEl) {
    if (!screenEl) return;
    screenEl.querySelectorAll(".ecoleadbot-clarify-block--error").forEach(function (el) {
      el.classList.remove("ecoleadbot-clarify-block--error");
    });
    var hint = screenEl.querySelector(".ecoleadbot-actions__hint");
    if (hint) {
      hint.textContent = "";
      hint.classList.add("ecoleadbot-hidden");
    }
    var btn = screenEl.querySelector(".ecoleadbot-actions .ecoleadbot-btn");
    if (btn) btn.classList.remove("is-error");
  }

  function ensureQualificationAnswers() {
    if (!state.qualification_answers || typeof state.qualification_answers !== "object" ||
        Array.isArray(state.qualification_answers)) {
      state.qualification_answers = {};
    }
    return state.qualification_answers;
  }

  /** Guarantees state.answers is a plain object (restored/partial sessions may omit it). */
  function ensureAnswers() {
    if (!state.answers || typeof state.answers !== "object" || Array.isArray(state.answers)) {
      state.answers = {};
    }
    return state.answers;
  }

  function saveDocumentQualAnswer(questionId, value) {
    var qa = ensureQualificationAnswers();
    if (value === "" || value == null || (Array.isArray(value) && value.length === 0)) {
      delete qa[questionId];
    } else {
      qa[questionId] = value;
    }
    state.qualification_answers = qa;
    if (questionId === "sites_count" || questionId === "eco_sites") {
      state.sites_count = value || "";
      ensureAnswers().sites_count = value || "";
    }
    persist();
  }

  /** Синхронизирует галочки/точки во всех карточках одного вопроса. */
  function optionCardMark(qType, isSel) {
    return qType === "multi" ? (isSel ? "✓" : "") : (isSel ? "●" : "");
  }

  function isOptionSelected(selected, opt, qType) {
    if (qType === "multi") {
      return Array.isArray(selected) && selected.indexOf(opt) !== -1;
    }
    return selected === opt;
  }

  function syncOptionCardsUi(container, blockId, qType, answersObj) {
    if (!container || !answersObj) return;
    var selected = answersObj[blockId];
    var cards = container.querySelectorAll(".ecoleadbot-card[data-qual-option]");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var opt = card.getAttribute("data-qual-option");
      if (opt == null) continue;
      var isSel = isOptionSelected(selected, opt, qType);
      card.classList.toggle("is-selected", isSel);
      var check = card.querySelector(".ecoleadbot-card__check");
      if (check) check.textContent = optionCardMark(qType, isSel);
    }
  }

  /**
   * Группа карточек одного вопроса (single / multi).
   * getAnswers() — актуальный объект ответов; setAnswer(id, value) — сохранение.
   */
  function wireOptionCardsGroup(params) {
    var container = params.container;
    var blockId = params.blockId;
    var qType = params.qType === "multi" ? "multi" : "single";
    var options = params.options || [];
    var getAnswers = params.getAnswers;
    var setAnswer = params.setAnswer;
    var compact = !!params.compact;
    var onAnswerChange = params.onAnswerChange;
    var cardCls = compact
      ? "ecoleadbot-card ecoleadbot-card--compact"
      : "ecoleadbot-card";

    container.setAttribute("data-qual-block-id", blockId);

    options.forEach(function (opt) {
      var card = el("button", cardCls);
      card.type = "button";
      var answers = getAnswers();
      var isSel = isOptionSelected(answers[blockId], opt, qType);
      if (isSel) card.classList.add("is-selected");
      card.innerHTML =
        '<span class="ecoleadbot-card__check" aria-hidden="true">' +
        optionCardMark(qType, isSel) + "</span>" +
        "<span>" + escapeHtml(opt) + "</span>";
      card.setAttribute("data-qual-option", opt);

      card.addEventListener("click", function () {
        var ans = getAnswers();
        var current = ans[blockId];
        if (qType === "multi") {
          var arr = Array.isArray(current) ? current.slice() : [];
          var pos = arr.indexOf(opt);
          if (pos === -1) arr.push(opt); else arr.splice(pos, 1);
          setAnswer(blockId, arr);
        } else if (current === opt) {
          setAnswer(blockId, "");
        } else {
          setAnswer(blockId, opt);
        }
        syncOptionCardsUi(container, blockId, qType, getAnswers());
        if (onAnswerChange) onAnswerChange();
      });
      container.appendChild(card);
    });

    syncOptionCardsUi(container, blockId, qType, getAnswers());
  }

  function setDocumentBranchPreviousScreen(currentStepId) {
    var prev = getPreviousDocumentBranchStep(currentStepId);
    state.previous_screen = prev ? documentStepToScreen(prev) : "document_services";
    persist();
  }

  function goBackDocumentBranchScreen() {
    var stepByScreen = {
      document_registry: "registry",
      document_nvos_category: "nvos_category",
      document_sites: "sites",
      document_qualification: "qualification"
    };
    var currentStep = stepByScreen[state.current_screen];
    if (!currentStep) return false;
    var prev = getPreviousDocumentBranchStep(currentStep);
    if (!prev) {
      renderDocumentServices();
      return true;
    }
    if (prev === "registry") renderDocumentRegistryOnAccount();
    else if (prev === "nvos_category") renderDocumentNvosCategory();
    else if (prev === "sites") renderDocumentSites();
    else if (prev === "qualification") renderDocumentQualification();
    return true;
  }

  function setClarifyAnswer(questionId, value) {
    var answers = ensureAnswers();
    if (value === "" || value == null || (Array.isArray(value) && value.length === 0)) {
      delete answers[questionId];
      if (state.qualification_answers) delete state.qualification_answers[questionId];
    } else {
      answers[questionId] = value;
      ensureQualificationAnswers()[questionId] = value;
    }
    persist();
  }

  /* -----------------------------------------------------------------------
     1c3. DOCUMENT BRANCH SCREENS
     ----------------------------------------------------------------------- */
  function renderDocumentRegistryOnAccount() {
    setScreen("document_registry");
    hideProgress();
    scrollBodyTop();
    track("document_registry_viewed");
    setDocumentBranchPreviousScreen("registry");

    var svc = getServiceById(state.selected_service_id);
    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Объект на учёте в реестре НВОС?"));
    screen.appendChild(el("p", "ecoleadbot-subtitle",
      (svc ? "Услуга: " + escapeHtml(svc.title) + ". " : "") +
      "КЭР требуется для объектов I категории — уточним, есть ли уже постановка на учёт."));

    var optionsWrap = el("div", "ecoleadbot-options");
    var cur = state.document_nvos_registry || ensureQualificationAnswers().nvos_registry_status || "";
    REGISTRY_ON_ACCOUNT_OPTIONS.forEach(function (opt) {
      var card = el("button", "ecoleadbot-card");
      card.type = "button";
      var isSel = cur === opt;
      if (isSel) card.classList.add("is-selected");
      card.innerHTML =
        '<span class="ecoleadbot-card__check" aria-hidden="true">' + (isSel ? "●" : "") + "</span>" +
        "<span>" + escapeHtml(opt) + "</span>";
      card.addEventListener("click", function () {
        state.document_nvos_registry = opt;
        saveDocumentQualAnswer("nvos_registry_status", opt);
        advanceDocumentBranch("registry");
      });
      optionsWrap.appendChild(card);
    });

    screen.appendChild(optionsWrap);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function appendDocumentServiceCard(optionsWrap, svc) {
    var card = el("button", "ecoleadbot-card");
    card.type = "button";
    var isSel = state.selected_service_id === svc.id;
    if (isSel) card.classList.add("is-selected");
    var noteHtml = svc.ui_note
      ? '<span class="ecoleadbot-card__note">' + escapeHtml(svc.ui_note) + "</span>"
      : "";
    card.innerHTML =
      '<span class="ecoleadbot-card__check" aria-hidden="true">' + (isSel ? "●" : "") + "</span>" +
      "<span>" + escapeHtml(svc.title) + noteHtml + "</span>";
    card.addEventListener("click", function () { selectDocumentService(svc.id); });
    optionsWrap.appendChild(card);
  }

  function renderDocumentNvosFilter() {
    setScreen("document_nvos_filter");
    hideProgress();
    scrollBodyTop();
    track("document_nvos_filter_viewed");

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Объект на учёте НВОС?"));
    screen.appendChild(el("p", "ecoleadbot-subtitle",
      "По ответу подберём услуги: сначала постановка на учёт или отчётность / сопровождение."));

    var optionsWrap = el("div", "ecoleadbot-options");
    ["Да", "Нет", "Не знаю"].forEach(function (opt) {
      var card = el("button", "ecoleadbot-card");
      card.type = "button";
      var isSel = state.document_nvos_registry === opt;
      if (isSel) card.classList.add("is-selected");
      card.innerHTML =
        '<span class="ecoleadbot-card__check" aria-hidden="true">' + (isSel ? "●" : "") + "</span>" +
        "<span>" + escapeHtml(opt) + "</span>";
      card.addEventListener("click", function () {
        state.document_nvos_registry = opt;
        saveDocumentQualAnswer("nvos_registry_status", opt);
        persist();
        track("document_nvos_registry_selected", { value: opt });
        renderDocumentServices();
      });
      optionsWrap.appendChild(card);
    });
    screen.appendChild(optionsWrap);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderDocumentNvosCategory() {
    setScreen("document_nvos_category");
    hideProgress();
    scrollBodyTop();
    track("document_nvos_category_viewed");
    setDocumentBranchPreviousScreen("nvos_category");

    var svc = getServiceById(state.selected_service_id);
    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Категория объекта НВОС"));
    if (svc) {
      screen.appendChild(el("p", "ecoleadbot-subtitle",
        "Услуга: " + escapeHtml(svc.title) +
        ". Если не знаете — выберите «Не знаю», уточним при звонке."));
    }

    var optionsWrap = el("div", "ecoleadbot-options");
    var selected = state.nvos_category || (state.answers && state.answers.nvos_category) || "";
    NVOS_CATEGORY_OPTIONS.forEach(function (opt) {
      var card = el("button", "ecoleadbot-card");
      card.type = "button";
      var isSel = selected === opt;
      if (isSel) card.classList.add("is-selected");
      card.innerHTML =
        '<span class="ecoleadbot-card__check" aria-hidden="true">' + (isSel ? "●" : "") + "</span>" +
        "<span>" + escapeHtml(opt) + "</span>";
      card.addEventListener("click", function () {
        state.nvos_category = opt;
        ensureAnswers().nvos_category = opt;
        saveDocumentQualAnswer("nvos_category", opt);
        persist();
        proceedDocumentBranchOrGate("nvos_category");
      });
      optionsWrap.appendChild(card);
    });
    screen.appendChild(optionsWrap);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderDocumentSites() {
    setScreen("document_sites");
    hideProgress();
    scrollBodyTop();
    track("document_sites_viewed");
    setDocumentBranchPreviousScreen("sites");

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Сколько площадок (адресов)?"));
    screen.appendChild(el("p", "ecoleadbot-subtitle",
      "Нужно для оценки объёма работ и подготовки разговора со специалистом."));

    var optionsWrap = el("div", "ecoleadbot-options");
    var selected = state.sites_count || (state.answers && state.answers.sites_count) || "";
    SITES_COUNT_OPTIONS.forEach(function (opt) {
      var card = el("button", "ecoleadbot-card");
      card.type = "button";
      var isSel = selected === opt;
      if (isSel) card.classList.add("is-selected");
      card.innerHTML =
        '<span class="ecoleadbot-card__check" aria-hidden="true">' + (isSel ? "●" : "") + "</span>" +
        "<span>" + escapeHtml(opt) + "</span>";
      card.addEventListener("click", function () {
        state.sites_count = opt;
        ensureAnswers().sites_count = opt;
        saveDocumentQualAnswer("sites_count", opt);
        advanceDocumentBranch("sites");
      });
      optionsWrap.appendChild(card);
    });
    screen.appendChild(optionsWrap);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderDocumentQualification() {
    var svc = getServiceById(state.selected_service_id);
    var blocks = getServiceQualificationQuestions(svc);
    if (!blocks.length) {
      advanceDocumentBranch("qualification");
      return;
    }

    setScreen("document_qualification");
    hideProgress();
    scrollBodyTop();
    track("document_qualification_viewed", { service_id: state.selected_service_id });
    setDocumentBranchPreviousScreen("qualification");

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Уточните по услуге"));
    if (svc) {
      screen.appendChild(el("p", "ecoleadbot-subtitle", escapeHtml(svc.title)));
    }

    var qa = ensureQualificationAnswers();

    blocks.forEach(function (block) {
      var section = el("div", "ecoleadbot-clarify-block");
      section.setAttribute("data-qual-block", block.id);
      section.appendChild(el("h3", "ecoleadbot-clarify-block__title", escapeHtml(block.text)));
      if (block.hint) {
        section.appendChild(el("p", "ecoleadbot-intro__hint ecoleadbot-question-hint", escapeHtml(block.hint)));
      }

      if (block.type === "text") {
        var field = el("div", "ecoleadbot-field");
        var textarea = el("textarea", "ecoleadbot-textarea");
        textarea.dataset.questionId = block.id;
        textarea.maxLength = block.max_length || 500;
        textarea.placeholder = block.placeholder || "Кратко опишите ситуацию";
        textarea.value = qa[block.id] || "";
        textarea.addEventListener("input", function () { clearQualValidationUi(screen); });
        field.appendChild(textarea);
        section.appendChild(field);
      } else {
        var optionsWrap = el("div", "ecoleadbot-options ecoleadbot-options--compact");
        wireOptionCardsGroup({
          container: optionsWrap,
          blockId: block.id,
          qType: qualBlockType(block),
          options: block.options || [],
          compact: true,
          getAnswers: function () { return ensureQualificationAnswers(); },
          setAnswer: function (id, val) { saveDocumentQualAnswer(id, val); },
          onAnswerChange: function () { clearQualValidationUi(screen); }
        });
        section.appendChild(optionsWrap);
      }
      screen.appendChild(section);
    });

    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    var qualHint = el("p", "ecoleadbot-actions__hint ecoleadbot-hidden");
    var nextBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Далее");
    nextBtn.type = "button";
    nextBtn.addEventListener("click", function () {
      var answersNow = ensureQualificationAnswers();
      if (!validateQualBlocks(screen, blocks, answersNow, {
        nextBtn: nextBtn,
        hintEl: qualHint,
        hintText: "Ответьте на все вопросы выше",
        saveTextAnswer: function (id, val) { saveDocumentQualAnswer(id, val); }
      })) {
        return;
      }
      state.previous_screen = "document_qualification";
      persist();
      var gate = evaluateServiceGate(getServiceById(state.selected_service_id));
      if (gate) {
        showServiceGate(gate, "document_qualification");
        return;
      }
      proceedToContact();
    });
    actions.appendChild(qualHint);
    actions.appendChild(nextBtn);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  /** Признаки объекта → уникальные зоны мини-оценки (порядок из zone_display_order). */
  function resolveMiniZones(signalIds) {
    var meta = getZonesMeta();
    var ids = Array.isArray(signalIds) ? signalIds : [];
    var zoneSet = {};

    ids.forEach(function (sid) {
      var sig = getObjectSignalById(sid);
      if (!sig || !Array.isArray(sig.zones)) return;
      sig.zones.forEach(function (zid) { zoneSet[zid] = true; });
    });

    var order = meta.zone_display_order || [];
    var titles = meta.zone_titles || {};
    var zones = [];

    order.forEach(function (zid) {
      if (!zoneSet[zid]) return;
      var tpl = getZoneTemplateMeta(zid) || {};
      zones.push({
        id: zid,
        title: titles[zid] || zid,
        kb_zone_key: tpl.kb_zone_key || ("zone_" + zid),
        rag_podrobnee_prompt: tpl.rag_podrobnee_prompt || ""
      });
    });

    if (!zones.length && meta.fallback_zone) {
      var fb = meta.fallback_zone;
      zones.push({
        id: fb.id || "general",
        title: fb.title || "Общая оценка",
        kb_zone_key: fb.kb_zone_key || "zone_general",
        rag_podrobnee_prompt: fb.rag_podrobnee_prompt || ""
      });
    }
    return zones;
  }

  function logV14DataStatus() {
    if (!isCatalogReady()) {
      console.warn(
        "[EcoLeadBot v1.4] JSON каталога не загружен, используется встроенный fallback:",
        catalogLoadError || "unknown"
      );
      return;
    }
    var svcCount = catalogV14.services ? catalogV14.services.length : 0;
    var sigCount = zonesV14.object_signals ? zonesV14.object_signals.length : 0;
    console.info(
      "[EcoLeadBot v1.4] Данные загружены: " + svcCount + " услуг, " +
      sigCount + " признаков объекта, версия " + WIDGET_VERSION +
      (IS_TEST_BUILD ? " (test build)" : "")
    );
  }

  function createDefaultV14Fields() {
    return {
      flow: "",
      activity_type: "",
      object_signals: [],
      nvos_category: "",
      sites_count: "",
      worries: "",
      selected_direction: "",
      selected_service_id: "",
      qualification_answers: {},
      mini_zones: [],
      mini_zone_rag_id: "",
      mini_zone_rag_title: "",
      document_nvos_registry: "",
      prefill: {},
      last_service_gate_id: "",
      before_client_terms_screen: "",
      client_terms_answers: {},
      client_terms_ok: false,
      last_client_gate_id: "",
      /* RAG display flags — backfill for older persisted sessions */
      rag_answer_html: "",
      rag_from_template: false,
      rag_podrobnee_template_key: ""
    };
  }

  function ensureV14State(s) {
    // Core session fields (not only v1.4) — old/partial saves may omit them.
    if (!s.answers || typeof s.answers !== "object" || Array.isArray(s.answers)) {
      s.answers = {};
    }
    if (!s.contact || typeof s.contact !== "object" || Array.isArray(s.contact)) {
      s.contact = {};
    }
    if (!s.timestamps || typeof s.timestamps !== "object") {
      s.timestamps = { started_at: isoNow() };
    } else if (!s.timestamps.started_at) {
      s.timestamps.started_at = isoNow();
    }

    var defaults = createDefaultV14Fields();
    Object.keys(defaults).forEach(function (k) {
      if (s[k] === undefined) s[k] = defaults[k];
    });
    if (!s.activity_type && s.answers && s.answers.object_type) {
      s.activity_type = s.answers.object_type;
    }
    if (!s.sites_count && s.answers && s.answers.sites_count) {
      s.sites_count = s.answers.sites_count;
    }
    if ((!s.object_signals || !s.object_signals.length) && s.answers && s.answers.object_features) {
      s.object_signals = mapLegacyObjectFeatures(s.answers.object_features);
    }
    if (s.object_signals && s.object_signals.length) {
      s.object_signals = normalizeObjectSignals(s.object_signals);
    }
    return s;
  }

  /** Временный мост v1.3 → v1.4 до переписывания чеклиста (фаза 2). */
  function mapLegacyObjectFeatures(features) {
    if (!Array.isArray(features)) return [];
    var map = {
      "Мусор и упаковка": "tko",
      "Масла / ветошь": "production_waste",
      "Выбросы в воздух": "emissions",
      "Сброс воды": "discharge_csv"
    };
    var out = [];
    features.forEach(function (label) {
      if (map[label] && out.indexOf(map[label]) === -1) out.push(map[label]);
    });
    return out;
  }

  function resetSessionToIntro() {
    var utm = parseUtm();
    var headline = state.headline_variant;
    var ab = state.ab_variant_token;
    var alreadySubmittedAt = state.already_submitted_at;
    var v14 = createDefaultV14Fields();
    Object.keys(v14).forEach(function (k) { state[k] = v14[k]; });
    state.session_id = makeSessionId();
    state.status = "started";
    state.current_screen = "idle";
    state.question_index = 0;
    state.answers = {};
    state.contact = {};
    state.do_not_call = false;
    state.consent = false;
    state.preferred_contact_method = "phone";
    state.timestamps = { started_at: isoNow() };
    state.popup_closed_at = 0;
    // UI/quiz state starts fresh, while the production anti-duplicate window remains intact.
    state.already_submitted_at = alreadySubmittedAt;
    state.rag_question = "";
    state.rag_answer = "";
    state.rag_answer_html = "";
    state.rag_answer_summary = "";
    state.rag_assistant_recommendation = "";
    state.rag_confidence = "";
    state.rag_sources = [];
    state.rag_sources_titles = [];
    state.rag_es_signal = "";
    state.rag_entry_type = "";
    state.rag_error_kind = "";
    state.rag_from_template = false;
    state.rag_podrobnee_template_key = "";
    state.previous_screen = "";
    state.previous_question_index = null;
    state.current_utm = utm;
    state.headline_variant = headline;
    state.ab_variant_token = ab;
    persist();
    track("session_retest_reset", { session_id: state.session_id });
    renderIntro();
  }

  /* -----------------------------------------------------------------------
     2. MAIN FLOW v1.4 (Scope §4, §8 — кнопка «Понять, что нужно по экологии»)
     ----------------------------------------------------------------------- */
  var ACTIVITY_TYPE_OPTIONS = [
    "Производство", "Склад", "Стройка", "Автосервис / СТО", "Автомойка",
    "Магазин / торговля", "Офис", "ЖКХ", "Сельхоз", "Другое"
  ];

  var SIGNAL_UNCERTAIN = "__uncertain__";
  /* Legacy ids — мигрируются в SIGNAL_UNCERTAIN */
  var SIGNAL_UNKNOWN = "__unknown__";
  var SIGNAL_NONE = "__none__";

  /** Заголовок карточки + подпись мелким (note). Перекрывает label из JSON. */
  var OBJECT_SIGNAL_DISPLAY = {
    tko: {
      label: "Мусор и упаковка",
      note: "ТКО — твердые коммунальные отходы"
    },
    production_waste: {
      note: "масла, ветошь, остатки материалов"
    },
    discharge_csv: {
      label: "Сброс воды в канализацию",
      note: "сброс в ЦСВ (централизованные сети Водоканала)"
    },
    discharge_own: {
      label: "Сброс воды в водные объекты",
      note: "сброс в реки, озера, моря — не в ЦСВ"
    },
    kitchen: {
      label: "Кухня",
      note: "(приготовление пищи)"
    },
    agriculture: {
      note: "животные, продукция"
    },
    import_packaging: {
      label: "Импорт / производство товаров и/или упаковки",
      note: "экологический сбор за товары и упаковку (расширенная ответственность производителя)"
    }
  };

  var MAIN_SITUATION_OPTIONS = [
    "Предстоящая проверка или предписание",
    "Не знаем, что требуется по экологии",
    "Нужно сделать конкретный документ",
    "Несколько вопросов сразу — нужна консультация",
    "Хотим навести порядок",
    "Пока изучаем / нет срочности"
  ];

  var MAIN_FLOW_STEPS = [
    {
      id: "activity_type",
      type: "single",
      title: "Вид деятельности",
      subtitle: "Что ближе всего к вашей компании?"
    },
    {
      id: "object_signals",
      type: "multiple",
      title: "Что из этого есть у вас на объекте?",
      hint: "отходы, выбросы, сбросы, особенности площадки"
    },
    {
      id: "object_clarify",
      type: "clarify",
      conditional: true,
      title: "Уточните по объекту"
    },
    {
      id: "ecology_responsible",
      type: "single",
      title: "Кто сейчас занимается экологией?",
      options: ["Штатный эколог", "Бухгалтер", "Директор", "Охрана труда", "Подрядчик", "Никто"]
    },
    {
      id: "main_situation",
      type: "single",
      title: "Что для вас сейчас актуально?",
      subtitle: "Поможет подготовить разговор со специалистом",
      options: MAIN_SITUATION_OPTIONS
    },
    {
      id: "nvos_category",
      type: "single",
      conditional: true,
      title: "Категория объекта НВОС",
      options: ["I", "II", "III", "IV", "Не знаю"]
    },
    {
      id: "sites_count",
      type: "single",
      title: "Сколько площадок (адресов)?",
      options: ["1", "2–3", "4 и более", "Не знаю"]
    },
    {
      id: "urgency",
      type: "single",
      title: "Когда хотите решить вопрос?",
      options: ["Срочно", "В течение месяца", "В течение квартала", "В этом году"]
    },
    {
      id: "help_format",
      type: "single",
      title: "Что было бы для вас удобнее?",
      options: [
        "Разобраться самому",
        "Чтобы специалист подсказал, что нужно",
        "Чтобы кто-то полностью занимался экологией"
      ]
    }
  ];

  function normalizeObjectSignals(arr) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    var hasUncertain = false;
    arr.forEach(function (id) {
      if (id === SIGNAL_UNKNOWN || id === SIGNAL_NONE || id === SIGNAL_UNCERTAIN) {
        hasUncertain = true;
        return;
      }
      if (out.indexOf(id) === -1) out.push(id);
    });
    if (hasUncertain) out.push(SIGNAL_UNCERTAIN);
    return out;
  }

  function isUncertainObjectSignal(signals) {
    if (!Array.isArray(signals)) return false;
    return signals.indexOf(SIGNAL_UNCERTAIN) !== -1 ||
      signals.indexOf(SIGNAL_UNKNOWN) !== -1 ||
      signals.indexOf(SIGNAL_NONE) !== -1;
  }

  function buildObjectSignalOptions() {
    var opts = [];
    getObjectSignalOptions().forEach(function (o) {
      var disp = OBJECT_SIGNAL_DISPLAY[o.id] || {};
      opts.push({
        id: o.id,
        label: disp.label || o.label,
        note: disp.note || ""
      });
    });
    opts.push({
      id: SIGNAL_UNCERTAIN,
      label: "Не знаю / ничего из перечисленного",
      note: ""
    });
    return opts;
  }

  function getObjectSignalLabel(signalId) {
    if (signalId === SIGNAL_UNCERTAIN || signalId === SIGNAL_UNKNOWN || signalId === SIGNAL_NONE) {
      return "Не знаю / ничего из перечисленного";
    }
    var opts = buildObjectSignalOptions();
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].id === signalId) return opts[i].label;
    }
    return signalId;
  }

  function getActiveObjectSignals() {
    return normalizeObjectSignals(state.object_signals || []).filter(function (id) {
      return id !== SIGNAL_UNCERTAIN;
    });
  }

  function getClarifyBlocks(signalIds) {
    var ids = signalIds || [];
    var blocks = [];
    var tpl = getQuestionTemplate;
    if (ids.indexOf("production_waste") !== -1 || ids.indexOf("tko") !== -1) {
      var wt = tpl("waste_types");
      if (wt) blocks.push(wt);
    }
    if (ids.indexOf("emissions") !== -1) {
      var iiv = tpl("iiv_status");
      if (iiv) blocks.push(iiv);
    }
    if (ids.indexOf("discharge_csv") !== -1 || ids.indexOf("discharge_own") !== -1) {
      var ww = tpl("wastewater_type");
      if (ww) blocks.push(ww);
    }
    return blocks;
  }

  function objectClarifyApplicable() {
    return getClarifyBlocks(getActiveObjectSignals()).length > 0;
  }

  function nvosCategoryApplicable() {
    var signals = getActiveObjectSignals();
    var i;
    for (i = 0; i < signals.length; i++) {
      var sid = signals[i];
      if (sid === "emissions" || sid === "discharge_csv" || sid === "discharge_own") return true;
      var sig = getObjectSignalById(sid);
      if (sig && sig.zones && sig.zones.indexOf("nvos") !== -1) return true;
    }
    return false;
  }

  function isComplexMiniResultCase() {
    var signals = normalizeObjectSignals(state.object_signals || []);
    var a = state.answers || {};
    var sit = a.main_situation || "";
    if (isUncertainObjectSignal(signals)) return true;
    if (a.ecology_responsible === "Никто") return true;
    if (sit === "Предстоящая проверка или предписание") return true;
    if (sit === "Не знаем, что требуется по экологии") return true;
    if (sit === "Несколько вопросов сразу — нужна консультация") return true;
    var zones = resolveMiniZones(getActiveObjectSignals());
    var sc = state.sites_count || a.sites_count || "";
    return zones.length >= 2 || sc === "2–3" || sc === "4 и более";
  }

  function isMainStepVisible(step) {
    if (!step.conditional) return true;
    if (step.id === "object_clarify") return objectClarifyApplicable();
    if (step.id === "nvos_category") return nvosCategoryApplicable();
    return true;
  }

  function syncMainFlowStateFromAnswers() {
    var a = ensureAnswers();
    if (a.activity_type) state.activity_type = a.activity_type;
    else if (a.object_type && !state.activity_type) {
      a.activity_type = a.object_type;
      state.activity_type = a.object_type;
    }
    if (Array.isArray(a.object_signals)) {
      state.object_signals = normalizeObjectSignals(a.object_signals);
      a.object_signals = state.object_signals.slice();
    }
    if (a.nvos_category) state.nvos_category = a.nvos_category;
    if (a.sites_count) state.sites_count = a.sites_count;
    ensureQualificationAnswers();
    getClarifyBlocks(getActiveObjectSignals()).forEach(function (block) {
      if (a[block.id] != null) state.qualification_answers[block.id] = a[block.id];
    });
  }

  function syncMainFlowAnswerFields(stepId, value) {
    var answers = ensureAnswers();
    if (stepId === "activity_type") {
      state.activity_type = value;
      answers.activity_type = value;
      answers.object_type = value;
    } else if (stepId === "object_signals") {
      state.object_signals = value;
      answers.object_signals = value;
    } else if (stepId === "nvos_category") {
      state.nvos_category = value;
      answers.nvos_category = value;
    } else if (stepId === "sites_count") {
      state.sites_count = value;
      answers.sites_count = value;
    }
  }

  function finalizeMainFlowBeforeMiniResult() {
    syncMainFlowStateFromAnswers();
    state.mini_zones = resolveMiniZones(getActiveObjectSignals());
    persist();
  }

  function normalizeMainSituation(value) {
    var map = {
      "Не знаем что нужно сдавать": "Не знаем, что требуется по экологии",
      "Нужно сделать документ": "Нужно сделать конкретный документ",
      "Проверка или предписание": "Предстоящая проверка или предписание",
      "Хотим навести порядок до проверки": "Хотим навести порядок",
      "Пока изучаем": "Пока изучаем / нет срочности"
    };
    return map[value] || value;
  }

  function migrateLegacyMainAnswers() {
    var a = state.answers || {};
    if (a.object_type && !a.activity_type) a.activity_type = a.object_type;
    if (a.object_features && (!a.object_signals || !a.object_signals.length)) {
      a.object_signals = mapLegacyObjectFeatures(a.object_features);
      state.object_signals = a.object_signals.slice();
    }
    if (a.worries && !a.main_situation) {
      a.main_situation = normalizeMainSituation(a.worries);
    }
    if (a.main_situation) {
      a.main_situation = normalizeMainSituation(a.main_situation);
    }
    if (a.help_format === "Чтобы специалист сделал конкретный документ") {
      a.help_format = "Чтобы специалист подсказал, что нужно";
    }
    if (a.help_format === "Пока не решили") {
      delete a.help_format;
    }
    if (a.worries) delete a.worries;
    if (state.worries) state.worries = "";
    if (a.urgency === "Пока изучаем") delete a.urgency;
  }

  function firstVisibleIndex() {
    for (var i = 0; i < MAIN_FLOW_STEPS.length; i++) {
      if (isMainStepVisible(MAIN_FLOW_STEPS[i])) return i;
    }
    return -1;
  }

  function nextVisibleIndex(from) {
    for (var i = from + 1; i < MAIN_FLOW_STEPS.length; i++) {
      if (isMainStepVisible(MAIN_FLOW_STEPS[i])) return i;
    }
    return -1;
  }

  function prevVisibleIndex(from) {
    for (var i = from - 1; i >= 0; i--) {
      if (isMainStepVisible(MAIN_FLOW_STEPS[i])) return i;
    }
    return -1;
  }

  function visibleQuestions() {
    return MAIN_FLOW_STEPS.filter(function (q) { return isMainStepVisible(q); });
  }

  /* -----------------------------------------------------------------------
     3. CONTENT (UX Этап 2)
     ----------------------------------------------------------------------- */
  var HEADLINES = {
    headline_a: "Проверьте за 2 минуты: грозит ли вам штраф",
    headline_b: "Есть ли у вас риск штрафа? Проверка за 2 минуты",
    headline_c: "Штраф до 500 000 ₽ — проверьте, касается ли это вас"
  };

  var MINI_RESULT = {
    simple: "Обычно таким компаниям требуется: учёт отходов, экологическая отчётность, контроль обязательных документов.",
    complex: "Похоже, потребуется более детальная проверка ситуации. Для таких объектов часто требуется консультация эколога.",
    high_es: "Во многих компаниях подобные задачи удобнее передать специалистам, чтобы не держать всё в голове самим."
  };

  /* Legacy v1.3 document_interest — удалён в v1.4 (ветка «конкретная услуга» через каталог). */

  /* Медиа-кнопки финального экрана (UX §14 — 6 кнопок) */
  var MEDIA_BUTTONS = [
    { label: "Telegram", url: "https://t.me/ecolusspb" },
    { label: "YouTube", url: "https://www.youtube.com/@ecolusspb" },
    { label: "Дзен", url: "https://dzen.ru/ecolusspb" },
    { label: "ЭкоКомпас", url: "https://ecolusspb.ru/subscribe/" },
    { label: "RuTube", url: "https://rutube.ru/channel/31793215/" },
    { label: "VK", url: "https://vk.com/ecolusspb" }
  ];

  function appendFinalMediaLinks(screen) {
    screen.appendChild(el("p", "ecoleadbot-subtitle ecoleadbot-final__media-lead",
      "Пока ждёте звонка — полезные материалы по экологии: бесплатный дайджест " +
      "«ЭкоКомпас» и наши каналы с разборами для бизнеса."));

    var media = el("div", "ecoleadbot-media");
    MEDIA_BUTTONS.forEach(function (btn) {
      var a = document.createElement("a");
      a.href = btn.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = btn.label;
      if (btn.label === "ЭкоКомпас") a.className = "ecoleadbot-media__highlight";
      a.addEventListener("click", function () {
        track("final_media_click", { label: btn.label, url: btn.url });
      });
      media.appendChild(a);
    });
    screen.appendChild(media);
  }

  /* -----------------------------------------------------------------------
     4. UTILITIES
     ----------------------------------------------------------------------- */
  function now() { return Date.now(); }

  function isoNow() {
    var d = new Date();
    var tz = -d.getTimezoneOffset();
    var sign = tz >= 0 ? "+" : "-";
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var abs = Math.abs(tz);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
      sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }

  function randToken(len) {
    var s = "";
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function makeSessionId() {
    return "eco_" + Math.floor(now() / 1000) + "_" + randToken(8);
  }

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /** Create element. Third arg goes to innerHTML — escape untrusted/dynamic text with escapeHtml(). */
  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function detectDevice() {
    var w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  function detectBrowser() {
    var ua = navigator.userAgent;
    if (/YaBrowser/i.test(ua)) return "Yandex";
    if (/Edg/i.test(ua)) return "Edge";
    if (/OPR|Opera/i.test(ua)) return "Opera";
    if (/Firefox/i.test(ua)) return "Firefox";
    if (/Chrome/i.test(ua)) return "Chrome";
    if (/Safari/i.test(ua)) return "Safari";
    return "Other";
  }

  function detectPageType() {
    if (document.querySelector(".article-content, .news-detail, .detail_text, article")) return "seo_article";
    if (document.querySelector(".service-page, [data-page='service']")) return "service_page";
    if (document.querySelector("[data-page='landing']")) return "landing";
    if (location.pathname === "/" || location.pathname === "") return "homepage";
    return "other";
  }

  function parseUtm() {
    var params = new URLSearchParams(location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    var out = {};
    keys.forEach(function (k) { out[k] = params.get(k) || ""; });
    return out;
  }

  function digitsCount(str) { return (String(str).match(/\d/g) || []).length; }

  // Только цифры из строки (без +, пробелов, скобок, дефисов).
  function digitsOnly(str) { return (String(str).match(/\d/g) || []).join(""); }

  // Визуальная маска телефона. Российские номера форматируются как
  // +7 (999) 999-99-99, прочие — как международные (+цифры, до 15).
  // Без сторонних библиотек.
  function formatPhone(value) {
    var d = digitsOnly(value);
    if (!d) return "";
    if (d.charAt(0) === "8") d = "7" + d.slice(1);          // 8XXX -> 7XXX
    else if (d.charAt(0) === "9") d = "7" + d;              // 9XX… (RU моб. без кода) -> 7 9XX…
    if (d.charAt(0) === "7") {
      d = d.slice(0, 11);                                   // 7 + 10 цифр
      var rest = d.slice(1);
      var out = "+7";
      if (rest.length > 0) out += " (" + rest.slice(0, 3);
      if (rest.length >= 3) out += ")";
      if (rest.length > 3) out += " " + rest.slice(3, 6);
      if (rest.length > 6) out += "-" + rest.slice(6, 8);
      if (rest.length > 8) out += "-" + rest.slice(8, 10);
      return out;
    }
    return "+" + d.slice(0, 15);                            // международный
  }

  /* -----------------------------------------------------------------------
     5. ANALYTICS (Frontend §36)
     Никаких ПДн в console (Security §44). Пушим только событие + безопасные поля.
     ----------------------------------------------------------------------- */
  var METRIKA_COUNTER_IDS = [];
  var METRIKA_GOALS = {
    widget_opened: "ecoleadbot_widget_opened",
    quiz_started: "ecoleadbot_quiz_started",
    mini_result_viewed: "ecoleadbot_mini_result_viewed",
    contact_form_viewed: "ecoleadbot_contact_form_viewed",
    lead_submitted: "ecoleadbot_lead_submitted",
    rag_question_submitted: "ecoleadbot_rag_question_submitted"
  };

  function addMetrikaCounterId(counterId) {
    var id = Number(counterId);
    if (!id || METRIKA_COUNTER_IDS.indexOf(id) !== -1) return;
    METRIKA_COUNTER_IDS.push(id);
  }

  function getMetrikaCounterIds() {
    if (METRIKA_COUNTER_IDS.length) return METRIKA_COUNTER_IDS;
    try {
      Object.keys(window).forEach(function (key) {
        var match = /^yaCounter(\d+)$/.exec(key);
        if (match) addMetrikaCounterId(match[1]);
      });
      // GTM / tag.js sometimes exposes counters only via Ya._metrika
      if (window.Ya && window.Ya._metrika && window.Ya._metrika.counters) {
        Object.keys(window.Ya._metrika.counters).forEach(function (key) {
          addMetrikaCounterId(key);
        });
      }
    } catch (e) { /* Metrika detection must never affect the widget. */ }
    // Fallback: public counter id from config (ecolusspb.ru = 22994308)
    if (!METRIKA_COUNTER_IDS.length && ECOLEADBOT_CONFIG.yandexMetrikaCounterId) {
      addMetrikaCounterId(ECOLEADBOT_CONFIG.yandexMetrikaCounterId);
    }
    return METRIKA_COUNTER_IDS;
  }

  function track(event, data) {
    window.dataLayer = window.dataLayer || [];
    var payload = { event: "ecoleadbot_" + event };
    if (data) {
      Object.keys(data).forEach(function (k) { payload[k] = data[k]; });
    }
    window.dataLayer.push(payload);

    var goalName = METRIKA_GOALS[event];
    if (goalName && typeof window.ym === "function") {
      var counterIds = getMetrikaCounterIds();
      if (!counterIds.length && ECOLEADBOT_CONFIG.yandexMetrikaCounterId) {
        addMetrikaCounterId(ECOLEADBOT_CONFIG.yandexMetrikaCounterId);
        counterIds = METRIKA_COUNTER_IDS;
      }
      counterIds.forEach(function (counterId) {
        try {
          window.ym(counterId, "reachGoal", goalName);
        } catch (e) { /* Metrika failures must never break the widget. */ }
      });
    }
  }
  /* -----------------------------------------------------------------------
     6. SESSION STORAGE (Frontend §17–19, TTL §18 = 180 дней)
     ----------------------------------------------------------------------- */
  var Session = {
    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        var ttlMs = ECOLEADBOT_CONFIG.sessionTtlDays * 24 * 60 * 60 * 1000;
        if (!data.saved_at || (now() - data.saved_at) > ttlMs) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
        return data;
      } catch (e) { return null; }
    },
    save: function (data) {
      try {
        data.saved_at = now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) { /* приватный режим / переполнение — игнорируем */ }
    },
    clear: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }
  };

  /* -----------------------------------------------------------------------
     7. STATE
     ----------------------------------------------------------------------- */
  var state = null;

  function initState() {
    var saved = Session.load();
    var utm = parseUtm();
    if (saved && saved.session_id) {
      state = saved;
      ensureV14State(state);
      // обновляем current_utm на текущий визит
      state.current_utm = utm;
      return;
    }
    state = {
      session_id: makeSessionId(),
      status: "started",                 // started | partial | completed | abandoned
      current_screen: "idle",
      question_index: 0,
      answers: {},
      contact: {},
      do_not_call: false,
      consent: false,
      preferred_contact_method: "phone",
      timestamps: { started_at: isoNow() },
      popup_closed_at: 0,
      already_submitted_at: 0,
      entry_type: "direct",
      popup_trigger: "",
      ab_variant_token: pickRandom(["a", "b"]),
      headline_variant: pickRandom(["headline_a", "headline_b", "headline_c"]),
      first_touch_utm: utm,
      current_utm: utm,
      utm_parameters: utm,
      entry_page_url: location.href,
      entry_page_type: detectPageType(),
      rag_question: "",
      rag_answer: "",
      rag_answer_html: "",
      rag_answer_summary: "",
      rag_assistant_recommendation: "",
      rag_confidence: "",
      rag_sources: [],
      rag_sources_titles: [],
      rag_es_signal: "",
      rag_entry_type: "",
      rag_error_kind: "",
      rag_from_template: false,
      rag_podrobnee_template_key: "",
      previous_screen: "",
      previous_question_index: null
    };
    ensureV14State(state);
    Session.save(state);
  }

  function persist() { Session.save(state); }

  function isAlreadySubmitted() {
    if (IS_TEST_BUILD) return false;
    if (!state.already_submitted_at) return false;
    var windowMs = ECOLEADBOT_CONFIG.antiDuplicateMinutes * 60 * 1000;
    return (now() - state.already_submitted_at) < windowMs;
  }

  function inCooldown() {
    if (!state.popup_closed_at) return false;
    var windowMs = ECOLEADBOT_CONFIG.cooldownMinutes * 60 * 1000;
    return (now() - state.popup_closed_at) < windowMs;
  }

  /* -----------------------------------------------------------------------
     8. DOM REFERENCES
     ----------------------------------------------------------------------- */
  var root, widgetBtn, overlay, popup, bodyEl, progressEl, progressFill, progressMeta;
  var exitBanner = null;
  var autoPopupTimer = null;
  var autoTriggerUsed = false;
  /** Exit-intent banner is independent of time/scroll autoTriggerUsed. */
  var exitIntentUsed = false;

  /* -----------------------------------------------------------------------
     9. BUILD STATIC DOM
     ----------------------------------------------------------------------- */
  function buildDom() {
    root = el("div", "ecoleadbot-root");

    // Floating widget
    if (ECOLEADBOT_CONFIG.enableFloatingWidget) {
      widgetBtn = el("button", "ecoleadbot-widget");
      widgetBtn.type = "button";
      widgetBtn.setAttribute("aria-label", "Понять, что нужно по экологии");
      var logoWrap = el("span", "ecoleadbot-widget__logo-wrap");
      logoWrap.appendChild(createWidgetLogoImg("ecoleadbot-widget__logo", 22));
      widgetBtn.appendChild(logoWrap);
      widgetBtn.appendChild(el("span", "ecoleadbot-widget__label", "Понять, что нужно по экологии"));
      widgetBtn.addEventListener("click", function () { openPopup("floating_widget", "widget_click"); });
      root.appendChild(widgetBtn);
      track("widget_loaded");
    }

    // Overlay + popup
    overlay = el("div", "ecoleadbot-overlay ecoleadbot-hidden");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closePopup();
    });

    popup = el("div", "ecoleadbot-popup");

    var header = el("div", "ecoleadbot-header");
    header.appendChild(createWidgetLogoImg("ecoleadbot-header__logo", 36));
    var closeBtn = el("button", "ecoleadbot-close", "×");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Закрыть");
    closeBtn.addEventListener("click", closePopup);
    header.appendChild(closeBtn);
    popup.appendChild(header);

    progressEl = el("div", "ecoleadbot-progress ecoleadbot-hidden");
    progressEl.innerHTML =
      '<div class="ecoleadbot-progress__track"><div class="ecoleadbot-progress__fill"></div></div>' +
      '<div class="ecoleadbot-progress__meta"><span class="ecoleadbot-progress__step"></span>' +
      '<span>Проверка займёт около 2 минут</span></div>';
    popup.appendChild(progressEl);
    progressFill = progressEl.querySelector(".ecoleadbot-progress__fill");
    progressMeta = progressEl.querySelector(".ecoleadbot-progress__step");

    bodyEl = el("div", "ecoleadbot-body");
    popup.appendChild(bodyEl);

    overlay.appendChild(popup);
    root.appendChild(overlay);

    // Exit-intent top banner (desktop): near browser chrome / tab close
    exitBanner = el("div", "ecoleadbot-exit-banner ecoleadbot-hidden");
    exitBanner.setAttribute("role", "dialog");
    exitBanner.setAttribute("aria-label", "Предложение пройти проверку");
    exitBanner.innerHTML =
      '<div class="ecoleadbot-exit-banner__accent" aria-hidden="true"></div>' +
      '<button type="button" class="ecoleadbot-exit-banner__dismiss" aria-label="Закрыть">×</button>' +
      '<div class="ecoleadbot-exit-banner__title">Уходите? Узнайте за 2 минуты — что нужно по экологии</div>' +
      '<p class="ecoleadbot-exit-banner__text">Короткий опрос: документы, риски и когда нужен специалист.</p>' +
      '<button type="button" class="ecoleadbot-exit-banner__cta">Понять, что нужно</button>';
    exitBanner.querySelector(".ecoleadbot-exit-banner__cta").addEventListener("click", function () {
      hideExitBanner();
      openPopup("exit_popup", "exit_intent");
    });
    exitBanner.querySelector(".ecoleadbot-exit-banner__dismiss").addEventListener("click", function () {
      hideExitBanner();
      track("exit_banner_dismissed");
    });
    root.appendChild(exitBanner);

    document.body.appendChild(root);

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) {
        closePopup();
        return;
      }
      if (typeof isExitBannerVisible === "function" && isExitBannerVisible()) {
        hideExitBanner();
        track("exit_banner_dismissed");
      }
    });
  }
  /* -----------------------------------------------------------------------
     10. INLINE CTA (UX §4.2 / Frontend §11–12)
     ----------------------------------------------------------------------- */
  function ctaTemplate() {
    var wrap = el("div", "ecoleadbot-inline-cta");
    wrap.innerHTML =
      '<div class="ecoleadbot-inline-cta__title">Не уверены, какие экологические документы нужны объекту?</div>' +
      '<div>Короткий опрос займёт около 2 минут:</div>' +
      '<ul class="ecoleadbot-inline-cta__list">' +
      '<li>что обычно требуется по экологии;</li>' +
      '<li>какие документы проверить в первую очередь;</li>' +
      '<li>когда имеет смысл привлечь специалиста.</li>' +
      '</ul>' +
      '<button type="button" class="ecoleadbot-inline-cta__btn">Понять, что нужно по экологии</button>';
    wrap.querySelector("button").addEventListener("click", function () {
      openPopup("inline_cta", "cta_click");
    });
    return wrap;
  }

  function insertInlineCta() {
    if (!ECOLEADBOT_CONFIG.enableInlineCta) return;
    var selectors = [".article-content", ".news-detail", ".detail_text", ".content", "article"];
    var container = null;
    for (var i = 0; i < selectors.length; i++) {
      container = document.querySelector(selectors[i]);
      if (container) break;
    }
    if (!container) return;

    var paragraphs = container.querySelectorAll("p");
    if (!paragraphs.length) return;

    // длина текста
    var total = 0;
    for (var p = 0; p < paragraphs.length; p++) total += paragraphs[p].textContent.length;
    if (total < 800) return; // не вставлять CTA в короткий контент (Frontend §12)

    var t1 = total * 0.28; // после 25–30% текста
    var t2 = total * 0.85; // ближе к концу
    var acc = 0, inserted1 = false, inserted2 = false, viewed = false;

    for (var j = 0; j < paragraphs.length; j++) {
      acc += paragraphs[j].textContent.length;
      if (!inserted1 && acc >= t1) {
        paragraphs[j].insertAdjacentElement("afterend", ctaTemplate());
        inserted1 = true;
      } else if (inserted1 && !inserted2 && acc >= t2) {
        paragraphs[j].insertAdjacentElement("afterend", ctaTemplate());
        inserted2 = true;
      }
    }
    if (inserted1) track("inline_cta_viewed");
  }

  /* -----------------------------------------------------------------------
     11. POPUP OPEN / CLOSE
     ----------------------------------------------------------------------- */
  function openPopup(entryType, trigger, options) {
    options = options || {};
    var shouldResume = options.resume !== false;
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return; // уже открыт

    if (typeof hideExitBanner === "function") hideExitBanner();

    // entry_type только из допустимых значений схемы Этапа 4 §6.4
    var allowed = ["floating_widget", "inline_cta", "auto_popup", "exit_popup", "scroll_popup", "direct"];
    state.entry_type = allowed.indexOf(entryType) !== -1 ? entryType : "direct";
    state.popup_trigger = trigger || "";
    persist();

    overlay.classList.remove("ecoleadbot-hidden");
    // двойной rAF для плавного появления
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add("is-visible"); });
    });
    document.body.style.overflow = "hidden";
    track("widget_opened", { entry_type: state.entry_type });

    if (entryType === "inline_cta") track("inline_cta_clicked");
    track("popup_shown", { trigger: state.popup_trigger });

    if (shouldResume) {
      routeOnOpen();
    } else {
      // Auto-open must not surface a saved mid-flow screen. Render only the
      // current UI as intro, then restore the resumable cursor for persistence.
      var resumeScreen = state.current_screen;
      var resumeIndex = state.question_index;
      renderIntro();
      state.current_screen = resumeScreen;
      state.question_index = resumeIndex;
      persist();
    }
  }

  function closePopup() {
    if (!overlay) return;
    overlay.classList.remove("is-visible");
    document.body.style.overflow = "";
    setTimeout(function () { overlay.classList.add("ecoleadbot-hidden"); }, 200);

    // cooldown только если не завершено/не отправлено
    if (state.status !== "completed" && !isAlreadySubmitted()) {
      state.popup_closed_at = now();
      if (state.status === "started" && Object.keys(state.answers || {}).length === 0) {
        // не трогаем статус
      } else if (state.status !== "completed") {
        state.status = "partial";
      }
    }
    persist();
    track("popup_closed");
  }

  /* Куда вести при открытии popup */
  function routeOnOpen() {
    // Session resume (Frontend §19): продолжить с последнего экрана
    if (state.current_screen === "question" && Object.keys(state.answers || {}).length > 0) {
      migrateLegacyMainAnswers();
      syncMainFlowStateFromAnswers();
      renderQuestion(clampQuestionIndex(state.question_index));
      return;
    }
    if (state.current_screen === "document_directions") {
      ensureCatalogThen(renderDocumentDirections);
      return;
    }
    if (state.current_screen === "document_nvos_filter") {
      ensureCatalogThen(renderDocumentNvosFilter);
      return;
    }
    if (state.current_screen === "document_services") {
      ensureCatalogThen(renderDocumentServices);
      return;
    }
    if (state.current_screen === "document_registry") {
      ensureCatalogThen(renderDocumentRegistryOnAccount);
      return;
    }
    if (state.current_screen === "document_nvos_category") {
      ensureCatalogThen(renderDocumentNvosCategory);
      return;
    }
    if (state.current_screen === "document_sites") {
      ensureCatalogThen(renderDocumentSites);
      return;
    }
    if (state.current_screen === "document_qualification") {
      ensureCatalogThen(renderDocumentQualification);
      return;
    }
    if (state.current_screen === "service_gate") {
      var gateRestore = SERVICE_GATE_DEFS[state.last_service_gate_id];
      if (gateRestore) { renderServiceGate(gateRestore); return; }
      ensureCatalogThen(renderDocumentServices);
      return;
    }
    if (state.current_screen === "client_gate") {
      var clientGateRestore = CLIENT_GATE_DEFS[state.last_client_gate_id];
      if (clientGateRestore) { renderClientGate(clientGateRestore); return; }
      renderClientTerms();
      return;
    }
    if (state.current_screen === "client_terms") { renderClientTerms(); return; }
    if (state.current_screen === "document_error") { renderDocumentCatalogError(); return; }
    if (state.current_screen === "document_interest") {
      state.flow = "document";
      ensureCatalogThen(renderDocumentDirections);
      return;
    }
    if (state.current_screen === "rag_loading") {
      /* In-flight fetch does not survive close/reload — re-submit saved question. */
      if ((state.rag_question || "").trim()) {
        submitRagQuestion(state.rag_question, state.rag_entry_type || "rag_question");
      } else {
        renderRagQuestion();
      }
      return;
    }
    if (state.current_screen === "rag_no_answer") { renderRagNoAnswer(); return; }
    if (state.current_screen === "rag_error") { renderRagTechnicalError(); return; }
    if (state.current_screen === "loading") { renderContact(); return; }
    if (state.current_screen === "error") { renderError(false); return; }
    if (state.current_screen === "contact_blocked") { renderContactBlocked(); return; }
    if (state.current_screen === "rag_question") { renderRagQuestion(); return; }
    if (state.current_screen === "rag_answer") { renderRagAnswer(); return; }
    if (state.current_screen === "rag_success") { renderRagSuccess(); return; }
    if (state.current_screen === "mini_teaser") { renderMiniResultTeaser(); return; }
    if (state.current_screen === "mini_result") { renderMiniResult(); return; }
    if (state.current_screen === "contact") {
      if (isAlreadySubmitted()) { renderContactBlocked(); return; }
      if (!state.client_terms_ok) { renderClientTerms(); return; }
      renderContact();
      return;
    }
    if (state.current_screen === "success") { renderFinal(); return; }

    renderIntro();
  }
  /* -----------------------------------------------------------------------
     11b. NAVIGATION (Scope Freeze v1.3.2)
     ----------------------------------------------------------------------- */
  function resetFlowToHome() {
    track("flow_reset_home", { session_id: state.session_id });
    renderIntro();
  }

  /** Wait for catalog JSON (or show error). Avoid blank document screens on resume. */
  function ensureCatalogThen(onReady) {
    function run() {
      if (isCatalogReady()) {
        onReady();
        return;
      }
      renderDocumentCatalogError();
    }
    if (isCatalogReady()) {
      onReady();
      return;
    }
    loadV14Data().then(run).catch(run);
  }

  /* v1.4: ветка «конкретная услуга» — направления и услуги из catalogV14 (фаза 1: навигация). */
  function openDocumentBranch() {
    state.flow = "document";
    state.selected_direction = "";
    state.selected_service_id = "";
    state.document_nvos_registry = "";
    resetQualForDocumentDirectionChange();
    track("document_branch_opened", { session_id: state.session_id });
    ensureCatalogThen(renderDocumentDirections);
  }

  function startMainFlow() {
    state.flow = "main";
    state.rag_entry_type = "";
    migrateLegacyMainAnswers();
    track("main_flow_started", { session_id: state.session_id });
    function run() { startFlow(); }
    if (isCatalogReady()) {
      run();
      return;
    }
    loadV14Data().then(run).catch(run);
  }

  function openRagEntry(entryType) {
    // Click listeners pass MouseEvent as 1st arg — only accept explicit string entry types.
    var type = (typeof entryType === "string" && entryType) ? entryType : "question_link";
    state.flow = "rag";
    state.rag_entry_type = type;
    track("rag_entry_opened", { session_id: state.session_id, rag_entry_type: state.rag_entry_type });
    renderRagQuestion();
  }

  function navigateBackFromContact() {
    var prev = state.previous_screen || "intro";
    if (prev === "client_terms") { renderClientTerms(); return; }
    if (prev === "rag_answer") { renderRagAnswer(); return; }
    if (prev === "rag_no_answer") { renderRagNoAnswer(); return; }
    if (prev === "rag_error") { renderRagTechnicalError(); return; }
    if (prev === "rag_question") { renderRagQuestion(); return; }
    if (prev === "document_qualification") { renderDocumentQualification(); return; }
    if (prev === "document_sites") { renderDocumentSites(); return; }
    if (prev === "document_nvos_category") { renderDocumentNvosCategory(); return; }
    if (prev === "document_registry") { renderDocumentRegistryOnAccount(); return; }
    if (prev === "document_services") { renderDocumentServices(); return; }
    if (prev === "document_directions") { renderDocumentDirections(); return; }
    if (prev === "mini_result") { renderMiniResult(); return; }
    if (prev === "mini_teaser") { renderMiniResultTeaser(); return; }
    if (prev === "question") {
      var idx = state.previous_question_index != null
        ? state.previous_question_index
        : clampQuestionIndex(state.question_index);
      renderQuestion(idx);
      return;
    }
    resetFlowToHome();
  }

  function navigateBackFromClientTerms() {
    var prev = state.before_client_terms_screen || state.previous_screen || "intro";
    state.before_client_terms_screen = "";
    persist();
    if (prev === "rag_answer") { renderRagAnswer(); return; }
    if (prev === "rag_no_answer") { renderRagNoAnswer(); return; }
    if (prev === "rag_error") { renderRagTechnicalError(); return; }
    if (prev === "rag_question") { renderRagQuestion(); return; }
    if (prev === "document_qualification") { renderDocumentQualification(); return; }
    if (prev === "document_sites") { renderDocumentSites(); return; }
    if (prev === "document_nvos_category") { renderDocumentNvosCategory(); return; }
    if (prev === "document_registry") { renderDocumentRegistryOnAccount(); return; }
    if (prev === "document_services") { renderDocumentServices(); return; }
    if (prev === "document_directions") { renderDocumentDirections(); return; }
    if (prev === "mini_result") { renderMiniResult(); return; }
    if (prev === "mini_teaser") { renderMiniResultTeaser(); return; }
    if (prev === "question") {
      var idx = state.previous_question_index != null
        ? state.previous_question_index
        : clampQuestionIndex(state.question_index);
      renderQuestion(idx);
      return;
    }
    resetFlowToHome();
  }

  /** Единая кнопка «← Назад» — возврат на предыдущий экран в любом сценарии. */
  function goBack() {
    var screen = state.current_screen;

    if (screen === "intro") {
      closePopup();
      return;
    }
    if (screen === "service_gate") {
      var prevGate = state.previous_screen || "document_services";
      if (prevGate === "client_terms") { renderClientTerms(); return; }
      if (prevGate === "document_qualification") { renderDocumentQualification(); return; }
      if (prevGate === "document_nvos_category") { renderDocumentNvosCategory(); return; }
      if (prevGate === "document_sites") { renderDocumentSites(); return; }
      if (prevGate === "document_registry") { renderDocumentRegistryOnAccount(); return; }
      if (prevGate === "contact") { renderClientTerms(); return; }
      renderDocumentServices();
      return;
    }
    if (screen === "client_gate") {
      renderClientTerms();
      return;
    }
    if (screen === "client_terms") {
      state.client_terms_ok = false;
      persist();
      navigateBackFromClientTerms();
      return;
    }
    if (screen === "question") {
      var prevQ = prevVisibleIndex(state.question_index);
      if (prevQ !== -1) renderQuestion(prevQ);
      else renderIntro();
      return;
    }
    if (screen === "document_directions" || screen === "document_error") {
      renderIntro();
      return;
    }
    if (screen === "document_nvos_filter") {
      renderDocumentDirections();
      return;
    }
    if (screen === "document_services") {
      if (state.selected_direction === "nvos") renderDocumentNvosFilter();
      else renderDocumentDirections();
      return;
    }
    if (goBackDocumentBranchScreen()) return;
    if (screen === "mini_teaser") {
      var prevStep = prevVisibleIndex(MAIN_FLOW_STEPS.length);
      if (prevStep !== -1) renderQuestion(prevStep);
      else renderIntro();
      return;
    }
    if (screen === "mini_result") {
      renderMiniResultTeaser();
      return;
    }
    if (screen === "rag_question") {
      renderIntro();
      return;
    }
    if (screen === "rag_loading" || screen === "rag_error" || screen === "rag_no_answer") {
      if (state.rag_entry_type === "podrobnee") {
        renderMiniResult();
        return;
      }
      renderRagQuestion();
      return;
    }
    if (screen === "rag_answer") {
      if (state.rag_entry_type === "podrobnee") {
        renderMiniResult();
        return;
      }
      renderRagQuestion();
      return;
    }
    if (screen === "rag_success") {
      renderRagAnswer();
      return;
    }
    if (screen === "contact") {
      navigateBackFromContact();
      return;
    }
    if (screen === "contact_blocked" || screen === "success") {
      renderIntro();
      return;
    }
    if (screen === "loading" || screen === "error") {
      renderContact();
      return;
    }
    renderIntro();
  }

  function prependBackButton(screen) {
    var back = el("button", "ecoleadbot-back", "← Назад");
    back.type = "button";
    back.addEventListener("click", goBack);
    if (screen.firstChild) screen.insertBefore(back, screen.firstChild);
    else screen.appendChild(back);
    return back;
  }

  function appendHomeButton(container, useGhost) {
    var cls = useGhost
      ? "ecoleadbot-btn ecoleadbot-btn--ghost ecoleadbot-btn--block"
      : "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block";
    var btn = el("button", cls, "В начало");
    btn.type = "button";
    btn.addEventListener("click", resetFlowToHome);
    container.appendChild(btn);
    return btn;
  }

  function appendPostSubmitNavActions(container) {
    var ragBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Есть вопрос?");
    ragBtn.type = "button";
    ragBtn.addEventListener("click", openRagEntry);
    container.appendChild(ragBtn);
    appendHomeButton(container, false);
  }

  function clampQuestionIndex(idx) {
    if (idx < 0) idx = 0;
    if (idx > MAIN_FLOW_STEPS.length - 1) idx = MAIN_FLOW_STEPS.length - 1;
    if (!isMainStepVisible(MAIN_FLOW_STEPS[idx])) {
      var prev = prevVisibleIndex(idx);
      return prev === -1 ? firstVisibleIndex() : prev;
    }
    return idx;
  }

  function setProgress(currentQuestionId) {
    var vis = visibleQuestions();
    var pos = 0;
    for (var i = 0; i < vis.length; i++) { if (vis[i].id === currentQuestionId) { pos = i + 1; break; } }
    var total = vis.length;
    progressEl.classList.remove("ecoleadbot-hidden");
    progressFill.style.width = total ? (pos / total * 100) + "%" : "0%";
    progressMeta.textContent = "Шаг " + pos + " из " + total;
  }
  function hideProgress() { progressEl.classList.add("ecoleadbot-hidden"); }

  function scrollBodyTop() { if (bodyEl) bodyEl.scrollTop = 0; }

  /* -----------------------------------------------------------------------
     13. SCREENS
     ----------------------------------------------------------------------- */
  function setScreen(name) {
    state.current_screen = name;
    if (state.status === "started" && (
      name === "document_directions" || name === "document_nvos_filter" ||
      name === "document_services" || name === "document_nvos_category" ||
      name === "document_registry" || name === "document_sites" || name === "document_qualification" ||
      name === "question" ||
      name === "mini_teaser" || name === "mini_result" ||
      name === "contact" || name === "rag_question" || name === "rag_answer"
    )) {
      state.status = "partial";
    }
    persist();
  }

  function renderIntro() {
    setScreen("intro");
    hideProgress();
    scrollBodyTop();

    var screen = el("div", "ecoleadbot-screen ecoleadbot-intro");
    var introBody = el("div");
    introBody.innerHTML =
      '<h2 class="ecoleadbot-title">Здравствуйте! Чем могу помочь?</h2>' +
      '<p class="ecoleadbot-intro__hint">Прохождение опроса займёт около 2 минут. ' +
      'Вы получите предварительную оценку и сможете оставить заявку.</p>';

    var actions = el("div", "ecoleadbot-intro__actions");
    var primary = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block",
      "Понять, что нужно по экологии");
    primary.type = "button";
    primary.addEventListener("click", startMainFlow);

    var secondary = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block",
      "Нужна конкретная услуга / документ");
    secondary.type = "button";
    secondary.addEventListener("click", openDocumentBranch);

    actions.appendChild(primary);
    actions.appendChild(secondary);

    var linkWrap = el("div", "ecoleadbot-intro__link-wrap");
    var ragLink = el("button", "ecoleadbot-intro__link", "Есть вопрос?");
    ragLink.type = "button";
    ragLink.addEventListener("click", openRagEntry);
    linkWrap.appendChild(ragLink);
    actions.appendChild(linkWrap);

    var closeLinkWrap = el("div", "ecoleadbot-intro__link-wrap ecoleadbot-intro__close-wrap");
    var closeLink = el("button", "ecoleadbot-intro__link", "Закрыть");
    closeLink.type = "button";
    closeLink.addEventListener("click", closePopup);
    closeLinkWrap.appendChild(closeLink);
    actions.appendChild(closeLinkWrap);

    introBody.appendChild(actions);
    screen.appendChild(introBody);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderDocumentCatalogError() {
    setScreen("document_error");
    hideProgress();
    scrollBodyTop();

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Каталог услуг временно недоступен"));
    screen.appendChild(el("p", "ecoleadbot-subtitle",
      "Не удалось загрузить список услуг. Можете пройти основной опрос или задать вопрос."));

    var actions = el("div", "ecoleadbot-intro__actions");
    var mainBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block",
      "Понять, что нужно по экологии");
    mainBtn.type = "button";
    mainBtn.addEventListener("click", startMainFlow);
    actions.appendChild(mainBtn);

    var ragBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Есть вопрос?");
    ragBtn.type = "button";
    ragBtn.addEventListener("click", openRagEntry);
    actions.appendChild(ragBtn);

    var retryBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Повторить");
    retryBtn.type = "button";
    retryBtn.addEventListener("click", openDocumentBranch);
    actions.appendChild(retryBtn);

    var closeBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--ghost ecoleadbot-btn--block", "Закрыть");
    closeBtn.type = "button";
    closeBtn.addEventListener("click", closePopup);
    actions.appendChild(closeBtn);

    screen.appendChild(actions);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderDocumentDirections() {
    setScreen("document_directions");
    hideProgress();
    scrollBodyTop();
    track("document_directions_viewed");

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Выберите направление"));
    screen.appendChild(el("p", "ecoleadbot-subtitle", "Далее — конкретная услуга или документ из каталога."));

    var optionsWrap = el("div", "ecoleadbot-options");
    getDirections().forEach(function (dir) {
      var card = el("button", "ecoleadbot-card");
      card.type = "button";
      var isSel = state.selected_direction === dir.id;
      if (isSel) card.classList.add("is-selected");
      var noteHtml = dir.ux_hint
        ? '<span class="ecoleadbot-card__note">' + escapeHtml(dir.ux_hint) + "</span>"
        : "";
      card.innerHTML =
        '<span class="ecoleadbot-card__check" aria-hidden="true">' + (isSel ? "●" : "") + "</span>" +
        "<span>" + escapeHtml(dir.title) + noteHtml + "</span>";
      card.addEventListener("click", function () {
        state.selected_direction = dir.id;
        state.selected_service_id = "";
        state.document_nvos_registry = "";
        resetQualForDocumentDirectionChange();
        persist();
        track("document_direction_selected", { direction: dir.id });
        if (dir.id === "nvos") {
          renderDocumentNvosFilter();
        } else {
          renderDocumentServices();
        }
      });
      optionsWrap.appendChild(card);
    });
    screen.appendChild(optionsWrap);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function applyDocumentPrefill() {
    var rules = getUxRules();
    var fields = (rules.document_branch_prefill || ["activity_type", "sites_count"]);
    state.prefill = state.prefill || {};
    fields.forEach(function (field) {
      if (state[field]) state.prefill[field] = state[field];
    });
  }

  function selectDocumentService(serviceId) {
    var svc = getServiceById(serviceId);
    if (!svc) return;
    state.selected_service_id = serviceId;
    state.selected_direction = svc.direction;
    resetQualForDocumentServiceChange(serviceId);
    if (serviceId === "dogovor-regional-operator") {
      saveDocumentQualAnswer("tko_contract_status", "Нет, нужно заключить");
    }
    applyDocumentPrefill();
    persist();
    track("document_service_selected", { service_id: serviceId, direction: svc.direction });
    startDocumentBranchAfterService();
  }

  function renderDocumentServices() {
    if (!state.selected_direction) {
      renderDocumentDirections();
      return;
    }
    setScreen("document_services");
    hideProgress();
    scrollBodyTop();
    track("document_services_viewed", { direction: state.selected_direction });

    var directions = getDirections();
    var dirTitle = state.selected_direction;
    for (var d = 0; d < directions.length; d++) {
      if (directions[d].id === state.selected_direction) {
        dirTitle = directions[d].title;
        break;
      }
    }

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Выберите услугу"));
    screen.appendChild(el("p", "ecoleadbot-subtitle", escapeHtml(dirTitle)));

    if (state.selected_direction === "nvos" && state.document_nvos_registry) {
      var hint = state.document_nvos_registry === "Нет"
        ? "Объект ещё не на учёте — в начале списка услуги для постановки на учёт."
        : state.document_nvos_registry === "Да"
          ? "Объект на учёте — ниже отчётность, расчёты и комплексное сопровождение."
          : "";
      if (hint) {
        screen.appendChild(el("p", "ecoleadbot-intro__hint ecoleadbot-question-hint", hint));
      }
    }

    var services = getServicesByDirection(state.selected_direction);
    var optionsWrap = el("div", "ecoleadbot-options");

    if (state.selected_direction === "nvos") {
      var grouped = {};
      services.forEach(function (svc) {
        var g = getNvosListGroup(svc);
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(svc);
      });
      getNvosGroupOrder(state.document_nvos_registry).forEach(function (groupId) {
        var list = grouped[groupId];
        if (!list || !list.length) return;
        var heading = el("h3", "ecoleadbot-service-group__title", NVOS_GROUP_LABELS[groupId] || groupId);
        optionsWrap.appendChild(heading);
        list.forEach(function (svc) { appendDocumentServiceCard(optionsWrap, svc); });
      });
    } else {
      services.forEach(function (svc) { appendDocumentServiceCard(optionsWrap, svc); });
    }

    screen.appendChild(optionsWrap);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function startFlow() {
    track("quiz_started");
    if (!state.timestamps.started_at) state.timestamps.started_at = isoNow();
    migrateLegacyMainAnswers();
    renderQuestion(firstVisibleIndex());
  }

  function renderClarifyStep(index) {
    var q = MAIN_FLOW_STEPS[index];
    var blocks = getClarifyBlocks(getActiveObjectSignals());
    state.question_index = index;
    setScreen("question");
    setProgress(q.id);
    scrollBodyTop();

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", escapeHtml(q.title)));
    screen.appendChild(el("p", "ecoleadbot-subtitle", "Ответьте на уточнения по выбранным признакам объекта."));

    blocks.forEach(function (block) {
      var section = el("div", "ecoleadbot-clarify-block");
      section.setAttribute("data-qual-block", block.id);
      section.appendChild(el("h3", "ecoleadbot-clarify-block__title", escapeHtml(block.text)));
      var optionsWrap = el("div", "ecoleadbot-options ecoleadbot-options--compact");
      wireOptionCardsGroup({
        container: optionsWrap,
        blockId: block.id,
        qType: qualBlockType(block),
        options: block.options || [],
        compact: true,
        getAnswers: function () { return state.answers; },
        setAnswer: function (id, val) { setClarifyAnswer(id, val); },
        onAnswerChange: function () { clearQualValidationUi(screen); }
      });
      section.appendChild(optionsWrap);
      screen.appendChild(section);
    });

    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    var clarifyHint = el("p", "ecoleadbot-actions__hint ecoleadbot-hidden");
    var nextBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Далее");
    nextBtn.type = "button";
    nextBtn.addEventListener("click", function () {
      if (!validateQualBlocks(screen, blocks, state.answers, {
        nextBtn: nextBtn,
        hintEl: clarifyHint,
        hintText: "Выберите ответ на все вопросы выше"
      })) {
        return;
      }
      advanceFromQuestion(index);
    });
    actions.appendChild(clarifyHint);
    actions.appendChild(nextBtn);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderQuestion(index) {
    if (index < 0) {
      finalizeMainFlowBeforeMiniResult();
      renderMiniResultTeaser();
      return;
    }
    var q = MAIN_FLOW_STEPS[index];
    if (q.type === "clarify") {
      renderClarifyStep(index);
      return;
    }

    state.question_index = index;
    setScreen("question");
    setProgress(q.id);
    scrollBodyTop();

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", escapeHtml(q.title)));
    if (q.subtitle) {
      screen.appendChild(el("p", "ecoleadbot-subtitle", escapeHtml(q.subtitle)));
    }
    if (q.hint) {
      screen.appendChild(el("p", "ecoleadbot-intro__hint ecoleadbot-question-hint", escapeHtml(q.hint)));
    }

    var optionsWrap = el("div", "ecoleadbot-options");

    if (q.id === "object_signals") {
      var selectedSignals = normalizeObjectSignals(state.object_signals || []);
      buildObjectSignalOptions().forEach(function (opt) {
        var card = el("button", "ecoleadbot-card");
        card.type = "button";
        var isSel = selectedSignals.indexOf(opt.id) !== -1;
        if (isSel) card.classList.add("is-selected");
        var noteHtml = opt.note
          ? '<span class="ecoleadbot-card__note">' + escapeHtml(opt.note) + "</span>"
          : "";
        card.innerHTML =
          '<span class="ecoleadbot-card__check" aria-hidden="true">' + (isSel ? "✓" : "") + "</span>" +
          "<span>" + escapeHtml(opt.label) + noteHtml + "</span>";
        card.setAttribute("data-signal-id", opt.id);
        card.addEventListener("click", function () { toggleObjectSignal(opt.id, optionsWrap); });
        optionsWrap.appendChild(card);
      });
    } else {
      var options = q.id === "activity_type" ? ACTIVITY_TYPE_OPTIONS : (q.options || []);
      var selected = ensureAnswers()[q.id];
      options.forEach(function (opt) {
        var card = el("button", "ecoleadbot-card");
        card.type = "button";
        var isSel = q.type === "multiple"
          ? (Array.isArray(selected) && selected.indexOf(opt) !== -1)
          : selected === opt;
        if (isSel) card.classList.add("is-selected");
        var mark = optionCardMark(q.type === "multiple" ? "multi" : "single", isSel);
        card.innerHTML =
          '<span class="ecoleadbot-card__check" aria-hidden="true">' + mark + "</span>" +
          "<span>" + escapeHtml(opt) + "</span>";
        card.setAttribute("data-qual-option", opt);
        card.addEventListener("click", function () {
          if (q.type === "multiple") toggleMultiple(q, opt, optionsWrap);
          else selectSingle(q, opt, index);
        });
        optionsWrap.appendChild(card);
      });
    }

    screen.appendChild(optionsWrap);

    if (q.type === "multiple" || q.id === "object_signals") {
      var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
      var multiHint = el("p", "ecoleadbot-actions__hint ecoleadbot-hidden");
      var nextBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Далее");
      nextBtn.type = "button";
      nextBtn.addEventListener("click", function () {
        var sel = q.id === "object_signals" ? state.object_signals : ensureAnswers()[q.id];
        if (!Array.isArray(sel) || sel.length === 0) {
          nextBtn.classList.add("is-error");
          multiHint.textContent = "Выберите хотя бы один пункт";
          multiHint.classList.remove("ecoleadbot-hidden");
          return;
        }
        nextBtn.classList.remove("is-error");
        multiHint.classList.add("ecoleadbot-hidden");
        advanceFromQuestion(index);
      });
      actions.appendChild(multiHint);
      actions.appendChild(nextBtn);
      screen.appendChild(actions);
    }

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function syncObjectSignalCardsUi(container) {
    if (!container) return;
    var selected = normalizeObjectSignals(state.object_signals || []);
    var cards = container.querySelectorAll(".ecoleadbot-card[data-signal-id]");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var id = card.getAttribute("data-signal-id");
      var isSel = selected.indexOf(id) !== -1;
      card.classList.toggle("is-selected", isSel);
      var check = card.querySelector(".ecoleadbot-card__check");
      if (check) check.textContent = isSel ? "✓" : "";
    }
  }

  function toggleObjectSignal(signalId, optionsWrap) {
    var arr = normalizeObjectSignals(state.object_signals || []);
    if (signalId === SIGNAL_UNCERTAIN) {
      if (arr.indexOf(SIGNAL_UNCERTAIN) !== -1) {
        arr = arr.filter(function (id) { return id !== SIGNAL_UNCERTAIN; });
      } else {
        arr = [SIGNAL_UNCERTAIN];
      }
    } else {
      arr = arr.filter(function (id) { return id !== SIGNAL_UNCERTAIN; });
      var pos = arr.indexOf(signalId);
      if (pos === -1) arr.push(signalId); else arr.splice(pos, 1);
    }
    state.object_signals = arr;
    ensureAnswers().object_signals = arr;
    persist();
    syncObjectSignalCardsUi(optionsWrap);
  }

  function selectSingle(q, opt, index) {
    ensureAnswers()[q.id] = opt;
    syncMainFlowAnswerFields(q.id, opt);
    persist();
    advanceFromQuestion(index);
  }

  function toggleMultiple(q, opt, optionsWrap) {
    var answers = ensureAnswers();
    var arr = Array.isArray(answers[q.id]) ? answers[q.id].slice() : [];
    var pos = arr.indexOf(opt);
    if (pos === -1) arr.push(opt); else arr.splice(pos, 1);
    answers[q.id] = arr;
    persist();
    syncOptionCardsUi(optionsWrap, q.id, "multi", answers);
  }

  function advanceFromQuestion(index) {
    track("question_answered", { question_id: MAIN_FLOW_STEPS[index].id });
    var next = nextVisibleIndex(index);
    if (next === -1) {
      finalizeMainFlowBeforeMiniResult();
      renderMiniResultTeaser();
    } else {
      renderQuestion(next);
    }
  }

  function pickMiniResultType() {
    var a = state.answers || {};
    var zones = state.mini_zones || [];
    if (zones.length >= 3 || isComplexMiniResultCase()) return "complex";
    if (a.help_format === "Чтобы кто-то полностью занимался экологией") return "high_es";
    if (a.ecology_responsible === "Никто") return "high_es";
    if (a.sites_count === "2–3" || a.sites_count === "4 и более") return "complex";
    return zones.length <= 1 ? "simple" : "complex";
  }

  function renderMiniResultTeaser() {
    finalizeMainFlowBeforeMiniResult();
    setScreen("mini_teaser");
    hideProgress();
    scrollBodyTop();
    track("mini_teaser_viewed");

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Готово"));
    screen.appendChild(el("p", "ecoleadbot-subtitle",
      "На основе ваших ответов можно собрать предварительную оценку по направлениям экологии."));

    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    var btn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block",
      "Посмотреть предварительную оценку");
    btn.type = "button";
    btn.addEventListener("click", renderMiniResult);
    actions.appendChild(btn);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function buildMiniChecklistItems() {
    var signals = getActiveObjectSignals();
    var items = [];
    if (signals.indexOf("tko") !== -1) {
      items.push("Договор с региональным оператором по ТКО (если есть)");
    }
    if (signals.indexOf("production_waste") !== -1) {
      items.push("Перечень отходов или результаты инвентаризации");
      items.push("Договоры на вывоз производственных отходов");
    }
    if (signals.indexOf("import_packaging") !== -1) {
      items.push("Перечень товаров/упаковки и прошлые отчёты по экосбору");
    }
    if (signals.indexOf("emissions") !== -1) {
      items.push("Сведения об учёте НВОС и источниках выбросов");
    }
    if (signals.indexOf("discharge_csv") !== -1) {
      items.push("Договор с водоканалом и данные по балансу водопотребления (БВВ), если есть");
    }
    if (signals.indexOf("discharge_own") !== -1) {
      items.push("Сведения о сбросе в водный объект (куда и примерный объём)");
    }
    if (signals.indexOf("wells") !== -1) {
      items.push("Данные по скважине и лицензии на водопользование (если есть)");
    }
    items.push("Адрес объекта и режим работы");
    items.push("Контакт ответственного за экологию на площадке");
    var out = [];
    items.forEach(function (it) {
      if (out.indexOf(it) === -1) out.push(it);
    });
    return out.slice(0, 6);
  }

  function buildMiniNextSteps() {
    return [
      "Пробегитесь по чек-листу — отметьте, что уже есть под рукой",
      "Нажмите «Подробнее» по интересному направлению",
      "Оставьте контакты для более предметного разговора с нашим специалистом"
    ];
  }

  function buildConstructionEmissionsHint() {
    syncMainFlowStateFromAnswers();
    var a = state.answers || {};
    var activity = (state.activity_type || a.activity_type || a.object_type || "").trim();
    var signals = getActiveObjectSignals();
    if (activity === "Стройка" && signals.indexOf("emissions") === -1) {
      return "На стройке часто есть выбросы (пыль, дизельная техника). Если это про ваш объект — отметьте «Выбросы в атмосферу» при повторном прохождении или обсудите со специалистом на звонке.";
    }
    return "";
  }

  function appendMiniResultValueBlock(screen) {
    var card = el("div", "ecoleadbot-mini-card");
    card.appendChild(el("h3", "ecoleadbot-mini-card__title", "Карточка вашего объекта"));

    var signalIds = getActiveObjectSignals();
    if (signalIds.length) {
      var tags = el("div", "ecoleadbot-mini-card__tags");
      signalIds.forEach(function (sid) {
        var tag = el("span", "ecoleadbot-mini-card__tag", escapeHtml(getObjectSignalLabel(sid)));
        tags.appendChild(tag);
      });
      card.appendChild(tags);
    }

    var checklistTitle = el("h4", "ecoleadbot-mini-card__subtitle", "Для подготовки к разговору с нашим специалистом могут понадобиться:");
    card.appendChild(checklistTitle);
    var checklist = el("ul", "ecoleadbot-mini-card__list");
    buildMiniChecklistItems().forEach(function (item) {
      checklist.appendChild(el("li", "", escapeHtml(item)));
    });
    card.appendChild(checklist);

    var stepsTitle = el("h4", "ecoleadbot-mini-card__subtitle", "Следующие шаги");
    card.appendChild(stepsTitle);
    var steps = el("ol", "ecoleadbot-mini-card__list ecoleadbot-mini-card__list--ordered");
    buildMiniNextSteps().forEach(function (step) {
      steps.appendChild(el("li", "", escapeHtml(step)));
    });
    card.appendChild(steps);

    screen.appendChild(card);

    var hint = buildConstructionEmissionsHint();
    if (hint) {
      screen.appendChild(el("p", "ecoleadbot-mini-hint", escapeHtml(hint)));
    }
  }

  function buildMiniResultPersonalizationText() {
    syncMainFlowStateFromAnswers();
    var a = state.answers || {};
    var parts = [];
    var activity = (state.activity_type || a.activity_type || a.object_type || "").trim();
    if (activity) parts.push("вид деятельности — «" + activity + "»");
    var nvos = (state.nvos_category || a.nvos_category || "").trim();
    if (nvos) parts.push("категория объекта НВОС — " + nvos);
    var sites = resolveSitesCount();
    if (sites) parts.push("площадок — " + sites);
    if (!parts.length) return "";
    return "Вы указали: " + parts.join("; ") + ".";
  }

  function buildMiniZoneBlock(zone) {
    var block = el("div", "ecoleadbot-zone-block");
    block.appendChild(el("h3", "ecoleadbot-zone-block__title", escapeHtml(zone.title)));
    var body = el("div", "ecoleadbot-zone-block__body");
    if (zone.body_html) {
      body.innerHTML = zone.body_html;
    } else if (zone.body_text) {
      body.appendChild(el("p", "ecoleadbot-zone-block__p", escapeHtml(zone.body_text)));
    }
    block.appendChild(body);
    var podBtn = el("button",
      "ecoleadbot-btn ecoleadbot-btn--ghost ecoleadbot-btn--block ecoleadbot-zone-block__more",
      "Подробнее");
    podBtn.type = "button";
    podBtn.addEventListener("click", function () { openMiniZonePodrobnee(zone); });
    block.appendChild(podBtn);
    return block;
  }

  function appendMiniResultActions(screen) {
    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    var btn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Получить консультацию");
    btn.type = "button";
    btn.addEventListener("click", function () {
      state.previous_screen = "mini_result";
      state.previous_question_index = clampQuestionIndex(state.question_index);
      persist();
      proceedToContact();
    });
    actions.appendChild(btn);
    screen.appendChild(actions);
  }

  function openMiniZonePodrobnee(zone) {
    if (!zone) return;
    state.flow = state.flow || "main";
    state.mini_zone_rag_id = zone.id || "";
    state.mini_zone_rag_title = zone.title || "";
    state.rag_from_template = false;
    state.rag_answer_html = "";
    state.rag_podrobnee_template_key = "";
    var prompt = zone.rag_podrobnee_prompt ||
      ("Расскажите подробнее, что проверить по направлению «" + zone.title + "»?");
    track("mini_zone_podrobnee", { session_id: state.session_id, zone_id: zone.id });

    var signals = getActiveObjectSignals();
    var tplKey = resolvePodrobneeTemplateKey(zone.id, signals);
    loadPodrobneeTemplate(tplKey).then(function (md) {
      if (isPodrobneeTemplateUsable(md)) {
        showPodrobneeFromTemplate(zone, md, tplKey);
        return;
      }
      submitRagQuestion(buildPodrobneeRagQuestion(zone, prompt), "podrobnee", tplKey);
    }).catch(function () {
      submitRagQuestion(buildPodrobneeRagQuestion(zone, prompt), "podrobnee", tplKey);
    });
  }

  function renderMiniResult() {
    finalizeMainFlowBeforeMiniResult();
    setScreen("mini_result");
    hideProgress();
    scrollBodyTop();
    track("mini_result_viewed");

    var zones = state.mini_zones || [];
    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Предварительная оценка"));
    screen.appendChild(el("p", "ecoleadbot-subtitle",
      "На объекте есть области для проверки. Это не диагноз и не штраф — ориентир для разговора со специалистом."));
    var personal = buildMiniResultPersonalizationText();
    if (personal) {
      screen.appendChild(el("p", "ecoleadbot-mini-personal", escapeHtml(personal)));
    }
    appendMiniResultValueBlock(screen);

    var zonesHeading = el("h3", "ecoleadbot-mini-zones-heading", "Направления для проверки");
    screen.appendChild(zonesHeading);

    var result = el("div", "ecoleadbot-result");

    if (!zones.length) {
      result.innerHTML = "<p>" + escapeHtml(MINI_RESULT[pickMiniResultType()]) + "</p>";
      screen.appendChild(result);
      appendMiniResultActions(screen);
      bodyEl.innerHTML = "";
      bodyEl.appendChild(screen);
      return;
    }

    result.appendChild(el("p", "ecoleadbot-mini-loading", "Загружаем оценку…"));
    screen.appendChild(result);
    appendMiniResultActions(screen);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);

    enrichMiniZonesWithTemplates(zones).then(function (enriched) {
      if (state.current_screen !== "mini_result") return;
      state.mini_zones = enriched;
      persist();
      result.innerHTML = "";
      var blocks = el("div", "ecoleadbot-zone-blocks");
      enriched.forEach(function (zone) {
        blocks.appendChild(buildMiniZoneBlock(zone));
      });
      result.appendChild(blocks);
    });
  }
  /* -----------------------------------------------------------------------
     13b. RAG SCENARIO (Scope Freeze v1.3.1 — третий входной сценарий)
     ----------------------------------------------------------------------- */
  function getRagApiUrl() {
    if (ECOLEADBOT_CONFIG.ragApiUrl) return ECOLEADBOT_CONFIG.ragApiUrl;
    /* Prefer widget host (elb.ecolusspb.ru), not the embedding page origin. */
    var base = getAssetBaseUrl();
    if (base && /^https?:\/\//i.test(base)) {
      return base.replace(/\/$/, "") + "/api/rag/ask";
    }
    return location.origin + "/api/rag/ask";
  }

  function summarizeRagAnswer(text) {
    var t = String(text || "").trim();
    if (t.length <= 320) return t;
    var cut = t.slice(0, 317);
    var dot = cut.lastIndexOf(". ");
    if (dot > 180) return cut.slice(0, dot + 1).trim() + "…";
    var sp = cut.lastIndexOf(" ");
    if (sp > 250) return cut.slice(0, sp).trim() + "…";
    return cut.trim() + "…";
  }

  function formatRagSource(source) {
    var parts = [];
    if (source.title) parts.push(source.title);
    if (source.document_number) parts.push(source.document_number);
    if (source.section) parts.push(source.section);
    if (!parts.length && source.file_name) parts.push(source.file_name);
    return parts.join(", ");
  }

  function getRagQuestionForCrm() {
    if (state.rag_entry_type === "podrobnee") {
      var title = String(state.mini_zone_rag_title || "").trim();
      if (title) return "Подробнее: " + title;
      if (state.rag_from_template) return "Подробнее (мини-оценка)";
      var q = String(state.rag_question || "").trim();
      /* Engineered API prompt must not appear as «вопрос пользователя». */
      if (!q || /^Дай краткий экспертный ответ/i.test(q)) {
        return "Подробнее (мини-оценка)";
      }
      return q;
    }
    return String(state.rag_question || "").trim();
  }

  function buildRagCommentBlock() {
    if (!state.rag_question && !state.rag_answer && !state.rag_answer_summary) return "";
    var isPodrobnee = state.rag_entry_type === "podrobnee";
    var questionLabel = isPodrobnee ? "Запрос «Подробнее»:" : "Вопрос пользователя:";
    var questionText = getRagQuestionForCrm();
    return [
      "=== Вопрос ассистенту ===",
      "",
      questionLabel,
      questionText || "—",
      "",
      "Краткий ответ ассистента:",
      state.rag_answer_summary || summarizeRagAnswer(state.rag_answer),
      "",
      "Рекомендация ассистента:",
      state.rag_assistant_recommendation || "",
      "",
      "Источник перехода:",
      isPodrobnee ? "Подробнее (мини-оценка)" : "Ассистент по базе знаний",
      "",
      "Возможный сигнал экосопровождения:",
      state.rag_es_signal || "неизвестно"
    ].join("\n");
  }

  /** Scope v1.4 §18: «нет ответа в базе» — ok-ответ без релевантных источников. */
  function isRagNoAnswerResponse(data) {
    if (!data || data.status !== "ok") return false;
    var rec = data.assistant_recommendation || "";
    if (rec === "out_of_scope") return true;
    if (rec === "insufficient_info") {
      var sources = Array.isArray(data.sources) ? data.sources : [];
      return sources.length === 0;
    }
    return false;
  }

  function countLeadDataPoints() {
    syncMainFlowStateFromAnswers();
    var a = state.answers || {};
    var pts = 0;
    if ((state.activity_type || a.activity_type || a.object_type || "").trim()) pts++;
    var signals = normalizeObjectSignals(state.object_signals || []);
    if (signals.length) pts++;
    if ((a.ecology_responsible || "").trim()) pts++;
    if ((a.main_situation || "").trim()) pts++;
    if ((a.urgency || "").trim()) pts++;
    if ((a.help_format || "").trim()) pts++;
    if ((state.nvos_category || a.nvos_category || "").trim()) pts++;
    if (state.sites_count || a.sites_count) pts++;
    if (state.selected_service_id) pts++;
    var qa = state.qualification_answers || {};
    if (Object.keys(qa).some(function (k) { return qa[k] != null && qa[k] !== ""; })) pts++;
    if ((state.mini_zones || []).length) pts++;
    if (state.selected_direction) pts++;
    if (state.document_nvos_registry) pts++;
    if (state.rag_answer) pts++;
    return pts;
  }

  /** Scope v1.4 / v1.4.1: ES scoring — document-flow aware. */
  /* -----------------------------------------------------------------------
     13b1. ES SCORING + BITRIX COMMENT (sync with n8n normalize-scoring-v141.js)
     ----------------------------------------------------------------------- */
  function computeEsScoring() {
    var flow = state.flow || "";
    var dataPoints = countLeadDataPoints();
    var miniType = pickMiniResultType();
    var a = state.answers || {};
    var signals = normalizeObjectSignals(state.object_signals || []);
    var selectedSvc = state.selected_service_id ? getServiceById(state.selected_service_id) : null;
    var esInterest = false;
    if (a.help_format === "Чтобы кто-то полностью занимался экологией") esInterest = true;
    if (a.ecology_responsible === "Никто") esInterest = true;
    var ragEs = (state.rag_es_signal || "").toLowerCase();
    if (ragEs === "да" || ragEs === "yes" || ragEs === "high") esInterest = true;

    if (flow === "document" && selectedSvc) {
      if (selectedSvc.service_type === "complex") miniType = "complex";
      if (a.sites_count === "2–3" || a.sites_count === "4 и более") miniType = "complex";
      if (selectedSvc.service_type === "bridge") miniType = miniType === "simple" ? "complex" : miniType;
    }

    var status;
    var statusLabel;
    var thinNote = "";

    if (dataPoints <= 1) {
      status = "requires_dequalification";
      statusLabel = "Требует уточнения при звонке";
      thinNote = "Мало данных — уточнить при звонке";
    } else if (isUncertainObjectSignal(signals) && flow !== "document") {
      status = "requires_dequalification";
      statusLabel = "Требует уточнения при звонке";
      thinNote = "Мало данных — уточнить при звонке";
    } else if (esInterest || miniType === "high_es") {
      status = "high_es_potential";
      statusLabel = "Высокий потенциал экосопровождения";
    } else if (isComplexMiniResultCase() || miniType === "complex") {
      status = "complex_lead";
      statusLabel = "Комплексный кейс — нужна консультация специалиста";
    } else {
      status = "qualified_lead";
      statusLabel = "Достаточно данных для первичной консультации";
    }

    return {
      status: status,
      status_label: statusLabel,
      data_points: dataPoints,
      es_interest_signal: esInterest,
      mini_result_type: miniType,
      thin_lead_note: thinNote
    };
  }

  function getDirectionTitle(dirId) {
    if (!dirId) return "";
    var dirs = getDirections();
    for (var i = 0; i < dirs.length; i++) {
      if (dirs[i].id === dirId) return dirs[i].title || dirId;
    }
    return dirId;
  }

  function formatQualAnswersForBitrix(qa) {
    qa = qa || getFilteredQualificationAnswersObject();
    if (!qa || !Object.keys(qa).length) return "";
    var labelMap = buildQualQuestionLabelMap();
    var lines = [];
    Object.keys(qa).forEach(function (k) {
      var v = qa[k];
      if (v == null || v === "") return;
      var q = getQualQuestionLabel(k, labelMap);
      if (isLatinSlug(q)) q = getQualQuestionLabel(k, null);
      lines.push("- " + q + ": " + (Array.isArray(v) ? v.join(", ") : String(v)));
    });
    return lines.length ? "Уточнения:\n" + lines.join("\n") : "";
  }

  /** Ответы «Условия сотрудничества» (скрипт админа) для комментария менеджеру. */
  function buildClientTermsNote() {
    var qa = state.client_terms_answers || {};
    var lines = [];
    if (qa.client_contract) lines.push("Форма договора: " + qa.client_contract);
    if (qa.client_prepayment) lines.push("Аванс: " + qa.client_prepayment);
    var clarify = [];
    if (qa.client_contract === "Пока не знаю") clarify.push("форму договора");
    if (qa.client_prepayment === "Пока не знаю") clarify.push("условия аванса");
    if (clarify.length) {
      lines.push("Уточнить при звонке: " + clarify.join(" и "));
    }
    return lines.length ? lines.join("\n") : "";
  }

  /** Scope v1.4 §9 / §13: комментарий для Bitrix — объект + цель обращения. */
  function buildBitrixManagerComment() {
    syncMainFlowStateFromAnswers();
    syncObjectFieldsFromQual();
    var a = state.answers || {};
    var activityType = state.activity_type || a.activity_type || a.object_type || "";
    var signalIds = normalizeObjectSignals(state.object_signals || []);
    var signalLabels = signalIds.map(getObjectSignalLabel);
    var signalUncertain = isUncertainObjectSignal(signalIds);
    var selectedSvc = state.selected_service_id ? getServiceById(state.selected_service_id) : null;
    var miniZones = (state.mini_zones || []).map(function (z) { return z.title; }).filter(Boolean);
    var zonesCfg = getZonesConfig();
    var template = (zonesCfg && zonesCfg.bitrix_comment_template) || {};
    var blocks = template.blocks || [
      {
        title: "Характеристика объекта",
        fields: ["activity_type", "object_signals", "nvos_category", "sites_count",
          "main_situation", "urgency", "help_format"]
      },
      {
        title: "Цель обращения",
        fields: ["direction", "service_title", "qualification_answers", "mini_assessment_zones"]
      },
      {
        title: "Условия сотрудничества",
        fields: ["client_terms"]
      }
    ];

    function fieldLine(key) {
      switch (key) {
        case "activity_type":
          return activityType ? "Вид деятельности: " + activityType : "";
        case "object_signals":
        case "object_signal_uncertain":
          if (signalUncertain) return "На объекте: не определено (ответ «не знаю»)";
          return signalLabels.length ? "На объекте есть: " + signalLabels.join(", ") : "";
        case "nvos_category": {
          var nvos = resolveNvosCategory();
          return nvos ? "Категория НВОС: " + nvos : "";
        }
        case "sites_count": {
          var sc = resolveSitesCount();
          return sc ? "Количество площадок: " + sc : "";
        }
        case "main_situation":
          return a.main_situation ? "Актуально: " + a.main_situation : "";
        case "urgency":
          return a.urgency ? "Срочность: " + a.urgency : "";
        case "help_format":
          return a.help_format ? "Формат помощи: " + a.help_format : "";
        case "direction":
          return state.selected_direction
            ? "Направление: " + getDirectionTitle(state.selected_direction)
            : "";
        case "service_title":
          return selectedSvc ? "Услуга интереса: " + selectedSvc.title : "";
        case "qualification_answers":
          return formatQualAnswersForBitrix();
        case "mini_assessment_zones":
          return miniZones.length
            ? "Зоны предварительной оценки:\n" + miniZones.map(function (t) { return "- " + t; }).join("\n")
            : "";
        case "client_terms":
          return buildClientTermsNote();
        default:
          return "";
      }
    }

    var parts = [];
    blocks.forEach(function (block) {
      var lines = [block.title || ""];
      (block.fields || []).forEach(function (key) {
        // object_signal_uncertain is covered by object_signals / fieldLine
        if (key === "object_signal_uncertain") return;
        var line = fieldLine(key);
        if (line) lines.push(line);
      });
      if (lines.length > 1) parts.push(lines.join("\n"));
    });

    return parts.join("\n\n");
  }

  function goToContactFromRag() {
    var answers = ensureAnswers();
    /* Keep quiz preference; only default when user never answered help_format. */
    if (!(answers.help_format || "").trim()) {
      answers.help_format = "консультация специалиста";
    }
    if (!state.rag_entry_type) state.rag_entry_type = "rag_question";
    state.previous_screen = state.current_screen || (state.rag_answer ? "rag_answer" : "rag_question");
    persist();
    track("rag_contact_requested", { session_id: state.session_id });
    proceedToContact();
  }

  /* -----------------------------------------------------------------------
     13b2. RAG UI SCREENS
     ----------------------------------------------------------------------- */
  /** Порог свёртки длинного ответа (символы plain text). */
  var RAG_ANSWER_COLLAPSE_CHARS = 700;

  /**
   * Если ответ длинный — свернуть с кнопкой «Показать полностью» / «Свернуть».
   * Полный текст остаётся в DOM; обрезка только визуальная (CSS max-height).
   */
  function mountRagAnswerExpand(screen, answerDiv) {
    var plain = String(state.rag_answer || answerDiv.textContent || "").trim();
    if (plain.length <= RAG_ANSWER_COLLAPSE_CHARS) return;

    answerDiv.classList.add("is-collapsed");
    var toggle = el("button", "ecoleadbot-rag-expand", "Показать полностью");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", function () {
      var expanded = answerDiv.classList.contains("is-expanded");
      if (expanded) {
        answerDiv.classList.remove("is-expanded");
        answerDiv.classList.add("is-collapsed");
        toggle.textContent = "Показать полностью";
        toggle.setAttribute("aria-expanded", "false");
      } else {
        answerDiv.classList.remove("is-collapsed");
        answerDiv.classList.add("is-expanded");
        toggle.textContent = "Свернуть";
        toggle.setAttribute("aria-expanded", "true");
      }
    });
    screen.appendChild(toggle);
  }

  function renderRagQuestion() {
    setScreen("rag_question");
    hideProgress();
    scrollBodyTop();
    track("rag_question_viewed");

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Есть вопрос?"));
    screen.appendChild(el("p", "ecoleadbot-subtitle",
      "Отвечу на основании базы знаний и нормативных документов. " +
      "Если вопрос сложный — предложу консультацию специалиста."));

    var field = el("div", "ecoleadbot-field");
    var textarea = el("textarea", "ecoleadbot-textarea ecoleadbot-rag-input");
    textarea.id = "eco-rag-question";
    textarea.placeholder = "Например: нужно ли делать ПЭК для небольшого производства?";
    textarea.maxLength = 1500;
    textarea.value = state.rag_question || "";
    field.appendChild(textarea);
    screen.appendChild(field);

    var actions = el("div", "ecoleadbot-intro__actions");
    var submit = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Получить ответ");
    submit.type = "button";
    submit.addEventListener("click", function () {
      var q = textarea.value.trim();
      if (!q) {
        textarea.classList.add("is-error");
        return;
      }
      textarea.classList.remove("is-error");
      submitRagQuestion(q);
    });
    actions.appendChild(submit);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
    textarea.focus();
  }

  function renderRagLoading() {
    setScreen("rag_loading");
    hideProgress();
    scrollBodyTop();
    var screen = el("div", "ecoleadbot-screen ecoleadbot-loading");
    prependBackButton(screen);
    var msgText = state.rag_entry_type === "podrobnee"
      ? "Составляю подробный ответ…"
      : "Составляю ответ…";
    var msg = el("div", "", msgText);
    screen.insertAdjacentHTML("beforeend",
      '<div class="ecoleadbot-spinner" aria-hidden="true"></div>');
    screen.appendChild(msg);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function retryRagQuestion() {
    if ((state.rag_question || "").trim()) {
      submitRagQuestion(state.rag_question, state.rag_entry_type || "rag_question");
      return;
    }
    renderRagQuestion();
  }

  function submitRagQuestion(questionText, entryType, podrobneeTemplateKey) {
    state.rag_question = questionText;
    state.rag_entry_type = entryType || state.rag_entry_type || "rag_question";
    state.rag_from_template = false;
    state.rag_answer_html = "";
    state.rag_podrobnee_template_key = podrobneeTemplateKey || state.rag_podrobnee_template_key || "";
    persist();
    renderRagLoading();
    track("rag_question_submitted", {
      session_id: state.session_id,
      rag_entry_type: state.rag_entry_type
    });

    var ragBody = {
      question: questionText,
      session_id: state.session_id,
      page_url: location.href,
      page_title: document.title || "",
      page_type: detectPageType()
    };
    if (state.rag_entry_type === "podrobnee") {
      ragBody.quiz_context = buildQuizContextForRag();
    }

    var ragController = typeof AbortController !== "undefined" ? new AbortController() : null;
    var ragTimeoutId = null;
    var ragTimeoutMs = ECOLEADBOT_CONFIG.ragFetchTimeoutMs || 90000;
    if (ragController) {
      ragTimeoutId = setTimeout(function () {
        try { ragController.abort(); } catch (e) { /* ignore */ }
      }, ragTimeoutMs);
    }

    fetch(getRagApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ragBody),
      signal: ragController ? ragController.signal : undefined
    }).then(function (res) {
      if (ragTimeoutId) clearTimeout(ragTimeoutId);
      if (res.status === 429) {
        state.rag_error_kind = "rate_limit";
        persist();
        track("rag_answer_error", { session_id: state.session_id, error_kind: "rate_limit" });
        renderRagTechnicalError();
        return null;
      }
      return res.json().then(function (data) {
        return { httpStatus: res.status, data: data };
      }).catch(function () {
        return { httpStatus: res.status, data: null };
      });
    }).then(function (wrapped) {
      if (!wrapped) return;
      var data = wrapped.data;
      if (!data || data.status !== "ok" || wrapped.httpStatus >= 400) {
        state.rag_error_kind = "technical";
        persist();
        track("rag_answer_error", {
          session_id: state.session_id,
          error_kind: "http_" + wrapped.httpStatus
        });
        renderRagTechnicalError();
        return;
      }
      var answerText = data.answer || "";
      var tplKey = (state.rag_podrobnee_template_key || "").replace(/^podrobnee\//, "");
      if (state.rag_entry_type === "podrobnee") {
        answerText = maybeAppendKoapToAnswer(answerText, tplKey || "default", data.confidence || "");
      }
      state.rag_answer = answerText;
      state.rag_answer_html = markdownToDisplayHtml(answerText);
      state.rag_answer_summary = summarizeRagAnswer(state.rag_answer);
      state.rag_assistant_recommendation = data.assistant_recommendation || "";
      state.rag_confidence = data.confidence || "";
      state.rag_sources = Array.isArray(data.sources) ? data.sources : [];
      state.rag_sources_titles = state.rag_sources.map(function (s) {
        return s.title || s.file_name || "";
      }).filter(function (t) { return !!t; });
      state.rag_es_signal = data.es_signal || "неизвестно";
      persist();
      if (isRagNoAnswerResponse(data)) {
        state.rag_error_kind = "no_answer";
        persist();
        track("rag_no_answer", {
          session_id: state.session_id,
          recommendation: state.rag_assistant_recommendation
        });
        renderRagNoAnswer();
        return;
      }
      state.rag_error_kind = "";
      persist();
      track("rag_answer_received", {
        session_id: state.session_id,
        recommendation: state.rag_assistant_recommendation
      });
      renderRagAnswer();
    }).catch(function (err) {
      if (ragTimeoutId) clearTimeout(ragTimeoutId);
      var aborted = err && (err.name === "AbortError" || err.code === 20);
      state.rag_error_kind = aborted ? "timeout" : "technical";
      persist();
      track("rag_answer_error", {
        session_id: state.session_id,
        error_kind: aborted ? "timeout" : "technical"
      });
      renderRagTechnicalError();
    });
  }

  function renderRagAnswer() {
    setScreen("rag_answer");
    hideProgress();
    scrollBodyTop();
    track("rag_answer_viewed", { rag_entry_type: state.rag_entry_type || "" });

    var isPodrobnee = state.rag_entry_type === "podrobnee";
    var rec = state.rag_assistant_recommendation;
    var showConsultCta = rec === "offer_consultation" || rec === "insufficient_info";

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);
    var answerTitle = isPodrobnee
      ? ("Подробнее: " + (state.mini_zone_rag_title || "оценка"))
      : "Ответ";
    /* escapeHtml: title may include zone name from JSON config via state.mini_zone_rag_title */
    screen.appendChild(el("h2", "ecoleadbot-title", escapeHtml(answerTitle)));
    var answerDiv = el("div", "ecoleadbot-rag-answer");
    if (!state.rag_answer_html && state.rag_answer) {
      state.rag_answer_html = markdownToDisplayHtml(state.rag_answer);
      persist();
    }
    if (state.rag_answer_html) {
      answerDiv.innerHTML = state.rag_answer_html;
    } else {
      answerDiv.textContent = state.rag_answer || "";
    }
    screen.appendChild(answerDiv);
    /* Длинный ответ: свёрнутый превью + «Показать полностью» (вариант C). */
    mountRagAnswerExpand(screen, answerDiv);

    if (state.rag_from_template) {
      var tplNote = el("p", "ecoleadbot-rag-template-note", "Готовый экспертный текст по вашим ответам");
      screen.appendChild(tplNote);
    }

    /* Источники — только test build (?elb_test=1 / localhost); в prod UI не показываем. */
    if (IS_TEST_BUILD && state.rag_sources && state.rag_sources.length) {
      var sourcesWrap = el("div", "ecoleadbot-rag-sources");
      var sourcesTitle = state.rag_sources.length > 1 ? "Источники:" : "Источник:";
      sourcesWrap.appendChild(el("div", "ecoleadbot-rag-sources__title", sourcesTitle));
      var list = el("ul", "ecoleadbot-rag-sources__list");
      state.rag_sources.forEach(function (source) {
        var line = formatRagSource(source);
        if (line) list.appendChild(el("li", "", escapeHtml(line)));
      });
      sourcesWrap.appendChild(list);
      screen.appendChild(sourcesWrap);
    }

    var actions = el("div", "ecoleadbot-intro__actions");

    if (isPodrobnee) {
      var backBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Вернуться к оценке");
      backBtn.type = "button";
      backBtn.addEventListener("click", function () {
        track("mini_zone_podrobnee_back", { session_id: state.session_id });
        renderMiniResult();
      });
      var consultBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Получить консультацию");
      consultBtn.type = "button";
      consultBtn.addEventListener("click", function () {
        var answers = ensureAnswers();
        answers.help_format = answers.help_format || "консультация специалиста";
        state.previous_screen = "mini_result";
        state.previous_question_index = clampQuestionIndex(state.question_index);
        persist();
        track("mini_zone_podrobnee_contact", { session_id: state.session_id });
        proceedToContact();
      });
      actions.appendChild(backBtn);
      actions.appendChild(consultBtn);
      screen.appendChild(actions);
      bodyEl.innerHTML = "";
      bodyEl.appendChild(screen);
      return;
    }

    screen.appendChild(el("p", "ecoleadbot-subtitle ecoleadbot-rag-feedback", "Это помогло ответить на ваш вопрос?"));

    actions.innerHTML = "";
    var yesBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Да, помогло");
    yesBtn.type = "button";
    yesBtn.addEventListener("click", function () {
      track("rag_feedback_positive", { session_id: state.session_id });
      renderRagSuccess();
    });
    var specialistLabel = showConsultCta ? "Лучше уточнить у специалиста" : "Хочу уточнить у специалиста";
    var specialistBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", specialistLabel);
    specialistBtn.type = "button";
    specialistBtn.addEventListener("click", goToContactFromRag);
    actions.appendChild(yesBtn);
    actions.appendChild(specialistBtn);

    appendHomeButton(actions, true);

    screen.appendChild(actions);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderRagSuccess() {
    setScreen("rag_success");
    hideProgress();
    scrollBodyTop();

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);
    screen.appendChild(el("h2", "ecoleadbot-title", "Спасибо! Рад, что удалось помочь."));

    var actions = el("div", "ecoleadbot-intro__actions");
    var againBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Задать ещё вопрос");
    againBtn.type = "button";
    againBtn.addEventListener("click", function () {
      state.rag_answer = "";
      state.rag_answer_summary = "";
      state.rag_assistant_recommendation = "";
      state.rag_confidence = "";
      state.rag_sources = [];
      state.rag_sources_titles = [];
      persist();
      renderRagQuestion();
    });
    actions.appendChild(againBtn);
    appendHomeButton(actions, false);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderRagNoAnswer() {
    setScreen("rag_no_answer");
    hideProgress();
    scrollBodyTop();
    track("rag_no_answer_viewed", { rag_entry_type: state.rag_entry_type || "" });

    var screen = el("div", "ecoleadbot-screen ecoleadbot-state ecoleadbot-state--no-answer");
    prependBackButton(screen);
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-state__icon" aria-hidden="true">📚</div>' +
      '<h2 class="ecoleadbot-title">В базе пока нет готового ответа</h2>' +
      '<p class="ecoleadbot-subtitle">По этому вопросу нет подходящих материалов в нашей базе знаний. ' +
      'Можете задать другой вопрос или оставить заявку — специалист ответит лично.</p>';
    screen.appendChild(body);

    if (state.rag_question) {
      var qWrap = el("div", "ecoleadbot-rag-no-answer__question");
      qWrap.appendChild(el("div", "ecoleadbot-rag-no-answer__label", "Ваш вопрос:"));
      qWrap.appendChild(el("div", "ecoleadbot-rag-no-answer__text", escapeHtml(state.rag_question)));
      screen.appendChild(qWrap);
    }

    var actions = el("div", "ecoleadbot-intro__actions");
    var retry = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Задать другой вопрос");
    retry.type = "button";
    retry.addEventListener("click", retryRagQuestion);
    var contact = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Связаться со специалистом");
    contact.type = "button";
    contact.addEventListener("click", function () {
      if (state.rag_entry_type === "podrobnee") {
        state.previous_screen = "mini_result";
        state.previous_question_index = clampQuestionIndex(state.question_index);
        persist();
      }
      goToContactFromRag();
    });
    actions.appendChild(retry);
    actions.appendChild(contact);
    appendHomeButton(actions, false);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderRagTechnicalError() {
    setScreen("rag_error");
    hideProgress();
    scrollBodyTop();
    track("rag_technical_error_viewed", { rag_entry_type: state.rag_entry_type || "" });

    var isTimeout = state.rag_error_kind === "timeout";
    var isRateLimit = state.rag_error_kind === "rate_limit";
    var subtitle = isTimeout
      ? "Ответ занимает слишком много времени. Попробуйте ещё раз или оставьте заявку — специалист свяжется с вами."
      : isRateLimit
        ? "Слишком много запросов подряд. Подождите минуту и попробуйте снова или оставьте заявку специалисту."
        : "Произошла техническая ошибка при обращении к ассистенту. Попробуйте ещё раз через минуту или оставьте заявку — специалист свяжется с вами.";

    var screen = el("div", "ecoleadbot-screen ecoleadbot-state ecoleadbot-state--technical");
    prependBackButton(screen);
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-state__icon" aria-hidden="true">⚠️</div>' +
      '<h2 class="ecoleadbot-title">Не удалось получить ответ</h2>' +
      '<p class="ecoleadbot-subtitle">' + escapeHtml(subtitle) + "</p>";
    screen.appendChild(body);

    var actions = el("div", "ecoleadbot-intro__actions");
    var retry = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Попробовать ещё раз");
    retry.type = "button";
    retry.addEventListener("click", retryRagQuestion);
    var contact = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Связаться со специалистом");
    contact.type = "button";
    contact.addEventListener("click", function () {
      if (state.rag_entry_type === "podrobnee") {
        state.previous_screen = "mini_result";
        state.previous_question_index = clampQuestionIndex(state.question_index);
        persist();
      }
      goToContactFromRag();
    });
    actions.appendChild(retry);
    actions.appendChild(contact);
    appendHomeButton(actions, false);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderRagError() {
    renderRagTechnicalError();
  }
  /* -----------------------------------------------------------------------
     14. CONTACT VALIDATION (чистая функция, без DOM — тестируется отдельно)
     Правила (Frontend §27–30 + уточнения):
       - name: обязателен;
       - phone: только цифры, минимум 10;
       - do_not_call=true: нужен метод WhatsApp/Telegram; телефон всё равно обязателен;
       - метод Telegram: ник обязателен, формат @username (после @ ≥5 симв., [A-Za-z0-9_]);
       - метод WhatsApp: telegram не нужен (используется phone_or_whatsapp).
     ----------------------------------------------------------------------- */
  function validateContact(data) {
    var errors = {};
    var name = (data.name || "").trim();
    var digits = digitsOnly(data.phone || "");
    var telegram = (data.telegram || "").trim();
    var dnc = !!data.do_not_call;
    var method = dnc ? (data.method || "") : "phone";
    var consent = !!data.consent;
    var normalizedTelegram = "";

    // Имя — обязательно.
    if (!name) errors.name = "Укажите имя";

    // Телефон обязателен ВСЕГДА (MVP-контракт: name + phone_or_whatsapp).
    // Только цифры, от 10 до 15.
    if (digits.length < 10 || digits.length > 15) {
      errors.phone = "Введите корректный номер телефона";
    }

    if (dnc) {
      if (method !== "whatsapp" && method !== "telegram") {
        errors.method = "Выберите, куда вам написать: WhatsApp или Telegram.";
      } else if (method === "telegram") {
        // Telegram обязателен при способе связи Telegram: формат @username.
        var tg = telegram;
        if (tg && tg.charAt(0) !== "@") tg = "@" + tg; // нормализуем к @username
        if (!/^@[A-Za-z0-9_]{5,}$/.test(tg)) {
          errors.telegram = "Введите Telegram в формате @username";
        } else {
          normalizedTelegram = tg;
        }
      }
    }

    // Согласие на обработку ПДн — обязательно для отправки.
    if (!consent) errors.consent = "Подтвердите согласие на обработку персональных данных";

    return {
      ok: Object.keys(errors).length === 0,
      errors: errors,
      method: method,
      telegram: normalizedTelegram, // непусто только если метод telegram и ник валиден
      phoneDigits: digits
    };
  }

  /* -----------------------------------------------------------------------
     14b. CONTACT SCREEN (UX §11 / Frontend §27–30)
     Email исключён (решение по противоречию №3).
     ----------------------------------------------------------------------- */
  function renderContactBlocked() {
    setScreen("contact_blocked");
    hideProgress();
    scrollBodyTop();
    track("contact_blocked_already_submitted", { session_id: state.session_id });

    var screen = el("div", "ecoleadbot-screen ecoleadbot-final");
    prependBackButton(screen);
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-final__icon" aria-hidden="true">✓</div>' +
      '<h2 class="ecoleadbot-title">Ваша заявка уже отправлена</h2>' +
      '<p class="ecoleadbot-subtitle">Специалист свяжется с вами.</p>';
    screen.appendChild(body);

    var actions = el("div", "ecoleadbot-intro__actions");
    var retryBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Пройти заново");
    retryBtn.type = "button";
    retryBtn.addEventListener("click", resetSessionToIntro);
    actions.appendChild(retryBtn);
    appendPostSubmitNavActions(actions);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderContact() {
    if (isAlreadySubmitted()) {
      renderContactBlocked();
      return;
    }
    if (!state.client_terms_ok) {
      proceedToContact();
      return;
    }

    /* Do not overwrite previous_screen here: document branch / client_terms
       already set the correct back target. Forcing "client_terms" broke back
       when client_terms_ok was already true (skipped the terms screen). */

    setScreen("contact");
    hideProgress();
    scrollBodyTop();
    track("contact_form_viewed");

    var c = state.contact || {};
    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    var content = el("div");
    content.innerHTML =
      '<h2 class="ecoleadbot-title">Оставьте контакты</h2>' +
      '<p class="ecoleadbot-subtitle">Подготовим рекомендации по вашему объекту.</p>' +
      '<p class="ecoleadbot-hint ecoleadbot-contact-disclaimer">' +
        'Мы работаем с юридическими лицами и ИП по прямым договорам. ' +
        'Участие в электронных закупках не предусмотрено.' +
      '</p>' +

      '<div class="ecoleadbot-field">' +
        '<label class="ecoleadbot-label" for="eco-name">Имя</label>' +
        '<input class="ecoleadbot-input" id="eco-name" type="text" autocomplete="name" value="' + escapeHtml(c.name || "") + '" />' +
        '<div class="ecoleadbot-error ecoleadbot-hidden" data-err="name"></div>' +
      '</div>' +

      '<div class="ecoleadbot-field">' +
        '<label class="ecoleadbot-label" for="eco-phone">Телефон для звонка / WhatsApp</label>' +
        '<input class="ecoleadbot-input" id="eco-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (999) 999-99-99" value="' + escapeHtml(formatPhone(c.phone_or_whatsapp || "")) + '" />' +
        '<p class="ecoleadbot-hint ecoleadbot-hidden" data-hint="phone-dnc"></p>' +
        '<div class="ecoleadbot-error ecoleadbot-hidden" data-err="phone"></div>' +
      '</div>' +

      '<label class="ecoleadbot-checkbox">' +
        '<input type="checkbox" id="eco-donotcall" ' + (state.do_not_call ? "checked" : "") + ' />' +
        '<span>Не звоните мне</span>' +
      '</label>' +

      '<div class="ecoleadbot-field ecoleadbot-hidden" data-block="prefer">' +
        '<label class="ecoleadbot-label">Как вам написать?</label>' +
        '<div class="ecoleadbot-chips">' +
          '<button type="button" class="ecoleadbot-chip" data-method="whatsapp">WhatsApp</button>' +
          '<button type="button" class="ecoleadbot-chip" data-method="telegram">Telegram</button>' +
        '</div>' +
        '<div class="ecoleadbot-error ecoleadbot-hidden" data-err="method"></div>' +
      '</div>' +

      '<div class="ecoleadbot-field ecoleadbot-hidden" data-block="telegram">' +
        '<label class="ecoleadbot-label" for="eco-tg">Telegram <span class="ecoleadbot-label__opt">(@username или username)</span></label>' +
        '<input class="ecoleadbot-input" id="eco-tg" type="text" value="' + escapeHtml(c.telegram || "") + '" />' +
        '<p class="ecoleadbot-hint">Укажите Telegram, чтобы мы могли написать вам без звонка.</p>' +
        '<div class="ecoleadbot-error ecoleadbot-hidden" data-err="telegram"></div>' +
      '</div>' +

      '<div class="ecoleadbot-field">' +
        '<label class="ecoleadbot-label" for="eco-comment">Комментарий <span class="ecoleadbot-label__opt">(необязательно)</span></label>' +
        '<textarea class="ecoleadbot-textarea" id="eco-comment">' + escapeHtml(c.comment || "") + '</textarea>' +
      '</div>' +

      '<label class="ecoleadbot-checkbox">' +
        '<input type="checkbox" id="eco-consent" ' + (state.consent ? "checked" : "") + ' />' +
        '<span>Я согласен с политикой обработки персональных данных</span>' +
      '</label>';
    screen.appendChild(content);

    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    var submit = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Получить рекомендации");
    submit.type = "button";
    submit.disabled = true; // активируется только когда форма валидна
    actions.appendChild(submit);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);

    // refs
    var nameI = screen.querySelector("#eco-name");
    var phoneI = screen.querySelector("#eco-phone");
    var phoneHint = screen.querySelector('[data-hint="phone-dnc"]');
    var dncI = screen.querySelector("#eco-donotcall");
    var consentI = screen.querySelector("#eco-consent");
    var preferBlock = screen.querySelector('[data-block="prefer"]');
    var tgBlock = screen.querySelector('[data-block="telegram"]');
    var tgI = screen.querySelector("#eco-tg");
    var commentI = screen.querySelector("#eco-comment");
    var chips = screen.querySelectorAll(".ecoleadbot-chip");

    function runValidation() {
      return validateContact({
        name: nameI.value,
        phone: phoneI.value,
        telegram: tgI.value,
        do_not_call: dncI.checked,
        method: state.preferred_contact_method,
        consent: consentI.checked
      });
    }

    // Включает/выключает кнопку отправки по текущей валидности формы.
    function refreshSubmit() {
      submit.disabled = !runValidation().ok;
    }

    function refreshConditional() {
      var dnc = dncI.checked;
      var method = state.preferred_contact_method;
      preferBlock.classList.toggle("ecoleadbot-hidden", !dnc);
      var showTg = dnc && method === "telegram";
      tgBlock.classList.toggle("ecoleadbot-hidden", !showTg);

      // Телефон обязателен ВСЕГДА. Меняется только текст пояснения.
      if (dnc && method === "whatsapp") {
        phoneHint.textContent = "Телефон нужен для WhatsApp. Звонить не будем.";
        phoneHint.classList.remove("ecoleadbot-hidden");
      } else if (dnc && method === "telegram") {
        phoneHint.textContent = "Телефон нужен для карточки обращения. Свяжемся с вами в Telegram.";
        phoneHint.classList.remove("ecoleadbot-hidden");
      } else {
        phoneHint.textContent = "";
        phoneHint.classList.add("ecoleadbot-hidden");
      }

      hideError(screen, "phone"); // сбросить возможную ошибку при смене режима
      refreshSubmit();
    }

    // Маска телефона во время ввода (визуальное форматирование, без библиотек).
    phoneI.addEventListener("input", function () {
      phoneI.value = formatPhone(phoneI.value);
      hideError(screen, "phone");
      refreshSubmit();
    });
    phoneI.addEventListener("blur", function () {
      var r = runValidation();
      if (r.errors.phone) showError(screen, "phone", r.errors.phone);
    });

    nameI.addEventListener("input", function () { hideError(screen, "name"); refreshSubmit(); });
    nameI.addEventListener("blur", function () {
      if (!nameI.value.trim()) showError(screen, "name", "Укажите имя");
    });

    tgI.addEventListener("input", function () { hideError(screen, "telegram"); refreshSubmit(); });
    tgI.addEventListener("blur", function () {
      var r = runValidation();
      if (r.errors.telegram) showError(screen, "telegram", r.errors.telegram);
    });

    consentI.addEventListener("change", function () {
      state.consent = consentI.checked;
      persist();
      refreshSubmit();
    });

    // восстановить выбранный метод
    chips.forEach(function (chip) {
      if (state.do_not_call && chip.getAttribute("data-method") === state.preferred_contact_method) {
        chip.classList.add("is-selected");
      }
      chip.addEventListener("click", function () {
        chips.forEach(function (c2) { c2.classList.remove("is-selected"); });
        chip.classList.add("is-selected");
        state.preferred_contact_method = chip.getAttribute("data-method");
        persist();
        hideError(screen, "method");
        refreshConditional();
      });
    });

    dncI.addEventListener("change", function () {
      state.do_not_call = dncI.checked;
      if (!dncI.checked) {
        state.preferred_contact_method = "phone";
        chips.forEach(function (c2) { c2.classList.remove("is-selected"); });
      }
      persist();
      refreshConditional();
    });

    refreshConditional();

    submit.addEventListener("click", function () {
      if (submit.disabled) return; // защита
      clearErrors(screen);
      var result = runValidation();
      if (!result.ok) {
        Object.keys(result.errors).forEach(function (field) {
          showError(screen, field, result.errors[field]);
        });
        return;
      }

      state.contact = {
        name: nameI.value.trim(),
        // Телефон обязателен всегда — храним только цифры с префиксом +.
        phone_or_whatsapp: "+" + result.phoneDigits,
        // telegram передаём только если заполнен и валиден (иначе пустая строка).
        telegram: result.telegram || "",
        comment: commentI.value.trim()
      };
      state.do_not_call = dncI.checked;
      state.preferred_contact_method = result.method;
      persist();

      submitLead();
    });
  }

  function showError(scope, name, msg) {
    var box = scope.querySelector('[data-err="' + name + '"]');
    if (box) { box.textContent = msg; box.classList.remove("ecoleadbot-hidden"); }
    var input = scope.querySelector("#eco-" + (name === "phone" ? "phone" : name === "telegram" ? "tg" : name));
    if (input) input.classList.add("is-error");
  }
  function clearErrors(scope) {
    scope.querySelectorAll(".ecoleadbot-error").forEach(function (b) { b.classList.add("ecoleadbot-hidden"); b.textContent = ""; });
    scope.querySelectorAll(".is-error").forEach(function (i) { i.classList.remove("is-error"); });
  }
  function hideError(scope, name) {
    var box = scope.querySelector('[data-err="' + name + '"]');
    if (box) { box.classList.add("ecoleadbot-hidden"); box.textContent = ""; }
    var input = scope.querySelector("#eco-" + (name === "phone" ? "phone" : name === "telegram" ? "tg" : name));
    if (input) input.classList.remove("is-error");
  }

  /* -----------------------------------------------------------------------
     15. PAYLOAD (n8n Этап 4 §6.2) + WEBHOOK SUBMIT
     ----------------------------------------------------------------------- */
  function buildPayload() {
    syncMainFlowStateFromAnswers();
    syncObjectFieldsFromQual();
    /* Sync may promote/normalize fields on state/answers — persist before webhook. */
    persist();
    var a = ensureAnswers();
    var activityType = state.activity_type || a.activity_type || a.object_type || "";
    var signalIds = normalizeObjectSignals(state.object_signals || a.object_signals || []);
    var nvosCategory = resolveNvosCategory();
    var sitesCount = resolveSitesCount() || "1";
    var filteredQual = getFilteredQualificationAnswersObject();
    var clientTerms = state.client_terms_answers || {};
    var answers = {
      activity_type: activityType,
      object_type: activityType,
      object_signal_ids: signalIds,
      object_signals: signalIds.map(getObjectSignalLabel),
      object_signal_uncertain: isUncertainObjectSignal(signalIds),
      ecology_responsible: a.ecology_responsible || "",
      main_situation: a.main_situation || "",
      urgency: a.urgency || "",
      help_format: a.help_format || "",
      nvos_category: nvosCategory,
      sites_count: sitesCount,
      qualification_answers: filteredQual,
      client_contract: clientTerms.client_contract || "",
      client_prepayment: clientTerms.client_prepayment || ""
    };
    if (a.document_interest) answers.document_interest = a.document_interest;

    var selectedSvc = state.selected_service_id ? getServiceById(state.selected_service_id) : null;
    if (state.rag_question || state.rag_answer) {
      answers.rag_question = getRagQuestionForCrm() || state.rag_question || "";
      answers.rag_es_signal = state.rag_es_signal || "";
      answers.rag_answer_summary = state.rag_answer_summary || summarizeRagAnswer(state.rag_answer);
      answers.rag_assistant_recommendation = state.rag_assistant_recommendation || "";
      answers.rag_confidence = state.rag_confidence || "";
      /* rag_sources_titles — только для test UI; в n8n/Bitrix не отправляем */
      answers.rag_entry_type = state.rag_entry_type || "question_link";
      if (state.rag_entry_type === "podrobnee") {
        answers.rag_podrobnee_zone_id = state.mini_zone_rag_id || "";
        answers.rag_podrobnee_zone_title = state.mini_zone_rag_title || "";
      }
      /* Default only when quiz never set help_format (RAG-only entry). */
      if (!(answers.help_format || "").trim()) {
        answers.help_format = "консультация специалиста";
      }
    }

    var utm = state.current_utm || {};
    var esScoring = computeEsScoring();
    var bitrixBlock = buildBitrixManagerComment();
    var ragBlock = buildRagCommentBlock();
    var userComment = state.contact.comment || "";
    var commentParts = [];
    if (bitrixBlock) commentParts.push(bitrixBlock);
    if (ragBlock) commentParts.push(ragBlock);
    if (userComment) {
      commentParts.push("Комментарий пользователя:\n" + userComment);
    }
    var mergedComment = commentParts.join("\n\n---\n\n");

    return {
      session_id: state.session_id,
      status: "completed",
      source: {
        entry_type: state.entry_type,
        page_url: state.entry_page_url || location.href,
        page_title: document.title || "",
        page_type: state.entry_page_type || detectPageType(),
        utm_source: utm.utm_source || "",
        utm_medium: utm.utm_medium || "",
        utm_campaign: utm.utm_campaign || "",
        utm_content: utm.utm_content || "",
        utm_term: utm.utm_term || "",
        first_touch_utm: state.first_touch_utm || {},
        current_utm: state.current_utm || {},
        ab_variant: state.entry_type + "_" + state.ab_variant_token,
        popup_trigger: state.popup_trigger || "",
        headline_variant: state.headline_variant
      },
      answers: answers,
      contact: {
        name: state.contact.name,
        phone_or_whatsapp: state.contact.phone_or_whatsapp,
        telegram: state.contact.telegram || "",
        preferred_contact_method: state.preferred_contact_method,
        do_not_call: !!state.do_not_call,
        comment: mergedComment
      },
      meta: {
        started_at: state.timestamps.started_at || isoNow(),
        completed_at: isoNow(),
        last_screen: "contact",
        device: detectDevice(),
        browser: detectBrowser(),
        widget_version: WIDGET_VERSION,
        is_test_build: IS_TEST_BUILD
      },
      v14: {
        flow: state.flow || "",
        activity_type: activityType,
        /* IDs by contract (scoring-spec): labels live in answers.object_signals */
        object_signals: signalIds.slice(),
        nvos_category: nvosCategory,
        sites_count: sitesCount,
        main_situation: a.main_situation || "",
        selected_direction: state.selected_direction || "",
        selected_service_id: state.selected_service_id || "",
        service_title: selectedSvc ? selectedSvc.title : "",
        service_type: selectedSvc ? (selectedSvc.service_type || "standalone") : "",
        service_direction: selectedSvc ? (selectedSvc.direction || state.selected_direction || "") : "",
        qualification_answers: filteredQual,
        mini_assessment_zones: (state.mini_zones || []).map(function (z) {
          return {
            id: z.id,
            title: z.title,
            summary: z.body_text || z.title
          };
        }),
        mini_zone_ids: (state.mini_zones || []).map(function (z) { return z.id; }).filter(Boolean),
        mini_zone_rag_id: state.mini_zone_rag_id || "",
        document_nvos_registry: state.document_nvos_registry || "",
        prefill: state.prefill || {},
        es_scoring: esScoring,
        bitrix_comment: bitrixBlock,
        rag_error_kind: state.rag_error_kind || ""
      }
    };
  }

  function isProduction() {
    var h = location.hostname;
    return h !== "localhost" && h !== "127.0.0.1" && h !== "" && h !== "0.0.0.0";
  }

  /* Финальный payload для лога. В production персональные данные не логируются
     (Security §44). На localhost (dev) — полный payload для отладки. */
  function payloadForLog(payload) {
    var copy = JSON.parse(JSON.stringify(payload));
    if (isProduction()) {
      copy.contact = {
        name: "[hidden]",
        phone_or_whatsapp: "[hidden]",
        telegram: copy.contact.telegram ? "[hidden]" : "",
        preferred_contact_method: copy.contact.preferred_contact_method,
        do_not_call: copy.contact.do_not_call,
        comment: copy.contact.comment ? "[hidden]" : ""
      };
    }
    return copy;
  }

  function submitLead() {
    if (isAlreadySubmitted()) {
      renderContactBlocked();
      return;
    }

    var gate = evaluateServiceGate(getServiceById(state.selected_service_id));
    if (gate) {
      showServiceGate(gate, "contact");
      return;
    }

    var clientGate = evaluateClientTermsGate();
    if (clientGate) {
      showClientGate(clientGate, "contact");
      return;
    }

    renderLoading();
    var payload = buildPayload();

    // Финальный payload перед отправкой в webhook
    console.log("[EcoLeadBot] payload →", payloadForLog(payload));

    var startedAt = now();

    function finishWith(fn) {
      var elapsed = now() - startedAt;
      var wait = Math.max(0, ECOLEADBOT_CONFIG.loadingMinMs - elapsed);
      setTimeout(fn, wait);
    }

    var leadHeaders = { "Content-Type": "application/json" };
    if (ECOLEADBOT_CONFIG.webhookSecret) {
      leadHeaders["X-EcoLeadBot-Secret"] = ECOLEADBOT_CONFIG.webhookSecret;
    }
    fetch(ECOLEADBOT_CONFIG.webhookUrl, {
      method: "POST",
      headers: leadHeaders,
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      finishWith(function () {
        state.status = "completed";
        state.already_submitted_at = now();
        state.timestamps.completed_at = isoNow();
        persist();
        track("lead_submitted", { session_id: state.session_id });
        renderFinal();
      });
    }).catch(function (err) {
      var isNetwork = (err && err.name === "TypeError"); // fetch network failure
      finishWith(function () {
        track("lead_submit_error");
        renderError(isNetwork);
      });
    });
  }

  /* -----------------------------------------------------------------------
     16. LOADING / FINAL / ERROR / ALREADY SUBMITTED
     ----------------------------------------------------------------------- */
  function renderLoading() {
    setScreen("loading");
    hideProgress();
    scrollBodyTop();
    var screen = el("div", "ecoleadbot-screen ecoleadbot-loading");
    prependBackButton(screen);
    screen.insertAdjacentHTML("beforeend",
      '<div class="ecoleadbot-spinner" aria-hidden="true"></div>');
    screen.appendChild(el("div", "", "Анализируем ответы..."));
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderFinal() {
    setScreen("success");
    hideProgress();
    scrollBodyTop();
    track("final_screen_viewed");

    var screen = el("div", "ecoleadbot-screen ecoleadbot-final");
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-final__icon" aria-hidden="true">✓</div>' +
      '<h2 class="ecoleadbot-title">Спасибо!</h2>' +
      '<p class="ecoleadbot-subtitle">Заявка отправлена.<br><br>' +
      'Специалист компании «Экологические услуги» свяжется с вами.</p>';
    screen.appendChild(body);
    appendFinalMediaLinks(screen);

    var actions = el("div", "ecoleadbot-intro__actions");
    var retryBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Пройти заново");
    retryBtn.type = "button";
    retryBtn.addEventListener("click", resetSessionToIntro);
    actions.appendChild(retryBtn);
    appendPostSubmitNavActions(actions);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderError(isNetwork) {
    setScreen("error");
    hideProgress();
    scrollBodyTop();
    var screen = el("div", "ecoleadbot-screen ecoleadbot-state");
    prependBackButton(screen);
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-state__icon" aria-hidden="true">⚠️</div>' +
      '<h2 class="ecoleadbot-title">' + (isNetwork ? "Нет соединения" : "Не удалось отправить заявку") + '</h2>' +
      '<p class="ecoleadbot-subtitle">' +
        (isNetwork ? "Проверьте подключение к интернету." : "Попробуйте ещё раз.") +
      '</p>';
    screen.appendChild(body);

    var actions = el("div", "ecoleadbot-actions");
    var retry = el("button", "ecoleadbot-btn ecoleadbot-btn--primary", "Повторить");
    retry.type = "button";
    retry.addEventListener("click", submitLead);
    var close = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary", "Закрыть");
    close.type = "button";
    close.addEventListener("click", closePopup);
    actions.appendChild(retry);
    actions.appendChild(close);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderAlreadySubmitted() {
    renderContactBlocked();
  }

  /* -----------------------------------------------------------------------
     17. AUTO POPUP TRIGGERS (UX §5 / Frontend §13–15)
     ----------------------------------------------------------------------- */
  function isExitBannerVisible() {
    return !!(exitBanner && !exitBanner.classList.contains("ecoleadbot-hidden") &&
      exitBanner.classList.contains("is-visible"));
  }

  function hideExitBanner() {
    if (!exitBanner) return;
    exitBanner.classList.remove("is-visible");
    setTimeout(function () {
      if (exitBanner) exitBanner.classList.add("ecoleadbot-hidden");
    }, 220);
  }

  /**
   * Top-right exit-intent banner (desktop). Independent of time/scroll triggers.
   */
  function showExitBanner() {
    if (!exitBanner || exitIntentUsed) return;
    if (!ECOLEADBOT_CONFIG.enableAutoPopup) return;
    if (inCooldown()) return;
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return;
    if (detectDevice() !== "desktop") return;

    exitIntentUsed = true;
    exitBanner.classList.remove("ecoleadbot-hidden");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (exitBanner) exitBanner.classList.add("is-visible");
      });
    });
    track("exit_banner_shown", { trigger: "exit_intent" });
  }

  function canAutoOpen() {
    if (!ECOLEADBOT_CONFIG.enableAutoPopup) return false;
    if (autoTriggerUsed) return false;
    if (inCooldown()) return false;
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return false;
    if (isExitBannerVisible()) return false;
    return true;
  }

  function canShowExitIntent() {
    if (!ECOLEADBOT_CONFIG.enableAutoPopup) return false;
    if (exitIntentUsed) return false;
    if (inCooldown()) return false;
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return false;
    if (detectDevice() !== "desktop") return false;
    return true;
  }

  function setupAutoTriggers() {
    // 1. Time delay
    autoPopupTimer = setTimeout(function () {
      if (canAutoOpen()) { autoTriggerUsed = true; openPopup("auto_popup", "time_delay", { resume: false }); }
    }, ECOLEADBOT_CONFIG.popupDelayMs);

    // 2. Scroll depth
    var onScroll = function () {
      var scrolled = (window.scrollY + window.innerHeight) /
        Math.max(document.documentElement.scrollHeight, 1);
      if (scrolled >= ECOLEADBOT_CONFIG.scrollDepthTrigger && canAutoOpen()) {
        autoTriggerUsed = true;
        openPopup("scroll_popup", "scroll_depth", { resume: false });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // 3. Exit intent (desktop) — top banner near tab close, independent of time/scroll
    document.addEventListener("mouseout", function (e) {
      if (e.clientY > 0 || e.relatedTarget) return;
      if (!canShowExitIntent()) return;
      showExitBanner();
    });
  }
  /* -----------------------------------------------------------------------
     18. INIT
     ----------------------------------------------------------------------- */
  function init() {
    if (window.__ecoleadbotLoaded) return;
    window.__ecoleadbotLoaded = true;

    ensureWidgetStylesheet();
    initState();
    buildDom();
    insertInlineCta();
    if (shouldOpenFromUrl() && overlay && overlay.classList.contains("ecoleadbot-hidden")) {
      autoTriggerUsed = true;
      openPopup("direct", "url_open", { resume: false });
    }
    setupAutoTriggers();

    loadV14Data().then(function () {
      logV14DataStatus();
    }).catch(function () {
      logV14DataStatus();
    });

    window.addEventListener("beforeunload", function () {
      if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) {
        state.popup_closed_at = now();
      }
      if (state && state.status !== "completed" && state.current_screen !== "idle") {
        if (Object.keys(state.answers || {}).length > 0) state.status = "partial";
        persist();
      }
      if (state && (state.status === "completed" || state.current_screen === "idle")) persist();
    });
  }

  /* Load only widget CSS on embeds; do not load the demo host stylesheet. */
  function ensureWidgetStylesheet() {
    var stylesheetUrl = resolveDataUrl("styles.css");
    var normalizedTarget;
    try {
      normalizedTarget = new URL(stylesheetUrl, document.baseURI).href.split("#")[0].split("?")[0];
    } catch (e) {
      normalizedTarget = stylesheetUrl.split("#")[0].split("?")[0];
    }

    var links = document.querySelectorAll('link[rel="stylesheet"][href]');
    for (var i = 0; i < links.length; i += 1) {
      try {
        var existingUrl = new URL(links[i].getAttribute("href"), document.baseURI).href;
        existingUrl = existingUrl.split("#")[0].split("?")[0];
        if (existingUrl === normalizedTarget) return;
      } catch (e) { /* Ignore malformed unrelated links. */ }
    }

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheetUrl;
    link.setAttribute("data-ecoleadbot-styles", "true");
    (document.head || document.documentElement).appendChild(link);
  }

  // Экспорт чистых функций для автотестов (Node). В браузере не мешает.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      validateContact: validateContact,
      digitsCount: digitsCount,
      formatPhone: formatPhone,
      digitsOnly: digitsOnly,
      WIDGET_VERSION: WIDGET_VERSION,
      IS_TEST_BUILD: IS_TEST_BUILD,
      createDefaultV14Fields: createDefaultV14Fields,
      ensureV14State: ensureV14State,
      ensureAnswers: ensureAnswers,
      resolveMiniZones: resolveMiniZones,
      mapLegacyObjectFeatures: mapLegacyObjectFeatures,
      getObjectSignalById: getObjectSignalById
    };
  }

  // Инициализация только в браузере (наличие document).
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
