"""SQLite access: schema init and upserts."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Optional

from . import config
from .models import Course


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    config.ensure_dirs()
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(config.SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.commit()


_COURSE_COLS = [
    "id", "source", "source_url", "title", "description_full", "description_snippet",
    "provider", "topics", "format", "cost_type", "price_chf", "age_min", "age_max",
    "language", "commune", "venue_name", "address", "lat", "lng", "image_url",
    "image_local_path", "first_seen", "last_seen", "raw",
]

_OCC_COLS = [
    "id", "course_id", "iso_year", "iso_week_start", "iso_week_end", "start_date",
    "end_date", "start_time", "end_time", "holiday_period", "registration_deadline",
    "spots_available",
]


def upsert_course(conn: sqlite3.Connection, course: Course) -> str:
    """Insert or update a course (+ its occasions). Returns 'new' or 'updated'."""
    row = course.to_row()
    ts = now_iso()
    existing = conn.execute(
        "SELECT first_seen FROM course WHERE id = ?", (course.id,)
    ).fetchone()
    row["last_seen"] = ts
    row["first_seen"] = existing["first_seen"] if existing else ts

    placeholders = ", ".join(f":{c}" for c in _COURSE_COLS)
    updates = ", ".join(f"{c}=excluded.{c}" for c in _COURSE_COLS if c != "first_seen")
    conn.execute(
        f"INSERT INTO course ({', '.join(_COURSE_COLS)}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET {updates}",
        {c: row.get(c) for c in _COURSE_COLS},
    )

    # Replace occasions for this course (simplest correct strategy for a re-crawl).
    conn.execute("DELETE FROM occasion WHERE course_id = ?", (course.id,))
    for occ in course.occasions:
        d = occ.__dict__
        ph = ", ".join(f":{c}" for c in _OCC_COLS)
        conn.execute(
            f"INSERT OR REPLACE INTO occasion ({', '.join(_OCC_COLS)}) VALUES ({ph})",
            {c: d.get(c) for c in _OCC_COLS},
        )
    return "new" if not existing else "updated"


def record_run(
    conn: sqlite3.Connection,
    *,
    started_at: str,
    source: str,
    fetched: int,
    parsed: int,
    new: int,
    updated: int,
    errors: int,
    note: str = "",
) -> None:
    conn.execute(
        "INSERT INTO crawl_run (started_at, finished_at, source, fetched, parsed, new, "
        "updated, errors, note) VALUES (?,?,?,?,?,?,?,?,?)",
        (started_at, now_iso(), source, fetched, parsed, new, updated, errors, note),
    )
    conn.commit()


def trailing_avg_parsed(conn: sqlite3.Connection, source: str, n: int = 5) -> Optional[float]:
    rows = conn.execute(
        "SELECT parsed FROM crawl_run WHERE source = ? ORDER BY id DESC LIMIT ?",
        (source, n),
    ).fetchall()
    if not rows:
        return None
    vals = [r["parsed"] for r in rows]
    return sum(vals) / len(vals)
