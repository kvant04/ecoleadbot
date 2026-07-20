/**
 * Comment Policy v1.4.2 — thin COMMENTS for Bitrix (Variant A).
 * Used inline in n8n Code nodes (normalize + merge AI).
 */
function stripRedundantFromWidgetComment(text) {
  if (!text) return "";
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^ES scoring:/i.test(t)) return false;
      if (/^Оценка экосопровождения:/i.test(t)) return false;
      if (/^Вид деятельности:/i.test(t)) return false;
      if (/^Услуга интереса:/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shortAdminHint(text, maxLen) {
  const limit = maxLen || 220;
  const s = String(text || "").trim();
  if (!s) return "";
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit);
  const lastPeriod = cut.lastIndexOf(".");
  if (lastPeriod > 80) return cut.slice(0, lastPeriod + 1);
  return cut.trim() + "…";
}

function buildCommentsFullV142(opts) {
  const clientBlock = stripRedundantFromWidgetComment(opts.clientBlock || "");
  const route = opts.route || "—";
  const routeReason = opts.routeReason || "";
  const adminHint = shortAdminHint(opts.adminHint);
  const sessionId = opts.sessionId || "";

  const parts = [];
  if (clientBlock) parts.push(clientBlock);
  parts.push(
    "",
    "── Следующий шаг ──",
    routeReason ? `${route}: ${routeReason}` : route,
    adminHint
  );
  if (sessionId) {
    parts.push(
      "",
      "---",
      `Оценка заявки и подсказки менеджеру — в полях карточки · сессия ${sessionId}`
    );
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
