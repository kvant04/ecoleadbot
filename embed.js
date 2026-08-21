/**
 * EcoLeadBot single-line embed for Bitrix / ecolusspb.ru.
 * Connect ONLY this file (once). It injects CSS + elb-config + app.js
 * with the current WIDGET_VERSION so cache-bust (?v=) is updated on VPS deploy
 * without editing the site template again.
 *
 *   <script src="https://elb.ecolusspb.ru/embed.js" defer></script>
 *
 * Do not also link styles.css / elb-config.js / app.js separately вЂ” that can double-init.
 */
(function () {
  if (window.__ecoleadbotEmbedLoaded) return;
  window.__ecoleadbotEmbedLoaded = true;

  var VERSION = "1.5.51";
  var base = "https://elb.ecolusspb.ru/";
  try {
    var current = document.currentScript;
    if (current && current.src) {
      var url = new URL(current.src, document.baseURI);
      base = url.origin + url.pathname.replace(/\/[^/]*$/, "/");
    }
  } catch (e) { /* keep default base */ }

  function asset(path) {
    return base.replace(/\/?$/, "/") + String(path || "").replace(/^\//, "") + "?v=" + VERSION;
  }

  function appendCss(href) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-ecoleadbot-embed", "css");
    (document.head || document.documentElement).appendChild(link);
  }

  function appendScript(src, onload) {
    var script = document.createElement("script");
    script.src = src;
    script.setAttribute("data-ecoleadbot-embed", "js");
    if (onload) script.onload = onload;
    script.onerror = function () {
      if (typeof console !== "undefined" && console.error) {
        console.error("EcoLeadBot embed failed to load:", src);
      }
    };
    (document.head || document.documentElement).appendChild(script);
  }

  appendCss(asset("styles.css"));
  // elb-config must run before app.js
  appendScript(asset("elb-config.js"), function () {
    appendScript(asset("app.js"));
  });
})();
