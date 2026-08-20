/**
 * Конфиг EcoLeadBot для elb.ecolusspb.ru / основного сайта.
 * Подключать ПЕРЕД app.js:
 *   <script src="https://elb.ecolusspb.ru/elb-config.js"></script>
 *   <script src="https://elb.ecolusspb.ru/app.js?v=1.5.45" defer></script>
 *
 * logoUrl / ragApiUrl / assetBaseUrl — абсолютные URL на VPS (иначе на ecolusspb.ru
 * ассеты ищутся на самом сайте и дают 404).
 *
 * Секрет webhookSecret должен совпадать с Header Auth в n8n
 * (имя заголовка: X-EcoLeadBot-Secret). Не коммитьте реальный секрет.
 */
window.ECOLEADBOT_SITE_CONFIG = {
  webhookUrl: "https://n8n.ecolusspb.ru/webhook/ecoleadbot",
  webhookSecret: "",
  ragApiUrl: "https://elb.ecolusspb.ru/api/rag/ask",
  logoUrl: "https://elb.ecolusspb.ru/assets/logo-eu.png",
  assetBaseUrl: "https://elb.ecolusspb.ru/"
};
