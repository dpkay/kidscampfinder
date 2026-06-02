"""Download course images locally so the UI can serve them without hotlinking."""
from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path
from typing import Optional

from . import config
from .http import Fetcher

_EXT_BY_CT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}


def _local_name(url: str, content_type: str = "") -> str:
    h = hashlib.sha1(url.encode("utf-8")).hexdigest()
    ext = _EXT_BY_CT.get(content_type.split(";")[0].strip().lower(), "")
    if not ext:
        # fall back to URL suffix if it looks like an image, else .jpg
        suffix = Path(url.split("?")[0]).suffix.lower()
        ext = suffix if suffix in (".jpg", ".jpeg", ".png", ".webp", ".gif") else ".jpg"
    return f"{h}{ext}"


def fetch_images(conn: sqlite3.Connection, fetcher: Fetcher) -> int:
    """Download images for courses that have an image_url but no local copy yet."""
    config.ensure_dirs()
    rows = conn.execute(
        "SELECT id, image_url FROM course "
        "WHERE image_url IS NOT NULL AND image_url != '' "
        "AND (image_local_path IS NULL OR image_local_path = '')"
    ).fetchall()
    downloaded = 0
    for row in rows:
        url = row["image_url"]
        content = fetcher.get_bytes(url)
        if not content:
            continue
        # guess content type from magic bytes for naming
        ct = ""
        if content[:3] == b"\xff\xd8\xff":
            ct = "image/jpeg"
        elif content[:8] == b"\x89PNG\r\n\x1a\n":
            ct = "image/png"
        elif content[:4] == b"RIFF" and content[8:12] == b"WEBP":
            ct = "image/webp"
        name = _local_name(url, ct)
        path = config.IMAGE_DIR / name
        if not path.exists():
            path.write_bytes(content)
        # store path relative to the data dir so the web tier can resolve it
        rel = f"images/{name}"
        conn.execute("UPDATE course SET image_local_path = ? WHERE id = ?", (rel, row["id"]))
        downloaded += 1
        if downloaded % 25 == 0:
            conn.commit()
            print(f"  [images] {downloaded}/{len(rows)} downloaded")
    conn.commit()
    return downloaded
