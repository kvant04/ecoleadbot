/**
 * Конфиг EcoLeadBot для elb.ecolusspb.ru / основного сайта.
 * Подключать ПЕРЕД app.js:
 *   <script src="https://elb.ecolusspb.ru/elb-config.js"></script>
 *   <script src="https://elb.ecolusspb.ru/app.js?v=1.5.20" defer></script>
 *
 * Секрет webhookSecret должен совпадать с Header Auth в n8n
 * (имя заголовка: X-EcoLeadBot-Secret). Не коммитьте реальный секрет.
 */
window.ECOLEADBOT_SITE_CONFIG = {
  webhookUrl: "https://n8n.ecolusspb.ru/webhook/ecoleadbot",
  webhookSecret: "",
  /** RAG API — VPS / тот же origin. Пока пусто = тот же origin. */
  ragApiUrl: ""
};
