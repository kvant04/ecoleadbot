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
        if (key === "object_signal_uncertain") return;
        if (key === "activity_type" || key === "service_title") return;
        var line = fieldLine(key);
        if (line) lines.push(line);
      });
      if (lines.length > 1) parts.push(lines.join("\n"));
    });

    return parts.join("\n\n");
  }

  function goToContactFromRag() {
    state.answers.help_format = "консультация специалиста";
    if (!state.rag_entry_type) state.rag_entry_type = "rag_question";
    state.previous_screen = state.current_screen || (state.rag_answer ? "rag_answer" : "rag_question");
    persist();
    track("rag_contact_requested", { session_id: state.session_id });
    proceedToContact();
  }

