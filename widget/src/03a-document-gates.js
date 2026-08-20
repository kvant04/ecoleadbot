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

