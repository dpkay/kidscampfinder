"""Discovery ingestion — the long-tail pipeline (step 4–5).

A *discovery* run finds independent provider sites (a gym's own page, a studio's Wix
site, …) that don't list on any platform we crawl, and extracts course records from their
free-form pages. Extraction is the hard part: arbitrary HTML with no common structure, so
it needs an LLM (see docs/TDD.md §14). This module is the part *after* extraction — it
takes normalized records (however they were produced) and lands them safely in the DB:

  records (JSON)  →  Course/Occasion  →  dedup vs existing DB  →  upsert

Discovered courses are marked `source="discovered:<domain>"` and carry a confidence score
and a `needs_verify` flag in `raw`, so the web layer can treat them as lower-trust than
platform data.

Record schema (one dict per course):
{
  "url": "https://www.verabjj.ch/summer-camp-2026",   # required
  "title": "...",                                       # required
  "provider": "...",            "description": "...",
  "topics": ["sports"],         "format": "multi_day", # optional; inferred if absent
  "cost_type": "paid",          "price_chf": 450,
  "age_min": 4, "age_max": 12,
  "commune": "Zürich",          "address": "...",
  "lat": 47.36, "lng": 8.52,    "image_url": "...",
  "language": "de",
  "confidence": 0.9,            # extractor's self-rated confidence 0..1
  "query": "kinder sommercamp zürich",   # the search query that surfaced it
  "occasions": [ {"start_date": "2026-08-07", "end_date": "2026-08-14",
                  "start_time": "09:00", "end_time": "16:00"} ]
}
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from typing import Any
from urllib.parse import urlparse

from rapidfuzz import fuzz

from . import db, geo, normalize
from .models import Course, Occasion

_NORM = re.compile(r"[^a-z0-9]+")
DUP_THRESHOLD = 88


def _domain(url: str) -> str:
    host = urlparse(url).hostname or "unknown"
    return host[4:] if host.startswith("www.") else host


def _norm_title(s: str) -> str:
    return _NORM.sub(" ", (s or "").lower()).strip()


def _is_duplicate(conn, title: str, commune: str | None) -> str | None:
    """Return the id of an existing course that looks like the same offering, else None."""
    rows = conn.execute(
        "SELECT id, title FROM course WHERE COALESCE(commune,'') = COALESCE(?, '')",
        (commune,),
    ).fetchall()
    nt = _norm_title(title)
    for r in rows:
        if fuzz.token_set_ratio(nt, _norm_title(r["title"])) >= DUP_THRESHOLD:
            return r["id"]
    return None


def _occasions_from(rec: dict, course_id: str) -> list[Occasion]:
    out = []
    for o in rec.get("occasions", []):
        sd = o.get("start_date")
        ed = o.get("end_date") or sd
        d = None
        try:
            d = date.fromisoformat(sd) if sd else None
        except ValueError:
            d = normalize.parse_date(sd)
        iy, iw = normalize.iso_week(d)
        ed_d = None
        try:
            ed_d = date.fromisoformat(ed) if ed else d
        except ValueError:
            ed_d = d
        _, iw2 = normalize.iso_week(ed_d)
        out.append(
            Occasion(
                course_id=course_id,
                iso_year=iy,
                iso_week_start=iw,
                iso_week_end=iw2 or iw,
                start_date=d.isoformat() if d else None,
                end_date=ed_d.isoformat() if ed_d else None,
                start_time=o.get("start_time"),
                end_time=o.get("end_time"),
                holiday_period=normalize.holiday_period_for(d),
                registration_deadline=o.get("registration_deadline"),
            )
        )
    return out


def _to_course(rec: dict) -> Course:
    url = rec["url"]
    domain = _domain(url)
    desc = rec.get("description")
    lat, lng = rec.get("lat"), rec.get("lng")
    if lat is None and rec.get("commune"):
        lat, lng = geo.latlng_for(rec["commune"])

    course = Course(
        source=f"discovered:{domain}",
        # include the title: one page (URL) can list many distinct camps — keying on URL
        # alone would collapse them into a single course.
        source_key=f"{url}::{rec['title']}",
        source_url=url,
        title=rec["title"],
        description_full=desc,
        description_snippet=normalize.make_snippet(desc),
        provider=rec.get("provider") or domain,
        topics=rec.get("topics") or normalize.classify_topics(rec["title"], desc),
        format=rec.get("format") or normalize.classify_format(text=f"{rec['title']} {desc or ''}"),
        cost_type=rec.get("cost_type") or ("paid" if rec.get("price_chf") else "unknown"),
        price_chf=rec.get("price_chf"),
        age_min=rec.get("age_min"),
        age_max=rec.get("age_max"),
        language=rec.get("language") or normalize.detect_language(rec["title"], desc),
        commune=rec.get("commune"),
        venue_name=rec.get("venue_name"),
        address=rec.get("address"),
        lat=lat,
        lng=lng,
        image_url=rec.get("image_url"),
        raw={
            "discovered": True,
            "needs_verify": True,
            "confidence": rec.get("confidence"),
            "query": rec.get("query"),
            "extractor": rec.get("extractor", "agent"),
        },
    )
    course.occasions = _occasions_from(rec, course.id)
    return course


def ingest(records: list[dict]) -> dict[str, Any]:
    conn = db.connect()
    db.init_db(conn)
    new = updated = skipped_dup = 0
    for rec in records:
        if not rec.get("url") or not rec.get("title"):
            continue
        course = _to_course(rec)
        dup = _is_duplicate(conn, course.title, course.commune)
        if dup and not dup.startswith(course.id):
            # already covered by a platform (or earlier) source — record the link, skip
            skipped_dup += 1
            continue
        status = db.upsert_course(conn, course)
        new += status == "new"
        updated += status == "updated"
    conn.commit()
    conn.close()
    return {"new": new, "updated": updated, "skipped_duplicate": skipped_dup,
            "total_in": len(records)}


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python -m kidscampfinder.discovery <records.json>")
        raise SystemExit(1)
    records = json.loads(open(sys.argv[1], encoding="utf-8").read())
    if isinstance(records, dict):
        records = records.get("records", [])
    stats = ingest(records)
    print(f"[discovery] ingested: {stats}")


if __name__ == "__main__":
    main()
