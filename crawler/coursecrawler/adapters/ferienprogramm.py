"""ferienprogramm.ch adapter — Winterthur-region holiday courses (server-rendered)."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Iterator, Optional
from urllib.parse import urljoin

from selectolax.parser import HTMLParser

from .. import normalize
from ..models import Course, Occasion
from .base import Adapter

BASE = "https://ferienprogramm.ch"
LISTING = f"{BASE}/kurse/"

_MONTHS = {
    "jan": 1, "feb": 2, "mrz": 3, "mär": 3, "apr": 4, "mai": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "okt": 10, "nov": 11, "dez": 12,
}
_KLASSE_RANGE = re.compile(r"(\d+)\.\s*[–\-]\s*(\d+)\.\s*Klasse", re.IGNORECASE)
_KLASSE_SINGLE = re.compile(r"(\d+)\.\s*Klasse", re.IGNORECASE)
_PRICE_RE = re.compile(r"CHF\s*([\d'.,]+)", re.IGNORECASE)
_PLZ_CITY = re.compile(r"\b(\d{4})\s+([A-Za-zÀ-ÿ.\-/ ]+?)(?:,|$|\s{2,}|<)")
_SPOTS = re.compile(r"(\d+)\s*Plätze", re.IGNORECASE)


def _grade_to_age(text: str) -> tuple[Optional[int], Optional[int]]:
    """Swiss school grade → approximate age (1. Klasse ≈ 7yo, so age = grade + 6)."""
    if re.search(r"kindergarten|\bKG\b", text, re.IGNORECASE):
        lo, hi = 4, 6
    else:
        lo = hi = None
    m = _KLASSE_RANGE.search(text)
    if m:
        return int(m.group(1)) + 6, int(m.group(2)) + 6
    m = _KLASSE_SINGLE.search(text)
    if m:
        a = int(m.group(1)) + 6
        return a, a
    return lo, hi


class FerienprogrammAdapter(Adapter):
    source = "ferienprogramm"

    def fetch(self) -> Iterator[Course]:
        html = self.fetcher.get(LISTING)
        if not html:
            return
        tree = HTMLParser(html)
        cards = tree.css("div.card.item")
        print(f"  [ferienprogramm] {len(cards)} cards")
        year_hint = self._year_hint(html)
        for card in cards:
            try:
                c = self._parse_card(card, year_hint)
                if c:
                    yield c
            except Exception as e:  # noqa: BLE001
                print(f"  [ferienprogramm] card error: {e}")

    def _year_hint(self, html: str) -> int:
        years = [int(y) for y in re.findall(r"\b(20\d{2})\b", html)]
        fut = [y for y in years if y >= datetime.now().year]
        return min(fut) if fut else datetime.now().year

    def _parse_card(self, card, year_hint: int) -> Optional[Course]:
        link = card.css_first('a[href*="kurs/"]')
        if not link:
            return None
        detail_url = urljoin(BASE + "/", link.attributes.get("href", ""))

        title_el = card.css_first("div.card-title h3")
        title = title_el.text(strip=True) if title_el else None
        if not title:
            return None

        img = card.css_first("img.card-img-top")
        image_url = urljoin(BASE, img.attributes.get("src")) if img else None

        labels = " | ".join(b.text(strip=True) for b in card.css("div.label button"))
        age_min, age_max = _grade_to_age(labels)

        # date from the card (day number + month abbrev)
        num_el = card.css_first("div.number")
        month_el = card.css_first("div.month")
        inhalt = card.css_first("span.inhalt")
        start_date = None
        start_time = end_time = None
        spots = None
        if num_el and month_el:
            day = re.sub(r"\D", "", num_el.text())
            mon = month_el.text(strip=True).lower().rstrip(".")[:3]
            month = _MONTHS.get(mon)
            if day and month:
                from datetime import date as _date
                try:
                    start_date = _date(year_hint, month, int(day))
                except ValueError:
                    start_date = None
        if inhalt:
            txt = inhalt.text(separator=" ", strip=True)
            tm = re.search(r"(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})", txt)
            if tm:
                start_time, end_time = tm.group(1), tm.group(2)
            sm = _SPOTS.search(txt)
            if sm:
                spots = int(sm.group(1))

        slug = detail_url.rstrip("/").rsplit("/", 1)[-1]
        course = Course(
            source=self.source,
            source_key=slug,
            source_url=detail_url,
            title=title,
            age_min=age_min,
            age_max=age_max,
            image_url=image_url,
        )

        self._enrich(course, detail_url)

        # occasion
        iso_y, iso_w = normalize.iso_week(start_date)
        course.occasions = [
            Occasion(
                course_id=course.id,
                iso_year=iso_y,
                iso_week_start=iso_w,
                iso_week_end=iso_w,
                start_date=start_date.isoformat() if start_date else None,
                end_date=start_date.isoformat() if start_date else None,
                start_time=start_time,
                end_time=end_time,
                holiday_period=normalize.holiday_period_for(start_date),
                spots_available=spots,
            )
        ]

        course.topics = normalize.classify_topics(title, course.description_snippet)
        course.language = normalize.detect_language(title, course.description_snippet)
        course.format = normalize.classify_format(text=f"{title} {labels}")
        return course

    def _enrich(self, course: Course, detail_url: str) -> None:
        html = self.fetcher.get(detail_url)
        if not html:
            return
        tree = HTMLParser(html)

        # price
        m = _PRICE_RE.search(html)
        if m:
            val = float(m.group(1).replace("'", "").replace(",", "."))
            course.price_chf = val
            course.cost_type = "free" if val == 0 else "paid"

        # location: the "Ort" block
        i = html.find("Ort</b>")
        if i >= 0:
            chunk = re.sub(r"<[^>]+>", " ", html[i : i + 200])
            chunk = re.sub(r"\s+", " ", chunk).strip()
            cm = _PLZ_CITY.search(chunk)
            if cm:
                course.commune = cm.group(2).strip().rstrip(".")
            course.address = chunk.replace("Ort", "", 1).strip(" :")[:200] or None

        # description: main content paragraph
        desc_el = tree.css_first("div.beschreibung, div.kurs-beschreibung, div.content, article")
        if desc_el:
            course.description_full = desc_el.text(separator=" ", strip=True)[:2000]
        course.description_snippet = normalize.make_snippet(
            course.description_full or (tree.css_first("p").text(strip=True) if tree.css_first("p") else None)
        )
