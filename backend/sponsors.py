import os
from pathlib import Path

SPONSOR_LABELS = {
    "acea": "ACEA",
    "engineering": "Engineering",
    "fides": "Fides",
    "fs": "FS",
    "leonardo": "Leonardo",
    "lottomatica": "Lottomatica",
    "luiss": "LUISS",
    "tim": "TIM",
    "zacconi": "Zacconi",
}

# Loghi scuri da invertire su sfondo blu
SPONSOR_INVERT_ON_DARK = {"luiss", "zacconi", "lottomatica"}  # , "engineering", "fs"}


def count_sponsor_logos(static_folder):
    partner_dir = Path(static_folder) / "svg" / "old_partner"
    try:
        return sum(
            1 for name in os.listdir(partner_dir) if Path(name).suffix.lower() == ".svg"
        )
    except OSError:
        return 0


def list_sponsor_logos(static_folder, url_for_fn):
    partner_dir = Path(static_folder) / "svg" / "old_partner"
    try:
        names = sorted(
            name
            for name in os.listdir(partner_dir)
            if Path(name).suffix.lower() == ".svg"
        )
    except OSError:
        names = []

    logos = []
    for name in names:
        stem = Path(name).stem
        logos.append(
            {
                "src": url_for_fn("static", filename=f"svg/old_partner/{name}"),
                "name": SPONSOR_LABELS.get(stem, stem.replace("_", " ").title()),
                "invert": stem in SPONSOR_INVERT_ON_DARK,
            }
        )
    return logos


def list_new_partner_logos(static_folder, url_for_fn):
    partner_dir = Path(static_folder) / "svg" / "new_partner"
    try:
        names = sorted(
            name
            for name in os.listdir(partner_dir)
            if Path(name).suffix.lower() == ".svg"
        )
    except OSError:
        names = []

    logos = []
    for name in names:
        stem = Path(name).stem
        logos.append(
            {
                "src": url_for_fn("static", filename=f"svg/new_partner/{name}"),
                "name": stem.replace("_", " ").replace("-", " ").title(),
            }
        )
    return logos
