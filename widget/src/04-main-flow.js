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

