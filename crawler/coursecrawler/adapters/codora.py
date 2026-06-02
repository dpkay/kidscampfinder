"""codora.ch adapter — Zürich coding/robotics/AI holiday camps.

WordPress + Modern Events Calendar (MEC); event cards are server-rendered. Each card is
one date-occurrence; we group cards by course slug → one Course with multiple Occasions.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date
from typing import Iterator, Optional

from selectolax.parser import HTMLParser

from .. import normalize
from ..models import Course, Occasion
from .base import Adapter

# Holiday-camp listing pages (MEC event archives). Past-season pages yield only past
# occurrences, which the web layer hides — harmless. After-school (term-time) listings are
# intentionally excluded to keep the dataset to holiday courses.
LISTING_URLS = [
    "https://codora.ch/sommerferiencamps-fuer-kinder-und-jugendliche/",
    "https://codora.ch/fruehlingsferiencamps-fuer-kinder-und-jugendliche/",
]
_PRICE_RE = re.compile(r"CHF\s*([0-9'’.]+)")
_OCC_IN_HREF = re.compile(r"[?&]occurrence=(\d{4}-\d{2}-\d{2})")


class CodoraAdapter(Adapter):
    source = "codora"

    def fetch(self) -> Iterator[Course]:
        # slug -> {title, url, location, image, dates:set}
        by_slug: dict[str, dict] = defaultdict(lambda: {"dates": set()})
        for url in LISTING_URLS:
            html = self.fetcher.get(url)
            if not html:
                continue
            self._collect(html, by_slug)
        print(f"  [codora] {len(by_slug)} distinct courses across listings")
        for slug, info in by_slug.items():
            try:
                c = self._build(slug, info)
                if c:
                    yield c
            except Exception as e:  # noqa: BLE001
                print(f"  [codora] build error ({slug}): {e}")

    def _collect(self, html: str, by_slug: dict) -> None:
        tree = HTMLParser(html)
        for art in tree.css("article"):
            title_a = art.css_first("h4.mec-event-title a, .mec-event-title a")
            if not title_a:
                continue
            href = title_a.attributes.get("href", "") or ""
            slug = self._slug(href)
            if not slug:
                continue
            info = by_slug[slug]
            info.setdefault("title", title_a.text(strip=True))
            info.setdefault("url", href.split("?")[0])
            loc = art.css_first(".mec-event-loc-place")
            if loc and "location" not in info:
                info["location"] = loc.text(strip=True)
            if "image" not in info:
                for img in art.css("img"):
                    src = (img.attributes.get("data-lazy-src") or img.attributes.get("data-src")
                           or img.attributes.get("src") or "")
                    if src and not src.startswith("data:"):
                        info["image"] = src
                        break
            # date: prefer the occurrence in the href, else the visible date text
            m = _OCC_IN_HREF.search(href)
            if m:
                info["dates"].add(m.group(1))
            else:
                date_el = art.css_first(".mec-event-date")
                if date_el:
                    d = normalize.parse_date(date_el.text(strip=True))
                    if d:
                        info["dates"].add(d.isoformat())

    def _slug(self, href: str) -> Optional[str]:
        m = re.search(r"/kurse/([^/?]+)", href)
        return m.group(1) if m else None

    def _build(self, slug: str, info: dict) -> Optional[Course]:
        if "title" not in info:
            return None
        url = info.get("url", f"https://codora.ch/kurse/{slug}/")
        commune = self._commune(info.get("location"))

        course = Course(
            source=self.source,
            source_key=slug,
            source_url=url,
            title=info["title"],
            provider="codora",
            commune=commune,
            venue_name=info.get("location"),
            image_url=info.get("image"),
        )

        self._enrich(course, url)

        # occasions from collected dates (ds is always ISO YYYY-MM-DD here — parse directly;
        # routing ISO strings through dateparser misreads them under DMY ordering)
        occ = []
        for ds in sorted(info["dates"]):
            try:
                d = date.fromisoformat(ds)
            except ValueError:
                d = None
            iy, iw = normalize.iso_week(d)
            occ.append(
                Occasion(
                    course_id=course.id,
                    iso_year=iy,
                    iso_week_start=iw,
                    iso_week_end=iw,
                    start_date=ds,
                    end_date=ds,
                    holiday_period=normalize.holiday_period_for(d),
                )
            )
        course.occasions = occ

        course.topics = normalize.classify_topics(course.title, course.description_snippet) or ["coding"]
        if "coding" not in course.topics and re.search(
            r"cod|program|robot|ki|ai|python|minecraft|lego", course.title, re.I
        ):
            course.topics = ["coding"] + [t for t in course.topics if t != "other"]
        course.language = normalize.detect_language(course.title, course.description_snippet)
        course.format = normalize.classify_format(text=course.title)
        return course

    def _commune(self, location: Optional[str]) -> Optional[str]:
        if not location:
            return None
        # "codora Zürich" / "codora Winterthur" → take the last token as commune
        loc = location.replace("codora", "").strip()
        return loc or None

    def _enrich(self, course: Course, url: str) -> None:
        html = self.fetcher.get(url)
        if not html:
            return
        tree = HTMLParser(html)
        text = tree.body.text(separator=" ", strip=True) if tree.body else ""

        # price: first plausible CHF amount in visible text
        for m in _PRICE_RE.finditer(text):
            val = m.group(1).replace("'", "").replace("’", "").replace(",", "")
            try:
                p = float(val)
            except ValueError:
                continue
            if 20 <= p <= 3000:
                course.price_chf = p
                course.cost_type = "paid"
                break

        # age via school grade
        amin, amax = normalize.klasse_to_age(text)
        if amin:
            course.age_min, course.age_max = amin, amax

        # snippet from meta description or first content paragraph
        meta = tree.css_first('meta[name="description"]')
        desc = meta.attributes.get("content") if meta else None
        if not desc:
            p = tree.css_first(".mec-single-event-description p, .entry-content p, article p")
            desc = p.text(strip=True) if p else None
        course.description_full = desc
        course.description_snippet = normalize.make_snippet(desc)
