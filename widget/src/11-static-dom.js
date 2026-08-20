  /* -----------------------------------------------------------------------
     9. BUILD STATIC DOM
     ----------------------------------------------------------------------- */
  function buildDom() {
    root = el("div", "ecoleadbot-root");

    // Floating widget
    if (ECOLEADBOT_CONFIG.enableFloatingWidget) {
      widgetBtn = el("button", "ecoleadbot-widget");
      widgetBtn.type = "button";
      widgetBtn.setAttribute("aria-label", "Понять, что нужно по экологии");
      var logoWrap = el("span", "ecoleadbot-widget__logo-wrap");
      logoWrap.appendChild(createWidgetLogoImg("ecoleadbot-widget__logo", 22));
      widgetBtn.appendChild(logoWrap);
      widgetBtn.appendChild(el("span", "ecoleadbot-widget__label", "Понять, что нужно по экологии"));
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

    var header = el("div", "ecoleadbot-header");
    header.appendChild(createWidgetLogoImg("ecoleadbot-header__logo", 36));
    var closeBtn = el("button", "ecoleadbot-close", "×");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Закрыть");
    closeBtn.addEventListener("click", closePopup);
    header.appendChild(closeBtn);
    popup.appendChild(header);

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

    // Exit-intent top banner (desktop): near browser chrome / tab close
    exitBanner = el("div", "ecoleadbot-exit-banner ecoleadbot-hidden");
    exitBanner.setAttribute("role", "dialog");
    exitBanner.setAttribute("aria-label", "Предложение пройти проверку");
    exitBanner.innerHTML =
      '<div class="ecoleadbot-exit-banner__accent" aria-hidden="true"></div>' +
      '<button type="button" class="ecoleadbot-exit-banner__dismiss" aria-label="Закрыть">×</button>' +
      '<div class="ecoleadbot-exit-banner__title">Уходите? Узнайте за 2 минуты — что нужно по экологии</div>' +
      '<p class="ecoleadbot-exit-banner__text">Короткий опрос: документы, риски и когда нужен специалист.</p>' +
      '<button type="button" class="ecoleadbot-exit-banner__cta">Понять, что нужно</button>';
    exitBanner.querySelector(".ecoleadbot-exit-banner__cta").addEventListener("click", function () {
      hideExitBanner();
      openPopup("exit_popup", "exit_intent");
    });
    exitBanner.querySelector(".ecoleadbot-exit-banner__dismiss").addEventListener("click", function () {
      hideExitBanner();
      track("exit_banner_dismissed");
    });
    root.appendChild(exitBanner);

    document.body.appendChild(root);

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (overlay && !overlay.classList.contains("ecoleadbot-hidden")) {
        closePopup();
        return;
      }
      if (typeof isExitBannerVisible === "function" && isExitBannerVisible()) {
        hideExitBanner();
        track("exit_banner_dismissed");
      }
    });
  }
