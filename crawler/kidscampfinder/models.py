"""Normalized data models mirroring schema.sql."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, asdict
from typing import Any, Optional


def _sha1(*parts: str) -> str:
    h = hashlib.sha1()
    for p in parts:
        h.update((p or "").encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


@dataclass
class Occasion:
    course_id: str
    iso_year: Optional[int] = None
    iso_week_start: Optional[int] = None
    iso_week_end: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    holiday_period: Optional[str] = None
    registration_deadline: Optional[str] = None
    spots_available: Optional[int] = None
    id: str = ""

    def __post_init__(self) -> None:
        if not self.id:
            self.id = _sha1(self.course_id, self.start_date or "", self.end_date or "")


@dataclass
class Course:
    source: str
    source_url: str
    title: str
    source_key: str = ""  # per-source stable identifier (slug/id) for the course id hash
    description_full: Optional[str] = None
    description_snippet: Optional[str] = None
    provider: Optional[str] = None
    topics: list[str] = field(default_factory=list)
    format: str = "unknown"
    cost_type: str = "unknown"
    price_chf: Optional[float] = None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    language: str = "unknown"
    commune: Optional[str] = None
    venue_name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    image_url: Optional[str] = None
    image_local_path: Optional[str] = None
    raw: dict[str, Any] = field(default_factory=dict)
    occasions: list[Occasion] = field(default_factory=list)
    id: str = ""

    def __post_init__(self) -> None:
        if not self.id:
            self.id = _sha1(self.source, self.source_key or self.source_url)
        for occ in self.occasions:
            if not occ.course_id:
                occ.course_id = self.id
                occ.__post_init__()

    def to_row(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("occasions", None)
        d.pop("source_key", None)
        d["topics"] = json.dumps(self.topics, ensure_ascii=False)
        d["raw"] = json.dumps(self.raw, ensure_ascii=False)
        return d
