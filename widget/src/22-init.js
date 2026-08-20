  /* -----------------------------------------------------------------------
     18. INIT
     ----------------------------------------------------------------------- */
  function init() {
    if (window.__ecoleadbotLoaded) return;
    window.__ecoleadbotLoaded = true;

    ensureWidgetStylesheet();
    initState();
    buildDom();
    insertInlineCta();
    if (shouldOpenFromUrl() && overlay && overlay.classList.contains("ecoleadbot-hidden")) {
      autoTriggerUsed = true;
      openPopup("direct", "url_open", { resume: false });
    }
    setupAutoTriggers();

    loadV14Data().then(function () {
      logV14DataStatus();
    }).catch(function () {
      logV14DataStatus();
    });

    window.addEventListener("beforeunload", function () {
      if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) {
        state.popup_closed_at = now();
      }
      if (state && state.status !== "completed" && state.current_screen !== "idle") {
        if (Object.keys(state.answers || {}).length > 0) state.status = "partial";
        persist();
      }
      if (state && (state.status === "completed" || state.current_screen === "idle")) persist();
    });
  }

  /* Load only widget CSS on embeds; do not load the demo host stylesheet. */
  function ensureWidgetStylesheet() {
    var stylesheetUrl = resolveDataUrl("styles.css");
    var normalizedTarget;
    try {
      normalizedTarget = new URL(stylesheetUrl, document.baseURI).href.split("#")[0].split("?")[0];
    } catch (e) {
      normalizedTarget = stylesheetUrl.split("#")[0].split("?")[0];
    }

    var links = document.querySelectorAll('link[rel="stylesheet"][href]');
    for (var i = 0; i < links.length; i += 1) {
      try {
        var existingUrl = new URL(links[i].getAttribute("href"), document.baseURI).href;
        existingUrl = existingUrl.split("#")[0].split("?")[0];
        if (existingUrl === normalizedTarget) return;
      } catch (e) { /* Ignore malformed unrelated links. */ }
    }

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheetUrl;
    link.setAttribute("data-ecoleadbot-styles", "true");
    (document.head || document.documentElement).appendChild(link);
  }

  // Экспорт чистых функций для автотестов (Node). В браузере не мешает.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      validateContact: validateContact,
      digitsCount: digitsCount,
      formatPhone: formatPhone,
      digitsOnly: digitsOnly,
      WIDGET_VERSION: WIDGET_VERSION,
      IS_TEST_BUILD: IS_TEST_BUILD,
      createDefaultV14Fields: createDefaultV14Fields,
      ensureV14State: ensureV14State,
      ensureAnswers: ensureAnswers,
      resolveMiniZones: resolveMiniZones,
      mapLegacyObjectFeatures: mapLegacyObjectFeatures,
      getObjectSignalById: getObjectSignalById
    };
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
