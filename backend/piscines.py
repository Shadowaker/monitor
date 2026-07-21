"""Piscine page: date da 42roma.it e conteggi funnel da CSV studenti."""

from __future__ import annotations

import csv
import logging
import re
from datetime import date
from html import unescape
from pathlib import Path

import requests

try:
    from . import config
except ImportError:
    import config

PISCINE_DATES_URL = "https://42roma.it"
PISCINE_SECTION_MARKER = "Le date delle prossime Piscine"

logger = logging.getLogger(__name__)


def _clean_li_text(raw: str) -> str:
    text = re.sub(r"<[^>]+>", "", raw)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def fetch_piscine_dates() -> list[str]:
    try:
        resp = requests.get(
            PISCINE_DATES_URL,
            timeout=10,
            headers={"User-Agent": "42Roma-Monitor/1.0"},
        )
        resp.raise_for_status()
        html = resp.text
    except requests.RequestException as exc:
        logger.warning("Failed to fetch piscine dates: %s", exc)
        return []

    pos = html.find(PISCINE_SECTION_MARKER)
    if pos == -1:
        logger.warning("Piscine dates section not found on 42roma.it")
        return []

    segment = html[pos : pos + 2000]
    ul_match = re.search(
        r'<ul[^>]*class="[^"]*text-lg[^"]*list-disc[^"]*"[^>]*>(.*?)</ul>',
        segment,
        re.DOTALL | re.IGNORECASE,
    )
    if not ul_match:
        return []

    items = re.findall(r"<li[^>]*>(.*?)</li>", ul_match.group(1), re.DOTALL)
    dates = [_clean_li_text(item) for item in items]
    return [date for date in dates if date]


_DATE_PART_RE = re.compile(
    r"^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})$",
    re.IGNORECASE,
)
_RANGE_SPLIT_RE = re.compile(r"\s*[–\-—]\s*")

ITALIAN_MONTHS = {
    "gennaio": 1,
    "febbraio": 2,
    "marzo": 3,
    "aprile": 4,
    "maggio": 5,
    "giugno": 6,
    "luglio": 7,
    "agosto": 8,
    "settembre": 9,
    "ottobre": 10,
    "novembre": 11,
    "dicembre": 12,
}


def _parse_italian_date(day: str, month: str, year: str) -> date | None:
    month_num = ITALIAN_MONTHS.get((month or "").strip().lower())
    if not month_num:
        return None
    try:
        return date(int(year), month_num, int(day))
    except ValueError:
        return None


def _months_until(start: date, today: date | None = None) -> int:
    today = today or date.today()
    if start <= today:
        return 0
    months = (start.year - today.year) * 12 + (start.month - today.month)
    if start.day < today.day:
        months -= 1
    return max(0, months)


def _format_days_label(days: int) -> str:
    if days == 1:
        return "Manca 1 giorno"
    return f"Mancano {days} giorni"


def build_piscine_countdown(start_day: str, start_month: str, start_year: str) -> dict[str, str]:
    """
    Contatore in giorni fino all'inizio piscine:
    - verde: 6+ mesi
    - giallo: 2–5 mesi
    - rosso: meno di 2 mesi
    """
    start = _parse_italian_date(start_day, start_month, start_year)
    if not start:
        return {"countdown_text": "—", "countdown_tier": "red"}

    today = date.today()
    days_left = (start - today).days
    months_left = _months_until(start, today)

    if days_left <= 0:
        return {"countdown_text": "In arrivo", "countdown_tier": "red"}

    text = _format_days_label(days_left)

    if months_left >= 6:
        tier = "green"
    elif months_left >= 2:
        tier = "yellow"
    else:
        tier = "red"

    return {"countdown_text": text, "countdown_tier": tier}


def parse_piscine_date_range(raw: str, index: int) -> dict | None:
    text = (raw or "").strip()
    if not text:
        return None

    parts = _RANGE_SPLIT_RE.split(text, maxsplit=1)
    if len(parts) != 2:
        return None

    start_match = _DATE_PART_RE.match(parts[0].strip())
    end_match = _DATE_PART_RE.match(parts[1].strip())
    if not start_match or not end_match:
        return None

    start_day, start_month, start_year = start_match.groups()
    end_day, end_month, end_year = end_match.groups()
    year = start_year if start_year == end_year else f"{start_year}–{end_year}"

    session = {
        "label": f"Piscine {index}",
        "start_day": str(int(start_day)),
        "start_month": start_month.lower(),
        "end_day": str(int(end_day)),
        "end_month": end_month.lower(),
        "year": year,
    }
    session.update(build_piscine_countdown(session["start_day"], session["start_month"], start_year))
    return session


def parse_piscine_dates(raw_dates: list[str]) -> list[dict]:
    sessions = []
    for index, raw in enumerate(raw_dates, start=1):
        parsed = parse_piscine_date_range(raw, index)
        if parsed:
            sessions.append(parsed)
    return sessions


def fetch_piscine_sessions() -> list[dict]:
    return parse_piscine_dates(fetch_piscine_dates())


def _parse_bool(value) -> bool:
    return str(value or "").strip().lower() == "true"


def _is_empty(value) -> bool:
    return not str(value or "").strip()


def _read_csv_rows(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def count_piscine_from_birth_csv() -> int:
    rows = _read_csv_rows(Path(config.STUDENTS_BIRTH_CSV))
    both_empty = sum(
        1
        for row in rows
        if _is_empty(row.get("birth_country")) and _is_empty(row.get("birth_date"))
    )
    return len(rows) - both_empty


def build_funnel_data() -> dict[str, list[int] | list[str]]:
    return {
        "chart": list(config.FUNNEL_CHART_COUNTS),
        "display": list(config.FUNNEL_DISPLAY_COUNTS),
        "stats": list(config.FUNNEL_STATS),
    }
