  /* -----------------------------------------------------------------------
     17. AUTO POPUP TRIGGERS (UX §5 / Frontend §13–15)
     ----------------------------------------------------------------------- */
  function isExitBannerVisible() {
    return !!(exitBanner && !exitBanner.classList.contains("ecoleadbot-hidden") &&
      exitBanner.classList.contains("is-visible"));
  }

  function hideExitBanner() {
    if (!exitBanner) return;
    exitBanner.classList.remove("is-visible");
    setTimeout(function () {
      if (exitBanner) exitBanner.classList.add("ecoleadbot-hidden");
    }, 220);
  }

  /**
   * Top-right exit-intent banner (desktop). Independent of time/scroll triggers.
   */
  function showExitBanner() {
    if (!exitBanner || exitIntentUsed) return;
    if (!ECOLEADBOT_CONFIG.enableAutoPopup) return;
    if (inCooldown()) return;
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return;
    if (detectDevice() !== "desktop") return;

    exitIntentUsed = true;
    exitBanner.classList.remove("ecoleadbot-hidden");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (exitBanner) exitBanner.classList.add("is-visible");
      });
    });
    track("exit_banner_shown", { trigger: "exit_intent" });
  }

  function canAutoOpen() {
    if (!ECOLEADBOT_CONFIG.enableAutoPopup) return false;
    if (autoTriggerUsed) return false;
    if (inCooldown()) return false;
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return false;
    if (isExitBannerVisible()) return false;
    return true;
  }

  function canShowExitIntent() {
    if (!ECOLEADBOT_CONFIG.enableAutoPopup) return false;
    if (exitIntentUsed) return false;
    if (inCooldown()) return false;
    if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) return false;
    if (detectDevice() !== "desktop") return false;
    return true;
  }

  function setupAutoTriggers() {
    // 1. Time delay
    autoPopupTimer = setTimeout(function () {
      if (canAutoOpen()) { autoTriggerUsed = true; openPopup("auto_popup", "time_delay", { resume: false }); }
    }, ECOLEADBOT_CONFIG.popupDelayMs);

    // 2. Scroll depth
    var onScroll = function () {
      var scrolled = (window.scrollY + window.innerHeight) /
        Math.max(document.documentElement.scrollHeight, 1);
      if (scrolled >= ECOLEADBOT_CONFIG.scrollDepthTrigger && canAutoOpen()) {
        autoTriggerUsed = true;
        openPopup("scroll_popup", "scroll_depth", { resume: false });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // 3. Exit intent (desktop) — top banner near tab close, independent of time/scroll
    document.addEventListener("mouseout", function (e) {
      if (e.clientY > 0 || e.relatedTarget) return;
      if (!canShowExitIntent()) return;
      showExitBanner();
    });
  }
