# CourseCrawler

Aggregates kids' school-holiday courses and camps across **Canton Zürich** into one
searchable place. A Python crawler pulls listings from many providers, normalizes them into
one SQLite dataset, and a React app lets parents filter by calendar week (KW), age, location,
price, topic, and format. Booking stays with the provider (we link out).

See [`docs/PRD.md`](docs/PRD.md), [`docs/TDD.md`](docs/TDD.md), and
[`docs/research-sources.md`](docs/research-sources.md).

## What's in the box (current dataset)

- **~728 unique courses · 1,090+ dated occasions** across **14 sources**:
  - **Feriennet fleet (10 ZH instances)** — ferienplausch (regional, ~51 communes) +
    standalone communes: pfaeffikon, urdorf, neftenbach, thalwil, stadel, horgen,
    bachenbülach, glattfelden, oberengstringen.
  - **ferienprogramm.ch** (Winterthur region), **codora** (Zürich coding/robotics camps),
    **jugendsportcamps.ch** (Canton ZH Sportamt — via its public JSON API, filtered to a ZH
    bounding box), **friLingue** (Swiss residential language camps — fills the languages topic).
- Coverage: **97% images, 100% age + dated, ~98% price, ~99% commune, ~93% coordinates.**
- Images are downloaded and served locally; courses are grouped (a multi-week camp = one
  card, "runs N weeks / KW range"); cross-source duplicates are flagged; past occasions are
  hidden.
- Topic mix skews toward **sports** (jugendsportcamps is sport-heavy); coding is now better
  covered (codora). One street-name/non-ZH commune may slip through the bbox — the web
  layer's `inZH`/Bezirk lookup is the precise canton filter.

## Architecture

```
crawler/   Python 3.13 — adapters → normalize → SQLite        (data wrangling)
web/       Vite + React + TS + Express + better-sqlite3        (serving + UI + admin)
data/      coursecrawler.sqlite + images/  ← the contract between the two
docs/      PRD, TDD, source research, discovery interview
```

The two halves only share the **SQLite file** — no shared code. (Why Python+TS: see TDD §1.)

## Run it

### 1. Crawl (build/refresh the dataset)

```bash
cd crawler
python3 -m venv .venv && source .venv/bin/activate
pip install -e .

# crawl everything (uses an on-disk HTML cache; re-runs are cheap & idempotent)
python -m coursecrawler.run

# useful flags
python -m coursecrawler.run --only feriennet         # one source
python -m coursecrawler.run --only feriennet --limit 20 --skip-images   # quick test
python -m coursecrawler.run --no-cache               # bypass HTML cache (fetch fresh)
python -m coursecrawler.run --report                 # print dataset report only
```

A weekly refresh is just re-running the crawl (e.g. via cron). The runner prints a per-source
summary and a **breakage alert** if any source drops to ~0 records.

### 2. Web app (browse + admin)

```bash
cd web
npm install

# dev (Vite + API with hot reload)
npm run dev          # → http://localhost:5173   (API on :8787, proxied)

# or production-style (build once, single server serves SPA + API + images)
npm run build
npm run api          # → http://localhost:8787
```

- **Browse:** http://localhost:8787/ — filters (KW, age, commune, topic, cost, format,
  max price), list + map views, course detail with link-out. DE/EN toggle.
- **Admin:** http://localhost:8787/#admin — crawl health, metadata coverage, and the
  "true potential if we crawl harder" estimate.

Screenshots of all views are in [`web/screenshots/`](web/screenshots/).

## Status & next steps

**Done:** Feriennet fleet adapter (one parser, **10 ZH instances**), ferienprogramm.ch,
**codora** (static WordPress/MEC), **jugendsportcamps.ch** (public JSON API, ZH-bbox
filtered), **friLingue** (static, residential language camps), normalization (topics, KW
derivation, price/age parsing incl. school-grade→age and birth-year→age, language detection,
snippets), local image fetch, commune geocoding, cross-source dedup, the parent browser, and
the admin dashboard.

**Untapped headroom** (still on the table):
- **Other holiday periods** — only the active (summer 2026) period is published on Feriennet
  right now; autumn/winter/spring add ~2× once communes publish them.
- **Logiscool** (Zürich coding) — *deferred*: bookable camps load behind a cookie-consent
  gate + booking-widget interaction (no programs API on render, Nuxt SSR state has only CMS
  config). Low ROI since codora already covers Zürich coding/robotics. Revisit via the
  booking API or a click-driven Playwright flow if it becomes important.
- jugendsportcamps is national (~880); we keep the ~217 inside a ZH bounding box.
- More Feriennet ZH instances beyond the ten probed (long-tail, mostly tiny).

Note: the crawler now uses Playwright (Python) for JS-only sources, but most sources needed
only HTTP — jugendsportcamps had a JSON API, codora/friLingue/ferienprogramm are server-rendered.
friLingue camps currently have no image (placeholder by topic); not yet extracted.

**Known caveats:**
- ferienprogramm.ch spans the Winterthur–Thurgau border, so some communes are outside ZH.
  A canton filter is a clean future addition.
- Topic classification (a nice-to-have filter) is keyword-based; ~good but not perfect.
- ToS/scraping was treated leniently per project scope (local/personal); revisit before any
  public/commercial use (see PRD §13).
