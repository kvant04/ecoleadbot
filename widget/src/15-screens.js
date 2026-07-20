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
      var selected = state.answers[q.id];
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
        var sel = q.id === "object_signals" ? state.object_signals : state.answers[q.id];
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
    state.answers.object_signals = arr;
    persist();
    syncObjectSignalCardsUi(optionsWrap);
  }

  function selectSingle(q, opt, index) {
    state.answers[q.id] = opt;
    syncMainFlowAnswerFields(q.id, opt);
    persist();
    advanceFromQuestion(index);
  }

  function toggleMultiple(q, opt, optionsWrap) {
    var arr = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
    var pos = arr.indexOf(opt);
    if (pos === -1) arr.push(opt); else arr.splice(pos, 1);
    state.answers[q.id] = arr;
    persist();
    syncOptionCardsUi(optionsWrap, q.id, "multi", state.answers);
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
      "Оставьте контакты — специалист уточнит детали по вашему объекту"
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

    var checklistTitle = el("h4", "ecoleadbot-mini-card__subtitle", "Для подготовки к разговору с нашим специалистом");
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
      appendMiniResultValueBlock(screen);
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

