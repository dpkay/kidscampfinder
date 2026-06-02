"""Feriennet fleet adapter — Pro Juventute / OneGov holiday-activity platform.

One parser handles every `*.feriennet.projuventute.ch` instance (shared HTML).
Listing pages are server-rendered; detail pages add dates, location, and coordinates.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Iterator, Optional
from urllib.parse import urljoin

from selectolax.parser import HTMLParser

from .. import config, normalize
from ..models import Course, Occasion
from .base import Adapter

_BG_URL_RE = re.compile(r"url\(['\"]?(.*?)['\"]?\)")
_ORDINAL_RE = re.compile(r"^\s*\d+\.\s+")
_SPOTS_RE = re.compile(r"(\d+)\s*(?:Plätze|Platz|spots?|frei)", re.IGNORECASE)
_PLZ_CITY_RE = re.compile(r"\b(\d{4})\s+([A-Za-zÀ-ÿ.\-/ ]+?)(?:,|$|\s{2,})")
_YEAR_RE = re.compile(r"\b(20\d{2})\b")
# a day line like "Mo. 13. Juli 10:00 - 16:00" or "Di. 14. Juli"
_DAY_RE = re.compile(
    r"(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)(?:\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2}))?"
)


class FeriennetAdapter(Adapter):
    def __init__(self, fetcher, instances: Optional[list[str]] = None):
        super().__init__(fetcher)
        self.instances = instances or config.FERIENNET_ZH_INSTANCES
        self.source = "feriennet"

    # -- public ---------------------------------------------------------------

    def fetch(self) -> Iterator[Course]:
        for inst in self.instances:
            base = f"https://{inst}.feriennet.projuventute.ch"
            print(f"  [feriennet] instance: {inst}")
            yield from self._fetch_instance(inst, base)

    # -- per instance ---------------------------------------------------------

    def _fetch_instance(self, inst: str, base: str) -> Iterator[Course]:
        listing_url = f"{base}/activities?pages=0-200"
        html = self.fetcher.get(listing_url)
        if not html:
            return
        tree = HTMLParser(html)
        cards = tree.css("div.activity-list-item.card")
        print(f"  [feriennet] {inst}: {len(cards)} cards")
        for card in cards:
            try:
                course = self._parse_card(inst, base, card)
                if course:
                    yield course
            except Exception as e:  # noqa: BLE001
                print(f"  [feriennet] card parse error ({inst}): {e}")

    def _parse_card(self, inst: str, base: str, card) -> Optional[Course]:
        link = card.css_first("a[href]")
        if not link:
            return None
        detail_url = urljoin(base, link.attributes.get("href", ""))
        slug = detail_url.rstrip("/").rsplit("/", 1)[-1]

        title_el = card.css_first("h5")
        title = _ORDINAL_RE.sub("", title_el.text(strip=True)) if title_el else slug
        snippet_el = card.css_first("span.page-lead")
        list_snippet = snippet_el.text(strip=True) if snippet_el else None

        # image from background-image style
        image_url = None
        img_el = card.css_first("div.activity-image")
        if img_el:
            m = _BG_URL_RE.search(img_el.attributes.get("style", "") or "")
            if m:
                image_url = urljoin(base, m.group(1))

        age_el = card.css_first("span.age span:not(.show-for-sr)")
        age_min, age_max = normalize.parse_age(age_el.text(strip=True) if age_el else None)

        cost_el = card.css_first("span.cost span:not(.show-for-sr)")
        price_chf, cost_type = normalize.parse_price(cost_el.text(strip=True) if cost_el else None)

        course = Course(
            source=f"feriennet:{inst}",
            source_key=slug,
            source_url=detail_url,
            title=title,
            description_snippet=normalize.make_snippet(list_snippet),
            age_min=age_min,
            age_max=age_max,
            price_chf=price_chf,
            cost_type=cost_type,
            image_url=image_url,
        )

        # enrich from detail page
        self._enrich(course, detail_url)

        # commune fallback: a standalone commune instance covers exactly one commune
        if not course.commune:
            default = config.FERIENNET_INSTANCE_COMMUNE.get(inst)
            if default:
                course.commune = default

        # classify from the activity's own title + lead snippet only — the full detail
        # text carries shared boilerplate ("Ferienprogramm", "lernen") that mis-tags topics.
        course.topics = normalize.classify_topics(title, list_snippet)
        course.language = normalize.detect_language(title, list_snippet or course.description_full)
        n_days = self._max_occasion_days(course)
        course.format = normalize.classify_format(
            n_days=n_days, text=f"{title} {list_snippet or ''}"
        )
        return course

    # -- detail page ----------------------------------------------------------

    def _enrich(self, course: Course, detail_url: str) -> None:
        html = self.fetcher.get(detail_url)
        if not html:
            return
        tree = HTMLParser(html)

        # full description: the lead/intro paragraphs in the main content
        desc_parts = []
        for sel in ("div.page-text", "span.page-lead", "div.activity-description"):
            el = tree.css_first(sel)
            if el:
                desc_parts.append(el.text(separator=" ", strip=True))
        full = " ".join(p for p in desc_parts if p) or None
        if full:
            course.description_full = full
            if not course.description_snippet:
                course.description_snippet = normalize.make_snippet(full)

        # coordinates from marker-map
        mm = tree.css_first("div.marker-map[data-lat]")
        if mm:
            try:
                course.lat = float(mm.attributes.get("data-lat"))
                course.lng = float(mm.attributes.get("data-lon"))
            except (TypeError, ValueError):
                pass

        # address / commune from a location block
        loc = tree.css_first("div.location")
        if loc:
            addr = loc.text(separator=" ", strip=True)
            course.address = re.sub(r"\s+", " ", addr).strip() or None
            commune = self._commune_from_address(course.address)
            if commune:
                course.commune = commune
            # venue: first chunk before the street
            course.venue_name = (course.address.split(",")[0].strip()
                                 if course.address else None)

        # registration deadline (Anmeldeschluss), often absent
        deadline = self._find_deadline(html)

        # page year hint for occasions lacking a year
        year_hint = self._year_hint(html)

        # occasions
        course.occasions = self._parse_occasions(tree, course.id, year_hint, deadline)

    def _commune_from_address(self, address: Optional[str]) -> Optional[str]:
        if not address:
            return None
        m = _PLZ_CITY_RE.search(address)
        if m:
            return m.group(2).strip().rstrip(".")
        return None

    def _find_deadline(self, html: str) -> Optional[str]:
        i = html.lower().find("anmeldeschluss")
        if i < 0:
            return None
        d = normalize.parse_date(re.sub(r"\s+", " ", html[i : i + 120]))
        return d.isoformat() if d else None

    def _year_hint(self, html: str) -> int:
        years = [int(y) for y in _YEAR_RE.findall(html)]
        future = [y for y in years if y >= datetime.now().year]
        return min(future) if future else (max(years) if years else datetime.now().year)

    def _parse_occasions(
        self, tree: HTMLParser, course_id: str, year_hint: int, deadline: Optional[str]
    ) -> list[Occasion]:
        occasions: list[Occasion] = []
        cards = tree.css("div.occasion.occasion-card")
        # spots live in sibling occasion-title blocks; collect them in order
        spot_texts = [s.text(strip=True) for s in tree.css("div.occasion-title .available-spots")]
        for idx, oc in enumerate(cards):
            dates_el = oc.css_first("div.dates")
            if not dates_el:
                continue
            days = [li.text(strip=True) for li in dates_el.css("li")]
            parsed = [self._parse_day(d, year_hint) for d in days]
            parsed = [p for p in parsed if p and p[0]]
            if not parsed:
                continue
            start_d, start_t, _ = parsed[0]
            end_d, _, end_t = parsed[-1]
            iso_y1, iso_w1 = normalize.iso_week(start_d)
            _, iso_w2 = normalize.iso_week(end_d)
            spots = None
            if idx < len(spot_texts):
                m = _SPOTS_RE.search(spot_texts[idx])
                if m:
                    spots = int(m.group(1))
            occasions.append(
                Occasion(
                    course_id=course_id,
                    iso_year=iso_y1,
                    iso_week_start=iso_w1,
                    iso_week_end=iso_w2 or iso_w1,
                    start_date=start_d.isoformat() if start_d else None,
                    end_date=end_d.isoformat() if end_d else None,
                    start_time=start_t,
                    end_time=end_t,
                    holiday_period=normalize.holiday_period_for(start_d),
                    registration_deadline=deadline,
                    spots_available=spots,
                )
            )
        return occasions

    def _parse_day(
        self, text: str, year_hint: int
    ) -> Optional[tuple[Optional[date], Optional[str], Optional[str]]]:
        m = _DAY_RE.search(text)
        if not m:
            return None
        day, month_name, t1, t2 = m.groups()
        d = normalize.parse_date(f"{day}. {month_name} {year_hint}")
        return d, t1, t2

    def _max_occasion_days(self, course: Course) -> Optional[int]:
        best = None
        for occ in course.occasions:
            if occ.start_date and occ.end_date:
                try:
                    d1 = date.fromisoformat(occ.start_date)
                    d2 = date.fromisoformat(occ.end_date)
                    days = (d2 - d1).days + 1
                    best = days if best is None else max(best, days)
                except ValueError:
                    continue
        return best
