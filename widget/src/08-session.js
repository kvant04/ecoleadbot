  /* -----------------------------------------------------------------------
     6. SESSION STORAGE (Frontend §17–19, TTL §18 = 180 дней)
     ----------------------------------------------------------------------- */
  var Session = {
    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        var ttlMs = ECOLEADBOT_CONFIG.sessionTtlDays * 24 * 60 * 60 * 1000;
        if (!data.saved_at || (now() - data.saved_at) > ttlMs) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
        return data;
      } catch (e) { return null; }
    },
    save: function (data) {
      try {
        data.saved_at = now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) { /* приватный режим / переполнение — игнорируем */ }
    },
    clear: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }
  };

