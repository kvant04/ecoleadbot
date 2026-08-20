  /* -----------------------------------------------------------------------
     4. UTILITIES
     ----------------------------------------------------------------------- */
  function now() { return Date.now(); }

  function isoNow() {
    var d = new Date();
    var tz = -d.getTimezoneOffset();
    var sign = tz >= 0 ? "+" : "-";
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var abs = Math.abs(tz);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
      sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }

  function randToken(len) {
    var s = "";
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function makeSessionId() {
    return "eco_" + Math.floor(now() / 1000) + "_" + randToken(8);
  }

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /** Create element. Third arg goes to innerHTML — escape untrusted/dynamic text with escapeHtml(). */
  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function detectDevice() {
    var w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  function detectBrowser() {
    var ua = navigator.userAgent;
    if (/YaBrowser/i.test(ua)) return "Yandex";
    if (/Edg/i.test(ua)) return "Edge";
    if (/OPR|Opera/i.test(ua)) return "Opera";
    if (/Firefox/i.test(ua)) return "Firefox";
    if (/Chrome/i.test(ua)) return "Chrome";
    if (/Safari/i.test(ua)) return "Safari";
    return "Other";
  }

  function detectPageType() {
    if (document.querySelector(".article-content, .news-detail, .detail_text, article")) return "seo_article";
    if (document.querySelector(".service-page, [data-page='service']")) return "service_page";
    if (document.querySelector("[data-page='landing']")) return "landing";
    if (location.pathname === "/" || location.pathname === "") return "homepage";
    return "other";
  }

  function parseUtm() {
    var params = new URLSearchParams(location.search);
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    var out = {};
    keys.forEach(function (k) { out[k] = params.get(k) || ""; });
    return out;
  }

  function digitsCount(str) { return (String(str).match(/\d/g) || []).length; }

  // Только цифры из строки (без +, пробелов, скобок, дефисов).
  function digitsOnly(str) { return (String(str).match(/\d/g) || []).join(""); }

  // Визуальная маска телефона. Российские номера форматируются как
  // +7 (999) 999-99-99, прочие — как международные (+цифры, до 15).
  // Без сторонних библиотек.
  function formatPhone(value) {
    var d = digitsOnly(value);
    if (!d) return "";
    if (d.charAt(0) === "8") d = "7" + d.slice(1);          // 8XXX -> 7XXX
    else if (d.charAt(0) === "9") d = "7" + d;              // 9XX… (RU моб. без кода) -> 7 9XX…
    if (d.charAt(0) === "7") {
      d = d.slice(0, 11);                                   // 7 + 10 цифр
      var rest = d.slice(1);
      var out = "+7";
      if (rest.length > 0) out += " (" + rest.slice(0, 3);
      if (rest.length >= 3) out += ")";
      if (rest.length > 3) out += " " + rest.slice(3, 6);
      if (rest.length > 6) out += "-" + rest.slice(6, 8);
      if (rest.length > 8) out += "-" + rest.slice(8, 10);
      return out;
    }
    return "+" + d.slice(0, 15);                            // международный
  }

