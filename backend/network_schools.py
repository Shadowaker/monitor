import json
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import requests

try:
    from . import config
except ImportError:
    import config  # type: ignore

logger = logging.getLogger(__name__)

LOOP_ITEM_SPLIT = re.compile(r'(?=<div data-elementor-type="loop-item")')
TITLE_RE = re.compile(
    r"card-campus-title.*?<h3[^>]*>\s*<a[^>]*>([^<]+)</a>",
    re.S,
)
COUNTRY_RE = re.compile(
    r"card-campus-country.*?<span>([^<]+)</span>",
    re.S,
)
LOOP_CONTAINER_RE = re.compile(
    r'<div class="elementor-loop-container elementor-grid">(.*)',
    re.S,
)


def schools_json_path():
    # type: () -> object
    return config.NETWORK_SCHOOLS_JSON


def parse_schools_html(html):
    # type: (str) -> List[Dict[str, str]]
    container_match = LOOP_CONTAINER_RE.search(html)
    source = container_match.group(1) if container_match else html
    schools = []

    for block in LOOP_ITEM_SPLIT.split(source)[1:]:
        title_match = TITLE_RE.search(block)
        country_match = COUNTRY_RE.search(block)
        if not title_match or not country_match:
            continue
        schools.append(
            {
                "name": title_match.group(1).strip(),
                "country": country_match.group(1).strip(),
            }
        )

    return schools


def group_schools_by_country(schools):
    # type: (List[Dict[str, str]]) -> Dict[str, List[str]]
    grouped = {}  # type: Dict[str, List[str]]
    for school in schools:
        grouped.setdefault(school["country"], []).append(school["name"])

    for country in grouped:
        grouped[country] = sorted(set(grouped[country]))

    return dict(sorted(grouped.items(), key=lambda item: item[0]))


def fetch_schools_from_web():
    # type: () -> List[Dict[str, str]]
    response = requests.get(
        config.NETWORK_SCHOOLS_URL,
        headers={"User-Agent": config.NETWORK_SCHOOLS_USER_AGENT},
        timeout=config.NETWORK_SCHOOLS_TIMEOUT,
    )
    response.raise_for_status()
    return parse_schools_html(response.text)


def save_schools_payload(schools):
    # type: (List[Dict[str, str]]) -> Dict[str, object]
    payload = {
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "source_url": config.NETWORK_SCHOOLS_URL,
        "schools": schools,
        "by_country": group_schools_by_country(schools),
    }
    path = schools_json_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return payload


def load_schools_payload():
    # type: () -> Optional[Dict[str, object]]
    path = schools_json_path()
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        logger.warning("Impossibile leggere %s: %s", path, exc)
        return None


def payload_is_stale(payload):
    # type: (Optional[Dict[str, object]]) -> bool
    if not payload or not payload.get("fetched_at"):
        return True
    try:
        fetched_at = datetime.strptime(
            str(payload["fetched_at"]).replace("Z", ""),
            "%Y-%m-%dT%H:%M:%S.%f",
        )
    except ValueError:
        try:
            fetched_at = datetime.strptime(
                str(payload["fetched_at"]).replace("Z", ""),
                "%Y-%m-%dT%H:%M:%S",
            )
        except ValueError:
            return True
    max_age = timedelta(hours=config.NETWORK_SCHOOLS_CACHE_HOURS)
    return datetime.utcnow() - fetched_at > max_age


def refresh_schools(force=False):
    # type: (bool) -> Dict[str, object]
    cached = load_schools_payload()
    if not force and cached and not payload_is_stale(cached):
        return cached

    try:
        schools = fetch_schools_from_web()
        if not schools:
            raise ValueError("Nessun campus trovato nella pagina 42network.org")
        return save_schools_payload(schools)
    except Exception as exc:
        logger.warning("Fetch campus 42network fallito: %s", exc)
        if cached:
            return cached
        return {
            "fetched_at": None,
            "source_url": config.NETWORK_SCHOOLS_URL,
            "schools": [],
            "by_country": {},
        }


def schools_by_country(force=False):
    # type: (bool) -> Dict[str, List[str]]
    payload = refresh_schools(force=force)
    by_country = payload.get("by_country") or {}
    return by_country  # type: ignore[return-value]
