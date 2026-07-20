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

    loadV14Data().then(function () {
      logV14DataStatus();
    }).catch(function () {
      logV14DataStatus();
    });

    window.addEventListener("beforeunload", function () {
      if (state && state.status !== "completed" && state.current_screen !== "idle") {
        if (Object.keys(state.answers).length > 0) state.status = "partial";
        persist();
      }
    });
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
