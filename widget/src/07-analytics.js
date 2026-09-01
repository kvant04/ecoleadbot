  /* -----------------------------------------------------------------------
     5. ANALYTICS (Frontend §36)
     Никаких ПДн в console (Security §44). Пушим только событие + безопасные поля.
     ----------------------------------------------------------------------- */
  var METRIKA_GOALS = {
    widget_opened: "ecoleadbot_widget_opened",
    quiz_started: "ecoleadbot_quiz_started",
    mini_result_viewed: "ecoleadbot_mini_result_viewed",
    contact_form_viewed: "ecoleadbot_contact_form_viewed",
    lead_submitted: "ecoleadbot_lead_submitted",
    rag_question_submitted: "ecoleadbot_rag_question_submitted"
  };

  var METRIKA_PENDING_GOALS = {};
  var METRIKA_RETRY_TIMER = null;
  var METRIKA_RETRY_ATTEMPTS = 0;
  var METRIKA_RETRY_DELAYS = [500, 1000, 1500];

  function fireMetrikaGoal(goalName) {
    var counterId = Number(ECOLEADBOT_CONFIG.yandexMetrikaCounterId);
    if (!counterId) return false;

    try {
      // XOR: modern API wins when present; never call both APIs for one track.
      if (typeof window.ym === "function") {
        window.ym(counterId, "reachGoal", goalName);
        return true;
      }

      var classicCounter = window["yaCounter" + counterId];
      if (classicCounter && typeof classicCounter.reachGoal === "function") {
        classicCounter.reachGoal(goalName);
        return true;
      }
    } catch (e) { /* Metrika failures must never break the widget. */ }
    return false;
  }

  function drainMetrikaPendingGoals() {
    Object.keys(METRIKA_PENDING_GOALS).forEach(function (goalName) {
      if (fireMetrikaGoal(goalName)) delete METRIKA_PENDING_GOALS[goalName];
    });
    return Object.keys(METRIKA_PENDING_GOALS).length === 0;
  }

  function scheduleMetrikaRetry() {
    if (METRIKA_RETRY_TIMER || !Object.keys(METRIKA_PENDING_GOALS).length) return;
    if (drainMetrikaPendingGoals()) {
      METRIKA_RETRY_ATTEMPTS = 0;
      return;
    }
    if (METRIKA_RETRY_ATTEMPTS >= METRIKA_RETRY_DELAYS.length) {
      // Avoid an unbounded queue when Metrika is blocked or absent.
      METRIKA_PENDING_GOALS = {};
      METRIKA_RETRY_ATTEMPTS = 0;
      return;
    }
    var delay = METRIKA_RETRY_DELAYS[METRIKA_RETRY_ATTEMPTS++];
    METRIKA_RETRY_TIMER = window.setTimeout(function () {
      METRIKA_RETRY_TIMER = null;
      scheduleMetrikaRetry();
    }, delay);
  }

  function queueMetrikaGoal(goalName) {
    if (fireMetrikaGoal(goalName)) return;
    METRIKA_PENDING_GOALS[goalName] = true;
    scheduleMetrikaRetry();
  }

  function track(event, data) {
    window.dataLayer = window.dataLayer || [];
    var payload = { event: "ecoleadbot_" + event };
    if (data) {
      Object.keys(data).forEach(function (k) { payload[k] = data[k]; });
    }
    window.dataLayer.push(payload);

    var goalName = METRIKA_GOALS[event];
    if (goalName) queueMetrikaGoal(goalName);
  }
