  /* -----------------------------------------------------------------------
     11b. NAVIGATION (Scope Freeze v1.3.2)
     ----------------------------------------------------------------------- */
  function resetFlowToHome() {
    track("flow_reset_home", { session_id: state.session_id });
    renderIntro();
  }

  /* v1.4: ветка «конкретная услуга» — направления и услуги из catalogV14 (фаза 1: навигация). */
  function openDocumentBranch() {
    state.flow = "document";
    state.selected_direction = "";
    state.selected_service_id = "";
    state.document_nvos_registry = "";
    resetQualForDocumentDirectionChange();
    track("document_branch_opened", { session_id: state.session_id });
    if (!isCatalogReady()) {
      renderDocumentCatalogError();
      return;
    }
    renderDocumentDirections();
  }

  function startMainFlow() {
    state.flow = "main";
    state.rag_entry_type = "";
    migrateLegacyMainAnswers();
    track("main_flow_started", { session_id: state.session_id });
    function run() { startFlow(); }
    if (isCatalogReady()) {
      run();
      return;
    }
    loadV14Data().then(run).catch(run);
  }

  function openRagEntry(entryType) {
    state.flow = "rag";
    state.rag_entry_type = entryType || "question_link";
    track("rag_entry_opened", { session_id: state.session_id, rag_entry_type: state.rag_entry_type });
    renderRagQuestion();
  }

  function navigateBackFromContact() {
    var prev = state.previous_screen || "intro";
    if (prev === "client_terms") { renderClientTerms(); return; }
    if (prev === "rag_answer") { renderRagAnswer(); return; }
    if (prev === "rag_no_answer") { renderRagNoAnswer(); return; }
    if (prev === "rag_error") { renderRagTechnicalError(); return; }
    if (prev === "rag_question") { renderRagQuestion(); return; }
    if (prev === "document_qualification") { renderDocumentQualification(); return; }
    if (prev === "document_sites") { renderDocumentSites(); return; }
    if (prev === "document_nvos_category") { renderDocumentNvosCategory(); return; }
    if (prev === "document_registry") { renderDocumentRegistryOnAccount(); return; }
    if (prev === "document_services") { renderDocumentServices(); return; }
    if (prev === "document_directions") { renderDocumentDirections(); return; }
    if (prev === "mini_result") { renderMiniResult(); return; }
    if (prev === "mini_teaser") { renderMiniResultTeaser(); return; }
    if (prev === "question") {
      var idx = state.previous_question_index != null
        ? state.previous_question_index
        : clampQuestionIndex(state.question_index);
      renderQuestion(idx);
      return;
    }
    resetFlowToHome();
  }

  function navigateBackFromClientTerms() {
    var prev = state.before_client_terms_screen || state.previous_screen || "intro";
    state.before_client_terms_screen = "";
    persist();
    if (prev === "rag_answer") { renderRagAnswer(); return; }
    if (prev === "rag_no_answer") { renderRagNoAnswer(); return; }
    if (prev === "rag_error") { renderRagTechnicalError(); return; }
    if (prev === "rag_question") { renderRagQuestion(); return; }
    if (prev === "document_qualification") { renderDocumentQualification(); return; }
    if (prev === "document_sites") { renderDocumentSites(); return; }
    if (prev === "document_nvos_category") { renderDocumentNvosCategory(); return; }
    if (prev === "document_registry") { renderDocumentRegistryOnAccount(); return; }
    if (prev === "document_services") { renderDocumentServices(); return; }
    if (prev === "document_directions") { renderDocumentDirections(); return; }
    if (prev === "mini_result") { renderMiniResult(); return; }
    if (prev === "mini_teaser") { renderMiniResultTeaser(); return; }
    if (prev === "question") {
      var idx = state.previous_question_index != null
        ? state.previous_question_index
        : clampQuestionIndex(state.question_index);
      renderQuestion(idx);
      return;
    }
    resetFlowToHome();
  }

  /** Единая кнопка «← Назад» — возврат на предыдущий экран в любом сценарии. */
  function goBack() {
    var screen = state.current_screen;

    if (screen === "intro") {
      closePopup();
      return;
    }
    if (screen === "service_gate") {
      var prevGate = state.previous_screen || "document_services";
      if (prevGate === "client_terms") { renderClientTerms(); return; }
      if (prevGate === "document_qualification") { renderDocumentQualification(); return; }
      if (prevGate === "document_nvos_category") { renderDocumentNvosCategory(); return; }
      if (prevGate === "document_sites") { renderDocumentSites(); return; }
      if (prevGate === "document_registry") { renderDocumentRegistryOnAccount(); return; }
      if (prevGate === "contact") { renderClientTerms(); return; }
      renderDocumentServices();
      return;
    }
    if (screen === "client_gate") {
      renderClientTerms();
      return;
    }
    if (screen === "client_terms") {
      state.client_terms_ok = false;
      persist();
      navigateBackFromClientTerms();
      return;
    }
    if (screen === "question") {
      var prevQ = prevVisibleIndex(state.question_index);
      if (prevQ !== -1) renderQuestion(prevQ);
      else renderIntro();
      return;
    }
    if (screen === "document_directions" || screen === "document_error") {
      renderIntro();
      return;
    }
    if (screen === "document_nvos_filter") {
      renderDocumentDirections();
      return;
    }
    if (screen === "document_services") {
      if (state.selected_direction === "nvos") renderDocumentNvosFilter();
      else renderDocumentDirections();
      return;
    }
    if (goBackDocumentBranchScreen()) return;
    if (screen === "mini_teaser") {
      var prevStep = prevVisibleIndex(MAIN_FLOW_STEPS.length);
      if (prevStep !== -1) renderQuestion(prevStep);
      else renderIntro();
      return;
    }
    if (screen === "mini_result") {
      renderMiniResultTeaser();
      return;
    }
    if (screen === "rag_question") {
      renderIntro();
      return;
    }
    if (screen === "rag_loading" || screen === "rag_error" || screen === "rag_no_answer") {
      if (state.rag_entry_type === "podrobnee") {
        renderMiniResult();
        return;
      }
      renderRagQuestion();
      return;
    }
    if (screen === "rag_answer") {
      if (state.rag_entry_type === "podrobnee") {
        renderMiniResult();
        return;
      }
      renderRagQuestion();
      return;
    }
    if (screen === "rag_success") {
      renderRagAnswer();
      return;
    }
    if (screen === "contact") {
      navigateBackFromContact();
      return;
    }
    if (screen === "contact_blocked" || screen === "success") {
      renderIntro();
      return;
    }
    if (screen === "loading" || screen === "error") {
      renderContact();
      return;
    }
    renderIntro();
  }

  function prependBackButton(screen) {
    var back = el("button", "ecoleadbot-back", "← Назад");
    back.type = "button";
    back.addEventListener("click", goBack);
    if (screen.firstChild) screen.insertBefore(back, screen.firstChild);
    else screen.appendChild(back);
    return back;
  }

  function appendHomeButton(container, useGhost) {
    var cls = useGhost
      ? "ecoleadbot-btn ecoleadbot-btn--ghost ecoleadbot-btn--block"
      : "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block";
    var btn = el("button", cls, "В начало");
    btn.type = "button";
    btn.addEventListener("click", resetFlowToHome);
    container.appendChild(btn);
    return btn;
  }

  function appendPostSubmitNavActions(container) {
    var ragBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Есть вопрос?");
    ragBtn.type = "button";
    ragBtn.addEventListener("click", openRagEntry);
    container.appendChild(ragBtn);
    appendHomeButton(container, false);
  }

  function clampQuestionIndex(idx) {
    if (idx < 0) idx = 0;
    if (idx > MAIN_FLOW_STEPS.length - 1) idx = MAIN_FLOW_STEPS.length - 1;
    if (!isMainStepVisible(MAIN_FLOW_STEPS[idx])) {
      var prev = prevVisibleIndex(idx);
      return prev === -1 ? firstVisibleIndex() : prev;
    }
    return idx;
  }

  function setProgress(currentQuestionId) {
    var vis = visibleQuestions();
    var pos = 0;
    for (var i = 0; i < vis.length; i++) { if (vis[i].id === currentQuestionId) { pos = i + 1; break; } }
    var total = vis.length;
    progressEl.classList.remove("ecoleadbot-hidden");
    progressFill.style.width = total ? (pos / total * 100) + "%" : "0%";
    progressMeta.textContent = "Шаг " + pos + " из " + total;
  }
  function hideProgress() { progressEl.classList.add("ecoleadbot-hidden"); }

  function scrollBodyTop() { if (bodyEl) bodyEl.scrollTop = 0; }

