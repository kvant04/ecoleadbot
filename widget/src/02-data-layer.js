  /* -----------------------------------------------------------------------
     1b. v1.4 DATA LAYER (Phase 0 — catalog + mini-assessment zones)
     ----------------------------------------------------------------------- */
  /**
   * Capture while this script executes (defer-safe). Later Bitrix/DOM cleanup
   * may remove <script> tags — then getElementsByTagName no longer finds app.js
   * and assets wrongly resolve to the host page origin (ecolusspb.ru → 404 logo).
   */
  var ASSET_BASE_URL = (function () {
    var scripts = document.getElementsByTagName("script");
    var i;
    for (i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || "";
      if (/\/(?:app|widget)\.js(?:\?|#|$)/i.test(src) || /ecoleadbot[^/]*\.js(?:\?|#|$)/i.test(src)) {
        return src.split("?")[0].split("#")[0].replace(/\/[^/]+$/, "/");
      }
    }
    return "";
  })();

  function getScriptDirectoryUrl() {
    if (ASSET_BASE_URL) return ASSET_BASE_URL;
    var scripts = document.getElementsByTagName("script");
    var i;
    for (i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || "";
      if (/\/(?:app|widget)\.js(?:\?|#|$)/i.test(src) || /ecoleadbot[^/]*\.js(?:\?|#|$)/i.test(src)) {
        return src.split("?")[0].split("#")[0].replace(/\/[^/]+$/, "/");
      }
    }
    return "";
  }

  function getAssetBaseUrl() {
    var scriptBase = getScriptDirectoryUrl();
    if (scriptBase) return scriptBase;
    if (ECOLEADBOT_CONFIG.assetBaseUrl) {
      return /\/$/.test(ECOLEADBOT_CONFIG.assetBaseUrl)
        ? ECOLEADBOT_CONFIG.assetBaseUrl
        : ECOLEADBOT_CONFIG.assetBaseUrl + "/";
    }
    if (location.origin && location.protocol.indexOf("http") === 0) {
      return location.origin + "/";
    }
    var path = location.pathname.replace(/\/[^/]*$/, "/");
    if (path.charAt(path.length - 1) !== "/") path += "/";
    return location.origin + path;
  }

  function resolveDataUrl(relativePath) {
    if (/^https?:\/\//i.test(relativePath)) return relativePath;
    return getAssetBaseUrl() + relativePath;
  }

  function getWidgetLogoUrl() {
    if (ECOLEADBOT_CONFIG.logoUrl) return ECOLEADBOT_CONFIG.logoUrl;
    return resolveDataUrl("assets/logo-eu.png");
  }

  function createWidgetLogoImg(className, sizePx) {
    var img = el("img", className);
    img.src = getWidgetLogoUrl();
    img.alt = "";
    img.width = sizePx;
    img.height = sizePx;
    img.setAttribute("decoding", "async");
    img.setAttribute("aria-hidden", "true");
    return img;
  }

  function fetchWithRetry(url, options, parseResponse, attempts) {
    var attempt = 0;
    var maxAttempts = attempts || 2;
    function run() {
      attempt += 1;
      return fetch(url, options).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
        return parseResponse(res);
      }).catch(function (err) {
        if (attempt >= maxAttempts) throw err;
        return new Promise(function (resolve) {
          setTimeout(resolve, 250 * attempt);
        }).then(run);
      });
    }
    return run();
  }

  function fetchJson(url) {
    return fetchWithRetry(url, { credentials: "omit" }, function (res) {
      return res.json();
    }, 2);
  }

  function loadV14Data() {
    if (catalogLoadPromise) return catalogLoadPromise;
    catalogLoadPromise = Promise.all([
      fetchJson(resolveDataUrl(V14_DATA_PATHS.catalog)),
      fetchJson(resolveDataUrl(V14_DATA_PATHS.zones)),
      fetchJson(resolveDataUrl(V14_DATA_PATHS.qualLabels))
    ]).then(function (results) {
      catalogV14 = results[0];
      zonesV14 = results[1];
      qualQuestionLabelsRu = results[2];
      catalogLoadError = null;
      return { catalog: catalogV14, zones: zonesV14, qualLabels: qualQuestionLabelsRu };
    }).catch(function (err) {
      catalogLoadError = err && err.message ? err.message : String(err);
      catalogV14 = null;
      zonesV14 = null;
      qualQuestionLabelsRu = null;
      /* Allow retry after network/transient failure (do not cache rejected promise). */
      catalogLoadPromise = null;
      throw err;
    });
    return catalogLoadPromise;
  }

  function isCatalogReady() {
    return !!(catalogV14 && zonesV14);
  }

  function getZonesConfig() { return zonesV14; }

  function getDirections() {
    if (!catalogV14 || !Array.isArray(catalogV14.directions)) return [];
    return catalogV14.directions.slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
  }

  function getServicesByDirection(directionId) {
    if (!catalogV14 || !Array.isArray(catalogV14.services)) return [];
    return catalogV14.services.filter(function (s) { return s.direction === directionId; });
  }

  function getServiceById(serviceId) {
    if (!catalogV14 || !Array.isArray(catalogV14.services)) return null;
    for (var i = 0; i < catalogV14.services.length; i++) {
      if (catalogV14.services[i].id === serviceId) return catalogV14.services[i];
    }
    return null;
  }

  function getObjectSignalOptions() {
    var list = (zonesV14 && Array.isArray(zonesV14.object_signals))
      ? zonesV14.object_signals
      : FALLBACK_OBJECT_SIGNALS;
    return list.map(function (s) {
      return { id: s.id, label: s.label, zones: s.zones || [] };
    });
  }

  function getObjectSignalById(signalId) {
    var list = (zonesV14 && Array.isArray(zonesV14.object_signals))
      ? zonesV14.object_signals
      : FALLBACK_OBJECT_SIGNALS;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === signalId) return list[i];
    }
    return null;
  }

  function getZonesMeta() {
    if (zonesV14) {
      return {
        zone_display_order: zonesV14.zone_display_order,
        zone_titles: zonesV14.zone_titles,
        zone_templates: zonesV14.zone_templates,
        zone_kb_template_prefix: zonesV14.zone_kb_template_prefix,
        fallback_zone: zonesV14.fallback_zone
      };
    }
    return FALLBACK_ZONES_META;
  }

  function getZoneTemplateMeta(zid) {
    var meta = getZonesMeta();
    var templates = meta.zone_templates || {};
    return templates[zid] || null;
  }

  function stripMarkdownFrontmatter(text) {
    var t = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (/^---\s*\n/.test(t)) {
      var end = t.indexOf("\n---\n", 4);
      if (end !== -1) return t.slice(end + 5).trim();
    }
    return t.trim();
  }

  /** Пункты списка в шаблоне зоны — только по отмеченным признакам объекта. */
  var ZONE_BULLET_SIGNAL_MAP = {
    otkhody: [
      { re: /ТКО/i, signals: ["tko", "kitchen"] },
      { re: /Производственные отходы/i, signals: ["production_waste", "kitchen", "agriculture", "transport"] }
    ],
    ekosbor: [
      { re: /Экологический сбор|экосбор/i, signals: ["import_packaging"] }
    ],
    voda: [
      { re: /ЦСВ|БВВ|канализац/i, signals: ["discharge_csv", "kitchen"] },
      { re: /Декларация/i, signals: ["discharge_csv", "kitchen"] },
      { re: /водные объекты/i, signals: ["discharge_own"] },
      { re: /Скважина|недра/i, signals: ["wells"] }
    ]
  };

  function filterZoneMarkdownBySignals(md, zoneId, signalIds) {
    var text = stripMarkdownFrontmatter(md);
    var rules = ZONE_BULLET_SIGNAL_MAP[zoneId];
    if (!rules || !Array.isArray(signalIds) || !signalIds.length) return text;
    var sigSet = {};
    signalIds.forEach(function (s) { sigSet[s] = true; });
    var lines = text.split("\n");
    var out = [];
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!/^[-*]\s/.test(trimmed)) {
        out.push(line);
        return;
      }
      var keep = false;
      for (var i = 0; i < rules.length; i++) {
        if (!rules[i].re.test(trimmed)) continue;
        for (var j = 0; j < rules[i].signals.length; j++) {
          if (sigSet[rules[i].signals[j]]) { keep = true; break; }
        }
        if (keep) break;
      }
      if (keep) out.push(line);
    });
    var result = out.join("\n").trim();
    if (rules && signalIds.length && !/^\s*[-*]\s/m.test(result)) {
      return stripMarkdownFrontmatter(md);
    }
    return result;
  }

  function applySitesCountWording(text, sitesCount) {
    var t = String(text || "");
    if (!t || !sitesCount) return t;
    var multi = sitesCount === "2–3" || sitesCount === "4 и более";
    if (multi) {
      return t.replace(/\bдоговор\b/gi, "договоры");
    }
    return t.replace(/\bдоговоры\b/gi, "договор").replace(/\bдоговоров\b/gi, "договор");
  }

  function markdownToDisplayHtml(md) {
    var text = stripMarkdownFrontmatter(md);
    if (!text) return "";
    var lines = text.split("\n");
    var html = "";
    var inList = false;
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) {
        if (inList) { html += "</ul>"; inList = false; }
        return;
      }
      if (/^#{1,3}\s/.test(trimmed)) {
        if (inList) { html += "</ul>"; inList = false; }
        html += "<h3 class=\"ecoleadbot-zone-block__heading\">" +
          escapeHtml(trimmed.replace(/^#+\s*/, "")) + "</h3>";
      } else if (/^[-*]\s/.test(trimmed)) {
        if (!inList) { html += "<ul class=\"ecoleadbot-zone-block__list\">"; inList = true; }
        var item = trimmed.replace(/^[-*]\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1");
        html += "<li>" + escapeHtml(item) + "</li>";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        var plain = trimmed.replace(/\*\*(.+?)\*\*/g, "$1");
        html += "<p class=\"ecoleadbot-zone-block__p\">" + escapeHtml(plain) + "</p>";
      }
    });
    if (inList) html += "</ul>";
    return html;
  }

  function extractPlainSummary(md) {
    var text = stripMarkdownFrontmatter(md);
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || /^#/.test(line)) continue;
      if (/^[-*]\s/.test(line)) return line.replace(/^[-*]\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1");
      return line.replace(/\*\*(.+?)\*\*/g, "$1");
    }
    return text.slice(0, 200);
  }

  function loadZoneTemplate(kbKey) {
    if (!kbKey) return Promise.reject(new Error("no kb key"));
    if (zoneTemplateCache[kbKey]) return Promise.resolve(zoneTemplateCache[kbKey]);
    var meta = getZonesMeta();
    var prefix = meta.zone_kb_template_prefix || "mini_assessment";
    var url = resolveDataUrl("kb/" + prefix + "/" + kbKey + ".md");
    return fetchWithRetry(url, { credentials: "omit" }, function (res) {
      return res.text();
    }).then(function (text) {
      zoneTemplateCache[kbKey] = text;
      return text;
    });
  }

  function resolvePodrobneeTemplateKey(zoneId, signalIds) {
    var priorities = PODROBBNEE_SIGNAL_PRIORITY[zoneId] || [];
    var i;
    for (i = 0; i < priorities.length; i++) {
      if (signalIds.indexOf(priorities[i]) !== -1) {
        return "podrobnee/" + zoneId + "_" + priorities[i];
      }
    }
    return "podrobnee/" + zoneId + "_default";
  }

  function loadPodrobneeTemplate(templateKey) {
    if (!templateKey) return Promise.reject(new Error("no podrobnee key"));
    if (podrobneeTemplateCache[templateKey]) {
      return Promise.resolve(podrobneeTemplateCache[templateKey]);
    }
    var url = resolveDataUrl("kb/mini_assessment/" + templateKey + ".md");
    return fetchWithRetry(url, { credentials: "omit" }, function (res) {
      return res.text();
    }).then(function (text) {
      podrobneeTemplateCache[templateKey] = text;
      return text;
    });
  }

  function isPodrobneeTemplateUsable(md) {
    var body = stripMarkdownFrontmatter(md);
    return body.length >= 80;
  }

  function buildQuizContextForRag() {
    syncMainFlowStateFromAnswers();
    var a = state.answers || {};
    var lines = [];
    var activity = (state.activity_type || a.activity_type || a.object_type || "").trim();
    if (activity) lines.push("Вид деятельности: " + activity);
    var signalIds = getActiveObjectSignals();
    if (signalIds.length) {
      lines.push("Признаки на объекте: " + signalIds.map(getObjectSignalLabel).join("; "));
    }
    var nvos = (state.nvos_category || a.nvos_category || "").trim();
    if (nvos) lines.push("Категория НВОС: " + nvos);
    var sites = resolveSitesCount();
    if (sites) lines.push("Число площадок: " + sites);
    if (a.main_situation) lines.push("Актуальная ситуация: " + a.main_situation);
    if (a.urgency) lines.push("Срочность: " + a.urgency);
    return lines.join("\n");
  }

  function buildPodrobneeRagQuestion(zone, basePrompt) {
    var ctx = buildQuizContextForRag();
    var zoneTitle = zone && zone.title ? zone.title : "экология";
    var parts = [
      "Дай краткий экспертный ответ для блока «Подробнее» по направлению «" + zoneTitle + "».",
      "Формат: «Вы отметили … → проверьте …» короткими пунктами.",
      "Учитывай только то, что пользователь указал в опросе.",
      "Если уверенность medium или high — добавь 1–2 статьи КоАП по теме.",
      "",
      "Вопрос: " + (basePrompt || "")
    ];
    if (ctx) {
      parts.push("", "Контекст ответов пользователя:", ctx);
    }
    return parts.join("\n");
  }

  function maybeAppendKoapToAnswer(answer, templateKey, confidence) {
    var text = String(answer || "").trim();
    if (!text) return text;
    if (confidence !== "high" && confidence !== "medium") return text;
    if (/коап|ст\.\s*8\./i.test(text)) return text;
    var snippet = KOAP_SNIPPETS[templateKey.replace(/^podrobnee\//, "")] ||
      KOAP_SNIPPETS[templateKey.split("_").slice(0, 2).join("_")];
    if (!snippet) return text;
    return text + "\n\n**Ответственность (КоАП):** " + snippet;
  }

  function showPodrobneeFromTemplate(zone, md, templateKey) {
    state.mini_zone_rag_id = zone.id || "";
    state.mini_zone_rag_title = zone.title || "";
    /* CRM/payload: human topic, not internal rag_podrobnee_prompt */
    state.rag_question = zone.title
      ? ("Подробнее: " + zone.title)
      : "Подробнее (мини-оценка)";
    state.rag_entry_type = "podrobnee";
    state.rag_from_template = true;
    state.rag_podrobnee_template_key = templateKey || "";
    var body = stripMarkdownFrontmatter(md);
    state.rag_answer = body;
    state.rag_answer_html = markdownToDisplayHtml(body);
    state.rag_answer_summary = summarizeRagAnswer(extractPlainSummary(body));
    state.rag_assistant_recommendation = "answer_only";
    state.rag_confidence = "high";
    state.rag_sources = [];
    state.rag_sources_titles = ["Готовый текст EcoLeadBot"];
    state.rag_error_kind = "";
    persist();
    track("mini_zone_podrobnee_template", {
      session_id: state.session_id,
      zone_id: zone.id,
      template_key: templateKey
    });
    renderRagAnswer();
  }

  function enrichMiniZonesWithTemplates(zones) {
    var signals = getActiveObjectSignals();
    var sites = resolveSitesCount();
    return Promise.all(zones.map(function (zone) {
      var key = zone.kb_zone_key;
      return loadZoneTemplate(key).then(function (md) {
        var filtered = filterZoneMarkdownBySignals(md, zone.id, signals);
        filtered = applySitesCountWording(filtered, sites);
        var copy = {};
        Object.keys(zone).forEach(function (k) { copy[k] = zone[k]; });
        copy.body_text = extractPlainSummary(filtered);
        copy.body_html = markdownToDisplayHtml(filtered);
        return copy;
      }).catch(function () {
        var fb = applySitesCountWording(FALLBACK_ZONE_TEMPLATE_TEXTS[key] || zone.title || "", sites);
        var copy = {};
        Object.keys(zone).forEach(function (k) { copy[k] = zone[k]; });
        copy.body_text = fb;
        copy.body_html = markdownToDisplayHtml(fb);
        return copy;
      });
    }));
  }

  function getQuestionTemplate(templateId) {
    if (!catalogV14 || !catalogV14.question_templates) return null;
    return catalogV14.question_templates[templateId] || null;
  }

  function getUxRules() {
    return (catalogV14 && catalogV14.ux_rules) ? catalogV14.ux_rules : {};
  }
