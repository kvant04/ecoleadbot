  /* -----------------------------------------------------------------------
     16. LOADING / FINAL / ERROR / ALREADY SUBMITTED
     ----------------------------------------------------------------------- */
  function renderLoading() {
    setScreen("loading");
    hideProgress();
    scrollBodyTop();
    var screen = el("div", "ecoleadbot-screen ecoleadbot-loading");
    prependBackButton(screen);
    screen.insertAdjacentHTML("beforeend",
      '<div class="ecoleadbot-spinner" aria-hidden="true"></div>');
    screen.appendChild(el("div", "", "Анализируем ответы..."));
    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderFinal() {
    setScreen("success");
    hideProgress();
    scrollBodyTop();
    track("final_screen_viewed");

    var screen = el("div", "ecoleadbot-screen ecoleadbot-final");
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-final__icon" aria-hidden="true">✓</div>' +
      '<h2 class="ecoleadbot-title">Спасибо!</h2>' +
      '<p class="ecoleadbot-subtitle">Заявка отправлена.<br><br>' +
      'Специалист компании «Экологические услуги» свяжется с вами.</p>';
    screen.appendChild(body);
    appendFinalMediaLinks(screen);

    var actions = el("div", "ecoleadbot-intro__actions");
    appendPostSubmitNavActions(actions);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderError(isNetwork) {
    setScreen("error");
    hideProgress();
    scrollBodyTop();
    var screen = el("div", "ecoleadbot-screen ecoleadbot-state");
    prependBackButton(screen);
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-state__icon" aria-hidden="true">⚠️</div>' +
      '<h2 class="ecoleadbot-title">' + (isNetwork ? "Нет соединения" : "Не удалось отправить заявку") + '</h2>' +
      '<p class="ecoleadbot-subtitle">' +
        (isNetwork ? "Проверьте подключение к интернету." : "Попробуйте ещё раз.") +
      '</p>';
    screen.appendChild(body);

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
    renderContactBlocked();
  }

