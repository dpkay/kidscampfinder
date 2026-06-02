"""friLingue adapter — Swiss residential language (+adventure/sport) camps.

Camps are listed server-side as definition lists on the Feriencamp page. These are mostly
non-ZH residential camps; they fill the otherwise-empty *languages* topic. Location is the
camp venue (the web layer marks non-ZH via its commune lookup).
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Iterator, Optional

from selectolax.parser import HTMLParser

from .. import normalize
from ..models import Course, Occasion
from .base import Adapter

LISTING = "https://www.frilingue.ch/feriencamp-schweiz"
_CAMP_A = re.compile(
    r'<a href="(https://www\.frilingue\.ch/[^"]*(?:feriencamp|sommercamp|camp)[^"]*)">\s*([^<]+?)\s*</a>',
    re.I,
)
_DT_DD = lambda label: re.compile(
    r"<dt[^>]*>\s*" + label + r"\s*</dt>\s*<dd[^>]*>(.*?)</dd>", re.I | re.S
)
_AGE = re.compile(r"(\d{1,2})\s*[-–]\s*(\d{1,2})\s*Jahre")
_DATE = re.compile(r"(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?")


class FrilingueAdapter(Adapter):
    source = "frilingue"

    def fetch(self) -> Iterator[Course]:
        html = self.fetcher.get(LISTING)
        if not html:
            return
        anchors = list(_CAMP_A.finditer(html))
        print(f"  [frilingue] {len(anchors)} camp blocks")
        seen = set()
        for i, m in enumerate(anchors):
            url, title = m.group(1), m.group(2).strip()
            if url in seen:
                continue
            seen.add(url)
            # block = from this anchor to the next camp anchor (its detail dl lives here)
            end = anchors[i + 1].start() if i + 1 < len(anchors) else m.start() + 4000
            block = html[m.start():end]
            try:
                c = self._build(url, title, block)
                if c:
                    yield c
            except Exception as e:  # noqa: BLE001
                print(f"  [frilingue] error ({title}): {e}")

    def _build(self, url: str, title: str, block: str) -> Optional[Course]:
        kurse = self._field(block, "Kurse")
        alter = self._field(block, "Altersgruppe")
        beginn = self._field(block, "Kursbeginn")

        age_min = age_max = None
        if alter:
            ma = _AGE.search(alter)
            if ma:
                age_min, age_max = int(ma.group(1)), int(ma.group(2))

        location = self._location(url)
        course = Course(
            source=self.source,
            source_key=url.rstrip("/").rsplit("/", 1)[-1],
            source_url=url,
            title=title,
            provider="friLingue",
            commune=location,
            venue_name=location,
            description_snippet=normalize.make_snippet(kurse),
            age_min=age_min,
            age_max=age_max,
            format="residential",
        )

        # occasions: each Kursbeginn date is a (typically week-long) camp start
        course.occasions = self._occasions(beginn, course.id)

        topics = normalize.classify_topics(title, kurse)
        if "languages" not in topics:
            topics = ["languages"] + [t for t in topics if t != "other"]
        course.topics = topics
        course.language = "multi"  # language camps teach FR/EN/DE
        course.cost_type = "paid"  # residential camps are paid (amount not on listing)
        return course

    def _field(self, block: str, label: str) -> Optional[str]:
        m = _DT_DD(label).search(block)
        if not m:
            return None
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(1))).strip()

    def _location(self, url: str) -> Optional[str]:
        # .../sprachaufenthalt-schweiz-jugendliche/<location>/<slug>
        m = re.search(r"-jugendliche/([^/]+)/", url) or re.search(r"-kinder/([^/]+)/", url)
        if not m:
            return None
        return " ".join(w.capitalize() for w in m.group(1).split("-"))

    def _occasions(self, beginn: Optional[str], course_id: str) -> list[Occasion]:
        if not beginn:
            return []
        # Dates come in groups: a run of "DD.MM" without a year is terminated by a
        # "DD.MM.YYYY" whose year applies to the whole run (e.g. "05.07 / .../ 09.08.2026").
        starts: list[date] = []
        pending: list[tuple[int, int]] = []
        for dd, mm, yy in _DATE.findall(beginn):
            pending.append((int(dd), int(mm)))
            if yy:
                y = int(yy)
                for d_, m_ in pending:
                    try:
                        starts.append(date(y, m_, d_))
                    except ValueError:
                        pass
                pending = []
        occ = []
        for start in starts:
            end = start + timedelta(days=6)  # camps run ~1 week
            iy, iw = normalize.iso_week(start)
            _, iw2 = normalize.iso_week(end)
            occ.append(
                Occasion(
                    course_id=course_id,
                    iso_year=iy,
                    iso_week_start=iw,
                    iso_week_end=iw2 or iw,
                    start_date=start.isoformat(),
                    end_date=end.isoformat(),
                    holiday_period=normalize.holiday_period_for(start),
                )
            )
        return occ
