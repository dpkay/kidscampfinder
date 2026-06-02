"""Paths, source registry, and crawl settings."""
from __future__ import annotations

from pathlib import Path

# crawler/kidscampfinder/config.py -> repo root is 2 parents up from this file's dir's parent
PKG_DIR = Path(__file__).resolve().parent
CRAWLER_DIR = PKG_DIR.parent
REPO_ROOT = CRAWLER_DIR.parent

DATA_DIR = REPO_ROOT / "data"
DB_PATH = DATA_DIR / "kidscampfinder.sqlite"
IMAGE_DIR = DATA_DIR / "images"
HTML_CACHE_DIR = DATA_DIR / "html_cache"
SCHEMA_PATH = PKG_DIR / "schema.sql"

USER_AGENT = (
    "KidsCampFinder/0.1 (personal hobby project; aggregates ZH kids' holiday courses)"
)

# Politeness: minimum seconds between requests to the same host.
REQUEST_DELAY_S = 1.0
REQUEST_TIMEOUT_S = 30.0
MAX_RETRIES = 3

# Known Zürich-region Feriennet instances (subdomains of *.feriennet.projuventute.ch).
# The Feriennet adapter also enumerates more via Elternkompass.
FERIENNET_ZH_INSTANCES = [
    "ferienplausch",    # Verein Ferienplausch — ~51 ZH municipalities (flagship, regional)
    "horgen",           # standalone commune instances (opted out of the regional pass)
    "thalwil",
    "neftenbach",
    "urdorf",
    "bachenbuelach",
    "pfaeffikon",       # Pfäffikon ZH (PLZ 8330) — 69 courses
    "stadel",           # Stadel b. Niederglatt — 28
    "glattfelden",      # 4
    "oberengstringen",  # 1
]
# Discovered by probing ZH commune subdomains (the platform 302-redirects unknown
# instances to a "notfound" page). eglisau resolves but has no active period (0 cards).

# Standalone commune instances cover exactly one commune; use it as the commune fallback
# when a detail page only gives a venue name. The regional "ferienplausch" spans many
# communes, so it has no default (rely on the per-activity address).
FERIENNET_INSTANCE_COMMUNE = {
    "horgen": "Horgen",
    "thalwil": "Thalwil",
    "neftenbach": "Neftenbach",
    "urdorf": "Urdorf",
    "bachenbuelach": "Bachenbülach",
    "pfaeffikon": "Pfäffikon",
    "stadel": "Stadel",
    "glattfelden": "Glattfelden",
    "oberengstringen": "Oberengstringen",
}

# Controlled topic vocabulary.
TOPICS = [
    "sports",
    "languages",
    "coding",
    "arts",
    "music",
    "science",
    "food",
    "academic",
    "nature",
    "other",
]


def ensure_dirs() -> None:
    for d in (DATA_DIR, IMAGE_DIR, HTML_CACHE_DIR):
        d.mkdir(parents=True, exist_ok=True)
