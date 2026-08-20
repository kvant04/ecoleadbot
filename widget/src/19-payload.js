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

