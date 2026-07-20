# -*- coding: utf-8 -*-
"""Patch ecoleadbot-workflow.json for v1.4 Normalize + Scoring + Bitrix."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WF = ROOT / "integrations" / "n8n" / "ecoleadbot-workflow.json"
CODE = ROOT / "integrations" / "n8n" / "normalize-scoring-v14.js"
BACKUP = ROOT / "integrations" / "n8n" / "ecoleadbot-workflow-v13-backup.json"

BITRIX_JSON_BODY = r"""={{
({
  fields: {
    TITLE: $json.lead_title,

    NAME: $json.name,

    PHONE: [
      {
        VALUE: $json.phone,
        VALUE_TYPE: "WORK"
      }
    ],

    ASSIGNED_BY_ID: 13860,

    SOURCE_ID: "UC_KQYSW1",

    COMMENTS: $json.comments_full,

    UF_CRM_1780045640: Number($json.segment_id),
    UF_CRM_1780045381: Number($json.complexity_id),
    UF_CRM_1780045704: Number($json.priority_id),
    UF_CRM_1780045778: Number($json.route_id),
    UF_CRM_1780045805: Number($json.diy_level_id),
    UF_CRM_1780047226: Number($json.responsible_id),
    UF_CRM_1780047272: Number($json.urgency_id),
    UF_CRM_1780047302: Number($json.object_count_id),
    UF_CRM_1780045834: $json.tags,
    UF_CRM_1780045115: $json.session_id,
    UF_CRM_1780045861: $json.summary,
    UF_CRM_1780045878: $json.admin_hint,
    UF_CRM_1780046722: $json.sales_hint
  }
})
}}"""

AI_SYSTEM = """Ты помощник отдела продаж экологической компании (EcoLeadBot v1.4).

Тебе запрещено менять:
- activity_type / segment
- complexity, priority, es_potential, route, diy_level, urgency
- tags и ES scoring виджета

Твоя задача:
1. Сформировать краткое резюме заявки для администратора (простым языком).
2. Подсказать администратору, что уточнить при звонке.
3. Подсказать менеджеру, как вести разговор.
4. Не придумывать данные, которых нет во входе.
5. Если es_status_label = «Требует доqualification» — не называй лид «низким потенциалом», пиши «мало данных — уточнить при звонке».

Верни строго JSON:
{
  "summary": "...",
  "admin_hint": "...",
  "sales_hint": "..."
}"""

AI_USER = """={
  "activity_type": "{{$json.activity_type}}",
  "service_title": "{{$json.service_title}}",
  "flow": "{{$json.flow}}",
  "complexity": "{{$json.complexity}}",
  "priority": "{{$json.priority}}",
  "es_potential": "{{$json.es_potential}}",
  "es_status_label": "{{$json.es_status_label}}",
  "route": "{{$json.route}}",
  "diy_level": "{{$json.diy_level}}",
  "responsible": "{{$json.responsible}}",
  "urgency": "{{$json.urgency}}",
  "object_count": "{{$json.object_count}}",
  "tags": "{{$json.tags}}",
  "summary_rule_based": "{{$json.summary}}",
  "admin_hint_rule_based": "{{$json.admin_hint}}",
  "sales_hint_rule_based": "{{$json.sales_hint}}"
}"""

MERGE_AI = """const aiRaw = $json.output?.[0]?.content?.[0]?.text;
let ai = {};
if (typeof aiRaw === 'string') {
  try { ai = JSON.parse(aiRaw); } catch (e) { ai = {}; }
} else if (aiRaw && typeof aiRaw === 'object') {
  ai = aiRaw;
}
const base = $('Normalize + Scoring v1.4').first().json;
const summary = ai.summary || base.summary;
const admin_hint = ai.admin_hint || base.admin_hint;
const sales_hint = ai.sales_hint || base.sales_hint;
const comments_full = [
  '=== EcoLeadBot v1.4 ===',
  '',
  base.comment || base.comments_full.split('\\n\\n--- Scoring')[0].replace('=== EcoLeadBot v1.4 ===\\n\\n', '').trim(),
  '',
  '--- Scoring (для админа) ---',
  `Вид деятельности: ${base.activity_type || '—'}`,
  base.service_title ? `Услуга интереса: ${base.service_title}` : '',
  base.nvos_category ? `Категория НВОС: ${base.nvos_category}` : '',
  `Сложность: ${base.complexity}`,
  `Приоритет: ${base.priority}`,
  `Потенциал ЭС (rule): ${base.es_potential}`,
  base.es_status_label ? `ES scoring (виджет): ${base.es_status_label}` : '',
  `Маршрут: ${base.route}`,
  '',
  'Резюме:',
  summary,
  '',
  'Подсказка администратору:',
  admin_hint,
  '',
  'Подсказка менеджеру:',
  sales_hint,
  '',
  `Теги: ${base.tags}`,
  `ID сессии: ${base.session_id || ''}`,
  base.widget_version ? `Виджет: ${base.widget_version}` : ''
].filter((line) => line !== '').join('\\n');
return [{ json: { ...base, summary, admin_hint, sales_hint, comments_full } }];"""


def main() -> None:
    wf = json.loads(WF.read_text(encoding="utf-8"))
    if not BACKUP.exists():
        BACKUP.write_text(json.dumps(wf, ensure_ascii=False, indent=2), encoding="utf-8")

    js_code = CODE.read_text(encoding="utf-8")
    for node in wf["nodes"]:
        name = node.get("name", "")
        if name == "Normalize + Scoring":
            node["name"] = "Normalize + Scoring v1.4"
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
            assigns = node["parameters"]["assignments"]["assignments"]
            names = {a.get("name", "").lstrip("=") for a in assigns}
            if "lead_title" not in names:
                assigns.append(
                    {
                        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                        "name": "=lead_title",
                        "value": "={{$json.lead_title}}",
                        "type": "string",
                    }
                )
            if "comments_full" not in names:
                assigns.append(
                    {
                        "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
                        "name": "=comments_full",
                        "value": "={{$json.comments_full}}",
                        "type": "string",
                    }
                )
            node["parameters"].setdefault("options", {})["includeOtherFields"] = True

    # Fix connections key rename + webhook target
    conns = wf.get("connections", {})
    if "Normalize + Scoring" in conns:
        conns["Normalize + Scoring v1.4"] = conns.pop("Normalize + Scoring")
    wh = conns.get("Webhook", {}).get("main", [[]])
    for branch in wh:
        for link in branch:
            if link.get("node") == "Normalize + Scoring":
                link["node"] = "Normalize + Scoring v1.4"

    wf["name"] = "EcoLeadBot v1.4"
    WF.write_text(json.dumps(wf, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Patched -> {WF}")


if __name__ == "__main__":
    main()
