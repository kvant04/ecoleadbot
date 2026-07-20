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

  /* Legacy v1.3 document_interest — удалён в v1.4 (ветка «конкретная услуга» через каталог). */

  /* Медиа-кнопки финального экрана (UX §14 — 6 кнопок) */
  var MEDIA_BUTTONS = [
    { label: "Telegram", url: "https://t.me/ecolusspb" },
    { label: "YouTube", url: "https://www.youtube.com/@ecolusspb" },
    { label: "Дзен", url: "https://dzen.ru/ecolusspb" },
    { label: "ЭкоКомпас", url: "https://ecolusspb.ru/subscribe/" },
    { label: "RuTube", url: "https://rutube.ru/channel/31793215/" },
    { label: "VK", url: "https://vk.com/ecolusspb" }
  ];

  function appendFinalMediaLinks(screen) {
    screen.appendChild(el("p", "ecoleadbot-subtitle ecoleadbot-final__media-lead",
      "Пока ждёте звонка — полезные материалы по экологии: бесплатный дайджест " +
      "«ЭкоКомпас» и наши каналы с разборами для бизнеса."));

    var media = el("div", "ecoleadbot-media");
    MEDIA_BUTTONS.forEach(function (btn) {
      var a = document.createElement("a");
      a.href = btn.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = btn.label;
      if (btn.label === "ЭкоКомпас") a.className = "ecoleadbot-media__highlight";
      a.addEventListener("click", function () {
        track("final_media_click", { label: btn.label, url: btn.url });
      });
      media.appendChild(a);
    });
    screen.appendChild(media);
  }

