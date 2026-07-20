  /* -----------------------------------------------------------------------
     17. AUTO POPUP TRIGGERS (UX §5 / Frontend §13–15)
     ----------------------------------------------------------------------- */
  function canAutoOpen() {
    if (!ECOLEADBOT_CONFIG.enableAutoPopup) return false;
    if (autoTriggerUsed) return false;
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

