"""Shared normalization: topics, prices, ages, dates→KW, snippets, language."""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

import dateparser
from langdetect import DetectorFactory, detect_langs
from selectolax.parser import HTMLParser

DetectorFactory.seed = 0  # deterministic language detection

# ---- topics -----------------------------------------------------------------

# Keywords are matched with a word-boundary at the START (\b<kw>) so they match the
# head of German compounds ("Fussballcamp" via "fussball") without firing mid-word
# ("Glasfusing", "Freitag", "normal"). Keep stems specific enough to avoid false friends.
_TOPIC_KEYWORDS = {
    "sports": [
        "sport", "fussball", "fußball", "football", "tennis", "kletter", "climbing",
        "schwimm", "swim", "skifahr", "skikurs", "snowboard", "tanz", "dance", "reiten",
        "reitkurs", "pony", "judo", "karate", "kampfsport", "velo", "bike", "polysport",
        "leichtathletik", "turnen", "geräteturnen", "yoga", "segel", "surf", "rudern",
        "rowing", "basketball", "volleyball", "hockey", "golf", "akroba", "parkour",
        "skate", "trampolin", "badminton", "unihockey", "schlittschuh", "bogenschiess",
        "gleitschirm", "scooter", "tauchen", "abtauchen", "agility", "breaking", "biken",
        "kickbox", "boxen", "boxing", "ringen", "fechten", "rugby", "handball", "tischtennis",
    ],
    "languages": [
        "sprach", "language", "englisch", "english", "französisch", "french", "deutschkurs",
        "italienisch", "spanisch", "spanish", "latein", "chinesisch",
    ],
    "coding": [
        "coding", "code", "programmier", "robot", "scratch", "minecraft", "python",
        "digital", "computer", "gaming", "game", "3d-druck", "3d print", "3d-print",
        "informatik", "roboter", "webseite", "website", "homepage", "html", "roblox",
        "ki-", "ki bootcamp", "chatgpt", "drohne", "podcast",
    ],
    "arts": [
        "kunst", "malen", "malkurs", "malerei", "malatelier", "paint", "zeichn", "draw",
        "basteln", "craft", "töpfer", "keramik", "theater", "theatre", "film", "foto",
        "photo", "design", "näh", "comic", "graffiti", "kreativ", "creative", "schmink",
        "punch needle", "collage", "ton", "gips", "schmuck", "origami", "aquarell",
        "acryl", "pouring", "animationsfilm", "trickfilm", "kurzfilm", "glasfus",
    ],
    "music": [
        "musik", "music", "gesang", "singen", "gitarre", "guitar", "klavier", "piano",
        "schlagzeug", "drum", "trommel", "chor", "instrument", "rockband", "beatbox",
        "ukulele", "violine", "geige", "musical", "hip-hop", "hiphop", "hip hop", "dj-",
    ],
    "science": [
        "wissenschaft", "science", "experiment", "forsch", "research", "chemie",
        "chemistry", "physik", "physics", "biolog", "mint", "stem", "mathe", "math",
        "astronom", "labor", "naturwissen", "fossil", "kristall", "mineral", "dampfturbine",
        "luftantrieb", "flugsimulator", "elektronik", "technik",
    ],
    "food": [
        "koch", "backen", "bäcker", "pizza", "cupcake", "cake", "kuchen", "glace",
        "schoggi", "schokolade", "sushi", "guetzli", "torte", "pralinen", "smoothie",
        "küche", "burger", "dessert",
    ],
    "academic": [
        "nachhilfe", "tutor", "prüfung", "gymi", "gymnasium", "hausaufgab", "homework",
        "rechtschreib",
    ],
    "nature": [
        "natur", "nature", "wald", "forest", "tiere", "tierpark", "tierisch", "wildtier",
        "animal", "bauernhof", "farm", "zoo", "garten", "garden", "outdoor", "wander",
        "hike", "abenteuer", "adventure", "umwelt", "pferd", "vögel", "vogel", "insekt",
        "bienen", "fische", "wassertier", "hund", "hunde", "kaninchen", "lama", "trekking",
        "safari", "kaktus", "fledermaus", "fledermäuse", "alp",
    ],
}

# precompile a single alternation regex per topic
_TOPIC_RE = {
    topic: re.compile(r"\b(?:" + "|".join(re.escape(k) for k in kws) + r")", re.IGNORECASE)
    for topic, kws in _TOPIC_KEYWORDS.items()
}


def classify_topics(*texts: Optional[str]) -> list[str]:
    blob = " ".join(t for t in texts if t)
    found = [topic for topic, rx in _TOPIC_RE.items() if rx.search(blob)]
    return found or ["other"]


# ---- price ------------------------------------------------------------------

_PRICE_RE = re.compile(r"(\d+(?:[.,]\d{1,2})?)\s*(?:chf|fr\.?|sfr)", re.IGNORECASE)
_PRICE_RE_ALT = re.compile(r"(?:chf|fr\.?)\s*(\d+(?:[.,]\d{1,2})?)", re.IGNORECASE)


def parse_price(text: Optional[str]) -> tuple[Optional[float], str]:
    """Return (price_chf, cost_type). cost_type: free|paid|unknown."""
    if not text:
        return None, "unknown"
    low = text.lower()
    if any(w in low for w in ("gratis", "kostenlos", "free", "0.00 chf", "chf 0")):
        return 0.0, "free"
    m = _PRICE_RE.search(text) or _PRICE_RE_ALT.search(text)
    if m:
        val = float(m.group(1).replace(",", "."))
        return val, ("free" if val == 0 else "paid")
    return None, "unknown"


# ---- age --------------------------------------------------------------------

_AGE_RANGE_RE = re.compile(r"(\d{1,2})\s*[-–bis]+\s*(\d{1,2})")
_AGE_SINGLE_RE = re.compile(r"(?:ab\s*)?(\d{1,2})\s*(?:jahre|jahr|jährige|j\.|years|yrs)", re.IGNORECASE)


_KLASSE_RANGE_RE = re.compile(r"(\d+)\.\s*[–\-]\s*(\d+)\.\s*Klasse", re.IGNORECASE)
_KLASSE_SINGLE_RE = re.compile(r"(\d+)\.\s*Klasse", re.IGNORECASE)


def klasse_to_age(text: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    """Swiss school grade → approximate age (1. Klasse ≈ 7yo, so age = grade + 6).

    Kindergarten → 4–6. Returns (None, None) if no grade found.
    """
    if not text:
        return None, None
    m = _KLASSE_RANGE_RE.search(text)
    if m:
        return int(m.group(1)) + 6, int(m.group(2)) + 6
    m = _KLASSE_SINGLE_RE.search(text)
    if m:
        a = int(m.group(1)) + 6
        return a, a
    if re.search(r"kindergarten|\bKG\b", text, re.IGNORECASE):
        return 4, 6
    return None, None


def parse_age(text: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    if not text:
        return None, None
    m = _AGE_RANGE_RE.search(text)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        if lo <= hi <= 25:
            return lo, hi
    m = _AGE_SINGLE_RE.search(text)
    if m:
        a = int(m.group(1))
        if a <= 25:
            return a, a
    return None, None


# ---- dates / KW -------------------------------------------------------------

_DATE_DE_SETTINGS = {"DATE_ORDER": "DMY", "PREFER_DAY_OF_MONTH": "first"}


def parse_date(text: Optional[str]) -> Optional[date]:
    if not text:
        return None
    dt = dateparser.parse(text, languages=["de", "en", "fr"], settings=_DATE_DE_SETTINGS)
    return dt.date() if dt else None


def iso_week(d: Optional[date]) -> tuple[Optional[int], Optional[int]]:
    if not d:
        return None, None
    iso = d.isocalendar()
    return iso[0], iso[1]


def holiday_period_for(d: Optional[date]) -> str:
    """Rough ZH school-holiday classification by month."""
    if not d:
        return "other"
    m = d.month
    if m in (7, 8):
        return "summer"
    if m == 10:
        return "autumn"
    if m in (2,):
        return "sport"
    if m in (4, 5):
        return "spring"
    if m in (12, 1):
        return "winter"
    return "other"


# ---- text / snippet / language ---------------------------------------------


def strip_html(text: Optional[str]) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", HTMLParser(text).text()).strip()


def make_snippet(text: Optional[str], limit: int = 220) -> Optional[str]:
    clean = strip_html(text)
    if not clean:
        return None
    if len(clean) <= limit:
        return clean
    cut = clean[:limit].rsplit(" ", 1)[0]
    return cut + "…"


def detect_language(*texts: Optional[str]) -> str:
    blob = " ".join(strip_html(t) for t in texts if t).strip()
    if len(blob) < 20:
        return "unknown"
    try:
        langs = detect_langs(blob)
    except Exception:  # noqa: BLE001
        return "unknown"
    if not langs:
        return "unknown"
    top = langs[0]
    if top.prob < 0.80:
        return "unknown"
    code = top.lang
    return code if code in ("de", "en", "fr", "it") else "unknown"


# ---- format -----------------------------------------------------------------


def classify_format(
    *, n_days: Optional[int] = None, half_day: Optional[bool] = None, text: str = ""
) -> str:
    low = (text or "").lower()
    if any(w in low for w in ("übernacht", "overnight", "lager", "residential", "internat")):
        return "residential"
    if half_day is True:
        return "half_day"
    if n_days is not None:
        if n_days <= 1:
            return "half_day" if half_day else "full_day"
        if n_days >= 5:
            return "weekly"
        return "multi_day"
    if any(w in low for w in ("woche", "week", "5 tage", "5-tage")):
        return "weekly"
    return "unknown"
