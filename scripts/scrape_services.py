# -*- coding: utf-8 -*-
"""Парсинг услуг и профиля компании с ecolusspb.ru для EcoLeadBot RAG."""

from __future__ import annotations

import html
import json
import re
import time
import datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib import robotparser

import requests
from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parent.parent
KB = ROOT / "kb"
REPORTS = ROOT / "reports"
TODAY = datetime.date.today().isoformat()

BASE_URL = "https://ecolusspb.ru"
USER_AGENT = "EcoLeadBot-KB-Scraper/1.0 (+https://ecolusspb.ru; RAG knowledge base)"
REQUEST_DELAY = 0.75

HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "ru-RU,ru;q=0.9"}

EXCLUDE_URL_PATTERNS = [
    r"/articles/",
    r"/press/",
    r"/portfolio/",
    r"/testimonials/",
    r"/company/clients/",
    r"/company/nashi-sotrudniki/",
    r"/5reasons/",
    r"politica",
    r"privacy",
    r"\.pdf$",
    r"\.php$",
    r"/upload/",
]

SERVICE_INDEX_PATHS = {
    "https://ecolusspb.ru/services/",
    "https://ecolusspb.ru/dopuslugi/",
}

COMPANY_PROFILE_URLS = [
    "https://ecolusspb.ru/",
    "https://ecolusspb.ru/company/",
    "https://ecolusspb.ru/company/contacts/",
    "https://ecolusspb.ru/chasto-zadavaemye-voprosy/",
    "https://ecolusspb.ru/services/personal-ecolog/",
]

NOISE_PHRASES = [
    "Скоро с вами свяжется менеджер",
    "Хотите получить бесплатную консультацию",
    "Я ознакомлен(а) с",
    "политикой конфиденциальности",
    "согласие на обработку персональных данных",
    "Обратный звонок",
    "Оставьте Ваше сообщение",
    "Заказать ",
    "Подробнее",
    "Есть вопросы ? Пишите или звоните!",
]

REMOVE_SELECTORS = [
    "script", "style", "noscript", "iframe", "form", "nav",
    ".section_footer", ".section_navigation", ".header_info_main",
    ".main_top_nav", ".service_block_2", ".article_block2",
    ".form_container", ".modal", ".owl-carousel", ".slider_elements",
    ".section_feedback", ".section_fee", ".text_price",
]

TOPIC_KEYWORDS = {
    "отходы": ["отход", "фкко", "утилиз", "размещен", "тко", "pnoolr", "пноолр"],
    "выбросы": ["выброс", "пдв", "ндв", "атмосфер", "iiv", "иив", "nmu", "нму", "пгу"],
    "вода": ["вод", "сброс", "ндс", "декларац", "водопольз", "скважин"],
    "НВОС": ["нвос", "ecouchet", "экоучет", "negativn", "негativ", "плат"],
    "отчетность": ["отчет", "отчёт", "2-tp", "2tp", "2-тп", "госотчет", "декларац"],
    "лицензирование": ["лиценз", "litsenz", "licens"],
    "СЗЗ": ["сзз", "szz", "sanitarno-zashchit", "зсо", "zso"],
    "ПЭК": ["пэк", "pek", "proizvodstvenn"],
    "НМУ": ["нму", "nmu", "meropriyatiy"],
    "аудит": ["аудит", "audit", "проверк", "предписан"],
    "сопровождение": ["сопровож", "personal-ecolog", "аутсорс", "экосопров"],
}

COMPLEX_SLUGS = {
    "pdv", "pds", "pnoolr", "pek", "proizvodstvenniy_kontrol_pek", "nds", "zso", "szz",
    "licensia", "litsenziya", "ker", "ekspertiz", "geolog", "nedr", "kompleksnoe",
    "ekologicheskoe_razereshenie", "organizaciya-obshestvennix", "polevye-ispytaniya",
    "proekt-geologicheskogo", "gosudarstvennaya-ekologicheskaya",
}

SIMPLE_SLUGS = {
    "pasport", "2tp", "otchet_2tp", "plata_za", "raschet-plati", "zhurnal", "vedenie-jurnalov",
    "instrukciya", "deklaratsiya", "postanovka", "dogovora-s-regionalnym", "ekologicheskiy-sbor",
    "ekologicheskiy_sbor", "otchet_ob_obrazovanii", "tehotchet", "gos-otchetnost",
}

ES_HIGH_SLUGS = {
    "audit", "personal-ecolog", "soprovozhden", "konsultatsiya", "postanovka", "pek",
    "ekologicheskiy-sbor", "deklaratsiya-o-vos", "otchet", "2tp", "plata", "nmu",
    "inventariz", "pdv", "nds", "pasport", "dogovora-s-regionalnym", "proizvodstvenniy",
}


def check_robots_allowed(url: str) -> bool:
    rp = robotparser.RobotFileParser()
    rp.set_url(urljoin(BASE_URL, "/robots.txt"))
    try:
        rp.read()
        return rp.can_fetch(USER_AGENT, url)
    except Exception:
        return True


def fetch(url: str, session: requests.Session) -> requests.Response | None:
    if not check_robots_allowed(url):
        return None
    try:
        resp = session.get(url, headers=HEADERS, timeout=45)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp
    except requests.RequestException:
        return None


def normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if not parsed.netloc:
        url = urljoin(BASE_URL, url)
        parsed = urlparse(url)
    path = parsed.path.rstrip("/") + "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def is_excluded_url(url: str) -> bool:
    for pat in EXCLUDE_URL_PATTERNS:
        if re.search(pat, url, re.I):
            return True
    return False


def discover_service_urls(session: requests.Session) -> tuple[list[str], list[str]]:
    found: set[str] = set()
    excluded: list[str] = []

    resp = fetch(f"{BASE_URL}/sitemap.xml", session)
    if resp:
        for loc in re.findall(r"<loc>([^<]+)</loc>", resp.text):
            url = normalize_url(loc)
            if "/services/" in url or "/dopuslugi/" in url:
                found.add(url)

    resp = fetch(f"{BASE_URL}/services/", session)
    if resp:
        soup = BeautifulSoup(resp.content, "lxml")
        for a in soup.select("a[href]"):
            href = a.get("href", "")
            if "/services/" in href or "/dopuslugi/" in href:
                found.add(normalize_url(urljoin(BASE_URL, href)))

    resp = fetch(f"{BASE_URL}/dopuslugi/", session)
    if resp:
        soup = BeautifulSoup(resp.content, "lxml")
        for a in soup.select("a[href]"):
            href = a.get("href", "")
            if "/dopuslugi/" in href:
                found.add(normalize_url(urljoin(BASE_URL, href)))

    service_urls = []
    for url in sorted(found):
        if url in SERVICE_INDEX_PATHS:
            excluded.append(f"{url} — индексная страница услуг")
            continue
        if is_excluded_url(url):
            excluded.append(f"{url} — исключён по шаблону")
            continue
        service_urls.append(url)
    return service_urls, excluded


def clean_text(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    for phrase in NOISE_PHRASES:
        text = text.replace(phrase, "")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def remove_noise_elements(root: Tag) -> None:
    for sel in REMOVE_SELECTORS:
        for el in root.select(sel):
            el.decompose()


def extract_accordion(soup: BeautifulSoup) -> list[dict]:
    items = []
    for block in soup.select(".accordion_block"):
        title_el = block.select_one(".accordion_title")
        body_el = block.select_one(".accordion_body")
        if not title_el or not body_el:
            continue
        q = clean_text(title_el.get_text(" ", strip=True))
        a = clean_text(body_el.get_text("\n", strip=True))
        if q and a:
            items.append({"question": q, "answer": a})
    return items


def extract_h1_section(soup: BeautifulSoup) -> str:
    h1 = soup.find("h1")
    if not h1:
        return ""
    container = h1.find_parent(["section", "div"], class_=re.compile(r"section|main|content|service", re.I))
    if not container:
        container = h1.parent
    if not container:
        return ""
    clone = BeautifulSoup(str(container), "lxml")
    remove_noise_elements(clone)
    return clean_text(clone.get_text("\n", strip=True))


def extract_main_sections(soup: BeautifulSoup) -> str:
    parts = []
    h1_section = extract_h1_section(soup)
    if h1_section:
        parts.append(h1_section)

    for sel in [".main-content", ".section_collection .section_main.mt-4.main-content"]:
        for el in soup.select(sel):
            clone = BeautifulSoup(str(el), "lxml")
            remove_noise_elements(clone)
            text = clean_text(clone.get_text("\n", strip=True))
            if len(text) > 100 and text not in parts:
                parts.append(text)

    if not parts:
        for el in soup.select(".section_collection, .section_main.main-content"):
            clone = BeautifulSoup(str(el), "lxml")
            remove_noise_elements(clone)
            text = clean_text(clone.get_text("\n", strip=True))
            if len(text) > 150:
                parts.append(text)
                break

    combined = clean_text("\n\n".join(parts))
    if soup.find("h1"):
        title = soup.find("h1").get_text(strip=True)
        combined = re.sub(rf"^{re.escape(title)}\s*\n+", f"{title}\n\n", combined)
    return combined


def first_sentences(text: str, max_sentences: int = 3) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    picked = [s.strip() for s in sentences if len(s.strip()) > 20][:max_sentences]
    return " ".join(picked)


def extract_list_after_keyword(text: str, keywords: list[str]) -> list[str]:
    lines = text.split("\n")
    items = []
    capture = False
    for line in lines:
        low = line.lower()
        if any(k in low for k in keywords):
            capture = True
            if ";" in line or ":" in line:
                tail = re.split(r"[:;]", line, maxsplit=1)[-1].strip()
                if tail.startswith(("•", "-")) or len(tail) > 10:
                    items.append(tail.lstrip("•- "))
            continue
        if capture:
            if line.strip().startswith(("•", "-", "—")):
                items.append(line.strip().lstrip("•-— "))
            elif re.match(r"^\d+[\).]", line.strip()):
                items.append(re.sub(r"^\d+[\).]\s*", "", line.strip()))
            elif line.strip() and not line.strip().startswith(("Преимущества", "Стоимость", "URL")):
                if len(line.strip()) < 120:
                    items.append(line.strip())
            else:
                if items:
                    break
    return items[:12]


def find_audience(text: str, accordion: list[dict]) -> str:
    for item in accordion:
        q = item["question"].lower()
        if "нужна ли" in q or "кому" in q:
            return item["answer"]
    for pat in [
        r"(?:если вы|для предприятий|компаниям,|организациям,).{20,400}?[.!]",
        r"(?:обязател(?:ен|на)|необходим(?:о|а)).{20,300}?[.!]",
    ]:
        m = re.search(pat, text, re.I | re.S)
        if m:
            return clean_text(m.group(0))
    return ""


def find_when_required(text: str, accordion: list[dict]) -> str:
    for item in accordion:
        ans = item["answer"]
        if re.search(r"обязат|необходим|требуется|нужно|когда", ans, re.I):
            if "нужна ли" in item["question"].lower() or "когда" in item["question"].lower():
                return ans
    for pat in [
        r"(?:документ обязателен|требуется|необходимо|нужен).{20,350}?[.!]",
        r"(?:I\s*[-–]\s*III|1\s*[-–]\s*3)\s*категор.{20,250}?[.!]",
    ]:
        m = re.search(pat, text, re.I | re.S)
        if m:
            return clean_text(m.group(0))
    return ""


def find_includes(text: str) -> list[str]:
    items = extract_list_after_keyword(text, ["процесс:", "процесс", "включает", "в базовый пакет", "этапы"])
    if items:
        return items
    bullets = [ln.strip().lstrip("•-— ") for ln in text.split("\n") if ln.strip().startswith(("•", "-", "—"))]
    return bullets[:10]


def slug_from_url(url: str) -> str:
    path = urlparse(url).path.strip("/")
    return path.split("/")[-1].lower()


def classify_service(name: str, url: str, text: str) -> dict:
    slug = slug_from_url(url)
    blob = f"{name} {slug} {text}".lower()

    complexity = "unknown"
    if any(s in slug for s in COMPLEX_SLUGS) or any(k in blob for k in ["проект", "согласован", "лиценз", "экспертиз", "инвентаризац"]):
        if any(s in slug for s in SIMPLE_SLUGS):
            complexity = "simple"
        elif any(k in blob for k in ["паспорт", "журнал", "2-тп", "2- тп", "2tp", "договор с региональным"]):
            complexity = "simple"
        else:
            complexity = "complex"
    elif any(s in slug for s in SIMPLE_SLUGS) or any(k in blob for k in ["журнал", "паспорт отход", "2-тп", "договор с региональным оператором"]):
        complexity = "simple"

    es_bridge = "low"
    if any(s in slug for s in ES_HIGH_SLUGS) or any(k in blob for k in ["сопровож", "аудит", "проверк", "отчетност", "отчётност", "нет эколога", "экосопров"]):
        es_bridge = "high"
    elif any(k in blob for k in ["консультац", "проект", "инвентар", "нвос", "пэк", "пдв"]):
        es_bridge = "medium"

    route = "consultation"
    if complexity == "simple":
        route = "service"
    if es_bridge == "high" and any(k in blob for k in ["сопровож", "аудит", "нет эколога", "отчетност", "отчётност", "проверк", "personal-ecolog"]):
        route = "es_signal"
    elif complexity == "complex":
        route = "consultation"

    topics = []
    for topic, keys in TOPIC_KEYWORDS.items():
        if any(k in blob for k in keys):
            topics.append(topic)
    if not topics:
        topics = ["сопровождение"] if "сопровож" in blob else []

    return {
        "complexity": complexity,
        "es_bridge": es_bridge,
        "recommended_route": route,
        "related_topics": sorted(set(topics)),
    }


def parse_service_page(url: str, session: requests.Session) -> tuple[dict | None, str | None]:
    resp = fetch(url, session)
    if not resp:
        return None, "fetch failed"

    if resp.status_code == 404:
        return None, "404 Not Found"

    soup = BeautifulSoup(resp.content, "lxml")
    h1 = soup.find("h1")
    if not h1:
        return None, "no h1 / no service content"

    title = clean_text(h1.get_text(" ", strip=True))
    meta = soup.find("meta", attrs={"name": "description"})
    meta_desc = clean_text(meta.get("content", "")) if meta else ""

    accordion = extract_accordion(soup)
    main_text = extract_main_sections(soup)
    if len(main_text) < 80 and not accordion:
        return None

    short = first_sentences(main_text.replace(title, "", 1).strip() or meta_desc, 3)
    if not short and meta_desc:
        short = meta_desc

    includes = find_includes(main_text)
    audience = find_audience(main_text, accordion)
    when_required = find_when_required(main_text, accordion)

    source_parts = [main_text]
    for item in accordion:
        if not re.search(r"смогу ли я найти|легко ли купить|разумной ли будет покупка", item["question"], re.I):
            source_parts.append(f"{item['question']}\n{item['answer']}")
    source_text = clean_text("\n\n".join(source_parts))

    classification = classify_service(title, url, source_text)

    return {
        "title": title,
        "url": url,
        "short_description": short,
        "includes": includes,
        "audience": audience,
        "when_required": when_required,
        "accordion": accordion,
        "source_text": source_text,
        **classification,
    }, None


def deduplicate_services(services: list[dict]) -> tuple[list[dict], list[str]]:
    """Оставить одну запись на услугу (по названию), с максимальным объёмом текста."""
    groups: dict[str, list[dict]] = {}
    for svc in services:
        key = re.sub(r"\s+", " ", svc["title"].strip().lower())
        groups.setdefault(key, []).append(svc)

    deduped: list[dict] = []
    notes: list[str] = []
    for key, items in groups.items():
        items.sort(key=lambda x: len(x.get("source_text", "")), reverse=True)
        best = items[0]
        deduped.append(best)
        for dup in items[1:]:
            notes.append(f"Дубликат «{dup['title']}»: {dup['url']} → оставлен {best['url']}")
    deduped.sort(key=lambda x: x["title"].lower())
    return deduped, notes


def service_to_markdown(service: dict) -> str:
    lines = [
        f"## {service['title']}",
        "",
        f"URL: {service['url']}",
        "",
        "### Краткое описание",
        "",
        service.get("short_description") or "—",
        "",
    ]

    includes = service.get("includes") or []
    lines += ["### Что включает услуга", ""]
    if includes:
        lines += [f"- {item}" for item in includes]
    else:
        lines.append("—")
    lines.append("")

    lines += ["### Кому подходит", ""]
    lines.append(service.get("audience") or "—")
    lines.append("")

    lines += ["### Когда требуется", ""]
    lines.append(service.get("when_required") or "—")
    lines.append("")

    topics = service.get("related_topics") or []
    lines += ["### Связанные темы", ""]
    if topics:
        lines += [f"- {t}" for t in topics]
    else:
        lines.append("- —")
    lines.append("")

    lines += [
        "### Complexity",
        "",
        service.get("complexity", "unknown"),
        "",
        "### ES Bridge Potential",
        "",
        service.get("es_bridge", "low"),
        "",
        "### Recommended Route",
        "",
        service.get("recommended_route", "consultation"),
        "",
        "### Source Text",
        "",
        service.get("source_text") or "—",
        "",
        "---",
        "",
    ]
    return "\n".join(lines)


def build_services_markdown(services: list[dict]) -> str:
    frontmatter = f"""---
title: Услуги компании Экологические услуги
type: company_services
source: ecolusspb.ru
updated: {TODAY}
priority: high
tags:
  - услуги
  - Экологические услуги
  - экологическое сопровождение
  - ПЭК
  - НВОС
  - отходы
  - выбросы
  - вода
---

# Услуги компании «Экологические услуги»

Файл содержит описания услуг компании для использования в EcoLeadBot RAG Assistant.

---

"""
    body = "".join(service_to_markdown(s) for s in services)
    chunking = """
# Chunking Recommendations

Strategy: service_based
Chunk Size: 1 service = 1 chunk
Overlap: 0
Reason: каждая услуга является самостоятельной смысловой единицей для RAG.
"""
    return frontmatter + body + chunking


def parse_company_page(url: str, session: requests.Session) -> dict:
    resp = fetch(url, session)
    if not resp:
        return {"url": url, "error": "fetch failed"}

    soup = BeautifulSoup(resp.content, "lxml")
    h1 = soup.find("h1")
    title = clean_text(h1.get_text(" ", strip=True)) if h1 else ""
    accordion = extract_accordion(soup)
    text = extract_main_sections(soup)
    if url.rstrip("/") == BASE_URL.rstrip("/") and len(text) < 200:
        for el in soup.select(".section_collection, .section_main"):
            if "footer" in " ".join(el.get("class") or []):
                continue
            clone = BeautifulSoup(str(el), "lxml")
            remove_noise_elements(clone)
            chunk = clean_text(clone.get_text("\n", strip=True))
            if len(chunk) > len(text):
                text = chunk

    return {"url": url, "title": title, "text": text, "accordion": accordion}


def extract_contacts(pages: list[dict]) -> dict:
    contacts = {
        "phone": [],
        "email": [],
        "address": [],
        "hours": "",
        "forms": [],
    }
    blob = "\n".join(p["text"] for p in pages if p.get("text"))
    for phone in re.findall(r"8\s*\(\s*800\s*\)\s*[\d-]+", blob):
        if phone not in contacts["phone"]:
            contacts["phone"].append(phone)
    for email in re.findall(r"[a-zA-Z0-9._%+-]+@ecolusspb\.ru", blob):
        if email not in contacts["email"]:
            contacts["email"].append(email)
    if "09:00" in blob and "18:00" in blob:
        contacts["hours"] = "Пн–Пт с 09:00 до 18:00"
    addr_match = re.search(r"192102[^.\n]{0,120}", blob)
    if addr_match:
        contacts["address"].append(clean_text(addr_match.group(0)))
    if "WhatsApp" in blob or "Telegram" in blob:
        contacts["forms"].append("WhatsApp и Telegram — для общих вопросов (указано на странице контактов)")
    return contacts


def build_company_profile(pages: list[dict]) -> str:
    by_url = {p["url"]: p for p in pages}
    about = by_url.get("https://ecolusspb.ru/company/", {})
    home = by_url.get("https://ecolusspb.ru/", {})
    contacts_page = by_url.get("https://ecolusspb.ru/company/contacts/", {})
    faq_page = by_url.get("https://ecolusspb.ru/chasto-zadavaemye-voprosy/", {})
    es_page = by_url.get("https://ecolusspb.ru/services/personal-ecolog/", {})

    contacts = extract_contacts([contacts_page, about, home])

    def section_from(text: str, patterns: list[str]) -> str:
        for pat in patterns:
            m = re.search(pat, text, re.I | re.S)
            if m:
                return clean_text(m.group(0))
        return ""

    about_text = about.get("text", "")
    home_text = home.get("text", "")

    who = section_from(about_text, [
        r"Компания \"Экологические услуги\"[\s\S]{0,900}?экологическом сопровождении предприятий малого и среднего бизнеса\.",
        r"Основана в августе 2008 года[\s\S]{0,500}?малого и среднего бизнеса\.",
    ]) or first_sentences(about_text, 4)

    activities = ""
    m = re.search(r"Наши услуги:\s*([^\n]+(?:\n[^\n]+){0,8})", about_text)
    if m:
        block = m.group(1)
        activities_list = re.findall(
            r"(Отходы|Воздух|Вода|СЗЗ|Экосопровождение|Лицензирование|Обучение)", block
        )
        if activities_list:
            activities = ", ".join(activities_list)
        else:
            activities = clean_text(re.sub(r"\s+", " ", block))
    directions = ""
    dm = re.search(
        r"Мы специализируемся на ([^.]+\.)", about_text, re.I
    )
    if dm:
        directions = clean_text(dm.group(0))
    what_we_do = "\n\n".join(x for x in [directions, f"Направления: {activities}." if activities else ""] if x)

    trust = section_from(about_text, [r"Почему выбирают нас[\s\S]{0,1200}?Убедили\?"])
    if not trust:
        trust = section_from(home_text, [r"разработали и согласовали[\s\S]{0,400}?\."])

    experience = section_from(about_text, [
        r"Наш опыт[\s\S]{0,500}?около 100 компаний[\s\S]{0,120}?\.(?:\s|$)",
        r"более 8000 экологических проектов[\s\S]{0,200}?\.(?:\s|$)",
    ])

    work_process = section_from(es_page.get("text", ""), [r"Забираем всю экологию[\s\S]{0,500}?\."])
    if not work_process:
        work_process = section_from(about_text, [r"Наша миссия[\s\S]{0,500}?\."])

    geography = ""
    for page in pages:
        for item in page.get("accordion", []):
            if "россии" in item["question"].lower() or "регион" in item["question"].lower():
                geography = item["answer"]
                break
        if geography:
            break

    main_services = []
    if activities:
        main_services = [clean_text(s) for s in re.split(r",", activities) if s.strip()]

    es_desc = es_page.get("text", "")
    es_short = first_sentences(es_desc.replace(es_page.get("title", ""), "", 1), 4)

    when_contact = section_from(about_text, [r"Снижение вредного воздействия[\s\S]{0,400}?\."])
    faq_items = faq_page.get("accordion", [])

    advantages = []
    for line in trust.split("\n"):
        if line.strip().endswith(":") and len(line) < 80:
            advantages.append(line.strip().rstrip(":"))
        elif line.strip().startswith(("•", "-")):
            advantages.append(line.strip().lstrip("•- "))

    frontmatter = f"""---
title: Компания Экологические услуги
type: company_profile
source: ecolusspb.ru
updated: {TODAY}
priority: high
tags:
  - компания
  - контакты
  - преимущества
  - доверие
  - экологическое сопровождение
---

# Компания «Экологические услуги»

## Кто мы

{who or "—"}

---

## Чем занимаемся

{what_we_do or "—"}

---

## Почему нам доверяют

{trust or "—"}

---

## Наш опыт

{experience or "—"}

---

## Как проходит работа

{work_process or "—"}

---

## География работы

{geography or "—"}

---

## Основные услуги

"""
    svc_lines = [f"- {s}" for s in main_services] if main_services else ["- —"]
    body = "\n".join(svc_lines) + f"""

---

## Экологическое сопровождение

{es_short or "—"}

---

## Когда стоит обратиться к нам

{when_contact or "—"}

---

## Контакты

Телефон: {", ".join(contacts["phone"]) or "—"}

Email: {", ".join(contacts["email"]) or "—"}

Адрес: {", ".join(contacts["address"]) or "—"}

Режим работы: {contacts["hours"] or "—"}

Ссылки на формы связи: {", ".join(contacts["forms"]) or "—"}

---

## Часто задаваемые вопросы о компании

"""
    for item in faq_items:
        body += f"### {item['question']}\n\n{item['answer']}\n\n---\n\n"

    body += "## Преимущества компании\n\n"
    if advantages:
        body += "\n".join(f"- {a}" for a in advantages[:10]) + "\n"
    else:
        body += "- —\n"

    body += """
---

# Chunking Recommendations

Strategy: topic_based
Chunk Size: 400–800 tokens
Overlap: 50 tokens
Reason: пользователи задают вопросы о компании по отдельным темам.
"""
    return frontmatter + body


def write_services_report(stats: dict) -> None:
    lines = [
        "# Отчёт парсинга услуг ecolusspb.ru",
        "",
        f"**Дата:** {TODAY}",
        "",
        "## Сводка",
        "",
        f"- URL найдено: **{stats['urls_found']}**",
        f"- Страниц обработано: **{stats['pages_processed']}**",
        f"- Услуг извлечено (до дедупликации): **{stats.get('services_raw', stats['services_added'])}**",
        f"- Услуг в RAG (после дедупликации): **{stats['services_added']}**",
        f"- Ошибок / пропусков: **{len(stats['failed'])}**",
        "",
        "## Список услуг",
        "",
    ]
    for s in stats["services"]:
        lines.append(f"- [{s['title']}]({s['url']})")
    lines += ["", "## Исключённые URL", ""]
    for item in stats["excluded"]:
        lines.append(f"- {item}")
    if stats.get("duplicates"):
        lines += ["", "## Дедупликация", ""]
        for item in stats["duplicates"]:
            lines.append(f"- {item}")
    if stats["failed"]:
        lines += ["", "## Не удалось обработать", ""]
        for item in stats["failed"]:
            lines.append(f"- {item}")
    lines += [
        "",
        "## Рекомендации по ручной проверке",
        "",
        "- Проверить классификацию Complexity / ES Bridge / Recommended Route для пограничных услуг.",
        "- Сверить цены и формулировки с актуальными страницами сайта.",
        "- Услуги с минимальным текстом на странице могут требовать дополнения вручную.",
        "- Маркетинговые FAQ-блоки («Смогу ли я найти…») исключены из Source Text, но сохранены при релевантности.",
        "",
    ]
    (REPORTS / "services_scraping_report.md").write_text("\n".join(lines), encoding="utf-8")


def write_company_report(pages: list[dict], contacts: dict, faq_count: int, advantages: int) -> None:
    lines = [
        "# Отчёт парсинга профиля компании ecolusspb.ru",
        "",
        f"**Дата:** {TODAY}",
        "",
        "## Использованные URL",
        "",
    ]
    for p in pages:
        status = "OK" if p.get("text") else "мало контента"
        lines.append(f"- `{p['url']}` — {status}")
    lines += [
        "",
        f"## FAQ извлечено: **{faq_count}**",
        f"## Преимуществ извлечено: **{advantages}**",
        "",
        "## Контактные данные",
        "",
        f"- Телефоны: {', '.join(contacts.get('phone', [])) or '—'}",
        f"- Email: {', '.join(contacts.get('email', [])) or '—'}",
        f"- Адрес: {', '.join(contacts.get('address', [])) or '—'}",
        f"- Режим работы: {contacts.get('hours') or '—'}",
        "",
        "## Сведения о компании (из источника)",
        "",
        "- Основание: август 2008 года (страница «О компании»)",
        "- Специализация: экологические проекты и сопровождение МСБ",
        "- Упомянуто: более 8000 проектов; около 100 компаний на сопровождении",
        "",
        "## Страницы для ручной проверки",
        "",
        "- Главная страница — часть контента в слайдерах; использован текст из доступных секций.",
        "- Страница контактов — реквизиты и персоналии сотрудников не включены в RAG-профиль полностью.",
        "",
    ]
    (REPORTS / "company_profile_report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    KB.mkdir(exist_ok=True)
    REPORTS.mkdir(exist_ok=True)
    session = requests.Session()

    service_urls, excluded = discover_service_urls(session)
    time.sleep(REQUEST_DELAY)

    services: list[dict] = []
    failed: list[str] = []

    for i, url in enumerate(service_urls):
        if i > 0:
            time.sleep(REQUEST_DELAY)
        parsed, err = parse_service_page(url, session)
        if parsed:
            services.append(parsed)
        else:
            failed.append(f"{url} — {err or 'unknown'}")

    raw_count = len(services)
    services, dup_notes = deduplicate_services(services)

    raw_path = REPORTS / "services_raw.json"
    raw_path.write_text(json.dumps(services, ensure_ascii=False, indent=2), encoding="utf-8")

    md_path = KB / "services.md"
    md_path.write_text(build_services_markdown(services), encoding="utf-8")

    write_services_report({
        "urls_found": len(service_urls) + len(excluded),
        "pages_processed": len(service_urls),
        "services_raw": raw_count,
        "services_added": len(services),
        "excluded": excluded,
        "duplicates": dup_notes,
        "failed": failed,
        "services": services,
    })

    company_pages = []
    for i, url in enumerate(COMPANY_PROFILE_URLS):
        if i > 0:
            time.sleep(REQUEST_DELAY)
        company_pages.append(parse_company_page(url, session))

    contacts = extract_contacts(company_pages)
    profile_md = build_company_profile(company_pages)
    (KB / "company_profile.md").write_text(profile_md, encoding="utf-8")

    faq_page = next((p for p in company_pages if "chasto-zadavaemye-voprosy" in p["url"]), {})
    faq_count = len(faq_page.get("accordion", []))
    advantages = len(re.findall(r"^-\s+", profile_md, re.M))

    write_company_report(company_pages, contacts, faq_count, advantages)

    print(
        f"Services: {len(services)}/{len(service_urls)} | "
        f"Failed: {len(failed)} | FAQ: {faq_count} | "
        f"Saved: {md_path.name}, company_profile.md"
    )


if __name__ == "__main__":
    main()
