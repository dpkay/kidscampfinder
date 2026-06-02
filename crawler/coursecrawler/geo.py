"""Commune geocoding fallback + Canton Zürich school-holiday week reference.

Feriennet detail pages already carry coordinates; this table is a fallback for sources
that only give a commune name, and powers the KW↔commune holiday mapping in the UI.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Optional

# Approximate centroids (lat, lng) for the larger Canton Zürich communes.
# Not exhaustive — a fallback when a source gives only a commune name.
COMMUNE_LATLNG: dict[str, tuple[float, float]] = {
    "Zürich": (47.3769, 8.5417),
    "Winterthur": (47.5008, 8.7241),
    "Uster": (47.3470, 8.7180),
    "Dübendorf": (47.3970, 8.6190),
    "Dietikon": (47.4017, 8.4003),
    "Wetzikon": (47.3260, 8.7980),
    "Wädenswil": (47.2300, 8.6740),
    "Kloten": (47.4520, 8.5870),
    "Horgen": (47.2590, 8.5990),
    "Bülach": (47.5210, 8.5410),
    "Schlieren": (47.3970, 8.4470),
    "Adliswil": (47.3110, 8.5250),
    "Volketswil": (47.3880, 8.6920),
    "Regensdorf": (47.4340, 8.4690),
    "Effretikon": (47.4260, 8.6920),
    "Illnau-Effretikon": (47.4260, 8.6920),
    "Wallisellen": (47.4150, 8.5960),
    "Opfikon": (47.4290, 8.5710),
    "Thalwil": (47.2920, 8.5650),
    "Meilen": (47.2700, 8.6440),
    "Stäfa": (47.2410, 8.7270),
    "Küsnacht": (47.3180, 8.5840),
    "Zollikon": (47.3410, 8.5760),
    "Zollikerberg": (47.3459, 8.6047),
    "Rüti": (47.2570, 8.8540),
    "Bassersdorf": (47.4440, 8.6280),
    "Affoltern am Albis": (47.2780, 8.4520),
    "Neerach": (47.4998, 8.4790),
    "Hedingen": (47.2970, 8.4470),
    "Urdorf": (47.3850, 8.4280),
    "Neftenbach": (47.5270, 8.6830),
    "Bachenbülach": (47.5470, 8.5390),
    "Oberrieden": (47.2770, 8.5810),
    "Hettlingen": (47.5460, 8.6940),
    "Hombrechtikon": (47.2520, 8.7700),
    "Uetikon am See": (47.2700, 8.6810),
    "Bonstetten": (47.3180, 8.4690),
    "Rüschlikon": (47.3050, 8.5520),
    "Kilchberg": (47.3220, 8.5430),
    "Richterswil": (47.2080, 8.6990),
    "Männedorf": (47.2570, 8.6920),
    "Bülach": (47.5210, 8.5410),
    "Aathal": (47.3400, 8.7700),
    "Feldbach": (47.2440, 8.7820),
    "Pfäffikon": (47.3650, 8.7850),
    "Stadel": (47.5230, 8.4770),
    "Glattfelden": (47.5350, 8.5100),
    "Oberengstringen": (47.4080, 8.4660),
}


def latlng_for(commune: Optional[str]) -> tuple[Optional[float], Optional[float]]:
    if not commune:
        return None, None
    return COMMUNE_LATLNG.get(commune.strip(), (None, None))


# Canton Zürich summer-holiday weeks (KW). The canton-wide 2026 summer break spans
# roughly mid-July to mid-August; communes stagger within this window. v1 uses the
# canton default and refines per-commune where known.
ZH_HOLIDAY_KW_2026 = {
    "summer": list(range(29, 34)),   # ~13 Jul – 16 Aug 2026
    "autumn": list(range(41, 43)),
    "sport": [6, 7],
    "spring": list(range(17, 19)),
    "winter": [1],
}


def backfill_coords(conn: sqlite3.Connection) -> int:
    """Fill lat/lng from the commune table for courses missing coordinates."""
    rows = conn.execute(
        "SELECT id, commune FROM course WHERE (lat IS NULL OR lng IS NULL) "
        "AND commune IS NOT NULL"
    ).fetchall()
    n = 0
    for row in rows:
        lat, lng = latlng_for(row["commune"])
        if lat is not None:
            conn.execute("UPDATE course SET lat = ?, lng = ? WHERE id = ?", (lat, lng, row["id"]))
            n += 1
    conn.commit()
    return n
