  /* -----------------------------------------------------------------------
     11. POPUP OPEN / CLOSE
     ----------------------------------------------------------------------- */
  function openPopup(entryType, trigger, options) {
    options = options || {};
    var shouldResume = options.resume !== false;
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return; // уже открыт

    if (typeof hideExitBanner === "function") hideExitBanner();

    // entry_type только из допустимых значений схемы Этапа 4 §6.4
    var allowed = ["floating_widget", "inline_cta", "auto_popup", "exit_popup", "scroll_popup", "direct"];
    state.entry_type = allowed.indexOf(entryType) !== -1 ? entryType : "direct";
    state.popup_trigger = trigger || "";
    persist();

    overlay.classList.remove("ecoleadbot-hidden");
    // двойной rAF для плавного появления
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add("is-visible"); });
    });
    document.body.style.overflow = "hidden";
    track("widget_opened", { entry_type: state.entry_type });

    if (entryType === "inline_cta") track("inline_cta_clicked");
    track("popup_shown", { trigger: state.popup_trigger });

    if (shouldResume) {
      routeOnOpen();
    } else {
      // Auto-open must not surface a saved mid-flow screen. Render only the
      // current UI as intro, then restore the resumable cursor for persistence.
      var resumeScreen = state.current_screen;
      var resumeIndex = state.question_index;
      renderIntro();
      state.current_screen = resumeScreen;
      state.question_index = resumeIndex;
      persist();
    }
  }

  function closePopup() {
    if (!overlay) return;
    overlay.classList.remove("is-visible");
    document.body.style.overflow = "";
    setTimeout(function () { overlay.classList.add("ecoleadbot-hidden"); }, 200);

    // cooldown только если не завершено/не отправлено
    if (state.status !== "completed" && !isAlreadySubmitted()) {
      state.popup_closed_at = now();
      if (state.status === "started" && Object.keys(state.answers || {}).length === 0) {
        // не трогаем статус
      } else if (state.status !== "completed") {
        state.status = "partial";
      }
    }
    persist();
    track("popup_closed");
  }

  /* Куда вести при открытии popup */
  function routeOnOpen() {
    // Session resume (Frontend §19): продолжить с последнего экрана
    if (state.current_screen === "question" && Object.keys(state.answers || {}).length > 0) {
      migrateLegacyMainAnswers();
      syncMainFlowStateFromAnswers();
      renderQuestion(clampQuestionIndex(state.question_index));
      return;
    }
    if (state.current_screen === "document_directions") {
      ensureCatalogThen(renderDocumentDirections);
      return;
    }
    if (state.current_screen === "document_nvos_filter") {
      ensureCatalogThen(renderDocumentNvosFilter);
      return;
    }
    if (state.current_screen === "document_services") {
      ensureCatalogThen(renderDocumentServices);
      return;
    }
    if (state.current_screen === "document_registry") {
      ensureCatalogThen(renderDocumentRegistryOnAccount);
      return;
    }
    if (state.current_screen === "document_nvos_category") {
      ensureCatalogThen(renderDocumentNvosCategory);
      return;
    }
    if (state.current_screen === "document_sites") {
      ensureCatalogThen(renderDocumentSites);
      return;
    }
    if (state.current_screen === "document_qualification") {
      ensureCatalogThen(renderDocumentQualification);
      return;
    }
    if (state.current_screen === "service_gate") {
      var gateRestore = SERVICE_GATE_DEFS[state.last_service_gate_id];
      if (gateRestore) { renderServiceGate(gateRestore); return; }
      ensureCatalogThen(renderDocumentServices);
      return;
    }
    if (state.current_screen === "client_gate") {
      var clientGateRestore = CLIENT_GATE_DEFS[state.last_client_gate_id];
      if (clientGateRestore) { renderClientGate(clientGateRestore); return; }
      renderClientTerms();
      return;
    }
    if (state.current_screen === "client_terms") { renderClientTerms(); return; }
    if (state.current_screen === "document_error") { renderDocumentCatalogError(); return; }
    if (state.current_screen === "document_interest") {
      state.flow = "document";
      ensureCatalogThen(renderDocumentDirections);
      return;
    }
    if (state.current_screen === "rag_loading") {
      /* In-flight fetch does not survive close/reload — re-submit saved question. */
      if ((state.rag_question || "").trim()) {
        submitRagQuestion(state.rag_question, state.rag_entry_type || "rag_question");
      } else {
        renderRagQuestion();
      }
      return;
    }
    if (state.current_screen === "rag_no_answer") { renderRagNoAnswer(); return; }
    if (state.current_screen === "rag_error") { renderRagTechnicalError(); return; }
    if (state.current_screen === "loading") { renderContact(); return; }
    if (state.current_screen === "error") { renderError(false); return; }
    if (state.current_screen === "contact_blocked") { renderContactBlocked(); return; }
    if (state.current_screen === "rag_question") { renderRagQuestion(); return; }
    if (state.current_screen === "rag_answer") { renderRagAnswer(); return; }
    if (state.current_screen === "rag_success") { renderRagSuccess(); return; }
    if (state.current_screen === "mini_teaser") { renderMiniResultTeaser(); return; }
    if (state.current_screen === "mini_result") { renderMiniResult(); return; }
    if (state.current_screen === "contact") {
      if (isAlreadySubmitted()) { renderContactBlocked(); return; }
      if (!state.client_terms_ok) { renderClientTerms(); return; }
      renderContact();
      return;
    }
    if (state.current_screen === "success") { renderFinal(); return; }

    renderIntro();
  }
