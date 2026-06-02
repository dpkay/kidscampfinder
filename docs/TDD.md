# CourseCrawler — Technical Design Document

*Draft v0.1 — 2026-06-01. Implements [`PRD.md`](./PRD.md). Source map in
[`RESEARCH-SOURCES.md`](./RESEARCH-SOURCES.md).*

## 1. Overview

Two halves, integrated by a **SQLite file**:

- **`crawler/`** (Python 3.13) — adapters scrape sources → normalize → write SQLite.
- **`web/`** (TypeScript, Vite + React, `better-sqlite3`) — reads SQLite → filterable UI.

The SQLite DB at `data/coursecrawler.sqlite` is the only contract. The web tier never imports
Python; the crawler never imports TS. Schema lives in `crawler/schema.sql`; TS types are
hand-mirrored in `web/src/types.ts` (small, stable surface — codegen is overkill for v1).

```
coursecrawler/
  crawler/
    pyproject.toml
    coursecrawler/
      __init__.py
      config.py            # source registry, rate limits, paths
      db.py                # SQLite connection, schema init, upsert helpers
      schema.sql           # DDL (§3)
      models.py            # dataclasses: Course, Occasion (mirror schema)
      http.py              # polite session: retries, rate limit, UA, on-disk cache
      normalize.py         # topics, price, age, dates→KW, snippet, language detect
      geo.py               # commune→latlng table + holiday-KW reference
      images.py            # download images locally
      dedup.py             # cross-source dedup
      run.py               # crawl runner: orchestrate adapters, stats, alerts
      adapters/
        base.py            # Adapter ABC -> yields raw records
        feriennet.py       # the fleet adapter (+ Elternkompass enumeration)
        ferienprogramm.py
        jugendsportcamps.py
        providers.py       # logiscool, kinder-camps, frilingue, zoo, ...
    data/                  # (gitignored) sqlite + images/ + html cache
    tests/
  web/
    package.json
    vite.config.ts
    server/                # tiny API over better-sqlite3 (or static JSON export)
    src/                   # React app
  data/                    # symlink/target for the shared sqlite (see config)
  docs/
```

## 2. Tech choices

| Concern | Choice | Notes |
|---|---|---|
| HTTP | `httpx` (sync) | retries + timeouts; `Retry-After` aware |
| HTML parse | `selectolax` (fast) or `BeautifulSoup`+lxml | Feriennet is static HTML — no browser |
| Headless | **not needed** for Feriennet; keep `playwright` optional for any JS-only provider | confirmed server-rendered |
| Dates | `dateparser` (de) | "14. Juni 2026" → date; derive ISO week (KW) |
| Fuzzy dedup | `rapidfuzz` | token_set_ratio on title+commune+dates |
| Lang detect | `lingua` or `langdetect` | low-confidence → `unknown` |
| DB | stdlib `sqlite3` | WAL mode; one file |
| Web serving | `better-sqlite3` behind a tiny Express/Hono route, or pre-exported JSON | decide at build |
| Map | Leaflet + OSM tiles | only if cheap |

## 3. Database schema (`schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS course (
  id                  TEXT PRIMARY KEY,         -- stable hash (source + source_key)
  source              TEXT NOT NULL,            -- feriennet:<instance> | ferienprogramm | ...
  source_url          TEXT NOT NULL,            -- link-out target
  title               TEXT NOT NULL,
  description_full    TEXT,                     -- stored, not shown
  description_snippet TEXT,                     -- shown
  provider            TEXT,
  topics              TEXT,                     -- JSON array of controlled categories
  format              TEXT,                     -- half_day|full_day|multi_day|weekly|residential|unknown
  cost_type           TEXT,                     -- free|paid|unknown
  price_chf           REAL,
  age_min             INTEGER,
  age_max             INTEGER,
  language            TEXT,                     -- de|en|fr|it|multi|unknown
  commune             TEXT,
  venue_name          TEXT,
  address             TEXT,
  lat                 REAL,
  lng                 REAL,
  image_url           TEXT,
  image_local_path    TEXT,
  first_seen          TEXT NOT NULL,            -- ISO timestamp
  last_seen           TEXT NOT NULL,
  raw                 TEXT                      -- JSON blob of original fields
);

CREATE TABLE IF NOT EXISTS occasion (
  id                  TEXT PRIMARY KEY,         -- hash(course_id + start + end)
  course_id           TEXT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  iso_year            INTEGER,
  iso_week_start      INTEGER,                  -- KW (primary filter)
  iso_week_end        INTEGER,
  start_date          TEXT,                     -- ISO date
  end_date            TEXT,
  start_time          TEXT,
  end_time            TEXT,
  holiday_period      TEXT,                     -- summer|autumn|sport|spring|other
  registration_deadline TEXT,                   -- ISO date or NULL (=unknown)
  spots_available     INTEGER                   -- NULL until/unless parseable
);

CREATE TABLE IF NOT EXISTS crawl_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT, finished_at TEXT,
  source TEXT, fetched INTEGER, parsed INTEGER,
  new INTEGER, updated INTEGER, errors INTEGER, note TEXT
);

CREATE INDEX IF NOT EXISTS idx_occ_course ON occasion(course_id);
CREATE INDEX IF NOT EXISTS idx_occ_week   ON occasion(iso_year, iso_week_start);
CREATE INDEX IF NOT EXISTS idx_course_commune ON course(commune);
```

`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`

## 4. Adapter contract

```python
class Adapter(ABC):
    source: str                      # stable key
    @abstractmethod
    def fetch(self) -> Iterator[RawRecord]: ...
    # RawRecord = loosely-typed dict the adapter emits;
    # run.py passes it through normalize.py -> Course/Occasion -> db.upsert
```

Adapters only **extract**; normalization is centralized so all sources share KW derivation,
topic mapping, snippet/lang/image logic. Each adapter is independently runnable
(`python -m coursecrawler.run --only feriennet`). An adapter raising mid-stream is caught,
logged, and counted; it never aborts the whole run.

## 5. Feriennet fleet adapter (the wedge)

**Enumeration.** Seed from the known ZH instance(s) and from Elternkompass
(`kompass.projuventute.ch`) to discover sibling `*.feriennet.projuventute.ch` subdomains
serving Zürich communes. Config holds a curated instance list; enumeration augments it.

**Listing.** `GET https://<inst>.feriennet.projuventute.ch/activities?pages=0-200` returns the
full active-period set (saturates; confirmed 132 for Ferienplausch ZH). Parse each
`div.activity-list-item.card`:

| Field | Selector |
|---|---|
| detail_url | `a[href]` (→ `/activity/<slug>`) |
| image_url | `div.activity-image` style `background-image:url('…')` |
| title | `h5` (strip leading `"N. "` ordinal) |
| snippet | `span.page-lead` text |
| age_min/max | `.factoids span.age span` → `"10 - 16 Jahre"` |
| price_chf / cost_type | `.factoids span.cost span` → `"ab 137.00 CHF"`; absent/`0` ⇒ free |
| spots hint | `.factoids span.available-spots` |

**Detail enrichment.** `GET` each `/activity/<slug>` for:
- **Occasions** — `div.occasion-title h4` ("1. Durchführung") blocks → dates ("14. Juni 2026")
  + per-occasion spots ("Noch 5 Plätze frei").
- **Location** — `Treffpunkt` address (incl. postal code → commune) and **embedded lat/lng**
  coordinates on the page (no external geocoding needed for Feriennet).
- **Full description** — main body → `description_full` (snippet from listing or first N chars).
- **Registration deadline** — `Anmeldeschluss` if present, else `unknown`.

**Politeness.** ~1 req/sec/instance, on-disk HTML cache keyed by URL so re-runs and dev
iteration don't re-hit the site. `source = "feriennet:<instance>"`.

## 6. Other adapters

- **ferienprogramm.ch** — `/kurse/` listing, bespoke HTML parse. Winterthur region.
- **jugendsportcamps.ch** — cantonal sports camps; searchable DB, parse result pages.
- **providers.py** — Logiscool, Kinder-Camps, friLingue, Zoo Zürich, codora, Camprock. Each a
  small parse function; some may need Playwright if JS-rendered (decide per site). These add
  the paid coding/sport/language diversity Feriennet under-represents.

Coverage philosophy: land Feriennet first (most volume), then breadth for topic/cost diversity
toward the "feels rich" success metric.

## 7. Normalization (`normalize.py`)

- **Topics:** keyword/category map → controlled list `{sports, languages, coding, arts, music,
  science, academic, nature, other}`. Source categories and title/desc keywords both feed it.
- **Price:** regex `([0-9]+\.?[0-9]*)\s*CHF`; `cost_type = free` if 0/none, else `paid`.
- **Age:** `"(\d+)\s*-\s*(\d+)"`; single age → min=max; clamp to plausible 0–18.
- **Dates → KW:** `dateparser` (de) → date → `isocalendar()` → `iso_year, iso_week`. Multi-day
  occasion spans `week_start..week_end`. Map month → holiday_period via ZH school calendar.
- **Snippet:** strip HTML, collapse whitespace, truncate ~200 chars on word boundary.
- **Language:** detect on title+desc; `unknown` under confidence threshold.
- **IDs:** `course.id = sha1(source + source_key)`; `occasion.id = sha1(course_id+start+end)`.

## 8. Geocoding & holiday calendar (`geo.py`)

- Feriennet detail pages provide lat/lng directly. For sources without coords, a static
  `commune → (lat,lng)` table for ZH communes (bundled JSON) + postal-code fallback.
- **Holiday-KW reference:** bundled `commune → [holiday KW ranges]` for the ZH school calendar
  (communes stagger). Powers the KW↔date↔"who's on holiday" UI mapping (PRD K1). v1 may start
  with the canton-wide default ranges and refine per-commune where data exists.

## 9. Dedup (`dedup.py`)

After all adapters write, reconcile cross-source duplicates (esp. Feriennet vs. Elternkompass):
exact key when a shared `source_key` exists; else `rapidfuzz.token_set_ratio` on
`normalize(title)+commune+start_date` over a threshold. Keep canonical (prefer richest record),
record alternate `source_url`s in `raw`. Within a source, the course/occasion model already
collapses "same camp, many weeks".

## 10. Crawl runner (`run.py`)

```
for adapter in selected:
    t0; fetched=parsed=new=updated=errors=0
    for raw in adapter.fetch():
        try: course, occasions = normalize(raw); db.upsert(...) ; tally
        except: errors++ ; log
    record crawl_run row
# post: dedup pass; image fetch pass; stale handled at query time (end_date < today)
print summary table per source
# BREAKAGE ALERT: if a source's parsed count is 0 (or << its trailing average), warn loudly
```

Stale listings aren't deleted; the web layer filters `end_date >= today` (PRD J3/FR14), so
history is retained for debugging.

## 11. Web tier (`web/`)

- **Serving:** tiny Express/Hono server opens the SQLite read-only via `better-sqlite3` and
  exposes `/api/courses?week=&age=&commune=&topic=&cost=&format=&maxPrice=` returning
  Course+Occasion JSON grouped by course. (Fallback: pre-export a static `courses.json` at
  crawl time and ship a pure-static SPA — decided at build.)
- **UI:** React + TS. List of grouped cards (image, title, age, KW range "runs N weeks",
  price, commune, provenance). Filters per PRD §8 (KW primary). Detail view with map pin,
  snippet, deadline-or-unknown, link-out, verify-with-provider disclaimer. Default sort by
  date. Empty-state suggests broadening (nearby communes / adjacent weeks). DE/EN toggle.

### 11a. Admin / operator dashboard (PRD §8 FR17–FR20)

A second SPA route (`#admin`) backed by one endpoint:

- **`GET /api/admin`** computes from the DB (cached on DB mtime like the main data):
  - `totals` — courses, uniqueCourses (excl. `dup_of`), duplicates, occasions.
  - `bySource` — courses + occasions per source.
  - `byTopic` / `byCost` / `byFormat` / `byCommune` — distributions (the diversity read).
  - `coverage` — for each field (image_local_path, lat, age_min, price_chf, commune, dated
    occasion): count + % populated (the completeness read).
  - `runs` — the `crawl_run` history rows (per-source fetched/parsed/new/updated/errors +
    `note`, which carries breakage alerts).
  - `potential` — a static-but-data-aware list of levers with estimated additional courses:
    | lever | status | basis for estimate |
    |---|---|---|
    | Feriennet instances | partial | instances crawled vs. discoverable by subdomain probe |
    | Other holiday periods | untapped | only the active period is pulled; autumn/winter/spring not yet |
    | jugendsportcamps.ch | untapped | ~30 cantonal camps (JS-rendered → needs Playwright) |
    | Private providers | untapped | Logiscool / Kinder-Camps / friLingue etc. (bespoke adapters) |
    Estimates are rough order-of-magnitude to show headroom, not promises.

- **Dashboard UI:** cards for totals, a per-source run table with the latest stats and any
  alert highlighted, coverage bars (% populated per field), distribution bars (topic / cost /
  commune), and a "true potential" panel summing crawled vs. estimated-available with each
  lever's status. Read-only, localhost-only.

## 12. Testing

- **Unit:** normalize (price/age/date→KW/snippet), dedup matcher, card parser against saved
  HTML fixtures in `tests/fixtures/` (so tests don't hit the network).
- **Integration:** run feriennet adapter against cached HTML → assert ≥N courses with required
  fields populated, valid KW, resolvable image, link-out 200 (sampled).
- **Data-quality report:** `run.py --report` prints volume, per-topic/per-commune/per-cost
  counts, % with image, % with coords, % with known dates — the objective read on "rich".

## 13. Open technical questions

- Whether other Feriennet **periods** (autumn/winter) are separately addressable via distinct
  `period_ids`; if so, enumerate and crawl each. (Current page exposed one active period.)
- Which private providers are JS-rendered (need Playwright) vs. static.
- Per-commune holiday-KW data availability vs. canton-wide default.

## 14. Discovery pipeline (long-tail)

Platform adapters (§5–6) only reach providers that list on a platform. Independent provider
sites are caught by a separate **discovery** pipeline (coverage rationale + results in
[`RESEARCH-SOURCES.md`](RESEARCH-SOURCES.md)).

```
local scout → candidate domains → per-domain nav-link crawl → dump pages
   → Haiku-subagent extraction → discovery.ingest() (normalize → dedup → persist)
```

### 14a. Local scout — `crawler/discovery_local/discover.py`
Runs **on a Swiss IP** (the hosted env egresses US → consent/CAPTCHA-walled, US-localized
results). Pure `httpx` + `selectolax`, no browser:
- **Search:** a query matrix (`TOPICS × REGIONS × year`, DE+EN) against **Startpage**
  (`/sp/search`, parses `a.result-link`). Startpage serves Google results without the wall;
  direct Google/Bing scraping is CAPTCHA-blocked, esp. from datacenter/VPN IPs.
- **Per-domain crawl:** for each candidate domain (known platforms + social filtered out),
  fetch the homepage and follow **internal nav links** matching `camp|ferien|sommer|kurs|…`.
  Catches pages **orphaned from `sitemap.xml` but present in the nav** (e.g. verabjj.ch's
  `/summer-camp-2026`).
- **Dumps** `discovery_out/{hits.json, social.json, pages/<hash>.json}` (each page = `{url,
  title, text[:6000]}`, scripts/nav/footer stripped). `discovery_out/` is gitignored scratch.

### 14b. Extraction — Haiku subagents
Free-form HTML with no common structure ⇒ extraction needs an LLM. Done with **Haiku
subagents** (the Agent tool, `model:"haiku"`), no API key required — fan out N agents over
batches of the dumped pages, each following the shared `discovery_out/EXTRACT.md` rules and
writing a JSON records array.
- **Batch size drives recall.** 26-page batches under-extracted (missed extractable camps);
  **~14-page batches with an "be exhaustive" instruction roughly tripled yield** (116→389
  records over the same pages). Keep batches small.
- The held-out probe (`verabjj.ch`, withheld as ground truth) is recovered organically only
  once batch size is right — a recall regression test, not a target to special-case.
- Extraction *quality* is still uneven (Haiku may capture a title but miss
  age/price/dates present in the text) → hence `needs_verify` + a recommended verification
  pass. Productionizing as a headless script: swap subagents for **Claude Haiku API** calls
  with a forced structured-output tool + prompt caching on `EXTRACT.md`.

### 14c. Ingestion — `crawler/coursecrawler/discovery.py`
Extractor-agnostic landing zone: takes normalized records, runs them through the shared
`normalize`/`geo` stages, **dedups** (`rapidfuzz` title+commune vs the existing DB, and
`url::title` keys so multi-camp pages don't collapse), and upserts as
`source="discovered:<domain>"` with `raw.needs_verify=true` + `raw.confidence`. CLI:
`python -m coursecrawler.discovery <records.json>`. The committed `crawler/discovery_seed.json`
is the reproducible canonical record of the discovered set.
