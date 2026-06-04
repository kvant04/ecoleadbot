/* =========================================================================
   EcoLeadBot — Frontend MVP
   Реализация строго по документам:
     - Этап 1  MVP Scope Freeze v1.2 FINAL
     - Этап 2  UX Wireframe Specification v2.1 CLEAN
     - Этап 3  Frontend Technical Specification v1.1 FINAL
     - Этап 4  n8n Workflow Architecture FINAL (источник вопросов и payload)
     - Change Log v1
   На реальном сайте файл подключается как один скрипт (widget.js) —
   он сам строит floating widget, inline CTA и popup.
   ========================================================================= */
(function () {
  "use strict";

  /* -----------------------------------------------------------------------
     1. CONFIGURATION (Frontend Spec §35, §45)
     ----------------------------------------------------------------------- */
  var ECOLEADBOT_CONFIG = {
    webhookUrl: "https://n8n.ecolusspb.ru/webhook/ecoleadbot",
    popupDelayMs: 45000,
    cooldownMinutes: 60,
    antiDuplicateMinutes: 60,
    sessionTtlDays: 180,
    enableInlineCta: true,
    enableFloatingWidget: true,
    enableAutoPopup: true,
    scrollDepthTrigger: 0.5,
    loadingMinMs: 700
  };

  var STORAGE_KEY = "ecoleadbot_session";

  /* -----------------------------------------------------------------------
     2. QUESTION ARCHITECTURE v1.0 (n8n Этап 4 §14)
     6 основных вопросов + 1 условный (sites_count).
     ----------------------------------------------------------------------- */
  var QUESTIONS = [
    {
      id: "object_type",
      type: "single",
      title: "Что ближе всего к вашей компании?",
      options: [
        "Производство", "Склад", "Стройка", "Автосервис / СТО", "Автомойка",
        "Магазин / торговля", "Офис", "ЖКХ", "Сельхоз", "Другое"
      ]
    },
    {
      id: "object_features",
      type: "multiple",
      title: "Что у вас остаётся после работы?",
      options: [
        "Мусор и упаковка", "Масла / ветошь", "Выбросы в воздух",
        "Сброс воды", "Не знаю", "Ничего из этого"
      ]
    },
    {
      id: "ecology_responsible",
      type: "single",
      title: "Кто сейчас занимается экологией?",
      options: ["Штатный эколог", "Бухгалтер", "Директор", "Охрана труда", "Подрядчик", "Никто"]
    },
    {
      id: "main_situation",
      type: "single",
      title: "Что сейчас происходит?",
      options: [
        "Не знаем что нужно сдавать", "Нужно сделать документ",
        "Проверка или предписание", "Хотим навести порядок", "Пока изучаем"
      ]
    },
    {
      id: "urgency",
      type: "single",
      title: "Когда хотите решить вопрос?",
      options: ["Срочно", "В течение месяца", "В течение квартала", "В этом году", "Пока изучаем"]
    },
    {
      id: "help_format",
      type: "single",
      title: "Что было бы для вас удобнее?",
      options: [
        "Разобраться самому",
        "Чтобы специалист подсказал, что нужно",
        "Чтобы специалист сделал конкретный документ",
        "Чтобы кто-то полностью занимался экологией",
        "Пока не решили"
      ]
    },
    {
      id: "sites_count",
      type: "single",
      conditional: true,
      title: "Сколько у вас площадок?",
      options: ["1", "2-3", "4+"]
    }
  ];

  /* Условие показа sites_count (n8n §14: производство, выбросы/сбросы,
     высокая неопределённость). */
  function sitesCountApplicable(answers) {
    var f = answers.object_features || [];
    return answers.object_type === "Производство" ||
      f.indexOf("Выбросы в воздух") !== -1 ||
      f.indexOf("Сброс воды") !== -1 ||
      answers.main_situation === "Не знаем что нужно сдавать" ||
      answers.main_situation === "Проверка или предписание";
  }

  function isQuestionVisible(q, answers) {
    if (!q.conditional) return true;
    if (q.id === "sites_count") return sitesCountApplicable(answers);
    return true;
  }

  /* -----------------------------------------------------------------------
     3. CONTENT (UX Этап 2)
     ----------------------------------------------------------------------- */
  var HEADLINES = {
    headline_a: "Проверьте за 2 минуты: грозит ли вам штраф",
    headline_b: "Есть ли у вас риск штрафа? Проверка за 2 минуты",
    headline_c: "Штраф до 500 000 ₽ — проверьте, касается ли это вас"
  };

  var MINI_RESULT = {
    simple: "Обычно таким компаниям требуется: учёт отходов, экологическая отчётность, контроль обязательных документов.",
    complex: "Похоже, потребуется более детальная проверка ситуации. Для таких объектов часто требуется консультация эколога.",
    high_es: "Во многих компаниях подобные задачи удобнее передать специалистам, чтобы не держать всё в голове самим."
  };

  /* CR-005: Secondary CTA «Нужен конкретный документ».
     Один дополнительный экран «Что вас интересует?» (без проф. терминов,
     без списка услуг). Первые 5 вариантов → сохраняем answers.document_interest
     и сразу к Contact Screen. «unknown» → сохраняем "unknown" и открываем
     основной стандартный qualification flow.
     Это информационный признак: НЕ влияет на scoring / priority / route / ES. */
  var DOCUMENT_INTEREST_OPTIONS = [
    { value: "reporting", label: "Отчётность" },
    { value: "waste", label: "Отходы" },
    { value: "emissions", label: "Выбросы в воздух" },
    { value: "water_subsoil", label: "Сбросы воды / скважина / недра" },
    { value: "inspection", label: "Проверка / штраф" },
    { value: "unknown", label: "Не знаю, что именно нужно" }
  ];

  /* Медиа-кнопки финального экрана (UX §14 — 6 кнопок) */
  var MEDIA_BUTTONS = [
    { label: "Telegram", url: "https://t.me/ecolusspb" },
    { label: "YouTube", url: "https://www.youtube.com/@ecolusspb" },
    { label: "Дзен", url: "https://dzen.ru/ecolusspb" },
    { label: "eCompass", url: "https://ecolusspb.ru/subscribe/" },
    { label: "RuTube", url: "https://rutube.ru/channel/31793215/" },
    { label: "VK Видео", url: "https://vkvideo.ru/@ecolusspb" }
  ];

  /* -----------------------------------------------------------------------
     4. UTILITIES
     ----------------------------------------------------------------------- */
  function now() { return Date.now(); }

  function isoNow() {
    var d = new Date();
    var tz = -d.getTimezoneOffset();
    var sign = tz >= 0 ? "+" : "-";
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var abs = Math.abs(tz);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
      sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }

  function randToken(len) {
    var s = "";
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function makeSessionId() {
    return "eco_" + Math.floor(now() / 1000) + "_" + randToken(8);
  }

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function detectDevice() {
    var w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  function detectBrowser() {
    var ua = navigator.userAgent;
    if (/YaBrowser/i.test(ua)) return "Yandex";
    if (/Edg/i.test(ua)) return "Edge";
    if (/OPR|Opera/i.test(ua)) return "Opera";
    if (/Firefox/i.test(ua)) return "Firefox";
    if (/Chrome/i.test(ua)) return "Chrome";
    if (/Safari/i.test(ua)) return "Safari";
    return "Other";
  }

  function detectPageType() {
    if (document.querySelector(".article-content, .news-detail, .detail_text, article")) return "seo_article";
    if (document.querySelector(".service-page, [data-page='service']")) return "service_page";
    if (document.querySelector("[data-page='landing']")) return "landing";
    if (location.pathname === "/" || location.pathname === "") return "homepage";
    return "other";
  }

  function parseUtm() {
    var params = new URLSearchParams(location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    var out = {};
    keys.forEach(function (k) { out[k] = params.get(k) || ""; });
    return out;
  }

  function digitsCount(str) { return (String(str).match(/\d/g) || []).length; }

  // Только цифры из строки (без +, пробелов, скобок, дефисов).
  function digitsOnly(str) { return (String(str).match(/\d/g) || []).join(""); }

  // Визуальная маска телефона. Российские номера форматируются как
  // +7 (999) 999-99-99, прочие — как международные (+цифры, до 15).
  // Без сторонних библиотек.
  function formatPhone(value) {
    var d = digitsOnly(value);
    if (!d) return "";
    if (d.charAt(0) === "8") d = "7" + d.slice(1);          // 8XXX -> 7XXX
    else if (d.charAt(0) === "9") d = "7" + d;              // 9XX… (RU моб. без кода) -> 7 9XX…
    if (d.charAt(0) === "7") {
      d = d.slice(0, 11);                                   // 7 + 10 цифр
      var rest = d.slice(1);
      var out = "+7";
      if (rest.length > 0) out += " (" + rest.slice(0, 3);
      if (rest.length >= 3) out += ")";
      if (rest.length > 3) out += " " + rest.slice(3, 6);
      if (rest.length > 6) out += "-" + rest.slice(6, 8);
      if (rest.length > 8) out += "-" + rest.slice(8, 10);
      return out;
    }
    return "+" + d.slice(0, 15);                            // международный
  }

  /* -----------------------------------------------------------------------
     5. ANALYTICS (Frontend §36)
     Никаких ПДн в console (Security §44). Пушим только событие + безопасные поля.
     ----------------------------------------------------------------------- */
  function track(event, data) {
    window.dataLayer = window.dataLayer || [];
    var payload = { event: "ecoleadbot_" + event };
    if (data) {
      Object.keys(data).forEach(function (k) { payload[k] = data[k]; });
    }
    window.dataLayer.push(payload);
  }

  /* -----------------------------------------------------------------------
     6. SESSION STORAGE (Frontend §17–19, TTL §18 = 180 дней)
     ----------------------------------------------------------------------- */
  var Session = {
    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        var ttlMs = ECOLEADBOT_CONFIG.sessionTtlDays * 24 * 60 * 60 * 1000;
        if (!data.saved_at || (now() - data.saved_at) > ttlMs) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
        return data;
      } catch (e) { return null; }
    },
    save: function (data) {
      try {
        data.saved_at = now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) { /* приватный режим / переполнение — игнорируем */ }
    },
    clear: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }
  };

  /* -----------------------------------------------------------------------
     7. STATE
     ----------------------------------------------------------------------- */
  var state = null;

  function initState() {
    var saved = Session.load();
    var utm = parseUtm();
    if (saved && saved.session_id) {
      state = saved;
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
      entry_page_type: detectPageType()
    };
    Session.save(state);
  }

  function persist() { Session.save(state); }

  function isAlreadySubmitted() {
    if (!state.already_submitted_at) return false;
    var windowMs = ECOLEADBOT_CONFIG.antiDuplicateMinutes * 60 * 1000;
    return (now() - state.already_submitted_at) < windowMs;
  }

  function inCooldown() {
    if (!state.popup_closed_at) return false;
    var windowMs = ECOLEADBOT_CONFIG.cooldownMinutes * 60 * 1000;
    return (now() - state.popup_closed_at) < windowMs;
  }

  /* -----------------------------------------------------------------------
     8. DOM REFERENCES
     ----------------------------------------------------------------------- */
  var root, widgetBtn, overlay, popup, bodyEl, progressEl, progressFill, progressMeta;
  var autoPopupTimer = null;
  var autoTriggerUsed = false;

  /* -----------------------------------------------------------------------
     9. BUILD STATIC DOM
     ----------------------------------------------------------------------- */
  function buildDom() {
    root = el("div", "ecoleadbot-root");

    // Floating widget
    if (ECOLEADBOT_CONFIG.enableFloatingWidget) {
      widgetBtn = el("button", "ecoleadbot-widget");
      widgetBtn.type = "button";
      widgetBtn.setAttribute("aria-label", "Проверить экологические риски");
      widgetBtn.innerHTML = '<span class="ecoleadbot-widget__icon" aria-hidden="true">🌱</span>' +
        '<span>Проверить экологические риски</span>';
      widgetBtn.addEventListener("click", function () { openPopup("floating_widget", "widget_click"); });
      root.appendChild(widgetBtn);
      track("widget_loaded");
    }

    // Overlay + popup
    overlay = el("div", "ecoleadbot-overlay ecoleadbot-hidden");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closePopup();
    });

    popup = el("div", "ecoleadbot-popup");

    var closeBtn = el("button", "ecoleadbot-close", "×");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Закрыть");
    closeBtn.addEventListener("click", closePopup);
    popup.appendChild(closeBtn);

    progressEl = el("div", "ecoleadbot-progress ecoleadbot-hidden");
    progressEl.innerHTML =
      '<div class="ecoleadbot-progress__track"><div class="ecoleadbot-progress__fill"></div></div>' +
      '<div class="ecoleadbot-progress__meta"><span class="ecoleadbot-progress__step"></span>' +
      '<span>Проверка займёт около 2 минут</span></div>';
    popup.appendChild(progressEl);
    progressFill = progressEl.querySelector(".ecoleadbot-progress__fill");
    progressMeta = progressEl.querySelector(".ecoleadbot-progress__step");

    bodyEl = el("div", "ecoleadbot-body");
    popup.appendChild(bodyEl);

    overlay.appendChild(popup);
    root.appendChild(overlay);

    document.body.appendChild(root);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.classList.contains("ecoleadbot-hidden")) closePopup();
    });
  }

  /* -----------------------------------------------------------------------
     10. INLINE CTA (UX §4.2 / Frontend §11–12)
     ----------------------------------------------------------------------- */
  function ctaTemplate() {
    var wrap = el("div", "ecoleadbot-inline-cta");
    wrap.innerHTML =
      '<div class="ecoleadbot-inline-cta__title">⚠️ Не уверены, всё ли у вас в порядке по экологии?</div>' +
      '<div>Проверьте за 2 минуты:</div>' +
      '<ul class="ecoleadbot-inline-cta__list">' +
      '<li>какие документы обычно нужны;</li>' +
      '<li>есть ли риск штрафов;</li>' +
      '<li>что стоит проверить в первую очередь.</li>' +
      '</ul>' +
      '<button type="button" class="ecoleadbot-inline-cta__btn">Проверить объект</button>';
    wrap.querySelector("button").addEventListener("click", function () {
      openPopup("inline_cta", "cta_click");
    });
    return wrap;
  }

  function insertInlineCta() {
    if (!ECOLEADBOT_CONFIG.enableInlineCta) return;
    var selectors = [".article-content", ".news-detail", ".detail_text", ".content", "article"];
    var container = null;
    for (var i = 0; i < selectors.length; i++) {
      container = document.querySelector(selectors[i]);
      if (container) break;
    }
    if (!container) return;

    var paragraphs = container.querySelectorAll("p");
    if (!paragraphs.length) return;

    // длина текста
    var total = 0;
    for (var p = 0; p < paragraphs.length; p++) total += paragraphs[p].textContent.length;
    if (total < 800) return; // не вставлять CTA в короткий контент (Frontend §12)

    var t1 = total * 0.28; // после 25–30% текста
    var t2 = total * 0.85; // ближе к концу
    var acc = 0, inserted1 = false, inserted2 = false, viewed = false;

    for (var j = 0; j < paragraphs.length; j++) {
      acc += paragraphs[j].textContent.length;
      if (!inserted1 && acc >= t1) {
        paragraphs[j].insertAdjacentElement("afterend", ctaTemplate());
        inserted1 = true;
      } else if (inserted1 && !inserted2 && acc >= t2) {
        paragraphs[j].insertAdjacentElement("afterend", ctaTemplate());
        inserted2 = true;
      }
    }
    if (inserted1) track("inline_cta_viewed");
  }

  /* -----------------------------------------------------------------------
     11. POPUP OPEN / CLOSE
     ----------------------------------------------------------------------- */
  function openPopup(entryType, trigger) {
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return; // уже открыт

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

    routeOnOpen();
  }

  function closePopup() {
    if (!overlay) return;
    overlay.classList.remove("is-visible");
    document.body.style.overflow = "";
    setTimeout(function () { overlay.classList.add("ecoleadbot-hidden"); }, 200);

    // cooldown только если не завершено/не отправлено
    if (state.status !== "completed" && !isAlreadySubmitted()) {
      state.popup_closed_at = now();
      if (state.status === "started" && Object.keys(state.answers).length === 0) {
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
    if (isAlreadySubmitted()) { renderAlreadySubmitted(); return; }

    // Session resume (Frontend §19): продолжить с последнего экрана
    if (state.current_screen === "question" && Object.keys(state.answers).length > 0) {
      renderQuestion(clampQuestionIndex(state.question_index));
      return;
    }
    if (state.current_screen === "document_interest") { renderDocumentInterest(); return; }
    if (state.current_screen === "mini_result") { renderMiniResult(); return; }
    if (state.current_screen === "contact") { renderContact(); return; }

    renderIntro();
  }

  function clampQuestionIndex(idx) {
    if (idx < 0) idx = 0;
    if (idx > QUESTIONS.length - 1) idx = QUESTIONS.length - 1;
    // если индекс указывает на скрытый вопрос — найти ближайший видимый
    if (!isQuestionVisible(QUESTIONS[idx], state.answers)) {
      var prev = prevVisibleIndex(idx);
      return prev === -1 ? firstVisibleIndex() : prev;
    }
    return idx;
  }

  /* -----------------------------------------------------------------------
     12. NAVIGATION OVER QUESTIONS
     ----------------------------------------------------------------------- */
  function firstVisibleIndex() {
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (isQuestionVisible(QUESTIONS[i], state.answers)) return i;
    }
    return -1;
  }
  function nextVisibleIndex(from) {
    for (var i = from + 1; i < QUESTIONS.length; i++) {
      if (isQuestionVisible(QUESTIONS[i], state.answers)) return i;
    }
    return -1;
  }
  function prevVisibleIndex(from) {
    for (var i = from - 1; i >= 0; i--) {
      if (isQuestionVisible(QUESTIONS[i], state.answers)) return i;
    }
    return -1;
  }
  function visibleQuestions() {
    return QUESTIONS.filter(function (q) { return isQuestionVisible(q, state.answers); });
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

  /* -----------------------------------------------------------------------
     13. SCREENS
     ----------------------------------------------------------------------- */
  function setScreen(name) {
    state.current_screen = name;
    if (state.status === "started" && (name === "document_interest" || name === "question" || name === "mini_result" || name === "contact")) {
      state.status = "partial";
    }
    persist();
  }

  function renderIntro() {
    setScreen("intro");
    hideProgress();
    scrollBodyTop();
    var headline = HEADLINES[state.headline_variant] || HEADLINES.headline_b;

    var screen = el("div", "ecoleadbot-screen ecoleadbot-intro");
    screen.innerHTML =
      '<h2 class="ecoleadbot-title">' + escapeHtml(headline) + '</h2>' +
      '<p class="ecoleadbot-subtitle">Подскажем:</p>' +
      '<ul class="ecoleadbot-intro__list">' +
      '<li>какие документы обычно нужны;</li>' +
      '<li>что чаще всего проверяют;</li>' +
      '<li>что стоит проверить именно вам.</li>' +
      '</ul>';

    var actions = el("div", "ecoleadbot-intro__actions");
    var primary = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Начать проверку");
    primary.type = "button";
    primary.addEventListener("click", startFlow);

    var secondary = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Нужен конкретный документ");
    secondary.type = "button";
    // CR-005: открывает сокращённый сценарий — экран «Что вас интересует?».
    secondary.addEventListener("click", renderDocumentInterest);

    actions.appendChild(primary);
    actions.appendChild(secondary);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  /* CR-005: экран сокращённого сценария «Что вас интересует?». */
  function renderDocumentInterest() {
    setScreen("document_interest");
    hideProgress();
    scrollBodyTop();
    track("document_interest_viewed");

    var screen = el("div", "ecoleadbot-screen");

    // Назад — возврат к интро-экрану.
    var back = el("button", "ecoleadbot-back", "← Назад");
    back.type = "button";
    back.addEventListener("click", renderIntro);
    screen.appendChild(back);

    screen.appendChild(el("h2", "ecoleadbot-title", "Что вас интересует?"));

    var optionsWrap = el("div", "ecoleadbot-options");
    var selected = state.answers.document_interest;

    DOCUMENT_INTEREST_OPTIONS.forEach(function (opt) {
      var card = el("button", "ecoleadbot-card");
      card.type = "button";
      var isSel = selected === opt.value;
      if (isSel) card.classList.add("is-selected");
      card.innerHTML = '<span class="ecoleadbot-card__check" aria-hidden="true">' + (isSel ? "●" : "") + '</span>' +
        '<span>' + escapeHtml(opt.label) + '</span>';
      card.addEventListener("click", function () { selectDocumentInterest(opt.value); });
      optionsWrap.appendChild(card);
    });
    screen.appendChild(optionsWrap);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function selectDocumentInterest(value) {
    // Сохраняем выбор в answers.document_interest (попадёт в payload.answers).
    state.answers.document_interest = value;
    persist();
    track("document_interest_selected", { document_interest: value });

    if (value === "unknown") {
      // Высокая неопределённость → основной стандартный qualification flow.
      startFlow();
    } else {
      // Конкретный интерес → сразу к экрану контактов.
      renderContact();
    }
  }

  function startFlow() {
    track("quiz_started");
    if (!state.timestamps.started_at) state.timestamps.started_at = isoNow();
    renderQuestion(firstVisibleIndex());
  }

  function renderQuestion(index) {
    if (index < 0) { renderMiniResult(); return; }
    var q = QUESTIONS[index];
    state.question_index = index;
    setScreen("question");
    setProgress(q.id);
    scrollBodyTop();

    var screen = el("div", "ecoleadbot-screen");

    // back button
    var prev = prevVisibleIndex(index);
    if (prev !== -1) {
      var back = el("button", "ecoleadbot-back", "← Назад");
      back.type = "button";
      back.addEventListener("click", function () { renderQuestion(prev); });
      screen.appendChild(back);
    }

    screen.appendChild(el("h2", "ecoleadbot-title", escapeHtml(q.title)));

    var optionsWrap = el("div", "ecoleadbot-options");
    var selected = state.answers[q.id];

    q.options.forEach(function (opt) {
      var card = el("button", "ecoleadbot-card");
      card.type = "button";
      var isSel = q.type === "multiple"
        ? (Array.isArray(selected) && selected.indexOf(opt) !== -1)
        : selected === opt;
      if (isSel) card.classList.add("is-selected");

      var mark = q.type === "multiple" ? (isSel ? "✓" : "") : (isSel ? "●" : "");
      card.innerHTML = '<span class="ecoleadbot-card__check" aria-hidden="true">' + mark + '</span>' +
        '<span>' + escapeHtml(opt) + '</span>';

      card.addEventListener("click", function () {
        if (q.type === "multiple") {
          toggleMultiple(q, opt, card);
        } else {
          selectSingle(q, opt, index);
        }
      });
      optionsWrap.appendChild(card);
    });
    screen.appendChild(optionsWrap);

    // multiple choice — кнопка "Далее" (Frontend §24)
    if (q.type === "multiple") {
      var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
      var nextBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Далее");
      nextBtn.type = "button";
      nextBtn.addEventListener("click", function () {
        var sel = state.answers[q.id];
        if (!Array.isArray(sel) || sel.length === 0) {
          // требуется хотя бы один вариант для обязательного поля
          nextBtn.classList.add("is-error");
          return;
        }
        advanceFromQuestion(index);
      });
      actions.appendChild(nextBtn);
      screen.appendChild(actions);
    }

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function selectSingle(q, opt, index) {
    state.answers[q.id] = opt;
    persist();
    advanceFromQuestion(index);
  }

  function toggleMultiple(q, opt, card) {
    var arr = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
    var pos = arr.indexOf(opt);
    if (pos === -1) arr.push(opt); else arr.splice(pos, 1);
    state.answers[q.id] = arr;
    persist();
    var sel = arr.indexOf(opt) !== -1;
    card.classList.toggle("is-selected", sel);
    card.querySelector(".ecoleadbot-card__check").textContent = sel ? "✓" : "";
  }

  function advanceFromQuestion(index) {
    track("question_answered", { question_id: QUESTIONS[index].id });
    var next = nextVisibleIndex(index);
    if (next === -1) { renderMiniResult(); }
    else { renderQuestion(next); }
  }

  function pickMiniResultType() {
    var a = state.answers;
    if (sitesCountApplicable(a) || a.sites_count === "2-3" || a.sites_count === "4+") return "complex";
    if (a.help_format === "Чтобы кто-то полностью занимался экологией" || a.ecology_responsible === "Никто") return "high_es";
    return "simple";
  }

  function renderMiniResult() {
    setScreen("mini_result");
    hideProgress();
    scrollBodyTop();
    track("mini_result_viewed");

    var type = pickMiniResultType();
    var screen = el("div", "ecoleadbot-screen");
    screen.innerHTML =
      '<h2 class="ecoleadbot-title">Предварительный результат</h2>' +
      '<div class="ecoleadbot-result">' + escapeHtml(MINI_RESULT[type]) + '</div>';

    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    var btn = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Получить рекомендации");
    btn.type = "button";
    btn.addEventListener("click", renderContact);
    actions.appendChild(btn);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  /* -----------------------------------------------------------------------
     14. CONTACT VALIDATION (чистая функция, без DOM — тестируется отдельно)
     Правила (Frontend §27–30 + уточнения):
       - name: обязателен;
       - phone: только цифры, минимум 10;
       - do_not_call=true: нужен метод WhatsApp/Telegram; телефон всё равно обязателен;
       - метод Telegram: ник обязателен, формат @username (после @ ≥5 симв., [A-Za-z0-9_]);
       - метод WhatsApp: telegram не нужен (используется phone_or_whatsapp).
     ----------------------------------------------------------------------- */
  function validateContact(data) {
    var errors = {};
    var name = (data.name || "").trim();
    var digits = digitsOnly(data.phone || "");
    var telegram = (data.telegram || "").trim();
    var dnc = !!data.do_not_call;
    var method = dnc ? (data.method || "") : "phone";
    var consent = !!data.consent;
    var normalizedTelegram = "";

    // Имя — обязательно.
    if (!name) errors.name = "Укажите имя";

    // Телефон обязателен ВСЕГДА (MVP-контракт: name + phone_or_whatsapp).
    // Только цифры, от 10 до 15.
    if (digits.length < 10 || digits.length > 15) {
      errors.phone = "Введите корректный номер телефона";
    }

    if (dnc) {
      if (method !== "whatsapp" && method !== "telegram") {
        errors.method = "Выберите, куда вам написать: WhatsApp или Telegram.";
      } else if (method === "telegram") {
        // Telegram обязателен при способе связи Telegram: формат @username.
        var tg = telegram;
        if (tg && tg.charAt(0) !== "@") tg = "@" + tg; // нормализуем к @username
        if (!/^@[A-Za-z0-9_]{5,}$/.test(tg)) {
          errors.telegram = "Введите Telegram в формате @username";
        } else {
          normalizedTelegram = tg;
        }
      }
    }

    // Согласие на обработку ПДн — обязательно для отправки.
    if (!consent) errors.consent = "Подтвердите согласие на обработку персональных данных";

    return {
      ok: Object.keys(errors).length === 0,
      errors: errors,
      method: method,
      telegram: normalizedTelegram, // непусто только если метод telegram и ник валиден
      phoneDigits: digits
    };
  }

  /* -----------------------------------------------------------------------
     14b. CONTACT SCREEN (UX §11 / Frontend §27–30)
     Email исключён (решение по противоречию №3).
     ----------------------------------------------------------------------- */
  function renderContact() {
    setScreen("contact");
    hideProgress();
    scrollBodyTop();
    track("contact_form_viewed");

    var c = state.contact || {};
    var screen = el("div", "ecoleadbot-screen");
    screen.innerHTML =
      '<h2 class="ecoleadbot-title">Оставьте контакты</h2>' +
      '<p class="ecoleadbot-subtitle">Подготовим рекомендации по вашему объекту.</p>' +

      '<div class="ecoleadbot-field">' +
        '<label class="ecoleadbot-label" for="eco-name">Имя</label>' +
        '<input class="ecoleadbot-input" id="eco-name" type="text" autocomplete="name" value="' + escapeHtml(c.name || "") + '" />' +
        '<div class="ecoleadbot-error ecoleadbot-hidden" data-err="name"></div>' +
      '</div>' +

      '<div class="ecoleadbot-field">' +
        '<label class="ecoleadbot-label" for="eco-phone">Телефон для звонка / WhatsApp</label>' +
        '<input class="ecoleadbot-input" id="eco-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (999) 999-99-99" value="' + escapeHtml(formatPhone(c.phone_or_whatsapp || "")) + '" />' +
        '<p class="ecoleadbot-hint ecoleadbot-hidden" data-hint="phone-dnc"></p>' +
        '<div class="ecoleadbot-error ecoleadbot-hidden" data-err="phone"></div>' +
      '</div>' +

      '<label class="ecoleadbot-checkbox">' +
        '<input type="checkbox" id="eco-donotcall" ' + (state.do_not_call ? "checked" : "") + ' />' +
        '<span>Не звоните мне</span>' +
      '</label>' +

      '<div class="ecoleadbot-field ecoleadbot-hidden" data-block="prefer">' +
        '<label class="ecoleadbot-label">Как вам написать?</label>' +
        '<div class="ecoleadbot-chips">' +
          '<button type="button" class="ecoleadbot-chip" data-method="whatsapp">WhatsApp</button>' +
          '<button type="button" class="ecoleadbot-chip" data-method="telegram">Telegram</button>' +
        '</div>' +
        '<div class="ecoleadbot-error ecoleadbot-hidden" data-err="method"></div>' +
      '</div>' +

      '<div class="ecoleadbot-field ecoleadbot-hidden" data-block="telegram">' +
        '<label class="ecoleadbot-label" for="eco-tg">Telegram <span class="ecoleadbot-label__opt">(@username или username)</span></label>' +
        '<input class="ecoleadbot-input" id="eco-tg" type="text" value="' + escapeHtml(c.telegram || "") + '" />' +
        '<p class="ecoleadbot-hint">Укажите Telegram, чтобы мы могли написать вам без звонка.</p>' +
        '<div class="ecoleadbot-error ecoleadbot-hidden" data-err="telegram"></div>' +
      '</div>' +

      '<div class="ecoleadbot-field">' +
        '<label class="ecoleadbot-label" for="eco-comment">Комментарий <span class="ecoleadbot-label__opt">(необязательно)</span></label>' +
        '<textarea class="ecoleadbot-textarea" id="eco-comment">' + escapeHtml(c.comment || "") + '</textarea>' +
      '</div>' +

      '<label class="ecoleadbot-checkbox">' +
        '<input type="checkbox" id="eco-consent" ' + (state.consent ? "checked" : "") + ' />' +
        '<span>Я согласен с политикой обработки персональных данных</span>' +
      '</label>';

    var actions = el("div", "ecoleadbot-actions ecoleadbot-actions--sticky");
    var submit = el("button", "ecoleadbot-btn ecoleadbot-btn--primary ecoleadbot-btn--block", "Получить рекомендации");
    submit.type = "button";
    submit.disabled = true; // активируется только когда форма валидна
    actions.appendChild(submit);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);

    // refs
    var nameI = screen.querySelector("#eco-name");
    var phoneI = screen.querySelector("#eco-phone");
    var phoneHint = screen.querySelector('[data-hint="phone-dnc"]');
    var dncI = screen.querySelector("#eco-donotcall");
    var consentI = screen.querySelector("#eco-consent");
    var preferBlock = screen.querySelector('[data-block="prefer"]');
    var tgBlock = screen.querySelector('[data-block="telegram"]');
    var tgI = screen.querySelector("#eco-tg");
    var commentI = screen.querySelector("#eco-comment");
    var chips = screen.querySelectorAll(".ecoleadbot-chip");

    function runValidation() {
      return validateContact({
        name: nameI.value,
        phone: phoneI.value,
        telegram: tgI.value,
        do_not_call: dncI.checked,
        method: state.preferred_contact_method,
        consent: consentI.checked
      });
    }

    // Включает/выключает кнопку отправки по текущей валидности формы.
    function refreshSubmit() {
      submit.disabled = !runValidation().ok;
    }

    function refreshConditional() {
      var dnc = dncI.checked;
      var method = state.preferred_contact_method;
      preferBlock.classList.toggle("ecoleadbot-hidden", !dnc);
      var showTg = dnc && method === "telegram";
      tgBlock.classList.toggle("ecoleadbot-hidden", !showTg);

      // Телефон обязателен ВСЕГДА. Меняется только текст пояснения.
      if (dnc && method === "whatsapp") {
        phoneHint.textContent = "Телефон нужен для WhatsApp. Звонить не будем.";
        phoneHint.classList.remove("ecoleadbot-hidden");
      } else if (dnc && method === "telegram") {
        phoneHint.textContent = "Телефон нужен для карточки обращения. Свяжемся с вами в Telegram.";
        phoneHint.classList.remove("ecoleadbot-hidden");
      } else {
        phoneHint.textContent = "";
        phoneHint.classList.add("ecoleadbot-hidden");
      }

      hideError(screen, "phone"); // сбросить возможную ошибку при смене режима
      refreshSubmit();
    }

    // Маска телефона во время ввода (визуальное форматирование, без библиотек).
    phoneI.addEventListener("input", function () {
      phoneI.value = formatPhone(phoneI.value);
      hideError(screen, "phone");
      refreshSubmit();
    });
    phoneI.addEventListener("blur", function () {
      var r = runValidation();
      if (r.errors.phone) showError(screen, "phone", r.errors.phone);
    });

    nameI.addEventListener("input", function () { hideError(screen, "name"); refreshSubmit(); });
    nameI.addEventListener("blur", function () {
      if (!nameI.value.trim()) showError(screen, "name", "Укажите имя");
    });

    tgI.addEventListener("input", function () { hideError(screen, "telegram"); refreshSubmit(); });
    tgI.addEventListener("blur", function () {
      var r = runValidation();
      if (r.errors.telegram) showError(screen, "telegram", r.errors.telegram);
    });

    consentI.addEventListener("change", function () {
      state.consent = consentI.checked;
      persist();
      refreshSubmit();
    });

    // восстановить выбранный метод
    chips.forEach(function (chip) {
      if (state.do_not_call && chip.getAttribute("data-method") === state.preferred_contact_method) {
        chip.classList.add("is-selected");
      }
      chip.addEventListener("click", function () {
        chips.forEach(function (c2) { c2.classList.remove("is-selected"); });
        chip.classList.add("is-selected");
        state.preferred_contact_method = chip.getAttribute("data-method");
        persist();
        hideError(screen, "method");
        refreshConditional();
      });
    });

    dncI.addEventListener("change", function () {
      state.do_not_call = dncI.checked;
      if (!dncI.checked) {
        state.preferred_contact_method = "phone";
        chips.forEach(function (c2) { c2.classList.remove("is-selected"); });
      }
      persist();
      refreshConditional();
    });

    refreshConditional();

    submit.addEventListener("click", function () {
      if (submit.disabled) return; // защита
      clearErrors(screen);
      var result = runValidation();
      if (!result.ok) {
        Object.keys(result.errors).forEach(function (field) {
          showError(screen, field, result.errors[field]);
        });
        return;
      }

      state.contact = {
        name: nameI.value.trim(),
        // Телефон обязателен всегда — храним только цифры с префиксом +.
        phone_or_whatsapp: "+" + result.phoneDigits,
        // telegram передаём только если заполнен и валиден (иначе пустая строка).
        telegram: result.telegram || "",
        comment: commentI.value.trim()
      };
      state.do_not_call = dncI.checked;
      state.preferred_contact_method = result.method;
      persist();

      submitLead();
    });
  }

  function showError(scope, name, msg) {
    var box = scope.querySelector('[data-err="' + name + '"]');
    if (box) { box.textContent = msg; box.classList.remove("ecoleadbot-hidden"); }
    var input = scope.querySelector("#eco-" + (name === "phone" ? "phone" : name === "telegram" ? "tg" : name));
    if (input) input.classList.add("is-error");
  }
  function clearErrors(scope) {
    scope.querySelectorAll(".ecoleadbot-error").forEach(function (b) { b.classList.add("ecoleadbot-hidden"); b.textContent = ""; });
    scope.querySelectorAll(".is-error").forEach(function (i) { i.classList.remove("is-error"); });
  }
  function hideError(scope, name) {
    var box = scope.querySelector('[data-err="' + name + '"]');
    if (box) { box.classList.add("ecoleadbot-hidden"); box.textContent = ""; }
    var input = scope.querySelector("#eco-" + (name === "phone" ? "phone" : name === "telegram" ? "tg" : name));
    if (input) input.classList.remove("is-error");
  }

  /* -----------------------------------------------------------------------
     15. PAYLOAD (n8n Этап 4 §6.2) + WEBHOOK SUBMIT
     ----------------------------------------------------------------------- */
  function buildPayload() {
    var a = state.answers;
    var answers = {
      object_type: a.object_type,
      object_features: Array.isArray(a.object_features) ? a.object_features : [],
      ecology_responsible: a.ecology_responsible,
      main_situation: a.main_situation,
      urgency: a.urgency,
      help_format: a.help_format
    };
    // sites_count — условный вопрос. В payload передаём всегда:
    // если пользователь не проходил вопрос по площадкам — значение "1".
    answers.sites_count = a.sites_count || "1";

    // CR-005: document_interest добавляется только если пользователь прошёл
    // сокращённый сценарий Secondary CTA. Основной flow остаётся без этого поля.
    if (a.document_interest) answers.document_interest = a.document_interest;

    var utm = state.current_utm || {};

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
        comment: state.contact.comment || ""
      },
      meta: {
        started_at: state.timestamps.started_at || isoNow(),
        completed_at: isoNow(),
        last_screen: "contact",
        device: detectDevice(),
        browser: detectBrowser()
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

    fetch(ECOLEADBOT_CONFIG.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  /* -----------------------------------------------------------------------
     16. LOADING / FINAL / ERROR / ALREADY SUBMITTED
     ----------------------------------------------------------------------- */
  function renderLoading() {
    setScreen("loading");
    hideProgress();
    scrollBodyTop();
    var screen = el("div", "ecoleadbot-screen ecoleadbot-loading");
    screen.innerHTML = '<div class="ecoleadbot-spinner" aria-hidden="true"></div>' +
      '<div>Анализируем ответы...</div>';
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderFinal() {
    setScreen("success");
    hideProgress();
    scrollBodyTop();
    track("final_screen_viewed");

    var media = MEDIA_BUTTONS.map(function (m) {
      return '<a href="' + escapeHtml(m.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(m.label) + '</a>';
    }).join("");

    var screen = el("div", "ecoleadbot-screen ecoleadbot-final");
    screen.innerHTML =
      '<div class="ecoleadbot-final__icon" aria-hidden="true">✓</div>' +
      '<h2 class="ecoleadbot-title">Спасибо!</h2>' +
      '<p class="ecoleadbot-subtitle">Мы подготовим рекомендации по вашему объекту. ' +
      'С вами свяжется специалист компании «Экологические услуги».</p>' +
      '<div class="ecoleadbot-media">' + media + '</div>';
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderError(isNetwork) {
    setScreen("error");
    hideProgress();
    scrollBodyTop();
    var screen = el("div", "ecoleadbot-screen ecoleadbot-state");
    screen.innerHTML =
      '<div class="ecoleadbot-state__icon" aria-hidden="true">⚠️</div>' +
      '<h2 class="ecoleadbot-title">' + (isNetwork ? "Нет соединения" : "Не удалось отправить заявку") + '</h2>' +
      '<p class="ecoleadbot-subtitle">' +
        (isNetwork ? "Проверьте подключение к интернету." : "Попробуйте ещё раз.") +
      '</p>';

    var actions = el("div", "ecoleadbot-actions");
    var retry = el("button", "ecoleadbot-btn ecoleadbot-btn--primary", "Повторить");
    retry.type = "button";
    retry.addEventListener("click", submitLead);
    var close = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary", "Закрыть");
    close.type = "button";
    close.addEventListener("click", closePopup);
    actions.appendChild(retry);
    actions.appendChild(close);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderAlreadySubmitted() {
    setScreen("success");
    hideProgress();
    scrollBodyTop();
    var screen = el("div", "ecoleadbot-screen ecoleadbot-final");
    screen.innerHTML =
      '<div class="ecoleadbot-final__icon" aria-hidden="true">✓</div>' +
      '<h2 class="ecoleadbot-title">Ваша заявка уже отправлена</h2>' +
      '<p class="ecoleadbot-subtitle">Специалист свяжется с вами.</p>';
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  /* -----------------------------------------------------------------------
     17. AUTO POPUP TRIGGERS (UX §5 / Frontend §13–15)
     ----------------------------------------------------------------------- */
  function canAutoOpen() {
    if (!ECOLEADBOT_CONFIG.enableAutoPopup) return false;
    if (autoTriggerUsed) return false;
    if (isAlreadySubmitted()) return false;
    if (inCooldown()) return false;
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return false;
    return true;
  }

  function setupAutoTriggers() {
    // 1. Time delay
    autoPopupTimer = setTimeout(function () {
      if (canAutoOpen()) { autoTriggerUsed = true; openPopup("auto_popup", "time_delay"); }
    }, ECOLEADBOT_CONFIG.popupDelayMs);

    // 2. Scroll depth
    var onScroll = function () {
      var scrolled = (window.scrollY + window.innerHeight) /
        Math.max(document.documentElement.scrollHeight, 1);
      if (scrolled >= ECOLEADBOT_CONFIG.scrollDepthTrigger && canAutoOpen()) {
        autoTriggerUsed = true;
        openPopup("scroll_popup", "scroll_depth");
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // 3. Exit intent (desktop)
    document.addEventListener("mouseout", function (e) {
      if (e.clientY <= 0 && !e.relatedTarget && detectDevice() === "desktop" && canAutoOpen()) {
        autoTriggerUsed = true;
        openPopup("exit_popup", "exit_intent");
      }
    });
  }

  /* -----------------------------------------------------------------------
     18. INIT
     ----------------------------------------------------------------------- */
  function init() {
    if (window.__ecoleadbotLoaded) return;
    window.__ecoleadbotLoaded = true;

    initState();
    buildDom();
    insertInlineCta();
    setupAutoTriggers();

    window.addEventListener("beforeunload", function () {
      if (state && state.status !== "completed" && state.current_screen !== "idle") {
        if (Object.keys(state.answers).length > 0) state.status = "partial";
        persist();
      }
    });
  }

  // Экспорт чистых функций для автотестов (Node). В браузере не мешает.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { validateContact: validateContact, digitsCount: digitsCount, formatPhone: formatPhone, digitsOnly: digitsOnly };
  }

  // Инициализация только в браузере (наличие document).
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
