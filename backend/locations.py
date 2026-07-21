import csv
from pathlib import Path

import requests
import yaml

try:
    from . import config
except ImportError:
    import config

OUTPUT_CSV = config.BASE_DIR / "checkup.csv"
OFFLINE_YAML = config.OFFLINE_YAML
USED_YAML = config.USED_YAML

clusters = 3
rows = 7
positions = 8

API_TIMEOUT = 2


def iter_location_ids():
    for cluster in range(clusters):
        for row in range(rows):
            if row > 5 and cluster > 0:
                break
            for position in range(positions):
                if row == 0 and cluster == 0 and position > 5:
                    break
                yield f"c{cluster + 1}r{row + 1}s{position + 1}"


def location_url(location_id: str) -> str:
    return str(config.CAMPUS_URL).replace("location_id", location_id.lower())


def classify_payload(payload: dict) -> str:
    """
    Restituisce 'used' se c'è un utente loggato, 'online' se raggiungibile ma libera.
    """
    if "user" not in payload:
        return "online"
    user = payload.get("user")
    if user is None or user == "":
        return "online"
    return "used"


def check_location(location_id: str):
    """
    Verifica una postazione.

    Returns:
        (status, payload, error)
        status: 'offline' | 'used' | 'online'
    """
    url = location_url(location_id)
    try:
        response = requests.get(url, timeout=API_TIMEOUT)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        return "offline", None, exc

    return classify_payload(payload), payload, None


def scan_locations():
    """Scansiona tutte le postazioni e restituisce liste offline / used / online."""
    offline = []
    used = []
    online = []
    rows_for_csv = []

    for location_id in iter_location_ids():
        status, payload, error = check_location(location_id)
        if status == "offline":
            offline.append(location_id)
            print(f"OFFLINE {location_id}: {error}")
            continue

        if status == "used":
            used.append(location_id)
            user = payload.get("user", "")
            print(f"USED {location_id} ({user})")
        else:
            online.append(location_id)
            print(f"ONLINE {location_id}")

        if payload is not None:
            rows_for_csv.append(payload_to_row(payload, location_id))

    return {
        "offline": offline,
        "used": used,
        "online": online,
        "csv_rows": rows_for_csv,
    }


def payload_to_row(data, location_id):
    """Flatten API JSON to one CSV row; excludes 'user'."""
    row = {"location": location_id}
    crc = data.get("crc")
    if isinstance(crc, dict):
        row["crc_version"] = crc.get("version", "")
    si = data.get("system_info")
    if isinstance(si, dict):
        for key, value in si.items():
            row[key] = value if value is not None else ""
    return row


def write_yaml(path: Path, root_key: str, items: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump({root_key: items}, f, default_flow_style=False, allow_unicode=True)


def write_checkup_csv(rows: list) -> None:
    if not rows:
        return
    all_keys = set()
    for row in rows:
        all_keys.update(row.keys())
    fieldnames = ["location"] + sorted(k for k in all_keys if k != "location")
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main():
    result = scan_locations()
    offline = result["offline"]
    used = result["used"]
    online = result["online"]

    write_yaml(OFFLINE_YAML, "offline", offline)
    write_yaml(USED_YAML, "used", used)
    write_checkup_csv(result["csv_rows"])

    print(
        f"\nRiepilogo: {len(offline)} offline, {len(used)} utilizzate, "
        f"{len(online)} online libere"
    )
    print(f"Scritto {OFFLINE_YAML}")
    print(f"Scritto {USED_YAML}")
    if result["csv_rows"]:
        print(f"Scritto {len(result['csv_rows'])} righe in {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
