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
import string
from datetime import datetime, timedelta
import requests
import urllib3
import yaml
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from . import config

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# === Setup Flask ===
# Read debug mode early so we can enforce secret requirements
DEBUG_MODE = os.getenv("FLASK_DEBUG", "false").lower() == "true"

app = Flask(__name__, static_folder="static")
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
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure rotating file handler using config values
try:
    file_handler = RotatingFileHandler(
        config.LOG_FILE,
        maxBytes=config.LOG_MAX_BYTES,
        backupCount=config.LOG_BACKUP_COUNT,
    )
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    logger.setLevel(logging.INFO)
except Exception:
    # If logging init fails, continue with default logger
    logger.exception("Failed to initialize rotating file handler")


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
    if not token:
        return []

    now = datetime.now()
    params = {
        "filter[begin_at]": f"{now.strftime('%Y-%m-%dT%H:%M:%S.000Z')},"
        f"{(now + timedelta(days=config.EVENT_LOOKAHEAD_DAYS)).strftime('%Y-%m-%dT%H:%M:%S.000Z')}"
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
        save_json(config.FUTURE_EVENTS_FILE, list(reversed(events)))
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


# === Routes ===
@app.route("/")
def index():
    return redirect(url_for("map"))


@app.route("/map")
def map():
    banner_data = load_json(
        config.BANNER_FILE,
        default={
            "visible": config.BANNER_DEFAULT_VISIBLE,
            "text": config.BANNER_DEFAULT_TEXT,
        },
    )

    data = dict(
        announcements=get_future_announcements(),
        days=[(datetime.now() + timedelta(days=i)).strftime("%A") for i in range(7)],
        maintenance_pcs=load_json(config.MAINTENANCE_FILE),
        banner=banner_data,
        banner_visible=banner_data.get("visible", False),
        banner_text=banner_data.get("text", ""),
        offline_pcs=[],
        online_pcs=[],
        events_data=[],
    )

    for label, url, key in [
        ("offline", config.OFFLINE_LOCATIONS, "offline_pcs"),
        ("online", config.ONLINE_LOCATIONS, "online_pcs"),
        ("events", config.GET_EVENTS, "events_data"),
    ]:
        try:
            resp = requests.get(url, verify=False, timeout=5)
            if resp.status_code == 200:
                if label == "events":
                    data[key] = resp.json()
                else:
                    parsed = yaml.safe_load(resp.text) or {}
                    expected_key = "offline" if label == "offline" else "used"
                    data[key] = parsed.get(expected_key, parsed)
        except Exception as e:
            logger.warning(f"Errore fetch {label}: {e}")

    return render_template(
        "map.j2.html",
        **data,
        has_future_announcements=bool(data["announcements"]),
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
    maintenance_pcs = load_json(config.MAINTENANCE_FILE, default=[])
    return render_template("staff.j2.html", maintenance_pcs=maintenance_pcs)


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


# === Main ===
if __name__ == "__main__":
    app.run(
        host=config.HOST,
        port=config.PORT,
        ssl_context=config.SSL_CONTEXT,
        debug=DEBUG_MODE,
    )
