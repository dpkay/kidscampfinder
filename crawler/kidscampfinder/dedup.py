"""Cross-source de-duplication.

The same offering can appear in more than one source (e.g. a commune's Feriennet
instance and an aggregator). We flag duplicates by fuzzy-matching normalized
title + commune, then attach the duplicate's URL to the canonical record's raw blob.
We keep both rows but mark the non-canonical one so the web tier can hide it.
"""
from __future__ import annotations

import json
import re
import sqlite3
from collections import defaultdict

from rapidfuzz import fuzz

_NORM_RE = re.compile(r"[^a-z0-9]+")


def _norm(s: str) -> str:
    return _NORM_RE.sub(" ", (s or "").lower()).strip()


def find_duplicates(conn: sqlite3.Connection, threshold: int = 90) -> int:
    """Mark duplicates within the same commune. Returns count of duplicates flagged.

    Adds a `dup_of` key into course.raw for the non-canonical rows. Canonical = the
    row with the most populated fields (richest record).
    """
    rows = conn.execute(
        "SELECT id, title, commune, source, description_full, image_url, lat, raw FROM course"
    ).fetchall()

    by_commune: dict[str, list[sqlite3.Row]] = defaultdict(list)
    for r in rows:
        by_commune[(r["commune"] or "").strip().lower()].append(r)

    def richness(r: sqlite3.Row) -> int:
        return sum(1 for f in ("description_full", "image_url", "lat") if r[f])

    flagged = 0
    for commune, group in by_commune.items():
        n = len(group)
        for i in range(n):
            for j in range(i + 1, n):
                a, b = group[i], group[j]
                if a["source"] == b["source"]:
                    continue  # same source already deduped by id
                score = fuzz.token_set_ratio(_norm(a["title"]), _norm(b["title"]))
                if score >= threshold:
                    # canonical = richer; loser gets dup_of
                    winner, loser = (a, b) if richness(a) >= richness(b) else (b, a)
                    raw = json.loads(loser["raw"] or "{}")
                    if raw.get("dup_of"):
                        continue
                    raw["dup_of"] = winner["id"]
                    raw["dup_score"] = score
                    conn.execute(
                        "UPDATE course SET raw = ? WHERE id = ?",
                        (json.dumps(raw, ensure_ascii=False), loser["id"]),
                    )
                    flagged += 1
    conn.commit()
    return flagged
