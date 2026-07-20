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

