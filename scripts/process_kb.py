# -*- coding: utf-8 -*-
"""
EcoLeadBot RAG — подготовка нормативных документов РФ для OpenAI Vector Store.

Читает все .txt из raw/, очищает и структурирует их (БЕЗ изменения юридического
смысла — только очистка артефактов и разметка), добавляет YAML-метаданные, раздел
Warnings, рекомендации для Vector Store и сохраняет .md в kb/.
В конце формирует reports/Processing_kb_report.md.

Принцип безопасности: скрипт НЕ переписывает и НЕ сокращает нормы. Он только:
  * удаляет технические артефакты PDF/КонсультантПлюс (колонтитулы, "СКАЧАТЬ ПОЛНОСТЬЮ",
    символы ¶, разрядку букв, двойные пробелы, пустые строки, номера страниц);
  * исключает редакционные пометки ("в ред.", "изменена с...", маркеры "утратил силу",
    "Федеральным законом ... внесены изменения");
  * размечает заголовки (Глава / Статья / разделы) как Markdown.
Все действующие нормативные положения сохраняются дословно.
"""

import os
import re
import time
import datetime
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "raw")
KB_DIR = os.path.join(ROOT, "kb")
REPORT_PATH = os.path.join(ROOT, "reports", "Processing_kb_report.md")

TODAY = datetime.date(2026, 6, 11)
TODAY_STR = TODAY.isoformat()

RU_MONTHS = {
    "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
    "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
}

# --------------------------------------------------------------------------- #
#  Транслитерация для имён файлов                                              #
# --------------------------------------------------------------------------- #
TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}
STOPWORDS_TRANSLIT = {"ob", "o", "i", "v", "po", "k", "na", "ot", "dlya", "ili", "s", "so", "ee", "ih"}


def translit(text):
    out = []
    for ch in text.lower():
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
    s = re.sub(r"-+", "-", "".join(out)).strip("-")
    return s


def short_slug(title, max_words=6):
    words = [w for w in translit(title).split("-") if w]
    kept = [w for w in words if w not in STOPWORDS_TRANSLIT and len(w) > 1]
    if not kept:
        kept = words
    return "-".join(kept[:max_words]) or "dokument"


# --------------------------------------------------------------------------- #
#  Даты                                                                        #
# --------------------------------------------------------------------------- #
def parse_ru_date(s):
    m = re.search(r"(\d{1,2})\s+([А-Яа-яёЁ]+)\s+(\d{4})", s)
    if m:
        mon = RU_MONTHS.get(m.group(2).lower())
        if mon:
            try:
                return datetime.date(int(m.group(3)), mon, int(m.group(1)))
            except ValueError:
                return None
    m = re.search(r"(\d{1,2})\.(\d{2})\.(\d{4})", s)
    if m:
        try:
            return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


# --------------------------------------------------------------------------- #
#  Регулярные выражения                                                        #
# --------------------------------------------------------------------------- #
STRUCT = r"(?:Статья|Пункт|Подпункт|Часть|Параграф|Раздел|Подраздел|Абзац|Глава|Книга|Подпараграф|Приложение)"

RE_EDIT_ANNOT = re.compile(
    r"^\s*" + STRUCT + r"\s+[\d.,\sIVXLCDМ-]*?\b(изменен\w*|дополнен\w*)\b", re.IGNORECASE)
RE_LAW_AMEND = re.compile(
    r"^\s*(Федеральным законом|Постановлением|Приказом|Указом|Распоряжением|Законом)\b.*"
    r"(внесен\w*\s+изменени\w*|дополнен\w*|изложен\w*\s+в\s+(новой\s+)?редакции|"
    r"изменен\w*\s+(статья|пункт|абзац|часть|раздел|глава|подпункт|преамбул))", re.IGNORECASE)
RE_NUM_UTRATIL = re.compile(r"^\s*\d+(?:\.\d+)*[\).]\s*утрати[лв]\w*\s+силу", re.IGNORECASE)
RE_ABZ_UTRATIL = re.compile(
    r"^\s*(абзац|подпункт|пункт|часть|статья|глава|раздел|параграф)\b[^.]*?утрати[лв]\w*\s+силу",
    re.IGNORECASE)
RE_PAREN_EDIT = re.compile(
    r"^\s*\((?:в\s+ред\.|введ[её]н|в\s+редакции|см\.\s*текст|дополнен|изменен|утратил|"
    r"п\.\s|абзац|часть|статья|пункт|подпункт)", re.IGNORECASE)
RE_RED_META = re.compile(
    r"^\s*(Редакция\s+от|В\s+редакции\s+от|Предыдущ\w+\s+редакци|"
    r"С\s+изменениями\s+и\s+дополнениями|Изменения,\s+вступающ)", re.IGNORECASE)
RE_INLINE_VRED = re.compile(r"\s*\((?:в\s+ред\.|введ[её]н|в\s+редакции)[^()]*\)", re.IGNORECASE)

RE_PAGE_NUM = re.compile(r"^\s*-?\s*\d{1,4}\s*-?\s*$")
RE_FORM_FEED = re.compile(r"\f")

RE_GLAVA = re.compile(r"^\s*(Глава|Раздел|Подраздел)\s+([\dIVXLCDМ]+(?:\.\d+)*)\.?\s*(.*)$", re.IGNORECASE)
RE_STATYA_HEAD = re.compile(r"^\s*(Стат(?:ья|ьи))\s+(\d+(?:\.\d+)*)\.\s*(.*)$")
RE_ROMAN_SECTION = re.compile(r"^\s*([IVX]{1,6})\.\s+([А-ЯЁ].{2,})$")

RE_FUTURE = re.compile(
    r"(изменен\w*\s+с|вступ\w+\s+в\s+силу|действует\s+до|вводит\w*\s+в\s+действие)", re.IGNORECASE)
RE_REPEALED = re.compile(r"утрати[лв]\w*\s+силу", re.IGNORECASE)


def statya_num(line):
    m = RE_STATYA_HEAD.match(line.strip())
    return m.group(2) if m else None


def is_editorial_or_repealed(line):
    s = line.strip()
    return bool(RE_EDIT_ANNOT.match(s) or RE_REPEALED.search(s))


def looks_like_doc_start(line):
    s = line.strip().upper()
    starts = (
        "РОССИЙСКАЯ ФЕДЕРАЦИЯ", "ФЕДЕРАЛЬНЫЙ ЗАКОН", "МИНИСТЕРСТВО",
        "ПРАВИТЕЛЬСТВО РОССИЙСКОЙ", "ФЕДЕРАЛЬНАЯ СЛУЖБА", "ПРИКАЗ",
        "ПОСТАНОВЛЕНИЕ", "САНПИН", "СНИП", "ВОДНЫЙ КОДЕКС", "КОДЕКС",
        "2.2.1", "2.1.7", "2.2.4", "СН ", "ЗОНЫ САНИТАРНОЙ", "ГИГИЕНИЧЕСКИЕ",
        "ФИЗИЧЕСКИЕ ФАКТОРЫ", "СТРОИТЕЛЬНЫЕ НОРМЫ",
    )
    return any(s.startswith(p) for p in starts)


def collapse_spacing(line):
    """Убирает «разрядку» букв (PDF-артефакт): 'о т х о д о в' -> 'отходов'.
    Разделителем слов считаем 2+ пробела; внутри слова буквы разделены 1 пробелом."""
    if "  " not in line:
        return line
    parts = re.split(r" {2,}", line)
    words, fixed = [], False
    for p in parts:
        toks = [t for t in p.split(" ") if t]
        if len(toks) >= 3 and sum(1 for t in toks if len(t) == 1) >= len(toks) * 0.7:
            words.append("".join(toks))
            fixed = True
        else:
            words.append(p)
    return " ".join(words) if fixed else line


# --------------------------------------------------------------------------- #
#  Разбор имени файла                                                          #
# --------------------------------------------------------------------------- #
def parse_filename(fname):
    base = fname[:-4] if fname.lower().endswith(".txt") else fname
    parts = base.split("__")
    group = parts[1] if len(parts) > 1 else ""
    date_iso, num, title, designation = None, None, None, None

    m = re.search(r"(\d{2})_(\d{2})_(\d{4})_([\dA-Za-zА-Яа-я-]+)", base)
    if m:
        try:
            date_iso = datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
        except ValueError:
            date_iso = None
        num = m.group(4)
        after = base[m.end():].strip()
        title = after or None

    if group == "snp":
        rest = base.split("snp__", 1)[1] if "snp__" in base else parts[-1]
        sm = re.match(r"(\S+)\s+(.*)$", rest)
        if sm:
            designation = sm.group(1)
            title = sm.group(2).strip()
    return group, date_iso, num, title, designation


TYPE_BY_GROUP = {
    "fz": ("Федеральный закон", "FZ"),
    "kodeks": ("Кодекс РФ", "Kodeks"),
    "pprf": ("Постановление Правительства РФ", "PP"),
    "mpr1": ("Приказ Минприроды России", "PR-Minprirody"),
    "rosstat": ("Приказ Росстата", "PR-Rosstat"),
    "rpn1": ("Приказ Росприроднадзора", "PR-RPN"),
    "snp": ("СанПиН", "SanPiN"),
}


def detect_type(group, head_text):
    """Тип определяется в первую очередь по группе из имени файла (надёжный
    источник), содержимое используется только для уточнения СанПиН/СНиП и кодексов."""
    h = head_text.upper()
    if group == "snp":
        if "СНИП" in h or "СТРОИТЕЛЬНЫЕ НОРМЫ" in h:
            return "СНиП", "SNiP"
        return "СанПиН", "SanPiN"
    if group == "kodeks":
        return "Кодекс РФ", "Kodeks"
    if group in TYPE_BY_GROUP:
        return TYPE_BY_GROUP[group]
    # запас: по содержимому
    if "КОДЕКС" in h:
        return "Кодекс РФ", "Kodeks"
    if "ПОСТАНОВЛЕНИЕ" in h and "ПРАВИТЕЛЬСТВ" in h:
        return "Постановление Правительства РФ", "PP"
    if "ПРИКАЗ" in h:
        return "Приказ федерального органа исполнительной власти", "PR"
    if "ФЕДЕРАЛЬНЫЙ ЗАКОН" in h:
        return "Федеральный закон", "FZ"
    return "Иной нормативный акт", "NPA"


def detect_number(group, num_fn, header_text, content_head):
    if group in ("fz", "kodeks"):
        m = re.search(r"N\s*(\d+)\s*-\s*Ф[КЗ]+", header_text)
        if m:
            return m.group(0).replace("N", "").replace(" ", "").lstrip()
        m = re.search(r"N\s*(\d+-\d+)", header_text)
        if m:
            return m.group(1)
        if num_fn:
            return num_fn + "-ФЗ"
    if group in ("pprf", "mpr1", "rosstat", "rpn1"):
        if num_fn:
            return num_fn
        m = re.search(r"\bN\s*(\d+)\b", header_text)
        if m:
            return m.group(1)
    if group == "snp":
        for pat in (r"СанПиН\s+([\d./-]+)", r"СНиП\s+([\d.\s-]*\d)", r"\bСН\s+([\d./-]+)"):
            m = re.search(pat, content_head)
            if m:
                label = "СНиП" if "СНиП" in pat else ("СанПиН" if "СанПиН" in pat else "СН")
                return "{} {}".format(label, m.group(1).strip())
    return num_fn or ""


# --------------------------------------------------------------------------- #
#  Темы и теги                                                                 #
# --------------------------------------------------------------------------- #
TOPIC_RULES = [
    ("отходы", [r"отход", r"\bФККО\b", r"\bТКО\b"]),
    ("выбросы", [r"выброс", r"атмосферн", r"\bНМУ\b", r"\bНДВ\b"]),
    ("НВОС", [r"негативн\w* воздействи", r"\bНВОС\b", r"\bДВОС\b"]),
    ("вода", [r"\bводн", r"водоснабж", r"водоотвед", r"сточн\w* вод", r"водопользован"]),
    ("отчетность", [r"\bотч[её]т", r"деклараци", r"статистическ\w* наблюден", r"2-ТП", r"\bПЭК\b"]),
    ("экологический контроль", [r"контрол\w* \(надзор", r"государственн\w* контрол", r"\bнадзор"]),
    ("лицензирование", [r"лицензир", r"лицензи"]),
    ("недропользование", [r"\bнедр"]),
    ("экологическая экспертиза", [r"экологическ\w* эксперт"]),
    ("санитарные требования", [r"санитарн", r"гигиеническ", r"санитарно-защитн", r"\bСЗЗ\b", r"\bшум"]),
    ("плата за НВОС", [r"плат\w* за негативн", r"ставк\w* плат"]),
]

TAG_RULES = [
    ("отходы", [r"отход"]),
    ("ФККО", [r"\bФККО\b", r"классификационн\w* каталог отход"]),
    ("ТКО", [r"\bТКО\b", r"тверд\w* коммунальн\w* отход"]),
    ("выбросы в атмосферу", [r"выброс", r"атмосферн"]),
    ("НМУ", [r"\bНМУ\b", r"неблагоприятн\w* метеорологическ"]),
    ("инвентаризация источников", [r"инвентаризаци"]),
    ("НВОС", [r"негативн\w* воздействи", r"\bНВОС\b"]),
    ("категорирование объектов", [r"\bкатегори"]),
    ("ДВОС", [r"\bДВОС\b", r"деклараци\w* о воздействии"]),
    ("плата за НВОС", [r"плат\w* за негативн"]),
    ("вода", [r"\bводн\w", r"водопользован"]),
    ("водоснабжение и водоотведение", [r"водоснабж", r"водоотвед"]),
    ("сточные воды", [r"сточн\w* вод"]),
    ("отчётность", [r"статистическ\w* наблюден", r"\bотч[её]тност"]),
    ("декларация", [r"деклараци"]),
    ("ПЭК", [r"\bПЭК\b", r"производственн\w* экологическ\w* контрол"]),
    ("2-ТП", [r"2-ТП"]),
    ("государственный контроль (надзор)", [r"контрол\w* \(надзор", r"государственн\w* контрол"]),
    ("лицензирование", [r"лицензир"]),
    ("недропользование", [r"\bнедр"]),
    ("экологическая экспертиза", [r"экологическ\w* эксперт"]),
    ("санитарно-защитные зоны", [r"санитарно-защитн", r"\bСЗЗ\b"]),
    ("санитарные нормы", [r"санитарн\w* правил", r"\bСанПиН\b", r"гигиеническ\w* норматив"]),
    ("защита от шума", [r"\bшум"]),
    ("охрана окружающей среды", [r"охран\w* окружающ\w* сред"]),
    ("охрана атмосферного воздуха", [r"охран\w* атмосферн"]),
    ("инвентаризация отходов", [r"учет\w* в области обращения с отход"]),
]


def _topic_scores(corpus):
    return {topic: sum(len(re.findall(p, corpus, re.IGNORECASE)) for p in pats)
            for topic, pats in TOPIC_RULES}


def detect_topic(text, title=""):
    tscore = _topic_scores(title or "")
    bscore = _topic_scores(text)
    title_topics = [t for t, s in tscore.items() if s > 0]
    if title_topics:
        # тема из заголовка решающая; при равенстве — по частоте в тексте
        ranked = sorted(((tscore[t] * 100 + bscore.get(t, 0), t) for t in title_topics),
                        reverse=True)
        return ranked[0][1]
    ranked = sorted(((s, t) for t, s in bscore.items() if s > 0), reverse=True)
    return ranked[0][1] if ranked else "природоохранное законодательство"


def detect_tags(text, topic):
    counts = []
    for tag, pats in TAG_RULES:
        c = sum(len(re.findall(p, text, re.IGNORECASE)) for p in pats)
        if c:
            counts.append((c, tag))
    counts.sort(reverse=True)
    # значимые теги: встречаются >= 3 раз
    tags = [t for c, t in counts if c >= 3]
    if len(tags) < 3:
        tags = [t for c, t in counts][:6]
    tags = tags[:10]
    if topic not in tags and topic != "природоохранное законодательство":
        tags = ([topic] + tags)[:10]
    if "природоохранное законодательство" not in tags and len(tags) < 10:
        tags.append("природоохранное законодательство")
    for extra in ("экология", "нормативный документ РФ", "требования"):
        if len(tags) >= 3:
            break
        if extra not in tags:
            tags.append(extra)
    return tags[:10]


# --------------------------------------------------------------------------- #
#  Чтение и заголовок                                                          #
# --------------------------------------------------------------------------- #
def read_lines(path):
    for enc in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            with open(path, "r", encoding=enc) as f:
                return f.read().splitlines()
        except UnicodeDecodeError:
            continue
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().splitlines()


ACRONYMS = ["НВОС", "ДВОС", "ПЭК", "НДВ", "НМУ", "ФККО", "ТКО", "ФГИС", "СЗЗ",
            "РФ", "КоАП", "ОНВ", "ИЗАВ"]


def restore_caps(s):
    for a in ACRONYMS:
        s = re.sub(r"(?<![А-Яа-яA-Za-z])" + a + r"(?![А-Яа-яa-z])", a, s, flags=re.IGNORECASE)
    s = re.sub(r"\b(\d+)-тп\b", lambda m: m.group(1) + "-ТП", s, flags=re.IGNORECASE)
    # символ номера «N» перед числом
    s = re.sub(r"(?<![A-Za-zА-Яа-я])n(?=\s*\d)", "N", s)
    # римские числа (латиница) — вернуть в верхний регистр
    s = re.sub(r"\b(i{1,3}|iv|vi{0,3}|ix|xi{0,2}|x)\b", lambda m: m.group(1).upper(), s)
    # имена собственные
    s = re.sub(r"\bроссийск(ой|ая|ую|ие|их|ом)\s+федерац(ии|ия|ию|ий|ием)",
               lambda m: "Российск" + m.group(1) + " Федерац" + m.group(2), s, flags=re.IGNORECASE)
    s = re.sub(r"(?<![А-Яа-я])россии(?![А-Яа-я])", "России", s, flags=re.IGNORECASE)
    return s


def to_sentence_case(s):
    s = s.strip().rstrip(".")
    if not s:
        return s
    letters = [c for c in s if c.isalpha()]
    # привести к виду «Первая заглавная», если строка преимущественно в верхнем регистре
    if letters and sum(1 for c in letters if c.isupper()) >= len(letters) * 0.6:
        s = s[0].upper() + s[1:].lower()
        s = restore_caps(s)
    return s


def find_title_in_content(raw_lines):
    norm = [collapse_spacing(l.replace("\u00b6", " ")).strip() for l in raw_lines]
    start = 0
    for idx, ln in enumerate(norm[:15]):
        if looks_like_doc_start(ln):
            start = idx
            break
    for ln in norm[start:start + 30]:
        u = ln.upper()
        if not ln:
            continue
        if re.match(r"^(ОБ?\s|КОДЕКС|КРИТЕРИИ|ПОРЯДОК|ТРЕБОВАНИЯ|ФЕДЕРАЛЬНЫЙ КЛАССИФИКАЦ|"
                    r"САНПИН|СНИП|ГИГИЕНИЧЕСКИЕ|САНИТАРНО|ЗОНЫ|ФИЗИЧЕСКИЕ|МЕТОДИКА|ПРАВИЛА)", u):
            return ln.rstrip(".")
    return None


# --------------------------------------------------------------------------- #
#  Очистка и структурирование                                                  #
# --------------------------------------------------------------------------- #
def is_faq_heading(s):
    """Заголовок FAQ: строка-вопрос (заканчивается '?') либо ПРОПИСНОЙ подзаголовок."""
    s = s.strip()
    if not s or len(s) > 200:
        return False
    if s.endswith("?"):
        return True
    letters = [c for c in s if c.isalpha()]
    if letters and not s.endswith((".", ":", ";", ",")) \
            and sum(1 for c in letters if c.isupper()) >= len(letters) * 0.7:
        return True
    return False


def process_faq(raw_lines):
    """Бережная обработка справочного документа (FAQ): без удаления норм/редакций,
    только очистка артефактов и разметка пар «вопрос — ответ»."""
    norm = []
    for ln in raw_lines:
        ln = ln.replace("\u00b6", " ").replace("\ufeff", "").replace("\u00ad", "").replace("\\n", " ")
        ln = RE_FORM_FEED.sub(" ", ln).replace("\t", " ")
        ln = collapse_spacing(ln)
        ln = re.sub(r"[ ]{2,}", " ", ln).rstrip()
        norm.append(ln)

    body, n_q, n_sec, future = [], 0, 0, []
    prev_blank = True
    for raw in norm:
        s = raw.strip()
        if not s:
            if body and not prev_blank:
                body.append("")
                prev_blank = True
            continue
        if RE_PAGE_NUM.match(s) or s.upper() in ("СКАЧАТЬ ПОЛНОСТЬЮ", "КОНСУЛЬТАНТПЛЮС"):
            continue
        if RE_FUTURE.search(s):
            d = parse_ru_date(s)
            if d and d > TODAY:
                future.append(s)
        if is_faq_heading(s):
            if s.endswith("?"):
                n_q += 1
            else:
                n_sec += 1
            body += ["", "## " + s, ""]
            prev_blank = True
            continue
        body.append(raw)
        prev_blank = False

    while body and body[0] == "":
        body.pop(0)
    while body and body[-1] == "":
        body.pop()

    warnings = []
    if future:
        warnings.append("В тексте упомянуты изменения/сроки, наступающие позднее даты "
                        "подготовки базы знаний ({}):".format(TODAY_STR))
        seen = set()
        for f in future:
            if f not in seen:
                warnings.append("  - " + f)
                seen.add(f)
            if len(seen) >= 10:
                break
    warnings.append("Справочно-консультационный материал (FAQ); не является нормативным правовым "
                    "актом и не заменяет консультацию эколога или юриста.")
    warnings.append("Содержит ссылки на нормативные акты и их положения — актуальность проверять "
                    "по первоисточникам (КонсультантПлюс / pravo.gov.ru).")
    return body, n_q, n_sec, warnings


def process_nvos_category(raw_lines):
    """Бережная обработка справочника перечней документов по категориям НВОС.
    Исходник уже в Markdown — сохраняем структуру и текст без изменения смысла."""
    title = "Перечни природоохранной документации по категориям объектов НВОС (справочник ЭкоЧекАп)"
    body, n_sec, future = [], 0, []
    skip_h1 = True

    for ln in raw_lines:
        ln = ln.replace("\ufeff", "").replace("\u00ad", "").rstrip()
        if skip_h1 and ln.startswith("# "):
            title = ln[2:].strip()
            skip_h1 = False
            continue
        if ln.startswith("## "):
            n_sec += 1
        if RE_FUTURE.search(ln):
            d = parse_ru_date(ln)
            if d and d > TODAY:
                future.append(ln.strip())
        body.append(ln)

    while body and not body[0].strip():
        body.pop(0)
    while body and not body[-1].strip():
        body.pop()

    warnings = [
        "Справочный ориентир для сверки комплекта природоохранной документации; "
        "не заменяет официальные нормативные акты.",
        "Номера приказов, формы отчётности и сроки подачи — уточнять по действующим "
        "редакциям НПА (КонсультантПлюс / pravo.gov.ru).",
        "При использовании в отчёте ЭкоЧекАп не смешивать перечни категорий I–IV "
        "(КЭР, ДВОС и иные документы относятся к разным категориям).",
    ]
    if future:
        warnings.insert(0, "В документе упомянуты сроки/изменения, наступающие позднее даты "
                         "подготовки базы знаний ({}):".format(TODAY_STR))
        for f in future[:10]:
            warnings.append("  - " + f)
    return body, title, n_sec, warnings


def is_masthead_line(s, title_u):
    """True для строк институциональной шапки (дублируются в метаданных/# Title)."""
    su = s.upper().rstrip(".").strip()
    if not su:
        return False
    if su in ("РОССИЙСКАЯ ФЕДЕРАЦИЯ", "ФЕДЕРАЛЬНЫЙ ЗАКОН", "ЗАКОН РОССИЙСКОЙ ФЕДЕРАЦИИ",
              "ФЕДЕРАЛЬНЫЙ ЗАКОН РОССИЙСКОЙ ФЕДЕРАЦИИ", "ПРИКАЗ", "ПОСТАНОВЛЕНИЕ"):
        return True
    if su.startswith(("МИНИСТЕРСТВО", "ПРАВИТЕЛЬСТВО РОССИЙСКОЙ", "ФЕДЕРАЛЬНАЯ СЛУЖБА")):
        return True
    if re.match(r"^ОТ\s+\d{1,2}[.\s]", su) and re.search(r"\bN\s*\S+$", su):
        return True
    if re.match(r"^ОТ\s+\d{1,2}\s+[А-ЯЁ]+\s+\d{4}\s*Г?\.?$", su):
        return True
    if re.match(r"^N\s*\d", su):
        return True
    if title_u and su == title_u:
        return True
    return False


def consume_paren_block(lines, i):
    depth, j = 0, i
    while j < len(lines):
        depth += lines[j].count("(") - lines[j].count(")")
        if depth <= 0:
            return j
        j += 1
    return j


def clean_and_structure(raw_lines, title):
    stats = {"out_statya": set(), "src_statya": set(),
             "out_glava": 0, "src_glava": 0, "removed_editorial": 0}
    future_changes = []
    has_repealed_refs = False

    # 1. Нормализация: разрядка букв, ¶, табы, схлопывание пробелов
    norm = []
    for ln in raw_lines:
        ln = ln.replace("\u00b6", " ").replace("\ufeff", "").replace("\u00ad", "")
        ln = ln.replace("\\n", " ")
        ln = RE_FORM_FEED.sub(" ", ln).replace("\t", " ")
        ln = collapse_spacing(ln)
        ln = re.sub(r"[ ]{2,}", " ", ln).rstrip()
        norm.append(ln)

    # 2. Начало документа
    start = 0
    for idx, ln in enumerate(norm[:15]):
        if looks_like_doc_start(ln):
            start = idx
            break
    norm = norm[start:]

    # 3. Эталонный подсчёт структуры (только действующие статьи/главы)
    for ln in norm:
        s = ln.strip()
        num = statya_num(s)
        if num and not is_editorial_or_repealed(s):
            stats["src_statya"].add(num)
        if RE_GLAVA.match(s) and not is_editorial_or_repealed(s) and not statya_num(s):
            stats["src_glava"] += 1

    # 4. Основной проход
    title_u = (title or "").strip().upper().rstrip(".")
    body = []
    i, n = 0, len(norm)
    prev_blank = True
    while i < n:
        ln = norm[i]
        s = ln.strip()

        # точечное удаление институциональной шапки (только первые строки;
        # без «слепого» пропуска, чтобы не потерять статьи/преамбулу)
        if i < 12 and is_masthead_line(s, title_u):
            i += 1
            continue

        if not s:
            i += 1
            if not prev_blank and body:
                body.append("")
                prev_blank = True
            continue
        if RE_PAGE_NUM.match(s):
            i += 1
            continue
        if s.upper() in ("СКАЧАТЬ ПОЛНОСТЬЮ", "КОНСУЛЬТАНТПЛЮС",
                         "КОНСУЛЬТАНТПЛЮС: ПРИМЕЧАНИЕ.", "КОММЕНТАРИИ"):
            i += 1
            continue
        # библиографические артефакты PDF (ББК/УДК/ISBN/каталожный код)
        if re.match(r"^(ББК|УДК|ISBN|ISSN)\b", s, re.IGNORECASE):
            i += 1
            continue

        # многострочный редакционный блок "(в ред. ...)"
        if RE_PAREN_EDIT.match(s):
            end = i
            if s.count("(") > s.count(")"):
                end = consume_paren_block(norm, i)
            for k in range(i, end + 1):
                if RE_FUTURE.search(norm[k]):
                    d = parse_ru_date(norm[k])
                    if d and d > TODAY:
                        future_changes.append(norm[k].strip())
            stats["removed_editorial"] += (end - i + 1)
            i = end + 1
            continue

        if RE_RED_META.match(s):
            d = parse_ru_date(s)
            if d and d > TODAY:
                future_changes.append(s)
            stats["removed_editorial"] += 1
            i += 1
            continue

        if RE_EDIT_ANNOT.match(s):
            if RE_FUTURE.search(s):
                d = parse_ru_date(s)
                if d and d > TODAY:
                    future_changes.append(s)
            stats["removed_editorial"] += 1
            i += 1
            continue

        if RE_LAW_AMEND.match(s):
            d = parse_ru_date(s)
            if d and d > TODAY:
                future_changes.append(s)
            stats["removed_editorial"] += 1
            i += 1
            continue

        # маркеры утративших силу пунктов/абзацев/статей
        if RE_NUM_UTRATIL.match(s) or RE_ABZ_UTRATIL.match(s):
            has_repealed_refs = True
            if RE_FUTURE.search(s):
                d = parse_ru_date(s)
                if d and d > TODAY:
                    future_changes.append(s)
            stats["removed_editorial"] += 1
            i += 1
            continue

        if RE_REPEALED.search(s):
            has_repealed_refs = True

        # встроенные "(в ред. ...)"
        cleaned = re.sub(r"[ ]{2,}", " ", RE_INLINE_VRED.sub("", ln)).rstrip()
        scl = cleaned.strip()
        if not scl:
            i += 1
            continue

        if RE_FUTURE.search(scl):
            d = parse_ru_date(scl)
            if d and d > TODAY:
                future_changes.append(scl)

        # --- Заголовки ---
        num = statya_num(scl)
        if num is not None:
            m_head = RE_STATYA_HEAD.match(scl)
            rest = m_head.group(3).strip() if m_head else ""
            # статья-заглушка «Статья N. Утратила силу ...» — исключаем из текста
            if re.match(r"^(Утрати[лв]\w*\s+силу|Исключен)", rest, re.IGNORECASE):
                has_repealed_refs = True
                stats["removed_editorial"] += 1
                i += 1
                continue
            stats["out_statya"].add(num)
            body.append("")
            body.append("### " + scl)
            body.append("")
            prev_blank = True
            i += 1
            continue

        # глава-заглушка «Глава N. Утратила силу ...» — исключаем
        if RE_GLAVA.match(scl) and is_editorial_or_repealed(scl):
            has_repealed_refs = True
            stats["removed_editorial"] += 1
            i += 1
            continue

        m_gl = RE_GLAVA.match(scl)
        if m_gl and not is_editorial_or_repealed(scl):
            kind, gnum, gtitle = m_gl.group(1), m_gl.group(2), m_gl.group(3).strip()
            stats["out_glava"] += 1
            if not gtitle:
                j = i + 1
                while j < n and not norm[j].strip():
                    j += 1
                nxt = norm[j].strip() if j < n else ""
                if nxt and statya_num(nxt) is None and not RE_GLAVA.match(nxt) \
                        and not re.match(r"^\d+[.\)]", nxt) and len(nxt) < 200:
                    gtitle = nxt
                    i = j
            head = "## {} {}.".format(kind, gnum)
            if gtitle:
                head += " " + gtitle
            body.append("")
            body.append(head)
            body.append("")
            prev_blank = True
            i += 1
            continue

        m_rom = RE_ROMAN_SECTION.match(scl)
        if m_rom:
            body.append("")
            body.append("## " + scl)
            body.append("")
            prev_blank = True
            i += 1
            continue

        body.append(cleaned)
        prev_blank = False
        i += 1

    while body and body[0] == "":
        body.pop(0)
    while body and body[-1] == "":
        body.pop()

    warnings = []
    if future_changes:
        warnings.append("В документе обнаружены изменения, вступающие в силу позднее даты "
                        "подготовки базы знаний ({}). Требуется проверка применимости редакции:"
                        .format(TODAY_STR))
        seen = set()
        for fc in future_changes:
            fc = fc.strip()
            if fc not in seen:
                warnings.append("  - " + fc)
                seen.add(fc)
            if len(seen) >= 20:
                warnings.append("  - … (и другие отметки о будущих изменениях)")
                break
    if has_repealed_refs:
        warnings.append("В документе присутствуют ссылки на нормы/документы, утратившие силу "
                        "(в переходных и заключительных положениях). Требует проверки актуальности.")
    warnings.append("Требует проверки актуальности по официальному источнику "
                    "(КонсультантПлюс / pravo.gov.ru) перед использованием в консультациях.")

    return body, stats, warnings


# --------------------------------------------------------------------------- #
#  Сборка Markdown                                                             #
# --------------------------------------------------------------------------- #
def build_description(type_name, title_sc, body_lines, topic):
    for ln in body_lines[:60]:
        if re.match(r"^Настоящ(ий|ая|ее|ие)\b", ln) and \
           re.search(r"(устанавлива|регулиру|определя|направлен)", ln):
            return ln.strip()
    return "{} в сфере «{}». {}.".format(type_name, topic, title_sc)


def vector_recommendations(type_code, is_table, priority, title_sc):
    overlap = "150 токенов"
    if type_code == "FAQ":
        chunk_type = "по парам «вопрос — ответ» (каждый вопрос вместе с ответом — отдельный чанк)"
        chunk_size = "200–600 токенов"
        overlap = "50–100 токенов"
        reason = ("Справочный материал EcoLeadBot по экологическому законодательству и практике; "
                  "хорошо подходит для прямых ответов на типовые вопросы пользователей.")
    elif type_code == "Ref-NVOS":
        chunk_type = ("по категориям объектов НВОС (I–IV) и блокам перечня документов; "
                      "сохранять таблицы и пояснения к позициям целиком")
        chunk_size = "400–800 токенов"
        overlap = "100 токенов"
        reason = ("Справочник перечней природоохранной документации по категориям НВОС; "
                  "высокая ценность для квалификации и консультаций EcoLeadBot RAG Assistant.")
    elif is_table:
        chunk_type = "по записям каталога/строкам таблицы (код + наименование), сохраняя целостность записи"
        chunk_size = "300–800 токенов (группировать связанные позиции)"
        reason = ("Действующий нормативный документ РФ по экологической тематике; "
                  "релевантен для консультаций EcoLeadBot RAG Assistant.")
    elif type_code in ("FZ", "Kodeks"):
        chunk_type = "по статьям (одна статья — один чанк); крупные статьи дробить по пунктам"
        chunk_size = "500–1000 токенов"
        reason = ("Действующий нормативный документ РФ по экологической тематике; "
                  "релевантен для консультаций EcoLeadBot RAG Assistant.")
    else:
        chunk_type = "по разделам и пунктам нормативного акта"
        chunk_size = "500–1000 токенов"
        reason = ("Действующий нормативный документ РФ по экологической тематике; "
                  "релевантен для консультаций EcoLeadBot RAG Assistant.")
    if "О ВНЕСЕНИИ ИЗМЕНЕНИЙ" in title_sc.upper():
        reason = ("Документ вносит изменения в базовый акт; включать как вспомогательный "
                  "источник — основной приоритет у консолидированной редакции базового документа.")
    return "\n".join([
        "## Vector Store Recommendations", "",
        "- **Тип чанкинга:** {}".format(chunk_type),
        "- **Рекомендуемый размер чанка:** {}".format(chunk_size),
        "- **Overlap:** {}".format(overlap),
        "- **Приоритет:** {}".format(priority),
        "- **Включать в EcoLeadBot RAG:** yes",
        "- **Причина:** {}".format(reason),
    ])


def decide_priority(type_code, title_sc):
    if "О ВНЕСЕНИИ ИЗМЕНЕНИЙ" in title_sc.upper():
        return "low"
    if type_code in ("FZ", "Kodeks", "Ref-NVOS"):
        return "high"
    return "medium"


def yaml_escape(s):
    return (s or "").replace('"', "'").strip()


def build_markdown(meta, description, body_lines, warnings, vector_block):
    y = ["---",
         'title: "{}"'.format(yaml_escape(meta["title"])),
         'document_number: "{}"'.format(yaml_escape(meta["document_number"])),
         'type: "{}"'.format(yaml_escape(meta["type"])),
         'topic: "{}"'.format(yaml_escape(meta["topic"])),
         "source: {}".format(meta.get("source", "КонсультантПлюс")),
         'date_adopted: "{}"'.format(yaml_escape(meta.get("date_adopted", ""))),
         'updated: "{}"'.format(meta["updated"]),
         "priority: {}".format(meta["priority"]),
         "tags:"]
    for t in meta["tags"]:
        y.append("  - {}".format(t))
    y.append('status: "{}"'.format(meta["status"]))
    y.append("---")

    parts = ["\n".join(y), "",
             "# {}".format(meta["title"]), "",
             "> **Тип документа:** {} | **Номер:** {} | **Дата принятия:** {}".format(
                 meta["type"], meta["document_number"], meta.get("date_adopted") or "—"),
             "", description, ""]
    if meta["status"] != "OK":
        parts += ["> **STATUS: REQUIRES MANUAL REVIEW** — {}".format(meta["status_note"]), ""]
    parts += ["## Warnings", ""]
    for w in warnings:
        parts.append(w if w.startswith("  - ") else "- {}".format(w))
    parts += ["", "## Текст документа", "", "\n".join(body_lines), "", vector_block, ""]
    return "\n".join(parts).rstrip() + "\n"


# --------------------------------------------------------------------------- #
#  Имя выходного файла                                                         #
# --------------------------------------------------------------------------- #
def output_number_token(group, number, num_fn, designation):
    if group in ("fz", "kodeks"):
        m = re.search(r"\d+", number or num_fn or "")
        return (m.group(0).zfill(3) if m else "000")
    if group in ("pprf", "mpr1", "rosstat", "rpn1"):
        core = num_fn or re.sub(r"\D", "", number or "")
        return core.zfill(3) if core and len(core) <= 3 else (core or "000")
    if group == "snp":
        m = re.search(r"(\d{2,4}-\d{2,4}(?:-\d{2,4})?)", (number or "") + " " + (designation or ""))
        if m:
            return m.group(1)
        m = re.search(r"\d+", (number or designation or ""))
        return m.group(0) if m else "000"
    m = re.search(r"\d+", number or num_fn or "")
    return (m.group(0).zfill(3) if m else "000")


# --------------------------------------------------------------------------- #
#  Main                                                                        #
# --------------------------------------------------------------------------- #
def main():
    t0 = time.time()
    os.makedirs(KB_DIR, exist_ok=True)
    files = sorted(f for f in os.listdir(RAW_DIR)
                   if f.lower().endswith((".txt", ".md")))
    processed, review, errors, used_names = [], [], [], {}

    for fname in files:
        path = os.path.join(RAW_DIR, fname)
        try:
            raw_lines = read_lines(path)
            full_text = "\n".join(collapse_spacing(l.replace("\u00b6", " ")) for l in raw_lines)
            group, date_iso, num_fn, title_fn, designation = parse_filename(fname)

            # --- Справочник перечней документов по категориям НВОС ---
            if "NVOS_CATEGORY" in fname.upper():
                body_lines, title, n_sec, warnings = process_nvos_category(raw_lines)
                topic = "НВОС"
                tags = detect_tags(full_text, topic)
                if "категорирование объектов" not in tags:
                    tags = (["категорирование объектов", "НВОС"] + tags)[:10]
                status = "OK" if len(body_lines) >= 5 else "REQUIRES MANUAL REVIEW"
                status_note = "" if status == "OK" else "Слишком короткий результат — проверить разбор."
                meta = {"title": title, "document_number": "NVOS-CAT-REF",
                        "type": "Справочник перечней документов по категориям НВОС",
                        "topic": topic, "source": "EcoLeadBot / ЭкоЧекАп (справочник)",
                        "date_adopted": "", "updated": TODAY_STR, "priority": "high",
                        "tags": tags, "status": status, "status_note": status_note}
                description = ("Ориентир для сверки полноты комплекта природоохранной документации "
                               "по категориям объектов НВОС (I–IV). Подготовлен для EcoLeadBot RAG "
                               "Assistant и отчётов ЭкоЧекАп. Не заменяет официальные нормативные акты.")
                vector_block = vector_recommendations("Ref-NVOS", False, "high", title)
                md = build_markdown(meta, description, body_lines, warnings, vector_block)
                out_name = "NVOS-Ref-perechni-dokumentacii-po-kategoriyam-obektov-nvos.md"
                with open(os.path.join(KB_DIR, out_name), "w", encoding="utf-8") as f:
                    f.write(md)
                rec = {"src": fname, "out": out_name,
                       "type": "Справочник НВОС (категории)", "number": "NVOS-CAT-REF",
                       "topic": topic, "glava": n_sec, "statya": 0, "removed": 0,
                       "warnings": len([w for w in warnings if not w.startswith("  - ")]),
                       "status": status, "status_note": status_note, "is_table": True,
                       "future": any(w.startswith("  - ") for w in warnings)}
                (processed if status == "OK" else review).append(rec)
                continue

            # --- Справочный документ (FAQ): отдельная бережная обработка ---
            if group == "" or fname.lower().startswith("faq"):
                body_lines, n_q, n_sec, warnings = process_faq(raw_lines)
                title = "Часто задаваемые вопросы по экологическому законодательству (FAQ EcoLeadBot)"
                topic = "экологическое законодательство (FAQ)"
                tags = detect_tags(full_text, "отходы")
                status = "OK" if len(body_lines) >= 5 else "REQUIRES MANUAL REVIEW"
                status_note = "" if status == "OK" else "Слишком короткий результат — проверить разбор."
                meta = {"title": title, "document_number": "FAQ",
                        "type": "Справочно-консультационный материал (FAQ)",
                        "topic": topic, "source": "ecolusspb.ru (EcoLeadBot FAQ)",
                        "date_adopted": "", "updated": TODAY_STR, "priority": "medium",
                        "tags": tags, "status": status, "status_note": status_note}
                description = ("Сборник часто задаваемых вопросов и ответов по экологическому "
                               "законодательству РФ и природоохранной практике, подготовленный для "
                               "EcoLeadBot RAG Assistant. Носит справочный характер и не заменяет "
                               "консультацию эколога или юриста.")
                vector_block = vector_recommendations("FAQ", False, "medium", title)
                md = build_markdown(meta, description, body_lines, warnings, vector_block)
                out_name = "FAQ-ekoleadbot-voprosy-i-otvety-po-ekologii.md"
                with open(os.path.join(KB_DIR, out_name), "w", encoding="utf-8") as f:
                    f.write(md)
                rec = {"src": fname, "out": out_name,
                       "type": "Справочный материал (FAQ)", "number": "FAQ", "topic": topic,
                       "glava": n_sec, "statya": n_q, "removed": 0,
                       "warnings": len([w for w in warnings if not w.startswith("  - ")]),
                       "status": status, "status_note": status_note, "is_table": False,
                       "future": any(w.startswith("  - ") for w in warnings)}
                (processed if status == "OK" else review).append(rec)
                continue
            head_lines = [collapse_spacing(l.replace("\u00b6", " ")) for l in raw_lines[:14]]
            head_text = "\n".join(head_lines)
            content_head = "\n".join(collapse_spacing(l.replace("\u00b6", " ")) for l in raw_lines[:60])

            type_name, type_code = detect_type(group, head_text)
            number = detect_number(group, num_fn, head_text, content_head)

            title = title_fn or find_title_in_content(raw_lines) or fname[:-4]
            title_sc = to_sentence_case(title)

            body_lines, stats, warnings = clean_and_structure(raw_lines, title)

            topic = detect_topic(full_text, title)
            tags = detect_tags(full_text, topic)
            priority = decide_priority(type_code, title_sc)

            is_table = (len(stats["out_statya"]) == 0 and stats["out_glava"] == 0
                        and (re.search(r"\d\s\d{2}\s\d{3}\s\d{2}\s\d{2}\s\d", full_text)
                             or "ФОРМА ФЕДЕРАЛЬНОГО СТАТИСТИЧЕСКОГО" in full_text.upper()
                             or group == "rosstat" or "КАТАЛОГ ОТХОДОВ" in (title or "").upper()))

            if not date_iso and group == "snp":
                for ln in content_head.splitlines():
                    if re.search(r"(Утвержд|введен|от)\b", ln, re.IGNORECASE):
                        d = parse_ru_date(ln)
                        if d:
                            date_iso = d.isoformat()
                            break

            status, status_note = "OK", ""
            missing = stats["src_statya"] - stats["out_statya"]
            if missing:
                status = "REQUIRES MANUAL REVIEW"
                status_note = "Не сопоставлены статьи при разметке: {}".format(
                    ", ".join(sorted(missing)[:15]))
            elif not is_table and type_code in ("FZ", "Kodeks") and not stats["out_statya"]:
                status = "REQUIRES MANUAL REVIEW"
                status_note = "Не обнаружены статьи в законе/кодексе — проверить структуру."
            elif len(body_lines) < 5:
                status = "REQUIRES MANUAL REVIEW"
                status_note = "Слишком короткий результат — возможна ошибка разбора."

            meta = {"title": title_sc, "document_number": number, "type": type_name,
                    "topic": topic, "source": "КонсультантПлюс", "date_adopted": date_iso or "",
                    "updated": TODAY_STR, "priority": priority, "tags": tags,
                    "status": status, "status_note": status_note}

            description = build_description(type_name, title_sc, body_lines, topic)
            vector_block = vector_recommendations(type_code, is_table, priority, title_sc)
            md = build_markdown(meta, description, body_lines, warnings, vector_block)

            tok = output_number_token(group, number, num_fn, designation)
            slug = short_slug(title)
            out_name = "{}-{}-{}.md".format(tok, type_code, slug)
            if out_name in used_names:
                used_names[out_name] += 1
                out_name = out_name[:-3] + "-{}.md".format(used_names[out_name])
            else:
                used_names[out_name] = 1

            with open(os.path.join(KB_DIR, out_name), "w", encoding="utf-8") as f:
                f.write(md)

            rec = {"src": fname, "out": out_name, "type": type_name, "number": number,
                   "topic": topic, "glava": stats["out_glava"], "statya": len(stats["out_statya"]),
                   "removed": stats["removed_editorial"],
                   "warnings": len([w for w in warnings if not w.startswith("  - ")]),
                   "status": status, "status_note": status_note, "is_table": is_table,
                   "future": any(w.startswith("  - ") for w in warnings)}
            (processed if status == "OK" else review).append(rec)

        except Exception as e:  # noqa
            import traceback
            errors.append({"src": fname, "error": "{}: {}".format(type(e).__name__, e),
                           "tb": traceback.format_exc()})

    elapsed = time.time() - t0
    write_report(processed, review, errors, len(files), elapsed)
    print("Готово. OK: {} | На проверку: {} | Ошибки: {} | {:.1f} c".format(
        len(processed), len(review), len(errors), elapsed))


def write_report(processed, review, errors, total, elapsed):
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    L = ["# Отчёт об обработке базы знаний EcoLeadBot RAG", "",
         "**Дата обработки:** {}  ".format(TODAY_STR),
         "**Время выполнения:** {:.2f} секунд  ".format(elapsed),
         "**Всего входных файлов:** {}  ".format(total),
         "**Успешно обработано (STATUS: OK):** {}  ".format(len(processed)),
         "**Требуют ручной проверки:** {}  ".format(len(review)),
         "**Ошибки обработки:** {}".format(len(errors)), "",
         "Выходные файлы сохранены в каталог `kb/`. Все действующие нормативные положения "
         "сохранены дословно; удалены только технические артефакты и редакционные пометки. "
         "Юридический смысл не изменялся.", ""]

    def table(rows):
        out = ["| Исходный файл | Markdown | Тип | Номер | Тема | Глав | Статей | Удал. ред. | Warn |",
               "|---|---|---|---|---|---|---|---|---|"]
        for r in rows:
            out.append("| {} | `{}` | {} | {} | {} | {} | {} | {} | {} |".format(
                r["src"][:50], r["out"], r["type"], r["number"], r["topic"],
                r["glava"], r["statya"], r["removed"], r["warnings"]))
        return "\n".join(out)

    L += ["## Успешно обработанные документы", "", table(processed) if processed else "_нет_", ""]
    L += ["## Документы, требующие ручной проверки", ""]
    if review:
        L += [table(review), "", "### Причины", ""]
        for r in review:
            L.append("- `{}` → `{}`: {}".format(r["src"][:50], r["out"], r["status_note"]))
    else:
        L.append("_нет — все документы прошли контроль целостности_")
    L += [""]

    L += ["## Документы с отметками о будущих изменениях", ""]
    fut = [r for r in (processed + review) if r.get("future")]
    if fut:
        for r in fut:
            L.append("- `{}` — см. раздел Warnings в `{}`".format(r["src"][:50], r["out"]))
    else:
        L.append("_не обнаружено_")
    L += [""]

    L += ["## Обнаруженные ошибки", ""]
    if errors:
        for e in errors:
            L += ["- `{}`: {}".format(e["src"], e["error"]), "", "```", e["tb"].strip(), "```"]
    else:
        L.append("_ошибок не обнаружено_")
    L += [""]

    L += ["## Сводка по типам документов", ""]
    c = Counter(r["type"] for r in (processed + review))
    for k, v in sorted(c.items(), key=lambda x: -x[1]):
        L.append("- {}: {}".format(k, v))
    L += [""]

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
