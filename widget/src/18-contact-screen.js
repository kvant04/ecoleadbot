  /* -----------------------------------------------------------------------
     14b. CONTACT SCREEN (UX §11 / Frontend §27–30)
     Email исключён (решение по противоречию №3).
     ----------------------------------------------------------------------- */
  function renderContactBlocked() {
    setScreen("contact_blocked");
    hideProgress();
    scrollBodyTop();
    track("contact_blocked_already_submitted", { session_id: state.session_id });

    var screen = el("div", "ecoleadbot-screen ecoleadbot-final");
    prependBackButton(screen);
    var body = el("div");
    body.innerHTML =
      '<div class="ecoleadbot-final__icon" aria-hidden="true">✓</div>' +
      '<h2 class="ecoleadbot-title">Ваша заявка уже отправлена</h2>' +
      '<p class="ecoleadbot-subtitle">Специалист свяжется с вами.</p>';
    screen.appendChild(body);

    var actions = el("div", "ecoleadbot-intro__actions");
    if (IS_TEST_BUILD) {
      var retryBtn = el("button", "ecoleadbot-btn ecoleadbot-btn--secondary ecoleadbot-btn--block", "Пройти заново");
      retryBtn.type = "button";
      retryBtn.addEventListener("click", resetSessionForRetest);
      actions.appendChild(retryBtn);
    }
    appendPostSubmitNavActions(actions);
    screen.appendChild(actions);

    bodyEl.innerHTML = "";
    bodyEl.appendChild(screen);
  }

  function renderContact() {
    if (isAlreadySubmitted()) {
      renderContactBlocked();
      return;
    }
    if (!state.client_terms_ok) {
      proceedToContact();
      return;
    }

    if (state.flow === "document" && state.selected_service_id) {
      state.previous_screen = getDocumentContactPreviousScreen();
      persist();
    }

    setScreen("contact");
    hideProgress();
    scrollBodyTop();
    track("contact_form_viewed");

    var c = state.contact || {};
    var screen = el("div", "ecoleadbot-screen");
    prependBackButton(screen);

    var content = el("div");
    content.innerHTML =
      '<h2 class="ecoleadbot-title">Оставьте контакты</h2>' +
      '<p class="ecoleadbot-subtitle">Подготовим рекомендации по вашему объекту.</p>' +
      '<p class="ecoleadbot-hint ecoleadbot-contact-disclaimer">' +
        'Мы работаем с юридическими лицами и ИП по прямым договорам. ' +
        'Участие в электронных закупках не предусмотрено.' +
      '</p>' +

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
    screen.appendChild(content);

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

