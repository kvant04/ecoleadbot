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
  var WIDGET_VERSION = "1.5.51";

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
