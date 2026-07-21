"""Configurazione durate e ordine rotazione schermate monitor."""

import json
import logging

try:
    from . import config
except ImportError:
    import config

logger = logging.getLogger(__name__)

DEFAULT_DISPLAY_DELAYS = {
    "splash_seconds": 15,
    "world_seconds": 30,
    "piscines_seconds": 30,
    "cc_step_seconds": 5,
    "cc_ranks": 6,
    "workstations_seconds": 30,
    "statistics_seconds": 30,
    "pictures_seconds": 30,
    "sponsors_seconds": 30,
    "events_slide_seconds": 15,
}

DEFAULT_CYCLE = [
    "splash",
    "world",
    "piscines",
    "cc",
    "workstations",
    "sponsors",
    "events",
]

# id → metadati pagina kiosk
KIOSK_PAGES = {
    "splash": {
        "id": "splash",
        "endpoint": "splash",
        "label": "Splash",
        "delay_key": "splash_seconds",
        "duration_kind": "fixed",
    },
    "world": {
        "id": "world",
        "endpoint": "statistics_world",
        "label": "Mondo (42 Network)",
        "delay_key": "world_seconds",
        "duration_kind": "fixed",
    },
    "piscines": {
        "id": "piscines",
        "endpoint": "piscines_page",
        "label": "Piscine",
        "delay_key": "piscines_seconds",
        "duration_kind": "fixed",
    },
    "cc": {
        "id": "cc",
        "endpoint": "statistics_cc",
        "label": "Common Core",
        "delay_key": "cc_step_seconds",
        "duration_kind": "cc_steps",
    },
    "workstations": {
        "id": "workstations",
        "endpoint": "workstations",
        "label": "Workstations",
        "delay_key": "workstations_seconds",
        "duration_kind": "fixed",
    },
    "statistics": {
        "id": "statistics",
        "endpoint": "statistics",
        "label": "Statistiche",
        "delay_key": "statistics_seconds",
        "duration_kind": "fixed",
    },
    "pictures": {
        "id": "pictures",
        "endpoint": "pictures",
        "label": "Foto",
        "delay_key": "pictures_seconds",
        "duration_kind": "fixed",
    },
    "sponsors": {
        "id": "sponsors",
        "endpoint": "sponsors_page",
        "label": "Sponsor",
        "delay_key": "sponsors_seconds",
        "duration_kind": "sponsor_slides",
    },
    "events": {
        "id": "events",
        "endpoint": "events",
        "label": "Eventi",
        "delay_key": "events_slide_seconds",
        "duration_kind": "slides",
    },
}

DISPLAY_DELAY_FIELDS = [
    {
        "key": "splash_seconds",
        "label": "Splash",
        "hint": "Durata logo iniziale",
        "page_id": "splash",
    },
    {
        "key": "world_seconds",
        "label": "Mondo (42 Network)",
        "hint": "Mappa campus nel mondo",
        "page_id": "world",
    },
    {
        "key": "piscines_seconds",
        "label": "Piscine",
        "hint": "Funnel percorso 42",
        "page_id": "piscines",
    },
    {
        "key": "cc_step_seconds",
        "label": "Common Core — secondi per cerchio",
        "hint": "Totale pagina = valore × 6 cerchi",
        "page_id": "cc",
    },
    {
        "key": "workstations_seconds",
        "label": "Workstations",
        "hint": "Mappa postazioni",
        "page_id": "workstations",
    },
    {
        "key": "statistics_seconds",
        "label": "Statistiche",
        "hint": "Dashboard KPI e grafici studenti",
        "page_id": "statistics",
    },
    {
        "key": "pictures_seconds",
        "label": "Foto",
        "hint": "Griglia 3×3 immagini casuali",
        "page_id": "pictures",
    },
    {
        "key": "sponsors_seconds",
        "label": "Sponsor — secondi per logo",
        "hint": "Totale pagina = valore × numero loghi sponsor",
        "page_id": "sponsors",
    },
    {
        "key": "events_slide_seconds",
        "label": "Eventi — secondi per slide",
        "hint": "Totale pagina = valore × numero slide visibili",
        "page_id": "events",
    },
]


def _load_file():
    try:
        with open(config.DISPLAY_DELAYS_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            return {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}
    return data


def normalize_cycle(cycle):
    # type: (object) -> list
    if not isinstance(cycle, list):
        return list(DEFAULT_CYCLE)

    seen = set()
    normalized = []
    for item in cycle:
        page_id = str(item).strip()
        if page_id not in KIOSK_PAGES or page_id in seen:
            continue
        seen.add(page_id)
        normalized.append(page_id)

    return normalized or list(DEFAULT_CYCLE)


def _merge_delays(data):
    merged = dict(DEFAULT_DISPLAY_DELAYS)
    for key, default in DEFAULT_DISPLAY_DELAYS.items():
        value = data.get(key, default)
        try:
            merged[key] = int(value)
        except (TypeError, ValueError):
            merged[key] = default
    return merged


def load_display_config():
    data = _load_file()
    raw = _merge_delays(data)
    cycle = normalize_cycle(data.get("cycle", DEFAULT_CYCLE))
    cc_ranks = raw["cc_ranks"]
    cc_step = raw["cc_step_seconds"]
    logger.info("cc_step %s", cc_step)
    logger.info("cc_ranks %s", cc_ranks)
    logger.info("raw %s", raw)
    logger.info("cycle %s", cycle)
    return {
        **raw,
        "cycle": cycle,
        "splash_ms": raw["splash_seconds"] * 1000,
        "world_ms": raw["world_seconds"] * 1000,
        "piscines_ms": raw["piscines_seconds"] * 1000,
        "cc_step_ms": cc_step * 1000,
        "cc_total_seconds": cc_step * cc_ranks,
        "workstations_ms": raw["workstations_seconds"] * 1000,
        "statistics_ms": raw["statistics_seconds"] * 1000,
        "pictures_ms": raw["pictures_seconds"] * 1000,
        "sponsors_ms": raw["sponsors_seconds"] * 1000,
        "events_slide_ms": raw["events_slide_seconds"] * 1000,
    }


def load_display_delays():
    return load_display_config()


def page_in_cycle(page_id, cfg=None):
    cfg = cfg or load_display_config()
    return page_id in cfg["cycle"]


def next_page_id(current_page_id, cycle=None):
    cfg = load_display_config()
    order = cycle if cycle is not None else cfg["cycle"]
    if current_page_id not in order:
        return order[0]
    index = order.index(current_page_id)
    return order[(index + 1) % len(order)]


def prev_page_id(current_page_id, cycle=None):
    cfg = load_display_config()
    order = cycle if cycle is not None else cfg["cycle"]
    if current_page_id not in order:
        return order[-1]
    index = order.index(current_page_id)
    return order[(index - 1) % len(order)]


def first_page_id():
    return load_display_config()["cycle"][0]


def page_duration_summary(page_id, cfg=None, sponsor_count=None):
    cfg = cfg or load_display_config()
    page = KIOSK_PAGES.get(page_id)
    if not page:
        return "—"

    kind = page["duration_kind"]
    key = page["delay_key"]
    if kind == "fixed":
        return "{}s".format(cfg[key])
    if kind == "cc_steps":
        total = cfg["cc_step_seconds"] * cfg["cc_ranks"]
        return "{}s × {} = {}s".format(cfg["cc_step_seconds"], cfg["cc_ranks"], total)
    if kind == "slides":
        return "{}s × n slide".format(cfg["events_slide_seconds"])
    if kind == "sponsor_slides":
        per = cfg["sponsors_seconds"]
        if sponsor_count:
            total = per * sponsor_count
            return "{}s × {} = {}s".format(per, sponsor_count, total)
        return "{}s × n sponsor".format(per)
    return "—"


def page_advance_on_complete(page_id):
    page = KIOSK_PAGES.get(page_id)
    if not page:
        return False
    return page["duration_kind"] in ("cc_steps", "slides", "sponsor_slides")


def page_duration_ms(page_id, cfg=None, sponsor_count=None):
    cfg = cfg or load_display_config()
    page = KIOSK_PAGES.get(page_id)
    if not page:
        i = 30000
        logger.info("page_duration_msFRAU %s %s", page_id, i)
        return i

    kind = page["duration_kind"]
    key = page["delay_key"]
    if kind == "fixed":
        ms_key = key.replace("_seconds", "_ms")
        i = int(cfg.get(ms_key, cfg[key] * 1000))
    elif kind == "cc_steps":
        steps = cfg["cc_ranks"]
        try:
            import config as app_config

            if app_config.CC_SHOW_MASTERY:
                steps += 1
        except ImportError:
            pass
        i = int(cfg["cc_step_ms"] * steps)
    elif kind == "slides":
        i = int(cfg["events_slide_ms"] * 5)
    elif kind == "sponsor_slides":
        count = sponsor_count or 1
        i = int(cfg["sponsors_ms"] * count)
    else:
        i = 30000

    logger.info("page_duration_msFRAU %s %s", page_id, i)
    return i


def kiosk_cycle_items(cfg=None, sponsor_count=None, url_for_fn=None):
    cfg = cfg or load_display_config()
    items = []
    for page_id in cfg["cycle"]:
        page = KIOSK_PAGES[page_id]
        count = sponsor_count if page_id == "sponsors" else None
        i = page_duration_ms(page_id, cfg, sponsor_count=count)
        logger.info("kiosk_cycle_itemsFRAU %s %s", page_id, i)
        item = {
            "id": page_id,
            "label": page["label"],
            "duration": page_duration_summary(page_id, cfg, sponsor_count=count),
            "duration_ms": i,
            "advance_on_complete": page_advance_on_complete(page_id),
        }
        if url_for_fn:
            item["url"] = url_for_fn(page["endpoint"])
        items.append(item)
    return items


def cycle_preview_items(cfg=None, sponsor_count=None):
    cfg = cfg or load_display_config()
    items = []
    for page_id in cfg["cycle"]:
        page = KIOSK_PAGES[page_id]
        count = sponsor_count if page_id == "sponsors" else None
        items.append(
            {
                "id": page_id,
                "label": page["label"],
                "duration": page_duration_summary(page_id, cfg, sponsor_count=count),
            }
        )
    return items


def save_display_config(form_data, cycle_order=None):
    saved_delays = dict(DEFAULT_DISPLAY_DELAYS)
    for key in DEFAULT_DISPLAY_DELAYS:
        if key not in form_data:
            continue
        try:
            value = int(form_data[key])
        except (TypeError, ValueError):
            continue
        if value < 1:
            value = 1
        if value > 3600:
            value = 3600
        saved_delays[key] = value

    if cycle_order is None:
        cycle_order = normalize_cycle(_load_file().get("cycle", DEFAULT_CYCLE))
    else:
        cycle_order = normalize_cycle(cycle_order)

    payload = dict(saved_delays)
    payload["cycle"] = cycle_order

    with open(config.DISPLAY_DELAYS_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=4)

    return payload


def save_display_delays(form_data):
    return save_display_config(form_data)
