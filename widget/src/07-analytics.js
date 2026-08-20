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
