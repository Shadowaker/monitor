from dotenv import load_dotenv
from pathlib import Path
import os

load_dotenv()

# === Percorsi base ===
BASE_DIR = Path(__file__).resolve().parent
ANNOUNCEMENTS_DIR = BASE_DIR / "announcements"
FUTURE_EVENTS_FILE = BASE_DIR / "future_events.json"
EVENT_SUMMARIES_CSV = BASE_DIR / "event_summaries.csv"
EVENT_SUMMARIZE_URL = os.getenv("EVENT_SUMMARIZE_URL")
EVENT_SUMMARIZE_TIMEOUT = int(os.getenv("EVENT_SUMMARIZE_TIMEOUT", "90"))
EVENT_SUMMARIZE_MAX_WORKERS = int(os.getenv("EVENT_SUMMARIZE_MAX_WORKERS", "4"))
MAINTENANCE_FILE = BASE_DIR / "maintenance.json"
BANNER_FILE = BASE_DIR / "banner.json"
DISPLAY_DELAYS_FILE = BASE_DIR / "display_delays.json"
LOG_FILE = BASE_DIR / "log.txt"
OFFLINE_YAML = BASE_DIR / "offline.yaml"
USED_YAML = BASE_DIR / "used.yaml"
TOTAL_WORKSTATIONS = int(os.getenv("TOTAL_WORKSTATIONS", "150"))
STUDENTS_BIRTH_CSV = os.getenv(
    "STUDENTS_BIRTH_CSV",
    str(BASE_DIR.parent.parent / "student-data" / "students_birth.csv"),
)
STUDENTS_CSV = os.getenv(
    "STUDENTS_CSV",
    str(BASE_DIR.parent.parent / "student-data" / "students.csv"),
)
STUDENT_ORIGIN_COUNTRY = os.getenv("STUDENT_ORIGIN_COUNTRY", "Italy")
STUDENT_ORIGIN_OTHERS_LABEL = os.getenv("STUDENT_ORIGIN_OTHERS_LABEL", "Altri")
ALL_STUDENTS_CSV = os.getenv(
    "ALL_STUDENTS_CSV",
    str(BASE_DIR.parent.parent / "student-data" / "all_students.csv"),
)
FUNNEL_DISPLAY_COUNTS = [
    int(os.getenv("FUNNEL_DISPLAY_TEST_ONLINE", "9000")),
    int(os.getenv("FUNNEL_DISPLAY_PISCINE", "2100")),
    int(os.getenv("FUNNEL_DISPLAY_COMMON_CORE", "830")),
    int(os.getenv("FUNNEL_DISPLAY_ADVANCED_CORE", "190")),
]
FUNNEL_CHART_COUNTS = [
    int(os.getenv("FUNNEL_CHART_TEST_ONLINE", "9000")),
    int(os.getenv("FUNNEL_CHART_PISCINE", "4800")),
    int(os.getenv("FUNNEL_CHART_COMMON_CORE", "2000")),
    int(os.getenv("FUNNEL_CHART_ADVANCED_CORE", "850")),
]
FUNNEL_STATS = [
    # "1 candidato su 10 accede al Common Core",
    '1 candidato su 2 dei "piscinanti" accede al CC',
    # "1 alumno su 4 prosegue il percorso advanced",
    "* Dati dei Campus di Roma e Firenze dal 1/1/2023 a oggi"
]
WORLD_MAP_SIDEBAR_ENABLED = (
    os.getenv("WORLD_MAP_SIDEBAR_ENABLED", "true").lower() == "true"
)
# true = colonne laterali (Europa | mappa | altri continenti); false = tutti i paesi sotto la mappa
WORLD_MAP_SIDEBAR_VERTICAL = (
    os.getenv("WORLD_MAP_SIDEBAR_VERTICAL", "true").lower() == "true"
)


def _world_map_highlight_country() -> str:
    """Paese evidenziato sulla mappa mondiale (nome o codice ISO).

    WORLD_MAP_HIGHLIGHT_COUNTRY ha priorità.
    WORLD_MAP_ITALY_NEON_ENABLED resta supportato: true → Italy, altrimenti il valore
    viene interpretato come nome paese (es. Luxembourg).
    """
    explicit = os.getenv("WORLD_MAP_HIGHLIGHT_COUNTRY", "").strip()
    if explicit:
        return explicit

    legacy = os.getenv("WORLD_MAP_ITALY_NEON_ENABLED", "true").strip()
    if not legacy:
        return ""
    lowered = legacy.lower()
    if lowered in {"false", "0", "no", "off"}:
        return ""
    if lowered in {"true", "1", "yes", "on"}:
        return "Italy"
    return legacy


WORLD_MAP_HIGHLIGHT_COUNTRY = _world_map_highlight_country()
WORLD_MAP_ITALY_NEON_ENABLED = bool(WORLD_MAP_HIGHLIGHT_COUNTRY)
# CC_SHOW_MASTERY=false → cc.svg (solo cerchi)
# CC_SHOW_MASTERY=true + CC_MASTERY_VISIBLE=false → mastery.svg, cerchi grandi, mastery parziale
# CC_SHOW_MASTERY=true + CC_MASTERY_VISIBLE=true → mastery.svg, tutto visibile (cerchi più piccoli)
CC_SHOW_MASTERY = os.getenv("CC_SHOW_MASTERY", "true").lower() == "true"
CC_MASTERY_VISIBLE = os.getenv("CC_MASTERY_VISIBLE", "true").lower() == "true"
CC_SVG_MASTERY = "mastery.svg"
CC_SVG_CLASSIC = "cc.svg"
CC_SIDEBAR_RIGHT = os.getenv("CC_SIDEBAR_RIGHT", "false").lower() == "true"
CC_GRADE_FOOTNOTE_MARK_NEON = (
    os.getenv("CC_GRADE_FOOTNOTE_MARK_NEON", "true").lower() == "true"
)
CC_GRADE_FOOTNOTE_BELOW = os.getenv("CC_GRADE_FOOTNOTE_BELOW", "false").lower() == "true"
CC_STATS_INTRO_NEON = os.getenv("CC_STATS_INTRO_NEON", "true").lower() == "true"
CC_STATS_INTRO_BELOW = os.getenv("CC_STATS_INTRO_BELOW", "false").lower() == "true"
# true → su /statistics/cc, tornando indietro da pagina successiva parte dall'ultimo cerchio
CC_BACK_NAV_START_FROM_END = (
    os.getenv("CC_BACK_NAV_START_FROM_END", "true").lower() == "true"
)
NETWORK_SCHOOLS_JSON = BASE_DIR / "static" / "json" / "network_schools.json"
NETWORK_SCHOOLS_URL = os.getenv(
    "NETWORK_SCHOOLS_URL", "https://www.42network.org/42-schools/"
)
NETWORK_SCHOOLS_USER_AGENT = os.getenv("NETWORK_SCHOOLS_USER_AGENT")
NETWORK_SCHOOLS_TIMEOUT = int(os.getenv("NETWORK_SCHOOLS_TIMEOUT", "30"))
NETWORK_SCHOOLS_CACHE_HOURS = int(os.getenv("NETWORK_SCHOOLS_CACHE_HOURS", "24"))

# === Parametri campus / eventi ===
CAMPUS_ID = int(os.getenv("CAMPUS_ID", "30"))
CURSUS_ID = int(os.getenv("CURSUS_ID", "21"))
CAMPUS_URL = os.getenv("CAMPUS_URL")
EVENT_LOOKAHEAD_DAYS = int(os.getenv("EVENT_LOOKAHEAD_DAYS", "7"))

# === Banner ===
BANNER_DEFAULT_VISIBLE = os.getenv("BANNER_DEFAULT_VISIBLE", "false").lower() == "true"
BANNER_DEFAULT_TEXT = os.getenv(
    "BANNER_DEFAULT_TEXT", "🔔 Attenzione: Manutenzione programmata il 17 dicembre"
)

# === OAuth 42 ===
OAUTH_AUTHORIZE_URL = os.getenv(
    "OAUTH_AUTHORIZE_URL", "https://api.intra.42.fr/oauth/authorize"
)
OAUTH_TOKEN_URL = os.getenv("OAUTH_TOKEN_URL", "https://api.intra.42.fr/oauth/token")
OAUTH_API_BASE_URL = os.getenv("OAUTH_API_BASE_URL", "https://api.intra.42.fr")
OAUTH_CLIENT_ID = os.getenv("OAUTH_CLIENT_ID")
OAUTH_CLIENT_SECRET = os.getenv("OAUTH_CLIENT_SECRET")
OAUTH_REDIRECT_URI = os.getenv(
    "OAUTH_REDIRECT_URI", "https://monitor.42roma.it/callback"
)

# === Logging configuration ===
# Maximum size for log rotation (bytes) and number of backups
LOG_MAX_BYTES = int(os.getenv("LOG_MAX_BYTES", str(10 * 1024 * 1024)))  # 10 MiB
LOG_BACKUP_COUNT = int(os.getenv("LOG_BACKUP_COUNT", "5"))

# === SSL e host ===
SSL_CERT_PATH = os.getenv("SSL_CERT_PATH", "")
SSL_KEY_PATH = os.getenv("SSL_KEY_PATH", "")
SSL_CONTEXT = (SSL_CERT_PATH, SSL_KEY_PATH) if SSL_CERT_PATH and SSL_KEY_PATH else None
HOST = os.getenv("FLASK_HOST", "monitor.42roma.it")
PORT = int(os.getenv("FLASK_PORT", "443"))

# === Servizi esterni ===
SITE = os.getenv("URL", "")
NAGIOS_URL = os.getenv("NAGIOS_URL")

# === Autorizzazioni ===
AUTHORIZED_USERS = os.getenv("AUTHORIZED_USERS", "ffrau").split(",")
