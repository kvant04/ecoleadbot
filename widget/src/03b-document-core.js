  /* -----------------------------------------------------------------------
     1c2. DOCUMENT BRANCH CORE (steps, qual helpers)
     ----------------------------------------------------------------------- */
  function needsDocumentRegistryQuestion(svc) {
    return !!(svc && svc.registry_instead_of_category === true);
  }

  function needsDocumentNvosCategory(svc) {
    if (!svc) return false;
    if (svc.needs_nvos_category_in_branch === true) return true;
    return false;
  }

  function hasDocumentNvosCategoryAnswer() {
    var qa = state.qualification_answers || {};
    return !!(state.nvos_category || (state.answers && state.answers.nvos_category) || qa.nvos_category);
  }

  function hasDocumentSitesAnswer() {
    var qa = state.qualification_answers || {};
    return !!(state.sites_count || (state.answers && state.answers.sites_count) || qa.sites_count || qa.eco_sites);
  }

  function needsDocumentSites(svc) {
    if (!svc) return false;
    if (svc.skip_sites_in_branch === true) return false;
    return true;
  }

  function getDocumentBranchSteps(svc) {
    if (!svc) return ["contact"];
    var steps = [];
    if (needsDocumentRegistryQuestion(svc)) steps.push("registry");
    if (needsDocumentNvosCategory(svc)) steps.push("nvos_category");
    if (needsDocumentSites(svc)) steps.push("sites");
    if (getServiceQualificationQuestions(svc).length) steps.push("qualification");
    steps.push("contact");
    return steps;
  }

  function documentStepToScreen(stepId) {
    if (stepId === "registry") return "document_registry";
    if (stepId === "nvos_category") return "document_nvos_category";
    if (stepId === "sites") return "document_sites";
    if (stepId === "qualification") return "document_qualification";
    return "contact";
  }

  function getPreviousDocumentBranchStep(currentStepId) {
    var svc = getServiceById(state.selected_service_id);
    var steps = getDocumentBranchSteps(svc);
    var idx = steps.indexOf(currentStepId);
    if (idx <= 0) return null;
    return steps[idx - 1];
  }

  function advanceDocumentBranch(afterStepId) {
    var svc = getServiceById(state.selected_service_id);
    var steps = getDocumentBranchSteps(svc);
    var idx = afterStepId ? steps.indexOf(afterStepId) : -1;
    var next = steps[idx + 1] || "contact";
    if (next === "contact") {
      var gate = evaluateServiceGate(svc);
      if (gate) {
        var prevStep = idx >= 0 ? steps[idx] : "document_services";
        showServiceGate(gate, documentStepToScreen(prevStep));
        return;
      }
      var prevStep = idx >= 0 ? steps[idx] : "document_services";
      state.previous_screen = documentStepToScreen(prevStep);
      if (state.previous_screen === "contact") state.previous_screen = "document_services";
      persist();
      proceedToContact();
      return;
    }
    if (next === "registry") renderDocumentRegistryOnAccount();
    else if (next === "nvos_category") renderDocumentNvosCategory();
    else if (next === "sites") renderDocumentSites();
    else if (next === "qualification") renderDocumentQualification();
  }

  function startDocumentBranchAfterService() {
    state.previous_screen = "document_services";
    persist();
    advanceDocumentBranch(null);
  }

  function getNvosListGroup(svc) {
    if (!svc) return "standalone";
    if (svc.id === "postanovka-nvos") return "first";
    if (svc.service_type === "complex") return "complex";
    if (svc.service_type === "bridge") return "bridge";
    return "standalone";
  }

  function getNvosGroupOrder(registry) {
    if (registry === "Да") return ["standalone", "complex", "first", "bridge"];
    if (registry === "Нет") return ["first", "standalone", "complex", "bridge"];
    return ["first", "standalone", "complex", "bridge"];
  }

  function getServiceQualificationQuestions(svc) {
    if (!svc || !Array.isArray(svc.qualification_questions)) return [];
    var out = [];
    svc.qualification_questions.forEach(function (q) {
      if (!q || !q.id) return;
      if (DOCUMENT_QUAL_SKIP_IDS[q.id]) return;
      if ((q.id === "nvos_registry" || q.id === "nvos_registry_status" || q.id === "plata_on_registry") &&
          state.document_nvos_registry) return;
      if (q.id === "eco_on_registry" && state.document_nvos_registry) return;
      if (q.id === "pek_nvos_cat" && hasDocumentNvosCategoryAnswer()) return;
      if (q.id === "nvos_category" && hasDocumentNvosCategoryAnswer()) return;
      if (q.id === "sites_count" && hasDocumentSitesAnswer()) return;
      if (q.id === "eco_sites" && hasDocumentSitesAnswer()) return;
      out.push(q);
    });
    return out.slice(0, 3);
  }

  function hasDocumentQualificationStep() {
    var svc = state.selected_service_id ? getServiceById(state.selected_service_id) : null;
    return getServiceQualificationQuestions(svc).length > 0;
  }

  function resolveNvosCategory() {
    var a = state.answers || {};
    var qa = state.qualification_answers || {};
    return String(
      state.nvos_category || a.nvos_category || qa.nvos_category || qa.pek_nvos_cat || ""
    ).trim();
  }

  function resolveSitesCount() {
    var a = state.answers || {};
    var qa = state.qualification_answers || {};
    return String(
      state.sites_count || a.sites_count || qa.sites_count || qa.eco_sites || ""
    ).trim();
  }

  function syncObjectFieldsFromQual() {
    var answers = ensureAnswers();
    var nvos = resolveNvosCategory();
    var sites = resolveSitesCount();
    if (nvos) {
      state.nvos_category = nvos;
      answers.nvos_category = nvos;
    }
    if (sites) {
      state.sites_count = sites;
      answers.sites_count = sites;
    }
  }

  function buildQualQuestionLabelMap() {
    var map = {};
    if (qualQuestionLabelsRu && typeof qualQuestionLabelsRu === "object") {
      Object.keys(qualQuestionLabelsRu).forEach(function (id) {
        map[id] = qualQuestionLabelsRu[id];
      });
    }
    if (catalogV14 && catalogV14.question_templates) {
      Object.keys(catalogV14.question_templates).forEach(function (tid) {
        var t = catalogV14.question_templates[tid];
        if (t && t.id) map[t.id] = t.text || t.id;
      });
    }
    if (catalogV14 && Array.isArray(catalogV14.services)) {
      catalogV14.services.forEach(function (svc) {
        (svc.qualification_questions || []).forEach(function (q) {
          if (q && q.id) map[q.id] = q.text || q.id;
        });
      });
    }
    return map;
  }

  function getQualQuestionLabel(questionId, labelMap) {
    if (labelMap && labelMap[questionId]) return labelMap[questionId];
    if (qualQuestionLabelsRu && qualQuestionLabelsRu[questionId]) {
      return qualQuestionLabelsRu[questionId];
    }
    return "Дополнительный вопрос";
  }

  function isLatinSlug(text) {
    return /^[a-z0-9_]+$/i.test(String(text || ""));
  }

  function getClarifyQualAllowlist() {
    var allowed = {};
    getClarifyBlocks(getActiveObjectSignals()).forEach(function (b) {
      if (b && b.id) allowed[b.id] = true;
    });
    return allowed;
  }

  function getAllowedQualIdsForCurrentPath() {
    var allowed = getClarifyQualAllowlist();
    var svc = state.selected_service_id ? getServiceById(state.selected_service_id) : null;
    if (svc) {
      getServiceQualificationQuestions(svc).forEach(function (q) {
        if (q && q.id) allowed[q.id] = true;
      });
      (DOCUMENT_SERVICE_IMPLICIT_QUAL[svc.id] || []).forEach(function (qid) {
        allowed[qid] = true;
      });
    }
    return allowed;
  }

  function pruneQualificationAnswers(allowedMap) {
    var qa = ensureQualificationAnswers();
    Object.keys(qa).forEach(function (k) {
      if (!allowedMap[k]) delete qa[k];
    });
    state.qualification_answers = qa;
    persist();
  }

  function resetQualForDocumentDirectionChange() {
    pruneQualificationAnswers(getClarifyQualAllowlist());
  }

  function resetQualForDocumentServiceChange(serviceId) {
    var allowed = getClarifyQualAllowlist();
    var svc = getServiceById(serviceId);
    if (svc) {
      getServiceQualificationQuestions(svc).forEach(function (q) {
        if (q && q.id) allowed[q.id] = true;
      });
      (DOCUMENT_SERVICE_IMPLICIT_QUAL[svc.id] || []).forEach(function (qid) {
        allowed[qid] = true;
      });
    }
    pruneQualificationAnswers(allowed);
  }

  function getFilteredQualificationAnswersObject() {
    var qa = state.qualification_answers || {};
    var allowed = getAllowedQualIdsForCurrentPath();
    var out = {};
    Object.keys(qa).forEach(function (k) {
      if (BITRIX_OBJECT_FIELD_QUAL_IDS[k]) return;
      if (!allowed[k]) return;
      var v = qa[k];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
      out[k] = v;
    });
    return out;
  }

  var NVOS_CATEGORY_OPTIONS = ["I", "II", "III", "IV", "Не знаю"];
  var SITES_COUNT_OPTIONS = ["1", "2–3", "4 и более", "Не знаю"];
  var REGISTRY_ON_ACCOUNT_OPTIONS = ["Да", "Нет", "Не знаю"];

  function qualBlockType(block) {
    if (!block) return "single";
    if (block.type === "multi" || block.type === "multiple") return "multi";
    if (block.type === "text") return "text";
    return "single";
  }

  function getQualBlockValue(block, answersNow, screenEl) {
    if (qualBlockType(block) === "text") {
      var ta = screenEl.querySelector('textarea[data-question-id="' + block.id + '"]');
      return ta ? ta.value.trim() : "";
    }
    return answersNow[block.id];
  }

  function isQualAnswerValid(block, val) {
    var t = qualBlockType(block);
    if (t === "text") return !!String(val || "").trim();
    if (t === "multi") return Array.isArray(val) && val.length > 0;
    return !!val;
  }

  /**
   * Проверка блоков qual/clarify; подсветка секций и подсказка у «Далее».
   * saveTextAnswers(saveFn) — опционально сохранить text-ответы при успехе.
   */
  function validateQualBlocks(screenEl, blocks, answersNow, opts) {
    opts = opts || {};
    var allOk = true;
    var firstBad = null;
    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b];
      var section = screenEl.querySelector('[data-qual-block="' + blk.id + '"]');
      var val = getQualBlockValue(blk, answersNow, screenEl);
      var ok = isQualAnswerValid(blk, val);
      if (section) section.classList.toggle("ecoleadbot-clarify-block--error", !ok);
      if (qualBlockType(blk) === "text") {
        var ta = screenEl.querySelector('textarea[data-question-id="' + blk.id + '"]');
        if (ta) ta.classList.toggle("is-error", !ok);
      }
      if (!ok) {
        allOk = false;
        if (!firstBad) firstBad = section;
      } else if (qualBlockType(blk) === "text" && opts.saveTextAnswer) {
        opts.saveTextAnswer(blk.id, val);
      }
    }
    if (opts.nextBtn) opts.nextBtn.classList.toggle("is-error", !allOk);
    if (opts.hintEl) {
      opts.hintEl.textContent = allOk ? "" : (opts.hintText || "Выберите ответ на все вопросы");
      opts.hintEl.classList.toggle("ecoleadbot-hidden", allOk);
    }
    if (!allOk && firstBad && firstBad.scrollIntoView) {
      firstBad.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    return allOk;
  }

  function clearQualValidationUi(screenEl) {
    if (!screenEl) return;
    screenEl.querySelectorAll(".ecoleadbot-clarify-block--error").forEach(function (el) {
      el.classList.remove("ecoleadbot-clarify-block--error");
    });
    var hint = screenEl.querySelector(".ecoleadbot-actions__hint");
    if (hint) {
      hint.textContent = "";
      hint.classList.add("ecoleadbot-hidden");
    }
    var btn = screenEl.querySelector(".ecoleadbot-actions .ecoleadbot-btn");
    if (btn) btn.classList.remove("is-error");
  }

  function ensureQualificationAnswers() {
    if (!state.qualification_answers || typeof state.qualification_answers !== "object" ||
        Array.isArray(state.qualification_answers)) {
      state.qualification_answers = {};
    }
    return state.qualification_answers;
  }

  /** Guarantees state.answers is a plain object (restored/partial sessions may omit it). */
  function ensureAnswers() {
    if (!state.answers || typeof state.answers !== "object" || Array.isArray(state.answers)) {
      state.answers = {};
    }
    return state.answers;
  }

  function saveDocumentQualAnswer(questionId, value) {
    var qa = ensureQualificationAnswers();
    if (value === "" || value == null || (Array.isArray(value) && value.length === 0)) {
      delete qa[questionId];
    } else {
      qa[questionId] = value;
    }
    state.qualification_answers = qa;
    if (questionId === "sites_count" || questionId === "eco_sites") {
      state.sites_count = value || "";
      ensureAnswers().sites_count = value || "";
    }
    persist();
  }

  /** Синхронизирует галочки/точки во всех карточках одного вопроса. */
  function optionCardMark(qType, isSel) {
    return qType === "multi" ? (isSel ? "✓" : "") : (isSel ? "●" : "");
  }

  function isOptionSelected(selected, opt, qType) {
    if (qType === "multi") {
      return Array.isArray(selected) && selected.indexOf(opt) !== -1;
    }
    return selected === opt;
  }

  function syncOptionCardsUi(container, blockId, qType, answersObj) {
    if (!container || !answersObj) return;
    var selected = answersObj[blockId];
    var cards = container.querySelectorAll(".ecoleadbot-card[data-qual-option]");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var opt = card.getAttribute("data-qual-option");
      if (opt == null) continue;
      var isSel = isOptionSelected(selected, opt, qType);
      card.classList.toggle("is-selected", isSel);
      var check = card.querySelector(".ecoleadbot-card__check");
      if (check) check.textContent = optionCardMark(qType, isSel);
    }
  }

  /**
   * Группа карточек одного вопроса (single / multi).
   * getAnswers() — актуальный объект ответов; setAnswer(id, value) — сохранение.
   */
  function wireOptionCardsGroup(params) {
    var container = params.container;
    var blockId = params.blockId;
    var qType = params.qType === "multi" ? "multi" : "single";
    var options = params.options || [];
    var getAnswers = params.getAnswers;
    var setAnswer = params.setAnswer;
    var compact = !!params.compact;
    var onAnswerChange = params.onAnswerChange;
    var cardCls = compact
      ? "ecoleadbot-card ecoleadbot-card--compact"
      : "ecoleadbot-card";

    container.setAttribute("data-qual-block-id", blockId);

    options.forEach(function (opt) {
      var card = el("button", cardCls);
      card.type = "button";
      var answers = getAnswers();
      var isSel = isOptionSelected(answers[blockId], opt, qType);
      if (isSel) card.classList.add("is-selected");
      card.innerHTML =
        '<span class="ecoleadbot-card__check" aria-hidden="true">' +
        optionCardMark(qType, isSel) + "</span>" +
        "<span>" + escapeHtml(opt) + "</span>";
      card.setAttribute("data-qual-option", opt);

      card.addEventListener("click", function () {
        var ans = getAnswers();
        var current = ans[blockId];
        if (qType === "multi") {
          var arr = Array.isArray(current) ? current.slice() : [];
          var pos = arr.indexOf(opt);
          if (pos === -1) arr.push(opt); else arr.splice(pos, 1);
          setAnswer(blockId, arr);
        } else if (current === opt) {
          setAnswer(blockId, "");
        } else {
          setAnswer(blockId, opt);
        }
        syncOptionCardsUi(container, blockId, qType, getAnswers());
        if (onAnswerChange) onAnswerChange();
      });
      container.appendChild(card);
    });

    syncOptionCardsUi(container, blockId, qType, getAnswers());
  }

  function setDocumentBranchPreviousScreen(currentStepId) {
    var prev = getPreviousDocumentBranchStep(currentStepId);
    state.previous_screen = prev ? documentStepToScreen(prev) : "document_services";
    persist();
  }

  function goBackDocumentBranchScreen() {
    var stepByScreen = {
      document_registry: "registry",
      document_nvos_category: "nvos_category",
      document_sites: "sites",
      document_qualification: "qualification"
    };
    var currentStep = stepByScreen[state.current_screen];
    if (!currentStep) return false;
    var prev = getPreviousDocumentBranchStep(currentStep);
    if (!prev) {
      renderDocumentServices();
      return true;
    }
    if (prev === "registry") renderDocumentRegistryOnAccount();
    else if (prev === "nvos_category") renderDocumentNvosCategory();
    else if (prev === "sites") renderDocumentSites();
    else if (prev === "qualification") renderDocumentQualification();
    return true;
  }

  function setClarifyAnswer(questionId, value) {
    var answers = ensureAnswers();
    if (value === "" || value == null || (Array.isArray(value) && value.length === 0)) {
      delete answers[questionId];
      if (state.qualification_answers) delete state.qualification_answers[questionId];
    } else {
      answers[questionId] = value;
      ensureQualificationAnswers()[questionId] = value;
    }
    persist();
  }

