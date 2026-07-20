  /* -----------------------------------------------------------------------
     10. INLINE CTA (UX §4.2 / Frontend §11–12)
     ----------------------------------------------------------------------- */
  function ctaTemplate() {
    var wrap = el("div", "ecoleadbot-inline-cta");
    wrap.innerHTML =
      '<div class="ecoleadbot-inline-cta__title">Не уверены, какие экологические документы нужны объекту?</div>' +
      '<div>Короткий опрос займёт около 2 минут:</div>' +
      '<ul class="ecoleadbot-inline-cta__list">' +
      '<li>что обычно требуется по экологии;</li>' +
      '<li>какие документы проверить в первую очередь;</li>' +
      '<li>когда имеет смысл привлечь специалиста.</li>' +
      '</ul>' +
      '<button type="button" class="ecoleadbot-inline-cta__btn">Понять, что нужно по экологии</button>';
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

