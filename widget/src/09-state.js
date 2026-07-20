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
      rag_answer_summary: "",
      rag_assistant_recommendation: "",
      rag_confidence: "",
      rag_sources: [],
      rag_sources_titles: [],
      rag_es_signal: "",
      rag_entry_type: "",
      rag_error_kind: "",
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

