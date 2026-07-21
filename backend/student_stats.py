"""Aggregazioni CSV studenti per la dashboard statistiche."""

import csv
from collections import Counter
from datetime import date
from pathlib import Path

try:
    from . import config
except ImportError:
    import config

AGE_BUCKET_ORDER = ["18-20", "21-23", "24-26", "27-29", "30-39", "40+"]
EXAM_RANK_MIN = 1
EXAM_RANK_MAX = 6
ADVANCED_CORE_GRADES = frozenset({"Alumni", "Transcender"})
ADVANCED_CORE_KEY = "advanced_core"
GRADE_DISPLAY_LABELS = {
    "Cadet": "In cursus",
    "Transcender": "Finished Common Core",
    "Alumni": "Alumni*",
}
GENDER_DISPLAY_LABELS = {
    "male": "Maschio",
    "female": "Femmina",
    "other": "Altro",
}
GENDER_ORDER = ["Maschio", "Femmina", "Altro"]


def format_grade_label(grade: str) -> str:
    return GRADE_DISPLAY_LABELS.get(grade, grade)


def format_gender_label(gender: str) -> str:
    key = (gender or "").strip().lower()
    if not key:
        return ""
    return GENDER_DISPLAY_LABELS.get(key, gender.strip().capitalize())


def students_birth_csv_path() -> Path:
    return Path(config.STUDENTS_BIRTH_CSV)


def students_csv_path() -> Path:
    return Path(config.STUDENTS_CSV)


def _age_bucket(age: int) -> str | None:
    if age < 18:
        return None
    if age <= 20:
        return "18-20"
    if age <= 23:
        return "21-23"
    if age <= 26:
        return "24-26"
    if age <= 29:
        return "27-29"
    if age <= 39:
        return "30-39"
    return "40+"


def _compute_age(birth_date: str, today: date) -> int | None:
    try:
        year, month, day = (int(p) for p in birth_date.split("-"))
        return today.year - year - ((today.month, today.day) < (month, day))
    except (ValueError, TypeError):
        return None


def build_origin_distribution(csv_path: Path | None = None):
    """Provenienza: un paese in evidenza (default Italy) + tutti gli altri in «Altri»."""
    path = csv_path or students_birth_csv_path()
    highlight = config.STUDENT_ORIGIN_COUNTRY.strip()
    others_label = config.STUDENT_ORIGIN_OTHERS_LABEL.strip() or "Altri"
    highlight_count = 0
    other_count = 0
    other_countries: set[str] = set()

    if not path.is_file():
        return {"labels": [], "values": []}

    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            country = (row.get("birth_country") or "").strip()
            if not country or country.lower() == "non specificato":
                continue
            if country == highlight:
                highlight_count += 1
            else:
                other_count += 1
                other_countries.add(country)

    labels = []
    values = []
    if highlight_count:
        labels.append(highlight)
        values.append(highlight_count)
    if other_count:
        other_label = others_label
        if other_countries:
            other_label = f"{others_label} {len(other_countries)} paesi"
        labels.append(other_label)
        values.append(other_count)
    return {"labels": labels, "values": values}


def build_age_distribution(csv_path: Path | None = None):
    """Distribuzione età calcolata da birth_date (doughnut)."""
    path = csv_path or students_birth_csv_path()
    buckets: Counter[str] = Counter()
    today = date.today()

    if not path.is_file():
        return {"labels": [], "values": []}

    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            birth_date = (row.get("birth_date") or "").strip()
            if not birth_date:
                continue
            age = _compute_age(birth_date, today)
            if age is None:
                continue
            bucket = _age_bucket(age)
            if bucket is None:
                continue
            buckets[bucket] += 1

    labels = [b for b in AGE_BUCKET_ORDER if buckets[b]]
    values = [buckets[b] for b in labels]
    return {"labels": labels, "values": values}


def build_gender_distribution(csv_path: Path | None = None):
    path = csv_path or students_birth_csv_path()
    counts: Counter[str] = Counter()

    if not path.is_file():
        return {"labels": [], "values": []}

    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            label = format_gender_label(row.get("gender"))
            if not label:
                continue
            counts[label] += 1

    if not counts:
        return {"labels": [], "values": []}

    extra = [label for label in counts if label not in GENDER_ORDER]
    labels = [label for label in GENDER_ORDER if counts[label]] + sorted(extra)
    values = [counts[label] for label in labels]
    return {"labels": labels, "values": values}


def _parse_exam_rank(raw: str | None) -> int | None:
    text = (raw or "").strip()
    if not text:
        return 1
    try:
        rank = int(text)
    except ValueError:
        return None
    if rank < EXAM_RANK_MIN or rank > EXAM_RANK_MAX:
        return None
    return rank


def build_grade_distribution(csv_path: Path | None = None):
    path = csv_path or students_csv_path()
    counts: Counter[str] = Counter()

    if not path.is_file():
        return {"labels": [], "values": []}

    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            grade = (row.get("grade") or "").strip()
            if not grade:
                continue
            counts[grade] += 1

    if not counts:
        return {"labels": [], "values": []}

    ordered = counts.most_common()
    return {
        "labels": [format_grade_label(name) for name, _ in ordered],
        "values": [count for _, count in ordered],
    }


def _exam_rank_buckets(csv_path: Path | None = None):
    path = csv_path or students_csv_path()
    buckets: Counter[int] = Counter()
    advanced_core = 0

    if not path.is_file():
        return buckets, advanced_core

    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            grade = (row.get("grade") or "").strip()
            if not grade:
                continue
            rank = _parse_exam_rank(row.get("last_exam_rank"))
            if rank is None:
                continue
            if rank == EXAM_RANK_MAX and grade in ADVANCED_CORE_GRADES:
                advanced_core += 1
                continue
            buckets[rank] += 1
    return buckets, advanced_core


def build_exam_rank_distribution(csv_path: Path | None = None):
    buckets, advanced_core = _exam_rank_buckets(csv_path)
    if not buckets and not advanced_core:
        return {"labels": [], "values": []}

    labels = [f"Cerchio {r}" for r in range(EXAM_RANK_MIN, EXAM_RANK_MAX + 1) if buckets[r]]
    values = [buckets[r] for r in range(EXAM_RANK_MIN, EXAM_RANK_MAX + 1) if buckets[r]]
    if advanced_core:
        labels.append("Advanced Core")
        values.append(advanced_core)
    return {"labels": labels, "values": values}


def build_exam_rank_counts(csv_path: Path | None = None):
    buckets, advanced_core = _exam_rank_buckets(csv_path)
    counts = {str(r): buckets.get(r, 0) for r in range(EXAM_RANK_MIN, EXAM_RANK_MAX + 1)}
    counts[ADVANCED_CORE_KEY] = advanced_core
    return counts
