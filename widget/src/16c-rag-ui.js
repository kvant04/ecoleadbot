  /* -----------------------------------------------------------------------
     13b2. RAG UI SCREENS
     ----------------------------------------------------------------------- */
  /** Порог свёртки длинного ответа (символы plain text). */
  var RAG_ANSWER_COLLAPSE_CHARS = 700;

  /**
   * Если ответ длинный — свернуть с кнопкой «Показать полностью» / «Свернуть».
   * Полный текст остаётся в DOM; обрезка только визуальная (CSS max-height).
   */
  function mountRagAnswerExpand(screen, answerDiv) {
    var plain = String(state.rag_answer || answerDiv.textContent || "").trim();
    if (plain.length <= RAG_ANSWER_COLLAPSE_CHARS) return;

    answerDiv.classList.add("is-collapsed");
    var toggle = el("button", "ecoleadbot-rag-expand", "Показать полностью");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", function () {
      var expanded = answerDiv.classList.contains("is-expanded");
      if (expanded) {
        answerDiv.classList.remove("is-expanded");
        answerDiv.classList.add("is-collapsed");
        toggle.textContent = "Показать полностью";
        toggle.setAttribute("aria-expanded", "false");
      } else {
        answerDiv.classList.remove("is-collapsed");
        answerDiv.classList.add("is-expanded");
        toggle.textContent = "Свернуть";
        toggle.setAttribute("aria-expanded", "true");
      }
    });
    screen.appendChild(toggle);
  }

  function renderRagQuestion() {
    setScreen("rag_question");
    hideProgress();
    scrollBodyTop();
    track("rag_question_viewed");

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    screen.appendChild(el("h2", "ecoleadbot-title", "Есть вопрос?"));
    screen.appendChild(el("p", "ecoleadbot-subtitle",
      "Отвечу на основании базы знаний и нормативных документов. " +
      "Если вопрос сложный — предложу консультацию специалиста."));

    var field = el("div", "ecoleadbot-field");
    var textarea = el("textarea", "ecoleadbot-textarea ecoleadbot-rag-input");
    textarea.id = "eco-rag-question";
    textarea.placeholder = "Например: нужно ли делать ПЭК для небольшого производства?";
    textarea.maxLength = 1500;
    textarea.value = state.rag_question || "";
    field.appendChild(textarea);
    screen.appendChild(field);

    var actions = el("div", "ecoleadbot-intro__actions");
    var submit = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Получить ответ");
    submit.type = "button";
    submit.addEventListener("click", function () {
      var q = textarea.value.trim();
      if (!q) {
        textarea.classList.add("is-error");
        return;
      }
      textarea.classList.remove("is-error");
      submitRagQuestion(q);
    });
    actions.appendChild(submit);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
    textarea.focus();
  }

  function renderRagLoading() {
    setScreen("rag_loading");
    hideProgress();
    scrollBodyTop();
    var screen = el("div", "ecoleadbot-screen ecoleadbot-loading");
    prependBackButton(screen);
    var msgText = state.rag_entry_type === "podrobnee"
      ? "Составляю подробный ответ…"
      : "Составляю ответ…";
    var msg = el("div", "", msgText);
    screen.insertAdjacentHTML("beforeend",
      '<div class="ecoleadbot-spinner" aria-hidden="true"></div>');
    screen.appendChild(msg);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function retryRagQuestion() {
    if ((state.rag_question || "").trim()) {
      submitRagQuestion(state.rag_question, state.rag_entry_type || "rag_question");
      return;
    }
    renderRagQuestion();
  }

  function submitRagQuestion(questionText, entryType, podrobneeTemplateKey) {
    state.rag_question = questionText;
    state.rag_entry_type = entryType || state.rag_entry_type || "rag_question";
    state.rag_from_template = false;
    state.rag_answer_html = "";
    state.rag_podrobnee_template_key = podrobneeTemplateKey || state.rag_podrobnee_template_key || "";
    persist();
    renderRagLoading();
    track("rag_question_submitted", {
      session_id: state.session_id,
      rag_entry_type: state.rag_entry_type
    });

    var ragBody = {
      question: questionText,
      session_id: state.session_id,
      page_url: location.href,
      page_title: document.title || "",
      page_type: detectPageType()
    };
    if (state.rag_entry_type === "podrobnee") {
      ragBody.quiz_context = buildQuizContextForRag();
    }

    var ragController = typeof AbortController !== "undefined" ? new AbortController() : null;
    var ragTimeoutId = null;
    var ragTimeoutMs = ECOLEADBOT_CONFIG.ragFetchTimeoutMs || 90000;
    if (ragController) {
      ragTimeoutId = setTimeout(function () {
        try { ragController.abort(); } catch (e) { /* ignore */ }
      }, ragTimeoutMs);
    }

    fetch(getRagApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ragBody),
      signal: ragController ? ragController.signal : undefined
    }).then(function (res) {
      if (ragTimeoutId) clearTimeout(ragTimeoutId);
      if (res.status === 429) {
        state.rag_error_kind = "rate_limit";
        persist();
        track("rag_answer_error", { session_id: state.session_id, error_kind: "rate_limit" });
        renderRagTechnicalError();
        return null;
      }
      return res.json().then(function (data) {
        return { httpStatus: res.status, data: data };
      }).catch(function () {
        return { httpStatus: res.status, data: null };
      });
    }).then(function (wrapped) {
      if (!wrapped) return;
      var data = wrapped.data;
      if (!data || data.status !== "ok" || wrapped.httpStatus >= 400) {
        state.rag_error_kind = "technical";
        persist();
        track("rag_answer_error", {
          session_id: state.session_id,
          error_kind: "http_" + wrapped.httpStatus
        });
        renderRagTechnicalError();
        return;
      }
      var answerText = data.answer || "";
      var tplKey = (state.rag_podrobnee_template_key || "").replace(/^podrobnee\//, "");
      if (state.rag_entry_type === "podrobnee") {
        answerText = maybeAppendKoapToAnswer(answerText, tplKey || "default", data.confidence || "");
      }
      state.rag_answer = answerText;
      state.rag_answer_html = markdownToDisplayHtml(answerText);
      state.rag_answer_summary = summarizeRagAnswer(state.rag_answer);
      state.rag_assistant_recommendation = data.assistant_recommendation || "";
      state.rag_confidence = data.confidence || "";
      state.rag_sources = Array.isArray(data.sources) ? data.sources : [];
      state.rag_sources_titles = state.rag_sources.map(function (s) {
        return s.title || s.file_name || "";
      }).filter(function (t) { return !!t; });
      state.rag_es_signal = data.es_signal || "неизвестно";
      persist();
      if (isRagNoAnswerResponse(data)) {
        state.rag_error_kind = "no_answer";
        persist();
        track("rag_no_answer", {
          session_id: state.session_id,
          recommendation: state.rag_assistant_recommendation
        });
        renderRagNoAnswer();
        return;
      }
      state.rag_error_kind = "";
      persist();
      track("rag_answer_received", {
        session_id: state.session_id,
        recommendation: state.rag_assistant_recommendation
      });
      renderRagAnswer();
    }).catch(function (err) {
      if (ragTimeoutId) clearTimeout(ragTimeoutId);
      var aborted = err && (err.name === "AbortError" || err.code === 20);
      state.rag_error_kind = aborted ? "timeout" : "technical";
      persist();
      track("rag_answer_error", {
        session_id: state.session_id,
        error_kind: aborted ? "timeout" : "technical"
      });
      renderRagTechnicalError();
    });
  }

  function renderRagAnswer() {
    setScreen("rag_answer");
    hideProgress();
    scrollBodyTop();
    track("rag_answer_viewed", { rag_entry_type: state.rag_entry_type || "" });

    var isPodrobnee = state.rag_entry_type === "podrobnee";
    var rec = state.rag_assistant_recommendation;
    var showConsultCta = rec === "offer_consultation" || rec === "insufficient_info";

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);
    var answerTitle = isPodrobnee
      ? ("Подробнее: " + (state.mini_zone_rag_title || "оценка"))
      : "Ответ";
    /* escapeHtml: title may include zone name from JSON config via state.mini_zone_rag_title */
    screen.appendChild(el("h2", "ecoleadbot-title", escapeHtml(answerTitle)));
    var answerDiv = el("div", "ecoleadbot-rag-answer");
    if (!state.rag_answer_html && state.rag_answer) {
      state.rag_answer_html = markdownToDisplayHtml(state.rag_answer);
      persist();
    }
    if (state.rag_answer_html) {
      answerDiv.innerHTML = state.rag_answer_html;
    } else {
      answerDiv.textContent = state.rag_answer || "";
    }
    screen.appendChild(answerDiv);
    /* Длинный ответ: свёрнутый превью + «Показать полностью» (вариант C). */
    mountRagAnswerExpand(screen, answerDiv);

    if (state.rag_from_template) {
      var tplNote = el("p", "ecoleadbot-rag-template-note", "Готовый экспертный текст по вашим ответам");
      screen.appendChild(tplNote);
    }

    /* Источники — только test build (?elb_test=1 / localhost); в prod UI не показываем. */
    if (IS_TEST_BUILD && state.rag_sources && state.rag_sources.length) {
      var sourcesWrap = el("div", "ecoleadbot-rag-sources");
      var sourcesTitle = state.rag_sources.length > 1 ? "Источники:" : "Источник:";
      sourcesWrap.appendChild(el("div", "ecoleadbot-rag-sources__title", sourcesTitle));
      var list = el("ul", "ecoleadbot-rag-sources__list");
      state.rag_sources.forEach(function (source) {
        var line = formatRagSource(source);
        if (line) list.appendChild(el("li", "", escapeHtml(line)));
      });
      sourcesWrap.appendChild(list);
      screen.appendChild(sourcesWrap);
    }

    var actions = el("div", "ecoleadbot-intro__actions");

    if (isPodrobnee) {
      var backBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Вернуться к оценке");
      backBtn.type = "button";
      backBtn.addEventListener("click", function () {
        track("mini_zone_podrobnee_back", { session_id: state.session_id });
        renderMiniResult();
      });
      var consultBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Получить консультацию");
      consultBtn.type = "button";
      consultBtn.addEventListener("click", function () {
        var answers = ensureAnswers();
        answers.help_format = answers.help_format || "консультация специалиста";
        state.previous_screen = "mini_result";
        state.previous_question_index = clampQuestionIndex(state.question_index);
        persist();
        track("mini_zone_podrobnee_contact", { session_id: state.session_id });
        proceedToContact();
      });
      actions.appendChild(backBtn);
      actions.appendChild(consultBtn);
      screen.appendChild(actions);
      bodyEl.innerHTML = "";
      bodyEl.appendChild(screen);
      return;
    }

    screen.appendChild(el("p", "ecoleadbot-subtitle ecoleadbot-rag-feedback", "Это помогло ответить на ваш вопрос?"));

    actions.innerHTML = "";
    var yesBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Да, помогло");
    yesBtn.type = "button";
    yesBtn.addEventListener("click", function () {
      track("rag_feedback_positive", { session_id: state.session_id });
      renderRagSuccess();
    });
    var specialistLabel = showConsultCta ? "Лучше уточнить у специалиста" : "Хочу уточнить у специалиста";
    var specialistBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", specialistLabel);
    specialistBtn.type = "button";
    specialistBtn.addEventListener("click", goToContactFromRag);
    actions.appendChild(yesBtn);
    actions.appendChild(specialistBtn);

    appendHomeButton(actions, true);

    screen.appendChild(actions);
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderRagSuccess() {
    setScreen("rag_success");
    hideProgress();
    scrollBodyTop();

    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);
    screen.appendChild(el("h2", "ecoleadbot-title", "Спасибо! Рад, что удалось помочь."));

    var actions = el("div", "ecoleadbot-intro__actions");
    var againBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Задать ещё вопрос");
    againBtn.type = "button";
    againBtn.addEventListener("click", function () {
      state.rag_answer = "";
      state.rag_answer_summary = "";
      state.rag_assistant_recommendation = "";
      state.rag_confidence = "";
      state.rag_sources = [];
      state.rag_sources_titles = [];
      persist();
      renderRagQuestion();
    });
    actions.appendChild(againBtn);
    appendHomeButton(actions, false);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderRagNoAnswer() {
    setScreen("rag_no_answer");
    hideProgress();
    scrollBodyTop();
    track("rag_no_answer_viewed", { rag_entry_type: state.rag_entry_type || "" });

    var screen = el("div", "ecoleadbot-screen ecoleadbot-state ecoleadbot-state--no-answer");
    prependBackButton(screen);
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-state__icon" aria-hidden="true">📚</div>' +
      '<h2 class="ecoleadbot-title">В базе пока нет готового ответа</h2>' +
      '<p class="ecoleadbot-subtitle">По этому вопросу нет подходящих материалов в нашей базе знаний. ' +
      'Можете задать другой вопрос или оставить заявку — специалист ответит лично.</p>';
    screen.appendChild(body);

    if (state.rag_question) {
      var qWrap = el("div", "ecoleadbot-rag-no-answer__question");
      qWrap.appendChild(el("div", "ecoleadbot-rag-no-answer__label", "Ваш вопрос:"));
      qWrap.appendChild(el("div", "ecoleadbot-rag-no-answer__text", escapeHtml(state.rag_question)));
      screen.appendChild(qWrap);
    }

    var actions = el("div", "ecoleadbot-intro__actions");
    var retry = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Задать другой вопрос");
    retry.type = "button";
    retry.addEventListener("click", retryRagQuestion);
    var contact = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Связаться со специалистом");
    contact.type = "button";
    contact.addEventListener("click", function () {
      if (state.rag_entry_type === "podrobnee") {
        state.previous_screen = "mini_result";
        state.previous_question_index = clampQuestionIndex(state.question_index);
        persist();
      }
      goToContactFromRag();
    });
    actions.appendChild(retry);
    actions.appendChild(contact);
    appendHomeButton(actions, false);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderRagTechnicalError() {
    setScreen("rag_error");
    hideProgress();
    scrollBodyTop();
    track("rag_technical_error_viewed", { rag_entry_type: state.rag_entry_type || "" });

    var isTimeout = state.rag_error_kind === "timeout";
    var isRateLimit = state.rag_error_kind === "rate_limit";
    var subtitle = isTimeout
      ? "Ответ занимает слишком много времени. Попробуйте ещё раз или оставьте заявку — специалист свяжется с вами."
      : isRateLimit
        ? "Слишком много запросов подряд. Подождите минуту и попробуйте снова или оставьте заявку специалисту."
        : "Произошла техническая ошибка при обращении к ассистенту. Попробуйте ещё раз через минуту или оставьте заявку — специалист свяжется с вами.";

    var screen = el("div", "ecoleadbot-screen ecoleadbot-state ecoleadbot-state--technical");
    prependBackButton(screen);
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-state__icon" aria-hidden="true">⚠️</div>' +
      '<h2 class="ecoleadbot-title">Не удалось получить ответ</h2>' +
      '<p class="ecoleadbot-subtitle">' + escapeHtml(subtitle) + "</p>";
    screen.appendChild(body);

    var actions = el("div", "ecoleadbot-intro__actions");
    var retry = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Попробовать ещё раз");
    retry.type = "button";
    retry.addEventListener("click", retryRagQuestion);
    var contact = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Связаться со специалистом");
    contact.type = "button";
    contact.addEventListener("click", function () {
      if (state.rag_entry_type === "podrobnee") {
        state.previous_screen = "mini_result";
        state.previous_question_index = clampQuestionIndex(state.question_index);
        persist();
      }
      goToContactFromRag();
    });
    actions.appendChild(retry);
    actions.appendChild(contact);
    appendHomeButton(actions, false);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderRagError() {
    renderRagTechnicalError();
  }
