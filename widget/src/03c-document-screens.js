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

