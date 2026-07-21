"""Web dashboard for monitoring announcements, events and maintenance status.

Handles:
  - OAuth login via 42 API
  - Announcement CRUD (restricted to authorized users)
  - Dashboard views populated with remote YAML/JSON data
  - Staff tools for maintenance & banner management
"""

import json
import logging
from logging.handlers import RotatingFileHandler
import os
import secrets
import sys
import string
import threading
from datetime import datetime, timedelta
import requests
import urllib3
import yaml
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix
try:
    from . import cc_svg
    from . import config
    from . import display_delays
    from . import event_summaries
    from . import network_schools
    from . import piscines
    from . import pictures_assets
    from . import sponsors
    from . import student_stats
except ImportError:
    import cc_svg  # type: ignore
    import config  # type: ignore
    import display_delays  # type: ignore
    import event_summaries  # type: ignore
    import network_schools  # type: ignore
    import piscines  # type: ignore
    import pictures_assets  # type: ignore
    import sponsors  # type: ignore
    import student_stats  # type: ignore
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# === Setup Flask ===
# Read debug mode early so we can enforce secret requirements
DEBUG_MODE = os.getenv("FLASK_DEBUG", "false").lower() == "true"

app = Flask(__name__, static_folder="static")
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
KIOSK_FRAME_ENDPOINTS = {
    page["endpoint"] for page in display_delays.KIOSK_PAGES.values()
} | {"kiosk_player", "kiosk_config"}
# Centralize secret management: require `FLASK_SECRET_KEY` in non-debug (production) mode.
env_secret = os.getenv("FLASK_SECRET_KEY")
if not env_secret and not DEBUG_MODE:
    raise SystemExit(
        "FLASK_SECRET_KEY must be set in production. Set FLASK_DEBUG=true for development or provide a secret."
    )
app.secret_key = env_secret or secrets.token_hex(16)
app.config.update(
    SESSION_PERMANENT=True,
    PERMANENT_SESSION_LIFETIME=timedelta(hours=24),
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

# === Logging ===
def setup_logging():
    """File + stderr (journalctl) per tutti i moduli, non solo app.py."""
    root = logging.getLogger()
    if getattr(setup_logging, "_configured", False):
        return root

    root.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    try:
        file_handler = RotatingFileHandler(
            config.LOG_FILE,
            maxBytes=config.LOG_MAX_BYTES,
            backupCount=config.LOG_BACKUP_COUNT,
        )
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)
    except Exception:
        logging.exception("Failed to initialize rotating file handler")

    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        # stdout → journalctl (systemd non mostra stderr da uv/python)
        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setFormatter(formatter)
        root.addHandler(stream_handler)

    setup_logging._configured = True
    return root


setup_logging()
logger = logging.getLogger(__name__)


# === Utility comuni ===
def load_json(path, default=None):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default or []


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=4)


def load_location_list(path, root_key):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        items = data.get(root_key, [])
        return items if isinstance(items, list) else []
    except FileNotFoundError:
        logger.warning("File location non trovato: %s", path)
        return []
    except (yaml.YAMLError, OSError) as exc:
        logger.warning("Errore lettura %s: %s", path, exc)
        return []


def build_location_stats(offline_pcs, used_pcs, maintenance_pcs):
    total = config.TOTAL_WORKSTATIONS
    offline_count = len(offline_pcs)
    used_count = len(used_pcs)
    online_count = max(0, total - offline_count)
    maintenance_online = [pc for pc in maintenance_pcs if pc not in offline_pcs]
    available_count = max(0, online_count - used_count - len(maintenance_online))
    return {
        "total": total,
        "offline": offline_count,
        "online": online_count,
        "occupied": used_count,
        "maintenance": len(maintenance_online),
        "available": available_count,
    }


def get_location_dashboard_data():
    maintenance_pcs = load_json(config.MAINTENANCE_FILE, default=[])
    offline_pcs = load_location_list(config.OFFLINE_YAML, "offline")
    used_pcs = load_location_list(config.USED_YAML, "used")
    location_stats = build_location_stats(offline_pcs, used_pcs, maintenance_pcs)
    return {
        "maintenance_pcs": maintenance_pcs,
        "offline_pcs": offline_pcs,
        "used_pcs": used_pcs,
        "online_pcs": used_pcs,
        "location_stats": location_stats,
    }


def build_statistics_kpis(location_stats):
    return [
        {
            "label": "Postazioni utilizzate",
            "value": location_stats["occupied"],
            "variant": "success",
        },
        {
            "label": "Postazioni offline",
            "value": location_stats["offline"],
            "variant": "danger",
        },
        {
            "label": "In manutenzione",
            "value": location_stats["maintenance"],
            "variant": "warning",
        },
        {
            "label": "Disponibili",
            "value": location_stats["available"],
        },
    ]


def _count_by_cluster(pc_list):
    counts = {"c1": 0, "c2": 0, "c3": 0}
    for pc_id in pc_list:
        prefix = pc_id[:2] if len(pc_id) >= 2 else ""
        if prefix in counts:
            counts[prefix] += 1
    return counts


def build_cluster_distribution(used_pcs):
    labels = ["Piano	-1", "Piano	0", "Piano	+1"]
    used = _count_by_cluster(used_pcs)
    return {"labels": labels, "values": [used["c1"], used["c2"], used["c3"]]}


def build_usage_grouped_bars(used_pcs):
    used = _count_by_cluster(used_pcs)
    keys = ["c1", "c2", "c3"]
    return {
        "labels": ["Piano	-1", "Piano   0", "Piano	+1"],
        "datasets": [
            {"label": "Utilizzate", "values": [used[k] for k in keys]},
        ],
    }


def build_used_workstations_rows(used_pcs):
    rows = []
    for pc_id in sorted(used_pcs):
        cluster = f"C{pc_id[1]}" if len(pc_id) >= 2 and pc_id[0] == "c" else ""
        rows.append(
            {
                "name": pc_id,
                "cluster": cluster,
                "hours": "—",
                "status": "occupied",
            }
        )
    return rows


def require_dashboard_access():
    """Ensure the user is logged in and authorised to manage announcements."""
    if "user_login" not in session:
        return redirect(url_for("login"))

    if session.get("user_kind") == "admin":
        return None

    user_login = session.get("user_login")
    if user_login not in config.AUTHORIZED_USERS:
        logger.info(
            f"Accesso non autorizzato da {user_login or 'sconosciuto'} ({request.remote_addr})"
        )
        return "Unauthorized", 403

    return None


def generate_announcement_id(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def list_announcements():
    announcements = []
    for entry in config.ANNOUNCEMENTS_DIR.glob("*.json"):
        try:
            payload = load_json(entry)
            payload["id"] = entry.stem
            announcements.append(payload)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Impossibile leggere %s: %s", entry, exc)
    announcements.sort(key=lambda item: item.get("start_date", ""), reverse=True)
    return announcements


def save_announcement(announcement_id: str, data: dict) -> None:
    config.ANNOUNCEMENTS_DIR.mkdir(parents=True, exist_ok=True)
    target = config.ANNOUNCEMENTS_DIR / f"{announcement_id}.json"
    save_json(target, data)


def load_announcement(announcement_id: str):
    target = config.ANNOUNCEMENTS_DIR / f"{announcement_id}.json"
    if not target.exists():
        return None
    payload = load_json(target)
    payload["id"] = announcement_id
    return payload


# === OAuth ===
AUTH_URL = (
    f"{config.OAUTH_AUTHORIZE_URL}?client_id={config.OAUTH_CLIENT_ID}"
    f"&redirect_uri={config.OAUTH_REDIRECT_URI}&response_type=code&scope=public"
)


def get_token():
    """Get client-credentials token from 42 API."""
    payload = {
        "grant_type": "client_credentials",
        "client_id": config.OAUTH_CLIENT_ID,
        "client_secret": config.OAUTH_CLIENT_SECRET,
    }
    try:
        resp = requests.post(config.OAUTH_TOKEN_URL, data=payload, timeout=10)
        resp.raise_for_status()
        return resp.json().get("access_token")
    except requests.RequestException as e:
        logger.error(f"Errore ottenendo token: {e}")
        return None


# === Date helpers ===
def format_date(date_str):
    d = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S.000Z")
    return d.strftime("%d %B %Y %H:%M")


def get_duration(begin, end):
    d1 = datetime.strptime(begin, "%Y-%m-%dT%H:%M:%S.000Z")
    d2 = datetime.strptime(end, "%Y-%m-%dT%H:%M:%S.000Z")
    diff = d2 - d1
    return f"{diff.seconds // 3600} ore {(diff.seconds % 3600) // 60} minuti"


# === Eventi ===
def get_filtered_events():
    token = get_token()
    return []
    # TODO: rimuovere dopo test
    if not token:
        return []

    now = datetime.now()
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=1)
    end_of_range = start_of_today + timedelta(days=config.EVENT_LOOKAHEAD_DAYS)
    params = {
        "range[begin_at]": f"{start_of_today.strftime('%Y-%m-%dT%H:%M:%S.000Z')},"
        f"{end_of_range.strftime('%Y-%m-%dT%H:%M:%S.000Z')}"
    }
    headers = {"Authorization": f"Bearer {token}"}
    url = f"https://api.intra.42.fr/v2/campus/{config.CAMPUS_ID}/cursus/{config.CURSUS_ID}/events"

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        events = [
            e
            for e in resp.json()
            if datetime.strptime(e["begin_at"], "%Y-%m-%dT%H:%M:%S.000Z") > now
        ]
        events.sort(key=lambda e: e["begin_at"])
        save_json(config.FUTURE_EVENTS_FILE, events)
        return events
    except requests.RequestException as e:
        logger.error(f"Errore recupero eventi: {e}")
        return []


events_data = load_json(config.FUTURE_EVENTS_FILE, default=get_filtered_events())


# === Annunci ===
def get_future_announcements():
    now = datetime.now()
    announcements = []
    for file in config.ANNOUNCEMENTS_DIR.glob("*.json"):
        ann = load_json(file)
        try:
            start, end = (
                datetime.fromisoformat(ann["start_date"]),
                datetime.fromisoformat(ann["end_date"]),
            )
            if start <= now < end:
                announcements.append(ann)
        except (KeyError, ValueError):
            continue
    return sorted(announcements, key=lambda x: x["start_date"])


def load_banner_context():
    banner_data = load_json(
        config.BANNER_FILE,
        default={
            "visible": config.BANNER_DEFAULT_VISIBLE,
            "text": config.BANNER_DEFAULT_TEXT,
        },
    )
    return {
        "banner": banner_data,
        "banner_visible": banner_data.get("visible", False),
        "banner_text": banner_data.get("text", ""),
    }


def fetch_events_data():
    events = get_filtered_events()
    if not events:
        events = load_json(config.FUTURE_EVENTS_FILE, default=[])
    events.sort(key=lambda e: e.get("begin_at", ""))
    event_summaries.schedule_summaries(events)
    return event_summaries.apply_summaries(events)


def kiosk_context(page_id):
    cfg = display_delays.load_display_config()
    display_delays.page_duration_ms(page_id, cfg)
    cycle = cfg["cycle"]
    in_cycle = display_delays.page_in_cycle(page_id, cfg)
    context = {
        **cfg,
        "in_cycle": in_cycle,
        "next_page_url": None,
        "prev_page_url": None,
    }
    if in_cycle:
        next_id = display_delays.next_page_id(page_id, cycle)
        prev_id = display_delays.prev_page_id(page_id, cycle)
        context["next_page_url"] = url_for(
            display_delays.KIOSK_PAGES[next_id]["endpoint"]
        )
        context["prev_page_url"] = url_for(
            display_delays.KIOSK_PAGES[prev_id]["endpoint"]
        )
    return context


@app.after_request
def kiosk_frame_headers(response):
    if request.endpoint in KIOSK_FRAME_ENDPOINTS:
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response


@app.route("/")
def index():
    first_id = display_delays.first_page_id()
    first_endpoint = display_delays.KIOSK_PAGES[first_id]["endpoint"]
    return redirect(url_for(first_endpoint))


@app.route("/kiosk")
def kiosk_entry():
    """Entry point legacy: reindirizza al player iframe (BrightSign)."""
    return redirect(url_for("kiosk_player"))


@app.route("/kiosk/player")
def kiosk_player():
    """Player unico per BrightSign: una URL, rotazione via iframe."""
    cfg = display_delays.load_display_config()
    return render_template(
        "kiosk_player.j2.html",
        delays=kiosk_context(cfg["cycle"][0]),
    )


@app.route("/kiosk/config.json")
def kiosk_config():
    cfg = display_delays.load_display_config()
    sponsor_count = sponsors.count_sponsor_logos(app.static_folder)
    cycle = display_delays.kiosk_cycle_items(
        cfg, sponsor_count=sponsor_count, url_for_fn=url_for
    )
    logger.info(
        "kiosk config: cc_step_ms=%s cycle=%s",
        cfg.get("cc_step_ms"),
        [item["id"] for item in cycle],
    )

    return jsonify(
        {
            "entry_url": url_for("kiosk_player", _external=True),
            "brightsign": {
                "recommended_url": url_for("kiosk_player", _external=True),
                "disable_widget_reload_timer": True,
                "note": (
                    "Impostare SOLO https://monitor.42roma.it/kiosk/player nel widget "
                    "BrightSign, senza timer di reload. Il player gestisce tutto il ciclo."
                ),
            },
            "cycle": cycle,
        }
    )


@app.route("/map")
def map():
    return redirect(url_for("workstations"))


@app.route("/workstations")
def workstations():
    location_data = get_location_dashboard_data()
    return render_template(
        "workstations.j2.html",
        kpi_items=build_statistics_kpis(location_data["location_stats"]),
        cluster_grouped_bars=build_usage_grouped_bars(location_data["used_pcs"]),
        **load_banner_context(),
        **location_data,
        delays=kiosk_context("workstations"),
    )


@app.route("/events")
def events():
    announcements = get_future_announcements()
    return render_template(
        "events.j2.html",
        announcements=announcements,
        events_data=[],
        # events_data=fetch_events_data(),
        has_future_announcements=bool(announcements),
        delays=kiosk_context("events"),
    )


# === Login / OAuth ===
@app.route("/login")
def login():
    if "user_login" in session:
        return redirect(url_for("choose"))
    return render_template("login.j2.html", auth_url=AUTH_URL)


@app.route("/callback")
def oauth_callback():
    code = request.args.get("code")
    if not code:
        return redirect(url_for("choose"))

    try:
        token_resp = requests.post(
            config.OAUTH_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "client_id": config.OAUTH_CLIENT_ID,
                "client_secret": config.OAUTH_CLIENT_SECRET,
                "code": code,
                "redirect_uri": config.OAUTH_REDIRECT_URI,
            },
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")

        user_resp = requests.get(
            f"{config.OAUTH_API_BASE_URL}/v2/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        user_resp.raise_for_status()
        user = user_resp.json()
        session.update({"user_login": user.get("login"), "user_kind": user.get("kind")})
    except requests.RequestException:
        logger.error("Errore nel flusso OAuth")

    return redirect(url_for("choose"))


# === Dashboard e staff ===
@app.route("/bde")
def bde():
    return redirect(url_for("choose"))


@app.route("/choose")
def choose():
    if "user_login" not in session:
        return redirect(url_for("login"))
    return render_template("choose.j2.html")


@app.route("/statistics")
def statistics():
    return render_template(
        "statistics.j2.html",
        user_login=session.get("user_login"),
        student_origin_chart=student_stats.build_origin_distribution(),
        student_age_chart=student_stats.build_age_distribution(),
        student_gender_chart=student_stats.build_gender_distribution(),
        student_exam_chart=student_stats.build_exam_rank_distribution(),
        delays=kiosk_context("statistics"),
    )


@app.route("/statistics/cc")
def statistics_cc():
    svg_file = config.CC_SVG_MASTERY if config.CC_SHOW_MASTERY else config.CC_SVG_CLASSIC
    svg_path = os.path.join(app.static_folder, "svg", svg_file)
    try:
        with open(svg_path, encoding="utf-8") as f:
            svg_raw = f.read()
    except OSError:
        svg_raw = ""

    svg_content, cc_full_viewbox, cc_only_viewbox = cc_svg.prepare_cc_svg(
        svg_raw,
        use_mastery_svg=config.CC_SHOW_MASTERY,
        mastery_fully_visible=config.CC_MASTERY_VISIBLE,
    )

    delays = kiosk_context("cc")
    logger.info(
        "statistics/cc cc_step_ms=%s cc_ranks=%s",
        delays.get("cc_step_ms"),
        delays.get("cc_ranks"),
    )

    return render_template(
        "statistics_cc.j2.html",
        svg_content=svg_content,
        rank_counts=student_stats.build_exam_rank_counts(),
        student_grade_chart=student_stats.build_grade_distribution(),
        cc_show_mastery=config.CC_SHOW_MASTERY,
        cc_mastery_visible=config.CC_MASTERY_VISIBLE,
        cc_full_viewbox=cc_full_viewbox,
        cc_only_viewbox=cc_only_viewbox,
        cc_sidebar_right=config.CC_SIDEBAR_RIGHT,
        cc_footnote_mark_neon=config.CC_GRADE_FOOTNOTE_MARK_NEON,
        cc_footnote_below=config.CC_GRADE_FOOTNOTE_BELOW,
        cc_intro_neon=config.CC_STATS_INTRO_NEON,
        cc_intro_below=config.CC_STATS_INTRO_BELOW,
        cc_back_nav_start_from_end=config.CC_BACK_NAV_START_FROM_END,
        delays=delays,
    )


def load_campus_counts():
    json_path = os.path.join(app.static_folder, "json", "42s.json")
    try:
        with open(json_path, encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        return {}


def load_country_names():
    json_path = os.path.join(app.static_folder, "json", "country.json")
    try:
        with open(json_path, encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        return {}


@app.route("/statistics/world")
def statistics_world():
    svg_path = os.path.join(app.static_folder, "svg", "world.svg")
    try:
        with open(svg_path, encoding="utf-8") as f:
            svg_content = f.read()
    except OSError:
        svg_content = ""

    campus_counts = load_campus_counts()
    max_count = max(campus_counts.values(), default=1)

    return render_template(
        "statistics_world.j2.html",
        svg_content=svg_content,
        campus_counts=campus_counts,
        country_names=load_country_names(),
        schools_by_country=network_schools.schools_by_country(),
        max_count=max_count,
        world_map_sidebar_enabled=config.WORLD_MAP_SIDEBAR_ENABLED,
        world_map_sidebar_vertical=config.WORLD_MAP_SIDEBAR_VERTICAL,
        world_map_highlight_country=config.WORLD_MAP_HIGHLIGHT_COUNTRY,
        delays=kiosk_context("world"),
    )


@app.route("/announcement")
def announcement_redirect():
    guard = require_dashboard_access()
    if guard:
        return guard
    return redirect(url_for("create_announcement"))


@app.route("/announcements/create", methods=["GET", "POST"])
def create_announcement():
    guard = require_dashboard_access()
    if guard:
        return guard

    if request.method == "POST":
        title = request.form.get("title", "").strip()
        description = request.form.get("description", "").strip()
        start_date = request.form.get("start_date", "").strip()
        end_date = request.form.get("end_date", "").strip()
        color = request.form.get("color", "#3e3e60")
        link = request.form.get("link", "").strip() or None

        if not title or not description or not start_date or not end_date:
            return render_template(
                "announcement.j2.html",
                error="Tutti i campi obbligatori devono essere compilati.",
            )

        # Clamp description to 470 bytes (approximate limit for signage)
        encoded = description.encode("utf-8")
        if len(encoded) > 470:
            description = encoded[:470].decode("utf-8", errors="ignore")

        announcement_id = generate_announcement_id()
        author = session.get("user_login")
        payload = {
            "title": title,
            "start_date": start_date,
            "end_date": end_date,
            "description": description,
            "color": color,
            "link": link,
            "created_by": author,
            "created_at": datetime.utcnow().isoformat(),
        }
        save_announcement(announcement_id, payload)
        logger.info(f"{author} ha creato l'annuncio {announcement_id}")
        return redirect(url_for("edit_announcements"))

    return render_template("announcement.j2.html")


@app.route("/announcements")
def edit_announcements():
    guard = require_dashboard_access()
    if guard:
        return guard

    user_login = session.get("user_login")
    show_all = session.get("user_kind") == "admin"
    items = list_announcements()
    if not show_all:
        items = [item for item in items if item.get("created_by") == user_login]
    return render_template("edit_announcements.j2.html", announcements=items)


@app.route("/edit_announcement/<announcement_id>", methods=["GET", "POST"])
def edit_announcement(announcement_id):
    guard = require_dashboard_access()
    if guard:
        return guard

    announcement = load_announcement(announcement_id)
    if not announcement:
        return "Annuncio non trovato", 404

    user_login = session.get("user_login")
    if (
        session.get("user_kind") != "admin"
        and announcement.get("created_by") != user_login
    ):
        logger.info(
            f"{user_login} ha tentato di modificare annuncio {announcement_id} senza permessi"
        )
        return "Unauthorized", 403
    # Handle form submission when editing an announcement
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        description = request.form.get("description", "").strip()
        start_date = request.form.get("start_date", "").strip()
        end_date = request.form.get("end_date", "").strip()
        color = request.form.get("color", announcement.get("color", "#3e3e60"))
        link = request.form.get("link", "").strip() or None

        if not title or not description or not start_date or not end_date:
            return render_template(
                "edit_announcement.j2.html",
                announcement=announcement,
                error="Tutti i campi obbligatori devono essere compilati.",
            )

        encoded = description.encode("utf-8")
        if len(encoded) > 470:
            description = encoded[:470].decode("utf-8", errors="ignore")

        announcement.update(
            {
                "title": title,
                "description": description,
                "start_date": start_date,
                "end_date": end_date,
                "color": color,
                "link": link,
                "updated_at": datetime.utcnow().isoformat(),
            }
        )
        save_announcement(
            announcement_id, {k: v for k, v in announcement.items() if k != "id"}
        )
        logger.info(f"{user_login} ha aggiornato l'annuncio {announcement_id}")
        return redirect(url_for("edit_announcements"))

    return render_template("edit_announcement.j2.html", announcement=announcement)


@app.route("/staff")
def staff_dashboard():
    if session.get("user_kind") != "admin":
        logger.info(
            f"Accesso staff non autorizzato da {session.get('user_login')} ({request.remote_addr})"
        )
        return redirect(url_for("choose"))
    return render_template("staff_dashboard.j2.html", NAGIOS_URL=config.NAGIOS_URL)


@app.route("/staff/display_delays", methods=["GET", "POST"])
def display_delays_management():
    if session.get("user_kind") != "admin":
        logger.info(
            "Accesso timing rotazione non autorizzato da %s (%s)",
            session.get("user_login"),
            request.remote_addr,
        )
        return redirect(url_for("choose"))

    error = None
    saved = False
    if request.method == "POST":
        try:
            cycle_order = request.form.getlist("cycle_order")
            display_delays.save_display_config(request.form, cycle_order)
            saved = True
            logger.info(
                "%s ha aggiornato rotazione monitor: %s",
                session.get("user_login"),
                cycle_order,
            )
        except OSError as exc:
            logger.error("Errore salvataggio display_delays: %s", exc)
            error = "Impossibile salvare le impostazioni."

    cfg = display_delays.load_display_config()
    sponsor_count = sponsors.count_sponsor_logos(app.static_folder)
    cycle_items = [
        {
            "id": page_id,
            "label": display_delays.KIOSK_PAGES[page_id]["label"],
            "duration": display_delays.page_duration_summary(
                page_id, cfg, sponsor_count=sponsor_count
            ),
        }
        for page_id in cfg["cycle"]
    ]
    all_pages = [
        display_delays.KIOSK_PAGES[page_id]
        for page_id in display_delays.KIOSK_PAGES
    ]

    page_catalog = {
        page_id: {
            "label": display_delays.KIOSK_PAGES[page_id]["label"],
            "duration": display_delays.page_duration_summary(
                page_id,
                cfg,
                sponsor_count=sponsor_count if page_id == "sponsors" else None,
            ),
        }
        for page_id in display_delays.KIOSK_PAGES
    }

    return render_template(
        "display_delays.j2.html",
        config=cfg,
        kiosk_pages=display_delays.KIOSK_PAGES,
        all_pages=all_pages,
        cycle_items=cycle_items,
        cycle_preview=display_delays.cycle_preview_items(
            cfg, sponsor_count=sponsor_count
        ),
        sponsor_count=sponsor_count,
        page_catalog=page_catalog,
        delay_fields=display_delays.DISPLAY_DELAY_FIELDS,
        error=error,
        saved=saved,
    )


@app.route("/banner_management", methods=["GET", "POST"])
def banner_management():
    if session.get("user_kind") != "admin":
        logger.info(
            f"Tentativo gestione banner non autorizzato da {session.get('user_login')}"
        )
        return "Unauthorized", 403

    banner = load_json(
        config.BANNER_FILE,
        {"visible": config.BANNER_DEFAULT_VISIBLE, "text": config.BANNER_DEFAULT_TEXT},
    )
    if request.method == "POST":
        banner["visible"] = "show_banner" in request.form
        banner["text"] = request.form.get("banner_text", "")
        save_json(config.BANNER_FILE, banner)
        logger.info(f"{session['user_login']} ha aggiornato il banner")
        return redirect(url_for("banner_management"))

    return render_template(
        "banner_management.j2.html",
        banner_visible=banner["visible"],
        banner_text=banner["text"],
    )


@app.route("/update_banner", methods=["POST"])
def update_banner():
    if "user_login" not in session:
        return redirect(url_for("login"))

    if session.get("user_kind") != "admin":
        logger.info(
            f"Tentativo aggiornamento banner non autorizzato da {session.get('user_login')} ({request.remote_addr})"
        )
        return "Unauthorized", 403

    banner_settings = {
        "visible": "show_banner" in request.form,
        "text": request.form.get("banner_text", ""),
    }
    save_json(config.BANNER_FILE, banner_settings)
    logger.info(f"{session.get('user_login')} ha aggiornato il banner")
    return redirect(url_for("banner_management"))


@app.route("/maintenance")
def staff_maintenance():
    if "user_login" not in session:
        logger.info(
            f"Tentativo di accesso non autorizzato alla pagina staff da IP {request.remote_addr}"
        )
        return redirect(url_for("login"))
    user_kind = session.get("user_kind")
    if user_kind != "admin":
        logger.info(
            f"Tentativo di accesso non autorizzato alla pagina staff da {session.get('user_login')} (IP: {request.remote_addr})"
        )
        return "Unauthorized", 403
    location_data = get_location_dashboard_data()
    return render_template("staff.j2.html", **location_data)


@app.route("/splash")
def splash():
    return render_template("splash.j2.html", delays=kiosk_context("splash"))


@app.route("/pictures")
def pictures():
    return render_template(
        "pictures.j2.html",
        pictures=pictures_assets.pick_random_picture_urls(
            app.static_folder, url_for, count=9
        ),
        delays=kiosk_context("pictures"),
    )


@app.route("/sponsors")
def sponsors_page():
    return render_template(
        "sponsors.j2.html",
        sponsor_logos=sponsors.list_sponsor_logos(app.static_folder, url_for),
        delays=kiosk_context("sponsors"),
    )


@app.route("/sponsors/new")
def new_sponsors_page():
    return render_template(
        "new_sponsors.j2.html",
        sponsor_logos=sponsors.list_new_partner_logos(app.static_folder, url_for),
    )


@app.route("/piscines")
def piscines_page():
    funnel = piscines.build_funnel_data()
    return render_template(
        "piscines.j2.html",
        piscine_sessions=piscines.fetch_piscine_sessions(),
        funnel_chart_data=funnel["chart"],
        funnel_display_counts=funnel["display"],
        funnel_stats=funnel["stats"],
        delays=kiosk_context("piscines"),
    )


@app.route("/toggle_maintenance", methods=["POST"])
def toggle_maintenance():
    if "user_login" not in session:
        logger.info(
            f"Tentativo di modifica manutenzione non autorizzato da IP {request.remote_addr}"
        )
        return redirect(url_for("login"))
    user_kind = session.get("user_kind")
    if user_kind != "admin":
        logger.info(
            f"Tentativo di modifica manutenzione non autorizzato da {session.get('user_login')} (IP: {request.remote_addr})"
        )
        return jsonify({"error": "Not authorized"}), 403
    pc_id = request.form.get("pc_id")
    action = request.form.get("action", "add")
    if not pc_id:
        return jsonify({"error": "No PC ID provided"}), 400
    maintenance_pcs = load_json(config.MAINTENANCE_FILE, default=[])
    if action == "remove" and pc_id in maintenance_pcs:
        maintenance_pcs.remove(pc_id)
        logger.info(
            f"{session.get('user_login')} ha rimosso {pc_id} dalla manutenzione"
        )
    elif action == "add" and pc_id not in maintenance_pcs:
        maintenance_pcs.append(pc_id)
        logger.info(
            f"{session.get('user_login')} ha aggiunto {pc_id} alla manutenzione"
        )
    save_json(config.MAINTENANCE_FILE, maintenance_pcs)
    return jsonify({"success": True, "maintenance_pcs": maintenance_pcs})


def _warm_picture_thumbnails():
    with app.app_context():
        pictures_assets.warm_all_thumbnails(app.static_folder)


threading.Thread(target=_warm_picture_thumbnails, daemon=True).start()


# === Main ===
if __name__ == "__main__":
    app.run(
        host=config.HOST,
        port=config.PORT,
        ssl_context=config.SSL_CONTEXT,
        debug=DEBUG_MODE,
    )
