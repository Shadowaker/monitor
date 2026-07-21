import os
import random
from pathlib import Path

from PIL import Image, ImageOps

PICTURE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
THUMB_SUBDIR = ".thumbs"
THUMB_MAX_PX = 960
THUMB_JPEG_QUALITY = 82


def _images_dir(static_folder):
    return Path(static_folder) / "images"


def _thumbs_dir(static_folder):
    return _images_dir(static_folder) / THUMB_SUBDIR


def list_picture_names(static_folder):
    directory = _images_dir(static_folder)
    try:
        return sorted(
            name
            for name in os.listdir(directory)
            if Path(name).suffix.lower() in PICTURE_EXTENSIONS
            and not name.startswith(".")
        )
    except OSError:
        return []


def _thumb_filename(source_name):
    return f"{Path(source_name).stem}.jpg"


def ensure_thumbnail(static_folder, source_name):
    """Return static-relative path to a cached JPEG thumbnail."""
    source_path = _images_dir(static_folder) / source_name
    if not source_path.is_file():
        return f"images/{source_name}"

    thumb_dir = _thumbs_dir(static_folder)
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / _thumb_filename(source_name)
    rel_thumb = f"images/{THUMB_SUBDIR}/{_thumb_filename(source_name)}"

    try:
        source_mtime = source_path.stat().st_mtime
        if thumb_path.is_file() and thumb_path.stat().st_mtime >= source_mtime:
            return rel_thumb
    except OSError:
        pass

    with Image.open(source_path) as img:
        img = ImageOps.exif_transpose(img)
        rgb = img.convert("RGB")
        rgb.thumbnail((THUMB_MAX_PX, THUMB_MAX_PX), Image.Resampling.LANCZOS)
        rgb.save(
            thumb_path,
            "JPEG",
            quality=THUMB_JPEG_QUALITY,
            optimize=True,
            progressive=True,
        )

    return rel_thumb


def warm_all_thumbnails(static_folder):
    for name in list_picture_names(static_folder):
        ensure_thumbnail(static_folder, name)


def pick_random_picture_urls(static_folder, url_for_fn, count=9):
    names = list_picture_names(static_folder)
    if not names:
        return []

    picked = random.sample(names, min(count, len(names)))
    return [url_for_fn("static", filename=ensure_thumbnail(static_folder, name)) for name in picked]
