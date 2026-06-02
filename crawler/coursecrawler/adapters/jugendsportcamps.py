"""jugendsportcamps.ch adapter — Canton Zürich Sportamt camp platform (JSON API).

The site is a SPA backed by a public REST API (api.jugendsportcamps.ch/api/public-camps).
The API is national (~880 camps), so we paginate all and keep those inside a Canton Zürich
bounding box; the web layer's commune→inZH lookup refines further.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Iterator, Optional
import re

from .. import normalize
from ..models import Course, Occasion
from .base import Adapter

API = "https://api.jugendsportcamps.ch/api/public-camps"
PAGE = 100

# Canton Zürich bounding box (approximate; neighbour-canton spill is fine — the web layer
# marks true ZH membership via commune lookup).
ZH_BBOX = (47.16, 47.70, 8.35, 8.99)  # lat_min, lat_max, lng_min, lng_max
_PLZ_CITY = re.compile(r"\b(\d{4})\s+([A-Za-zÀ-ÿ][\wÀ-ÿ .\-/]+?)(?:\s*,|$)")


def _in_zh(lat: Optional[float], lng: Optional[float]) -> bool:
    if lat is None or lng is None:
        return False
    a, b, c, d = ZH_BBOX
    return a <= lat <= b and c <= lng <= d


def _commune_from_city(city: str) -> Optional[str]:
    if not city:
        return None
    city = city.strip()
    m = _PLZ_CITY.search(city)          # "Sportanlage Tüfi, 8134 Adliswil" -> Adliswil
    if m:
        return m.group(2).strip().rstrip(".")
    # strip trailing ", ZH" / ", Switzerland" / ", Schweiz"
    seg = re.split(r",\s*(?:ZH|Switzerland|Schweiz)\b", city)[0]
    seg = seg.split(",")[0].strip()     # else first comma segment
    return seg or None


class JugendsportcampsAdapter(Adapter):
    source = "jugendsportcamps"

    def fetch(self) -> Iterator[Course]:
        offset = 0
        total = None
        kept = 0
        while True:
            raw = self.fetcher.get(f"{API}?offset={offset}&limit={PAGE}")
            if not raw:
                break
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                break
            body = data.get("body", [])
            total = data.get("metaData", {}).get("totalFilterCount", total)
            if not body:
                break
            for camp in body:
                if not _in_zh(camp.get("lat"), camp.get("long")):
                    continue
                try:
                    c = self._build(camp)
                    if c:
                        kept += 1
                        yield c
                except Exception as e:  # noqa: BLE001
                    print(f"  [jugendsportcamps] build error ({camp.get('slug')}): {e}")
            offset += PAGE
            if total and offset >= total:
                break
        print(f"  [jugendsportcamps] kept {kept} ZH-area camps (of ~{total} national)")

    def _build(self, camp: dict) -> Optional[Course]:
        title = camp.get("title")
        slug = camp.get("slug")
        if not title or not slug:
            return None
        url = f"https://www.jugendsportcamps.ch/de/camp/{slug}"

        commune = _commune_from_city(camp.get("city", ""))
        price = camp.get("price")
        cost_type = "free" if price in (0, None) else "paid"
        if price is None:
            cost_type = "unknown"

        # age from birth-year generation range, relative to the camp's year
        year = self._year(camp)
        age_min = age_max = None
        gf, gt = camp.get("generation_from"), camp.get("generation_to")
        if gf and gt and year:
            age_min, age_max = year - gt, year - gf  # gt is the youngest (latest birth year)

        img = (camp.get("teaser_image") or {}).get("url")
        cats = " ".join(sc.get("label", "") for sc in camp.get("sports_categories", []))

        course = Course(
            source=self.source,
            source_key=slug,
            source_url=url,
            title=title,
            provider=camp.get("organisation"),
            commune=commune,
            venue_name=camp.get("city"),
            lat=camp.get("lat"),
            lng=camp.get("long"),
            price_chf=float(price) if price not in (None, "") else None,
            cost_type=cost_type,
            age_min=age_min,
            age_max=age_max,
            image_url=img,
            raw={
                "sports_categories": cats,
                "gender": camp.get("gender"),
                "signon_state": camp.get("signonState"),
                "j_and_s": camp.get("j_and_s"),
            },
        )

        # occasion from start/end timestamps
        start_d = self._date(camp.get("start_date_timestamp"))
        end_d = self._date(camp.get("end_date_timestamp"))
        if start_d:
            iy, iw = normalize.iso_week(start_d)
            _, iw_end = normalize.iso_week(end_d or start_d)
            course.occasions = [
                Occasion(
                    course_id=course.id,
                    iso_year=iy,
                    iso_week_start=iw,
                    iso_week_end=iw_end or iw,
                    start_date=start_d.isoformat(),
                    end_date=(end_d or start_d).isoformat(),
                    holiday_period=normalize.holiday_period_for(start_d),
                    spots_available=None,
                )
            ]

        course.topics = normalize.classify_topics(title, cats) or ["sports"]
        if "sports" not in course.topics:
            course.topics = ["sports"] + [t for t in course.topics if t != "other"]
        course.language = "de"
        n_days = (end_d - start_d).days + 1 if (start_d and end_d) else None
        course.format = normalize.classify_format(n_days=n_days, text=title)
        return course

    def _date(self, ts) -> Optional[object]:
        if not ts:
            return None
        try:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc).date()
        except (ValueError, OSError, TypeError):
            return None

    def _year(self, camp: dict) -> Optional[int]:
        end = camp.get("end_date") or ""
        m = re.search(r"(20\d{2})", end)
        if m:
            return int(m.group(1))
        d = self._date(camp.get("end_date_timestamp"))
        return d.year if d else None
