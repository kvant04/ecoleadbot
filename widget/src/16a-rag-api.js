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
