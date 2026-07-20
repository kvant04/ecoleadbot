  /* -----------------------------------------------------------------------
     5. ANALYTICS (Frontend §36)
     Никаких ПДн в console (Security §44). Пушим только событие + безопасные поля.
     ----------------------------------------------------------------------- */
  function track(event, data) {
    window.dataLayer = window.dataLayer || [];
    var payload = { event: "ecoleadbot_" + event };
    if (data) {
      Object.keys(data).forEach(function (k) { payload[k] = data[k]; });
    }
    window.dataLayer.push(payload);
  }

