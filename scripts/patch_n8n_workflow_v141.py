# -*- coding: utf-8 -*-
"""Patch ecoleadbot-workflow.json for v1.4.1 scoring + Bitrix."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WF = ROOT / "integrations" / "n8n" / "ecoleadbot-workflow.json"
CODE = ROOT / "integrations" / "n8n" / "normalize-scoring-v141.js"
MAP_JSON = ROOT / "data" / "bitrix_service_iblock_map.json"
BACKUP = ROOT / "integrations" / "n8n" / "ecoleadbot-workflow-v13-backup.json"
NODE_NAME = "Normalize + Scoring v1.4.1"

BITRIX_JSON_BODY = r"""={{
({
  fields: {
    TITLE: $json.lead_title,
    NAME: $json.name,
    PHONE: [{ VALUE: $json.phone, VALUE_TYPE: "WORK" }],
    ASSIGNED_BY_ID: 13860,
    SOURCE_ID: "UC_KQYSW1",
    COMMENTS: $json.comments_full,
    UF_CRM_1780045640: Number($json.segment_id),
    UF_CRM_1780045381: Number($json.complexity_id),
    UF_CRM_1780045704: Number($json.priority_id),
    UF_CRM_1780045750: Number($json.es_potential_id),
    UF_CRM_1780045778: Number($json.route_id),
    UF_CRM_1780045805: Number($json.diy_level_id),
    UF_CRM_1780047226: Number($json.responsible_id),
    UF_CRM_1780047272: Number($json.urgency_id),
    UF_CRM_1780047302: Number($json.object_count_id),
    UF_CRM_1780045834: $json.tags,
    UF_CRM_1780045115: $json.session_id,
    UF_CRM_1780045861: $json.summary,
    UF_CRM_1780045878: $json.admin_hint,
    UF_CRM_1780046722: $json.sales_hint,
    ...($json.service_iblock_id ? { UF_CRM_1744184298: Number($json.service_iblock_id) } : {})
  }
})
}}"""

AI_SYSTEM = """Ты помощник отдела продаж экологической компании (EcoLeadBot v1.4.1).

Тебе запрещено менять: activity_type, complexity, priority, es_potential, route, diy_level, urgency, tags.

Твоя задача:
1. Краткое резюме для администратора.
2. Подсказка администратору при звонке.
3. Подсказка менеджеру (включая мягкое предложение экосопровождения).
4. Не придумывать данные, которых нет во входе.
5. Если es_status_label = «Требует уточнения при звонке» — не «низкий потенциал», а «мало данных».

Верни строго JSON: {"summary":"...","admin_hint":"...","sales_hint":"..."}"""

AI_USER = """={
  "activity_type": "{{$json.activity_type}}",
  "service_title": "{{$json.service_title}}",
  "flow": "{{$json.flow}}",
  "complexity": "{{$json.complexity}}",
  "priority": "{{$json.priority}}",
  "es_potential": "{{$json.es_potential}}",
  "es_status_label": "{{$json.es_status_label}}",
  "route": "{{$json.route}}",
  "route_reason": "{{$json.route_reason}}",
  "diy_level": "{{$json.diy_level}}",
  "responsible": "{{$json.responsible}}",
  "urgency": "{{$json.urgency}}",
  "object_count": "{{$json.object_count}}",
  "tags": "{{$json.tags}}",
  "summary_rule_based": "{{$json.summary}}",
  "admin_hint_rule_based": "{{$json.admin_hint}}",
  "sales_hint_rule_based": "{{$json.sales_hint}}"
}"""

MERGE_AI = f"""const aiRaw = $json.output?.[0]?.content?.[0]?.text;
let ai = {{}};
if (typeof aiRaw === 'string') {{
  try {{ ai = JSON.parse(aiRaw); }} catch (e) {{ ai = {{}}; }}
}} else if (aiRaw && typeof aiRaw === 'object') {{
  ai = aiRaw;
}}
const base = $('{NODE_NAME}').first().json;
const summary = ai.summary || base.summary;
const admin_hint = ai.admin_hint || base.admin_hint;
const sales_hint = ai.sales_hint || base.sales_hint;

function stripRedundantFromWidgetComment(text) {{
  if (!text) return "";
  return text
    .split("\\n")
    .filter((line) => {{
      const t = line.trim();
      if (!t) return true;
      if (/^ES scoring:/i.test(t)) return false;
      if (/^Оценка экосопровождения:/i.test(t)) return false;
      if (/^Вид деятельности:/i.test(t)) return false;
      if (/^Услуга интереса:/i.test(t)) return false;
      return true;
    }})
    .join("\\n")
    .replace(/\\n{{3,}}/g, "\\n\\n")
    .trim();
}}

function shortAdminHint(text, maxLen) {{
  const limit = maxLen || 220;
  const s = String(text || "").trim();
  if (!s) return "";
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit);
  const lastPeriod = cut.lastIndexOf(".");
  if (lastPeriod > 80) return cut.slice(0, lastPeriod + 1);
  return cut.trim() + "…";
}}

function buildCommentsFullV142(opts) {{
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
    routeReason ? `${{route}}: ${{routeReason}}` : route,
    adminHint
  );
  if (sessionId) {{
    parts.push(
      "",
      "---",
      `Оценка заявки и подсказки менеджеру — в полях карточки · сессия ${{sessionId}}`
    );
  }}
  return parts.join("\\n").replace(/\\n{{3,}}/g, "\\n\\n").trim();
}}

const comments_full = buildCommentsFullV142({{
  clientBlock: base.comment || "",
  route: base.route,
  routeReason: base.route_reason,
  adminHint: admin_hint,
  sessionId: base.session_id || "",
}});

return [{{ json: {{ ...base, summary, admin_hint, sales_hint, comments_full }} }}];"""


def load_scoring_js() -> str:
    js = CODE.read_text(encoding="utf-8")
    map_data = json.loads(MAP_JSON.read_text(encoding="utf-8"))
    service_map = map_data.get("map") or {}
    inject = json.dumps(service_map, ensure_ascii=False)
    js = js.replace("/* INJECT_SERVICE_IBLOCK_MAP */ {}", inject)
    return js


def ensure_edit_fields(node: dict) -> None:
    assigns = node["parameters"]["assignments"]["assignments"]
    names = {a.get("name", "").lstrip("=") for a in assigns}
    extras = [
        ("lead_title", "={{$json.lead_title}}"),
        ("comments_full", "={{$json.comments_full}}"),
        ("service_iblock_id", "={{$json.service_iblock_id}}"),
        ("es_potential_id", "={{$json.es_potential_id}}"),
        ("route_reason", "={{$json.route_reason}}"),
    ]
    for i, (field, val) in enumerate(extras):
        if field not in names:
            assigns.append(
                {
                    "id": f"v141-{field}-{i}",
                    "name": f"={field}",
                    "value": val,
                    "type": "string",
                }
            )
    node["parameters"].setdefault("options", {})["includeOtherFields"] = True
    if assigns:
        for a in assigns:
            if a.get("name", "").lstrip("=") == "es_potential_id":
                a["value"] = "={{$json.es_potential_id}}"
                break


def fix_connections(conns: dict, old_names: list[str]) -> None:
    for old in old_names:
        if old in conns and old != NODE_NAME:
            if NODE_NAME not in conns:
                conns[NODE_NAME] = conns.pop(old)
    wh = conns.get("Webhook", {}).get("main", [[]])
    for branch in wh:
        for link in branch:
            if link.get("node") in old_names and link.get("node") != NODE_NAME:
                link["node"] = NODE_NAME


def main() -> None:
    wf = json.loads(WF.read_text(encoding="utf-8"))
    if not BACKUP.exists():
        BACKUP.write_text(json.dumps(wf, ensure_ascii=False, indent=2), encoding="utf-8")

    js_code = load_scoring_js()
    old_node_names = [
        "Normalize + Scoring",
        "Normalize + Scoring v1.4",
        "Normalize + Scoring v1.4.1",
    ]

    for node in wf["nodes"]:
        name = node.get("name", "")
        if name in old_node_names:
            node["name"] = NODE_NAME
            node["parameters"]["jsCode"] = js_code
        elif name == "Merge AI Summary":
            node["parameters"]["jsCode"] = MERGE_AI
        elif name == "Message a model":
            vals = node["parameters"]["responses"]["values"]
            vals[0]["content"] = AI_SYSTEM
            vals[1]["content"] = AI_USER
            node["onError"] = "continueRegularOutput"
        elif name == "HTTP Request Bitrix24":
            node["parameters"]["jsonBody"] = BITRIX_JSON_BODY
        elif name == "Edit Fields":
            ensure_edit_fields(node)

    fix_connections(wf.get("connections", {}), old_node_names)
    wf["name"] = "EcoLeadBot v1.4.1"
    WF.write_text(json.dumps(wf, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Patched -> {WF}")


if __name__ == "__main__":
    main()
