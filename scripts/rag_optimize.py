# -*- coding: utf-8 -*-
"""EcoLeadBot RAG — второй проход оптимизации базы знаний."""

import os
import re
import random
import shutil
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KB = ROOT / "kb"
REPORTS = ROOT / "reports"
FUTURE = ROOT / "future_extension"
RAW = ROOT / "raw"

TODAY = datetime.date(2026, 6, 11).isoformat()

# --- Task 2: документы для переноса в future_extension ---
EXCLUDE_TO_FUTURE = {
    "027-FZ-nedrah.md": "ФЗ о недрах — узкая тематика недропользования, не входит в 80% типовых вопросов EcoLeadBot.",
    "174-FZ-ekologicheskoy-ekspertize.md": "Экологическая экспертиза — нишевый блок, редко в типовых консультациях MVP.",
    "099-FZ-licenzirovanii-otdelnyh-vidov-deyatelnosti.md": "Общий закон о лицензировании; экологические лицензии покрываются профильными НПА.",
    "052-FZ-sanitarno-epidemiologicheskom-blagopoluchii-naseleniya.md": "Общий санитарный закон; детализация в профильных СанПиН.",
    "23-03-2003-SNiP-stroitelnye-normy-pravila-rossiyskoy-federacii-zaschita.md": "СНиП по защите от шума — строительная ниша, низкий приоритет для MVP.",
    "562-96-SanPiN-fizicheskie-faktory-proizvodstvennoy-sredy-okruzhayuschey-prirodnoy.md": "Физические факторы производственной среды — узкая санитарная тема.",
    "573-96-SanPiN-gigienicheskie-trebovaniya-ispolzovaniyu-stochnyh-vod-osadkov.md": "Сточные воды для орошения — сельхоз-ниша.",
    "1110-02-SanPiN-zony-sanitarnoy-ohrany-istochnikov-vodosnabzheniya-vodoprovodov.md": "ЗСО источников водоснабжения — специализированный водный блок.",
    "913-PP-federalnoy-gosudarstvennoy-informacionnoy-sisteme-ucheta-tverdyh.md": "ФГИС УТКО — муниципальная система учёта ТКО, нишевый контекст.",
    "019-PR-RPN-vnesenii-izmeneniy-federalnyy-klassifikacionnyy-katalog-othodov.md": "Приказ-изменение к ФККО; для RAG достаточен базовый каталог №242.",
    "359-PR-RPN-vnesenii-izmeneniy-federalnyy-klassifikacionnyy-katalog-othodov.md": "Приказ-изменение к ФККО; для RAG достаточен базовый каталог №242.",
    "723-PR-RPN-vnesenii-izmeneniy-federalnyy-klassifikacionnyy-katalog-othodov.md": "Приказ-изменение к ФККО; для RAG достаточен базовый каталог №242.",
    "150-PR-Minprirody-vnesenii-izmeneniy-trebovaniya-soderzhaniyu-programmy-pek.md": "Изменения к пр. №109; включены в актуальную цепочку через пр. №262.",
    "825-PR-Minprirody-vnesenii-izmeneniy-poryadok-ucheta-oblasti-obrascheniya.md": "Изменения к пр. №1028; базовый приказ об учёте отходов сохранён в kb/.",
    "195-Kodeks-kodeks-administrativnyh-pravonarusheniyah.md": "Полный КоАП (~10k статей); для RAG создан производный koap_eco.md с экологическими статьями.",
}

CH19_ECO_EXACT = {
    "19.4", "19.4.1", "19.5", "19.6.1", "19.7",
    "19.7.14",  # лесные пожары
    "19.7.16",  # парниковые газы
}


def ch19_article_included(num):
    """Только явно перечисленные статьи; не захватывать 19.5.1, 19.7.1 и т.п."""
    return num in CH19_ECO_EXACT


def read_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def parse_frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        if line.startswith("  - "):
            continue
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"')
    body = text[m.end():]
    return meta, body


def extract_section(body, start_pat, end_pat=None):
    """Извлечь блок от start_pat до end_pat (regex на ##/###)."""
    m = re.search(start_pat, body, re.MULTILINE)
    if not m:
        return ""
    start = m.start()
    if end_pat:
        m2 = re.search(end_pat, body[m.end():], re.MULTILINE)
        end = m.end() + m2.start() if m2 else len(body)
    else:
        end = len(body)
    return body[start:end].rstrip()


def extract_chapter8_and_ch19(body):
    ch8 = extract_section(body, r"^## Глава 8\.", r"^## Глава 9\.")
    parts = []
    if ch8:
        parts.append(ch8)

    # Глава 19 — выборочные статьи
    m19 = re.search(r"^## Глава 19\.", body, re.MULTILINE)
    m20 = re.search(r"^## Глава 20\.", body, re.MULTILINE)
    if m19:
        ch19_block = body[m19.start():m20.start() if m20 else len(body)]
        parts.append("\n## Глава 19. АДМИНИСТРАТИВНЫЕ ПРАВОНАРУШЕНИЯ\n\nПРОТИВ ПОРЯДКА УПРАВЛЕНИЯ (статьи, связанные с экологическим контролем)\n")
        for art_m in re.finditer(
            r"^### Статья (\d+(?:\.\d+)*(?:-\d+)?)\.\s+", ch19_block, re.MULTILINE
        ):
            num = art_m.group(1)
            if not ch19_article_included(num):
                continue
            start = art_m.start()
            nxt = re.search(r"^### Статья ", ch19_block[art_m.end():], re.MULTILINE)
            end = art_m.end() + nxt.start() if nxt else len(ch19_block)
            parts.append(ch19_block[start:end].rstrip())

    return "\n\n".join(parts)


def task1_koap_eco():
    src = KB / "195-Kodeks-kodeks-administrativnyh-pravonarusheniyah.md"
    if not src.exists():
        src = FUTURE / "195-Kodeks-kodeks-administrativnyh-pravonarusheniyah.md"
    meta, body = parse_frontmatter(read_text(src))
    text_start = body.find("## Текст документа")
    doc_body = body[text_start + len("## Текст документа"):].strip() if text_start >= 0 else body
    eco_text = extract_chapter8_and_ch19(doc_body)

    yaml = """---
title: "КоАП РФ — административная ответственность в сфере охраны окружающей среды (выборка для RAG)"
document_number: "195-ФЗ-ECO"
type: "Производный документ (выборка из КоАП РФ)"
topic: "экологический контроль"
source: КонсультантПлюс
date_adopted: "2001-12-30"
updated: "{today}"
priority: high
tags:
  - административная ответственность
  - штрафы
  - отходы
  - выбросы
  - НВОС
  - вода
  - экологический контроль
  - государственный контроль (надзор)
status: "OK"
derived_from: "195-Kodeks-kodeks-administrativnyh-pravonarusheniyah.md"
---""".format(today=TODAY)

    md = "\n".join([
        yaml, "",
        "# КоАП РФ — выборка статей по охране окружающей среды",
        "",
        "> **Производный документ для RAG.** Содержит главу 8 КоАП РФ и статьи гл. 19 "
        "(19.4, 19.4.1, 19.5, 19.6.1, 19.7, 19.7.14, 19.7.16), связанные с государственным контролем (надзором). "
        "Полный текст КоАП: `195-Kodeks-kodeks-administrativnyh-pravonarusheniyah.md`.",
        "",
        "## Warnings",
        "",
        "- Выборка для EcoLeadBot RAG; не заменяет полный текст КоАП РФ.",
        "- Требует проверки актуальности по действующей редакции (КонсультантПлюс / pravo.gov.ru).",
        "",
        "## Текст документа",
        "",
        eco_text,
        "",
    ])
    write_text(KB / "koap_eco.md", md)
    arts = len(re.findall(r"^### Статья ", eco_text, re.MULTILINE))
    return arts


def task2_move_excluded():
    FUTURE.mkdir(exist_ok=True)
    moved = []
    for fname, reason in EXCLUDE_TO_FUTURE.items():
        src = KB / fname
        if src.exists():
            dst = FUTURE / fname
            if dst.exists():
                dst.unlink()
            shutil.move(str(src), str(dst))
            moved.append((fname, reason))
    return moved


def chunking_for_file(fname, meta):
    """Определить стратегию чанкинга по типу файла."""
    typ = meta.get("type", "")
    num = meta.get("document_number", "")
    topic = meta.get("topic", "")
    derived = meta.get("derived_from", "")

    if fname == "FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md":
        return ("question_based", "1 question = 1 chunk", "0",
                "FAQ оптимален для прямого сопоставления вопрос–ответ.")
    if fname == "koap_eco.md" or "Федеральный закон" in typ or "Кодекс" in typ:
        return ("article_based", "500–1000 tokens", "50 tokens",
                "Нормы с article-структурой; чанк = статья или пункт крупной статьи.")
    if "242" in fname or "ФККО" in fname or num == "242":
        return ("registry_based", "100–150 entries", "0",
                "Каталог кодов отходов; сохранять целостность записи код+наименование.")
    if "ПЭК" in fname or "pek" in fname.lower() or "отчетност" in topic or "2-ТП" in fname:
        return ("section_based", "500–800 tokens", "50 tokens",
                "Приказы/формы с разделами и приложениями.")
    if "Справочник" in typ or "NVOS-Ref" in fname:
        return ("section_based", "400–800 tokens (по категории I–IV)", "100 tokens",
                "Справочник перечней по категориям НВОС.")
    if "FAQ" in typ or "Справочный" in typ:
        return ("question_based", "1 question = 1 chunk", "0",
                "Справочный материал с Q&A-структурой.")
    if "СанПиН" in typ or "СНиП" in typ:
        return ("section_based", "500–800 tokens", "50 tokens",
                "Санитарные нормы с разделами и пунктами.")
    return ("section_based", "500–800 tokens", "50 tokens",
            "Приказ/постановление с разделами и пунктами.")


def add_chunking_recommendations():
    updated = 0
    for path in sorted(KB.glob("*.md")):
        text = read_text(path)
        meta, body = parse_frontmatter(text)

        # Удалить старый блок Chunking Recommendations если есть
        body = re.sub(r"\n## Chunking Recommendations\n.*?(?=\n## |\Z)",
                      "\n", body, flags=re.DOTALL).rstrip()

        strat, size, overlap, reason = chunking_for_file(path.name, meta)
        block = "\n\n## Chunking Recommendations\n\n" + "\n".join([
            f"- **Strategy:** {strat}",
            f"- **Chunk Size:** {size}",
            f"- **Overlap:** {overlap}",
            f"- **Reason:** {reason}",
        ])

        # Добавить после Vector Store Recommendations или в конец
        if "## Vector Store Recommendations" in body:
            body = body.rstrip() + block + "\n"
        else:
            body = body.rstrip() + block + "\n"

        write_text(path, "---\n" + _rebuild_yaml(meta) + "---\n" + body)
        updated += 1
    return updated


def _rebuild_yaml(meta):
    lines = []
    for k, v in meta.items():
        if k == "tags":
            continue
        lines.append(f'{k}: "{v}"' if k not in ("priority", "source") and not v.isdigit()
                     else (f"{k}: {v}" if k == "priority" else f"{k}: {v}"))
    # упрощённо — сохраняем через исходный frontmatter из файла лучше
    return "\n".join(f"{k}: {v}" for k, v in meta.items() if k != "tags")


def add_chunking_safe():
    """Добавить Chunking Recommendations, сохраняя исходный YAML."""
    updated = 0
    for path in sorted(KB.glob("*.md")):
        raw = read_text(path)
        m = re.match(r"^(---\n.*?\n---\n)", raw, re.DOTALL)
        if not m:
            continue
        fm = m.group(1)
        body = raw[m.end():]
        meta = {}
        for line in fm.splitlines():
            if line.startswith("  -") or line.strip() in ("---", ""):
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()

        body = re.sub(r"\n# Chunking Recommendations\n[\s\S]*?(?=\n## Vector Store|\Z)",
                      "", body)
        body = re.sub(r"\n## Chunking Recommendations\n[\s\S]*?(?=\n## Vector Store|\Z)",
                      "", body)
        body = re.sub(r"\n# Chunking Recommendations\n[\s\S]*$", "", body.rstrip())
        body = re.sub(r"\n## Chunking Recommendations\n[\s\S]*$", "", body.rstrip())

        strat, size, overlap, reason = chunking_for_file(path.name, meta)
        block = "\n\n# Chunking Recommendations\n\n" + "\n".join([
            f"Strategy: {strat}",
            f"Chunk Size: {size}",
            f"Overlap: {overlap}",
            f"Reason: {reason}",
        ])
        if "## Vector Store Recommendations" in body:
            parts = body.split("## Vector Store Recommendations")
            vs = parts[1]
            vs_lines = vs.split("\n")
            vs_content = []
            for ln in vs_lines:
                if ln.startswith("## ") and "Vector Store" not in ln:
                    break
                vs_content.append(ln)
            body = parts[0].rstrip() + "\n\n## Vector Store Recommendations" + \
                   "\n".join(vs_content).rstrip() + block + "\n"
        else:
            body = body.rstrip() + block + "\n"

        write_text(path, fm + body)
        updated += 1
    return updated


def validate_fkko(sample_n=25):
    """Сверка случайных записей ФККО между raw и kb."""
    raw_path = RAW / "npa__rpn1__PR__RPN__22_05_2017_242 ОБ УТВЕРЖДЕНИИ ФЕДЕРАЛЬНОГО КЛАССИФИКАЦИОННОГО КАТАЛОГА ОТХОДОВ ФККО.txt"
    kb_path = KB / "242-PR-RPN-utverzhdenii-federalnogo-klassifikacionnogo-kataloga-othodov-fkko.md"
    raw_lines = read_text(raw_path).splitlines()
    kb_text = read_text(kb_path)

    codes = [ln.strip() for ln in raw_lines if re.match(r"^\d \d{2} \d{3}", ln.strip())]
    random.seed(42)
    sample = random.sample(codes, min(sample_n, len(codes)))

    results, errors = [], []
    for code in sample:
        idx = raw_lines.index(code) if code in raw_lines else -1
        name_raw = ""
        if idx >= 0:
            for j in range(idx + 1, min(idx + 4, len(raw_lines))):
                nxt = raw_lines[j].strip()
                if re.match(r"^\d \d{2} \d{3}", nxt):
                    break
                if nxt and nxt not in ("Код", "Наименование", "БЛОК 1", "СКАЧАТЬ ПОЛНОСТЬЮ"):
                    name_raw = nxt
                    break
        in_kb_code = code in kb_text
        in_kb_name = (name_raw[:40] in kb_text) if name_raw else True
        ok = in_kb_code and in_kb_name
        results.append({"code": code, "name": name_raw[:60], "ok": ok,
                      "code_present": in_kb_code, "name_present": in_kb_name})
        if not ok:
            errors.append(code)

    status = "OK" if not errors else "REQUIRES_MANUAL_REVIEW"
    report = [
        "# Отчёт валидации ФККО",
        "",
        f"**Дата:** {TODAY}",
        f"**Исходный файл:** `{raw_path.name}`",
        f"**Markdown:** `{kb_path.name}`",
        f"**Проверено записей:** {len(sample)}",
        f"**Статус:** {status}",
        "",
        "## Метод",
        "",
        "Случайная выборка кодов ФККО из raw/ с проверкой наличия кода и "
        "наименования отхода в обработанном kb/.",
        "",
        "## Результаты",
        "",
        "| Код | Наименование (фрагмент) | Код OK | Наименование OK |",
        "|---|---|---|---|",
    ]
    for r in results:
        report.append(f"| `{r['code']}` | {r['name'][:50]} | {'✓' if r['code_present'] else '✗'} | "
                      f"{'✓' if r['name_present'] else '✗'} |")
    report += ["", f"**Ошибок:** {len(errors)}", ""]
    if errors:
        report += ["## Требует ручной проверки", ""]
        for c in errors:
            report.append(f"- `{c}`")
    else:
        report += ["Все проверенные записи сохранены корректно.", ""]
    write_text(REPORTS / "fkko_validation_report.md", "\n".join(report))
    return status, len(sample), len(errors)


def write_pek_recommendation():
    content = """# Рекомендации по документам ПЭК (программа производственного экологического контроля)

**Дата анализа:** {today}

## Сводная таблица

| Файл | Приказ | Статус | Рекомендация для RAG |
|---|---|---|---|
| `109-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md` | Минприроды №109 от 18.02.2022 | **ACTIVE** | **Включать.** Базовый документ с полным текстом требований к ПЭК и порядка отчётности. Действует с 01.09.2022 (6 лет). Применять с учётом изменений пр. №150 и №262. |
| `150-PR-Minprirody-vnesenii-izmeneniy-trebovaniya-soderzhaniyu-programmy-pek.md` | Минприроды №150 от 24.03.2023 | **AMENDMENT** | **Исключить из primary RAG** (перенесён в `future_extension/`). Содержит только дельта-изменения к пр. №109; для консультаций достаточно пр. №109 + №262. |
| `262-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md` | Минприроды №262 от 12.05.2025 | **AMENDMENT** (ACTIVE) | **Включать как дополнение.** Последние изменения к требованиям ПЭК (вступили 01.09.2025). Не заменяет пр. №109 полностью — содержит изменения к нему и к форме отчёта (пр. №173). |

## Хронология и правовая логика

1. **Приказ №74 от 28.02.2018** — SUPERSEDED приказом №109.
2. **Приказ №109 от 18.02.2022** — ACTIVE базовый документ (полный текст требований).
3. **Приказ №150 от 24.03.2023** — AMENDMENT к №109 (вступил 01.09.2023).
4. **Приказ №659 от 13.11.2024** — AMENDMENT к №109 (не включён в kb/ отдельным файлом).
5. **Приказ №262 от 12.05.2025** — AMENDMENT к №109 (с учётом №150 и №659), вступил 01.09.2025.

## Рекомендация для OpenAI Vector Store

- **Primary:** `109-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md` + `262-PR-Minprirody-trebovaniya-soderzhaniyu-programmy-pek.md`
- **Secondary:** `173-PR-Minprirody-utverzhdenii-formy-otcheta-organizacii-rezultatah-osuschestvleniya.md` (форма отчёта о ПЭК)
- **Exclude from primary RAG:** `150-PR-Minprirody-...` (AMENDMENT, дублирует дельту)

## Предупреждение

Для юридически точных консультаций необходима **консолидированная редакция** требований ПЭК с учётом всех изменений. RAG-ассистент должен ссылаться на пр. №109 как базу и указывать на изменения пр. №262.
""".format(today=TODAY)
    write_text(REPORTS / "pek_recommendation.md", content)


def estimate_chunks():
    """Грубая оценка числа чанков."""
    total = 0
    for path in KB.glob("*.md"):
        text = read_text(path)
        _, body = parse_frontmatter(text)
        if "FKKO" in path.name or "242-PR-RPN" in path.name:
            codes = len(re.findall(r"^\d \d{2} \d{3}", body, re.MULTILINE))
            total += max(1, codes // 125)
        elif "FAQ" in path.name:
            total += len(re.findall(r"^## .+\?$", body, re.MULTILINE))
        elif "koap_eco" in path.name:
            total += len(re.findall(r"^### Статья ", body, re.MULTILINE))
        elif "Федеральный закон" in text or "Кодекс" in text:
            total += len(re.findall(r"^### Статья ", body, re.MULTILINE)) or 10
        else:
            total += max(3, len(body) // 3000)
    return total


def write_rag_report(before_count, after_count, moved, koap_arts, fkko_status, fkko_checked, fkko_errors):
    active = sorted(p.name for p in KB.glob("*.md"))
    excluded = sorted(p.name for p in FUTURE.glob("*.md")) if FUTURE.exists() else []
    est_chunks = estimate_chunks()

    lines = [
        "# Отчёт оптимизации RAG EcoLeadBot",
        "",
        f"**Дата:** {TODAY}",
        "",
        "## Сводка",
        "",
        f"| Показатель | Значение |",
        f"|---|---|",
        f"| Документов до оптимизации | {before_count} |",
        f"| Документов после оптимизации (активная kb/) | {after_count} |",
        f"| Перенесено в future_extension/ | {len(moved)} |",
        f"| Создано производных документов | 1 (`koap_eco.md`) |",
        f"| Статус валидации ФККО | {fkko_status} |",
        f"| Оценочное число чанков (активная kb/) | ~{est_chunks} |",
        "",
        "## Выполненные задачи",
        "",
        "1. **koap_eco.md** — выборка из КоАП: глава 8 + статьи 19.4, 19.4.1, 19.5, 19.6.1, 19.7 "
        f"({koap_arts} статей). Исходный КоАП перенесён в future_extension/.",
        "2. **future_extension/** — нерелевантные для 80% вопросов документы (см. ниже).",
        "3. **reports/pek_recommendation.md** — статусы ACTIVE / AMENDMENT / SUPERSEDED для документов ПЭК.",
        f"4. **reports/fkko_validation_report.md** — проверено {fkko_checked} записей, ошибок: {fkko_errors}.",
        "5. **Chunking Recommendations** — добавлены во все активные документы kb/.",
        "",
        "## Активная база kb/ (для Vector Store)",
        "",
    ]
    for f in active:
        lines.append(f"- `{f}`")

    lines += ["", "## Исключённые документы (future_extension/)", ""]
    for f in excluded:
        reason = EXCLUDE_TO_FUTURE.get(f, "—")
        lines.append(f"- `{f}` — {reason}")

    lines += [
        "",
        "## Документы, требующие проверки",
        "",
    ]
    if fkko_status == "REQUIRES_MANUAL_REVIEW":
        lines.append("- `242-PR-RPN-utverzhdenii-federalnogo-klassifikacionnogo-kataloga-othodov-fkko.md` — см. reports/fkko_validation_report.md")
    else:
        lines.append("- Нет критических замечаний по активной базе.")

    lines += [
        "",
        "## Рекомендации по загрузке в OpenAI Vector Store",
        "",
        "1. Загружать только файлы из `kb/` (не `future_extension/`).",
        "2. **Приоритет high:** 7-ФЗ, 89-ФЗ, 96-ФЗ, 416-ФЗ, 248-ФЗ, 2398-ПП, koap_eco.md, NVOS-Ref, FAQ.",
        "3. **ФККО:** один файл `242-PR-RPN-...`; чанкинг registry_based, 100–150 записей.",
        "4. **ПЭК:** primary — пр. №109 + №262; форма отчёта — пр. №173.",
        "5. Использовать metadata из YAML frontmatter для фильтрации по topic/tags.",
        "6. Модель: **GPT-4.1 mini**; temperature 0.1–0.3 для юридических ответов.",
        "",
        "## Рекомендации по запуску MVP",
        "",
        "- Начать с ~{} документов активной kb/ (~{} чанков).".format(after_count, est_chunks),
        "- Прогнать 20–30 типовых вопросов из FAQ и проверить retrieval.",
        "- Мониторить галлюцинации по ссылкам на утратившие силу НПА (раздел Warnings).",
        "- После MVP расширять базу документами из future_extension/ по запросу пользователей.",
        "",
    ]
    write_text(REPORTS / "rag_optimization_report.md", "\n".join(lines))


def main():
    REPORTS.mkdir(exist_ok=True)
    before = len(list(KB.glob("*.md")))

    koap_arts = task1_koap_eco()
    moved = task2_move_excluded()
    write_pek_recommendation()
    fkko_status, fkko_n, fkko_err = validate_fkko(25)
    n_chunk = add_chunking_safe()

    after = len(list(KB.glob("*.md")))
    write_rag_report(before, after, moved, koap_arts, fkko_status, fkko_n, fkko_err)

    print(f"Done. kb: {before} -> {after}, moved: {len(moved)}, "
          f"koap_eco articles: {koap_arts}, chunking updated: {n_chunk}, FKKO: {fkko_status}")


if __name__ == "__main__":
    main()
