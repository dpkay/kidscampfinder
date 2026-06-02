# CourseCrawler — Product Requirements Document

*Draft v0.1 — 2026-06-01. Source inventory lives in [`research-sources.md`](./research-sources.md);
discovery answers in [`INTERVIEW.md`](./INTERVIEW.md). Items marked **[ASSUMPTION]** are my
defaults where you didn't specify — flag any you disagree with.*

---

## 1. Summary

CourseCrawler aggregates kids' school-holiday courses and camps across **Canton Zürich**
into one searchable place. It automatically crawls the many scattered providers (communal
Ferienpass programs, cantonal sports camps, private camp providers), normalizes them into a
single schema, and presents parents a fast filterable browser. Booking stays with the
provider (we link out).

**The bet:** parents today just "Google and hope." If we can show a *rich, diverse, accurate*
set of real options in one place, that's compelling enough to validate as a scalable product.
v1 exists to prove the **dataset** is rich — not to handle registration or accounts.

## 2. Problem

A Zürich parent looking for holiday activities for their kid has no single place to look.
Offerings are spread across ~160 communes' programs, cantonal sports camps, and dozens of
private providers, each with its own site, format, and terminology — much of it
German-only. The current workflow is ad-hoc Google searching with no way to compare by age,
date, location, topic, or price. Good options are missed simply because they're invisible.

## 3. Goals & non-goals (v1)

### Goals
- G1. Aggregate holiday courses/camps across Canton Zürich from multiple sources into one
  normalized dataset.
- G2. Achieve **enough volume + accuracy** that the result *feels* like a rich, real catalog.
- G3. Let a parent filter to relevant options (age, date, topic, location, price) in seconds.
- G4. Link out to the provider for details/registration.
- G5. Run end-to-end locally with a weekly refresh.

### Non-goals (explicitly out for v1)
- N1. In-app registration/booking. (Link out only.)
- N2. User accounts, saved favorites, kid profiles.
- N3. Alerts / notifications.
- N4. Real-time seats-left tracking. *(Desirable later — see roadmap.)*
- N5. Cloud hosting / public deployment. *(Local only for now.)*
- N6. Geographies beyond Canton Zürich.
- N7. Payment, reviews, ratings, provider self-service portal.

## 4. Target user

**Primary (only, for v1):** a parent in Canton Zürich with kids roughly **ages 4–16**,
looking for something for their child during a school break. May be a **non-German speaker**
(expat) — English support is required.

Secondary users (providers listing themselves, kids browsing) are explicitly deferred.

## 5. Success metrics

The success signal is qualitative-but-real:
- **Primary:** "When I search as a parent, I see a rich, diverse set of courses and believe
  there are lots of genuine choices for my kids." (The founder's gut check.)
- **Supporting, measurable:**
  - **Volume:** ≥ several hundred distinct courses/occasions covering multiple communes.
  - **Diversity:** all major topic categories represented; both free communal *and* paid
    private offerings present.
  - **Accuracy:** spot-check sample — title, dates, age, price, and link-out are correct and
    the provider link resolves. Target ≥ 95% of sampled records correct on core fields.
  - **Freshness:** dataset reflects the current/upcoming holiday period.

## 6. Scope of content

- **Formats:** half-day workshops, full-day camps, multi-day camps, weekly recurring
  courses, overnight/residential camps. Surfaced as a **format filter (dropdown)**.
- **Topics:** all of — sports, languages, coding/robotics, arts & crafts, music, science,
  academic tutoring, other. (Normalized to a controlled category list.)
- **Time coverage:** **all Swiss school holidays** (summer, autumn, sport/winter, spring),
  per the Canton Zürich school calendar — not summer only.
- **Cost types:** **both** free/cheap communal Ferienpass activities **and** paid private
  courses. Surfaced as a **cost-type filter (dropdown)**.
- **Geography:** **whole Canton Zürich** (~160 communes) from day one.
- **Language of the product UI:** German + **English** (see §10).

## 7. Data sources & crawl strategy

Full inventory and URLs in [`research-sources.md`](./research-sources.md). Key points:

**The wedge: the Feriennet fleet.** Pro Juventute's **Feriennet** (`onegov.feriennet` /
OneGov Cloud) powers **210+ Ferienpässe nationwide**, each at
`<name>.feriennet.projuventute.ch`, all sharing identical HTML, URL filter grammar, and the
`Activity → Occasion → Period` data model. **One adapter crawls the whole fleet.** The
flagship **Ferienplausch Zürich** instance alone covers ~51 ZH municipalities (ages 6–16,
with prices + ages in the HTML). This is the single highest-value target and likely yields
most of the *free/communal* content.

**No usable public API.** Feriennet's CSV/JSON export is admin-only; its iCal feed is
per-user, not a catalog. So ingestion is **HTML scraping** of the paginated `/activities`
listing. (Consistent with "scrape broadly" — see §8 source list.)

### Source priority (v1 build order)

| # | Source | Type | Adapter cost | Why |
|---|--------|------|--------------|-----|
| 1 | **Feriennet fleet** (`*.feriennet.projuventute.ch/activities`) | Shared platform | One adapter, many instances | Collapses ~210 sources into one; most free/communal ZH content |
| 2 | **Elternkompass** (`kompass.projuventute.ch`) | Seed/enumerator | Light | Discovers the full list of ZH Feriennet instances to crawl; also the nearest competitor |
| 3 | **ferienprogramm.ch** | Shared platform (Winterthur) | One adapter | A whole region of providers not on Feriennet |
| 4 | **jugendsportcamps.ch** (Kanton ZH) | Cantonal | One adapter | ~30 authoritative sports camps, canton-wide |
| 5 | **Private providers** — Logiscool, Kinder-Camps, friLingue (+ Zoo Zürich, codora, Camprock as long-tail) | Bespoke | One adapter each | Paid coding/sport/language segment Feriennet under-represents |

**Effort scales with the number of distinct HTML layouts, not the number of sources** —
Feriennet alone gives broad coverage from one parser. v1 should land **#1–#2 first** (proves
the wedge), then add #3–#5 to demonstrate diversity (free + paid, public + private).

### Adapter contract
Each adapter is a module that fetches its source and emits records in the **normalized
schema** (§9). Adapters are independent and individually runnable. Per-source config:
base URL(s), enumeration logic, rate limit, parser. Adapters must be resilient to missing
fields (emit what's present; mark the rest unknown).

## 8. Functional requirements

### Ingestion pipeline
- FR1. A **crawl runner** executes all (or a selected) adapters, with per-source rate
  limiting and polite delays.
- FR2. Adapters parse listings → normalized `Course`/`Occasion` records.
- FR3. **Normalization:** map source categories → controlled topic list; parse prices to a
  number + currency; parse ages to `ageMin/ageMax`; parse dates to structured occasions and
  **derive ISO calendar week(s) (KW)** for each (K1); classify format
  (half/full/multi-day/weekly/residential) and cost-type (free/paid); extract
  `registration_deadline` when present (else `unknown`, J2); store the full description and
  generate a short **snippet** (N1).
- FR3b. **Image fetching:** capture the source `image_url` *and* **download the image to
  serve it locally** (`image_local_path`), so the UI can render thumbnails without hotlinking
  (J1; copyright not a concern at hobby scale — see §13).
- FR4. **Geocoding:** resolve commune/venue → coordinates using a static Canton ZH commune
  table (+ optional address geocoding) for the map and distance filter. **[ASSUMPTION]**
- FR5. **Language detection:** infer instruction/listing language from text; default
  `unknown` when unclear (see §10).
- FR6. **Deduplication:** detect the same offering appearing in multiple sources (notably
  Feriennet vs. Elternkompass) via a stable key (source-id where available, else fuzzy match
  on title + provider + dates + commune). Keep one canonical record, retain source links.
- FR7. **Persistence:** upsert into local storage; track `firstSeen` / `lastSeen` so stale
  records (gone from source) can be aged out.
- FR8. **Idempotent re-runs:** a weekly re-crawl updates existing records rather than
  duplicating.

### Parent-facing app
- FR9. **Browse/search** a list of courses, **grouped by Course** (a multi-week camp is one
  card showing "runs N weeks / KW range", not N rows — K2). **Default sort: date, soonest
  first** (L1). Each card shows an **image thumbnail** where available.
- FR10. **Course detail** view: title, image, snippet description, provider, topic, age range,
  KW + dates/times, format, price, location (+ map pin), language, registration deadline (or
  "unknown"), **provenance** ("source: X · updated N days ago", L3), a **link-out** button to
  the provider, and a small **"always verify details with the provider"** disclaimer (N2).
- FR11. **Filtering** (E1 marks, §8), combinable, with live result count.
- FR12. **Map view** of results **[ASSUMPTION: include if low-cost given geocoded data; list
  is the primary view]**.
- FR13. **Empty / thin results**: when a filter combo returns little or nothing, suggest
  broadening (e.g. nearby communes, adjacent weeks) rather than a dead end (L2).
- FR14. **Hide stale listings**: an Occasion whose end-date has passed is not shown (J3).
- FR15. Anonymous, no login. Fast and responsive on desktop + mobile web.
- FR16. **Bilingual UI** (DE/EN) with graceful handling of unknown content language (§10).

### Filters (E1 — your marks)
| Filter | v1 | Notes |
|--------|----|-------|
| Age | **Must** | Single age input → matches `ageMin ≤ age ≤ ageMax` |
| Calendar week (KW) | **Must** | Primary date dimension (K1). UI shows the KW→date-range mapping and which communes are on holiday that week. Holiday-period label is a secondary convenience |
| Location / distance | **Must** | By commune; distance needs geocoding (§FR4) |
| Price / cost-type | **Must** | Free vs paid + max price |
| Half-day vs full-day | **Must** | A distinct toggle; also covered by the broader Format facet |
| Format (half/full/multi/weekly/residential) | **Must** | Dropdown (per B1); superset of the half/full toggle |
| Topic / category | **Nice** | Controlled list — you marked this *nice*, not must |
| Language of instruction | **Nice** | Content language is *often unknown* (§10); as a nice-to-have the filter just treats `unknown` gracefully (include-by-default) rather than gating the dataset |
| Lunch / care included | **Nice** | Only if reliably parseable |
| Gender | **Nice** | Only if data exists |
| Special-needs friendly | **Nice** | Only if data exists |

### Operator / admin dashboard
A separate internal view (not parent-facing) that answers "is the crawl healthy, what
data do we have, and how much are we leaving on the table?" — directly serving the core
bet (is the dataset rich, and how much richer could it be?).

- FR17. **Crawl health over time:** per-source history from `crawl_run` (fetched / parsed /
  new / updated / errors per run, most-recent timestamp), surfacing the **breakage alerts**
  (a source dropping to ~0 or far below its trailing average).
- FR18. **Metadata coverage by type:** how complete the dataset is — % of courses with
  image / coordinates / age / price / commune / dated occasion — plus counts by source,
  topic, cost-type, format, and commune. This is the objective read on "rich + diverse".
- FR19. **"True potential" estimate:** what we'd gain by crawling harder. A panel listing
  each known source/lever (Feriennet instances crawled vs. discoverable, other holiday
  **periods** not yet pulled, `jugendsportcamps.ch`, private providers) with a rough
  estimate of additional courses available and its status (crawled / partial / untapped).
  Makes the headroom explicit so we can prioritise where to invest crawl effort.
- FR20. Local/operator-only; no auth needed for v1 (runs on localhost). Reachable at a
  separate route (e.g. `#admin`).

## 9. Data model (normalized schema)

```
Course (stable offering)
  id                  stable hash (source + source_id | fuzzy key)
  source              enum (feriennet, ferienprogramm, jugendsportcamps, logiscool, …)
  source_url          canonical provider/listing URL (link-out target)
  title               text
  description_full    text (nullable)  // full scraped text — STORED, not shown in v1
  description_snippet text (nullable)  // short excerpt — what the UI shows (see §13)
  provider            text (nullable — Feriennet cards often omit)
  topics              [controlled category]  // sports, languages, coding, arts, music, science, academic, other
  format              enum (half_day, full_day, multi_day, weekly, residential, unknown)
  cost_type           enum (free, paid, unknown)
  price_chf           number (nullable)
  age_min, age_max    int (nullable)
  language            enum (de, en, fr, it, multi, unknown)
  commune             text
  venue_name          text (nullable)
  lat, lng            number (nullable, from geocoding)
  image_url           text (nullable)  // source image URL
  image_local_path    text (nullable)  // downloaded copy served locally (J1)
  first_seen, last_seen  timestamp
  raw                 jsonb (original scraped fields, for debugging/repair)

Occasion (a date-bound instance of a Course)
  id
  course_id           → Course
  iso_year            int
  iso_week_start      int     // KW number — PRIMARY filter dimension (K1)
  iso_week_end        int     // = start for single-week; spans for multi-week camps
  start_date, end_date        // the concrete dates the KW range maps to
  start_time, end_time        (nullable)
  holiday_period      enum (summer, autumn, sport, spring, other)  // secondary/convenience label
  registration_deadline date (nullable — "unknown" when source doesn't expose it, J2)
  spots_available     int (nullable; reserved for future seats-left tracking)
```

A Course has 1..n Occasions (different weeks/dates). Search operates over Occasions but
**groups by Course** in the UI — a camp running 6 weeks shows as one card labelled "runs 6
weeks (KW 28–33)", not 6 rows (K2). Default sort is **by date, soonest first** (L1).

**Holiday-calendar data dependency (K1):** because Zürich communes *stagger* their school
breaks, we need a reference table mapping `commune → holiday KW ranges` for the ZH school
calendar. The week filter is by **KW number**; the UI shows what dates a KW maps to and which
communes are actually on holiday that week.

## 10. Language handling

German is the dominant content language; English UI is required for expats. Content language
is **often not explicitly stated**, so:
- Detect content language heuristically (lib-based detection on title+description); store
  `language=unknown` when confidence is low rather than guessing.
- The UI is bilingual (DE/EN); **content** is shown in its original language (we do not
  machine-translate listings in v1 **[ASSUMPTION]** — flag if you want auto-translation).
- The language filter includes an "include unknown" default-on behavior so unknowns aren't
  hidden (avoids shrinking an already-small dataset). **[ASSUMPTION]**

## 11. Architecture & tech stack (decided)

**Split by strength: Python crawler + TypeScript serve/client, with SQLite as the
contract.** The crawler/data-pipeline half lives in Python because that's where the
ecosystem genuinely wins for this work (`dateparser` for messy German dates, `rapidfuzz` for
dedup, mature crawling tools, and `scipy`/`sklearn` available if semantic dedup ever needs
them). The serving + UI half is TypeScript/React, which co-locates cleanly as one JS runtime.
The two halves never share code — they share **the SQLite database** (schema per §9). This
keeps the boundary a data file, not synchronized logic, so the language split costs little.

*Decision rationale:* Node was only ever ahead on the shared-types/single-toolchain
convenience; on raw capability for scraping + data-wrangling, Python is equal-or-better and
notably stronger at this project's two soft spots (German date parsing, fuzzy dedup). Since
the crawler↔frontend contract is the DB, not shared types, that convenience didn't justify
giving up Python's data ecosystem.

```
coursecrawler/
  crawler/      # Python: adapters, runner, normalization, geocoding, dedup → SQLite
                #   pyproject.toml, schema migrations, the controlled category list
  web/          # Vite + React + TS: serving layer + filterable browser, map, detail view
  data/         # SQLite db (gitignored) + static commune→coords table  ← the contract
  schema/       # single source of truth for the DB schema + a JSON Schema the web app
                #   can use to generate/validate TS types  [ASSUMPTION]
  docs/         # this PRD, research, interview
```

- **Scraping:** **Playwright for Python** for JS-rendered pages (Feriennet appears to render
  dynamically — plain fetch saw only nav) + **BeautifulSoup/parsel** for static HTML where
  possible (faster). Optionally **Scrapy** if the crawl grows enough to want its
  politeness/retry pipeline. **[ASSUMPTION — confirm Feriennet needs a headless browser
  during spike.]**
- **Data wrangling:** `dateparser` (German dates), `rapidfuzz` (dedup), stdlib elsewhere.
- **Storage / contract:** **SQLite** (file-based, zero-setup, perfect for local). Schema per
  §9. Python writes it; the web app reads it. This file *is* the integration point.
- **Serving:** TS — the `web` app reads from a thin local API over SQLite (e.g.
  Vite + a small Express/Hono layer using `better-sqlite3`), or from a generated static JSON
  snapshot for the simplest possible v1. **[ASSUMPTION — decide at build time.]**
- **Type sharing across the boundary:** generate TS types for `Course`/`Occasion` from the
  `schema/` JSON Schema so the frontend stays in sync without hand-copying. **[ASSUMPTION]**
- **Map:** Leaflet + OpenStreetMap tiles (free, no key) if we do the map.
- **Scheduling:** manual `python -m crawler` for now; weekly is a cron/README note, not infra
  (local only).

## 12. Non-functional requirements

- **Local-first:** everything runs on the dev machine; no cloud dependency, no secrets.
- **Politeness:** rate-limit and delay scraping; identify a sane user-agent; cache fetched
  pages during a run to avoid re-hitting.
- **Resilience:** one source failing must not break the crawl; log per-source errors and
  record counts.
- **Observability:** each crawl run prints a summary (per source: fetched, parsed, new,
  updated, errors) so we can see dataset health.
- **Data quality first:** correctness of core fields (title, dates, age, price, link) is the
  top priority — it's the whole success bet.

## 13. Legal / ToS

You've chosen to **scrape broadly** since this is a personal/local project for now and not
public. Recorded as an explicit, conscious decision. **Caveat for later:** if this goes
public or commercial, ToS/robots/Datenschutz of Feriennet, ferienprogramm.ch, etc. must be
revisited — several couldn't be confirmed as scraping-permissive (see research open items).
Keep scraping polite and low-volume regardless.

## 14. Roadmap

- **Phase 0 — Spike (days):** Build the **Feriennet adapter** against Ferienplausch Zürich;
  confirm whether Playwright is needed; land 1 source end-to-end into SQLite; throwaway UI to
  eyeball records.
- **Phase 1 — MVP (the "rich dataset" proof):** Feriennet fleet (via Elternkompass
  enumeration) + ferienprogramm.ch + jugendsportcamps + 2–3 private providers. Normalized
  schema, dedup, geocoding. React browser with the must-have filters + course detail +
  link-out. Map if cheap. Weekly manual re-crawl. **← this is the deliverable that proves the
  thesis.**
- **Phase 2 — depth:** more private providers; better dedup; language auto-translation;
  data-quality dashboard.
- **Phase 3 — toward product:** seats-left tracking, accounts/favorites, alerts, cloud
  hosting, expand beyond ZH, revisit ToS/partnerships.

## 15. Open questions / decisions

- ✅ **Filters (E1):** decided — your marks recorded in §8. (Note the language-filter tension flagged there.)
- ✅ **Stack:** decided — Python crawler + TS serve/client, SQLite contract (§11).
- ✅ **Map in v1:** decided — include if easy (list is primary); defer if it adds real cost (§12/FR12).

- ✅ **Age range:** ~4–16 confirmed (A2). Feriennet's own range is 6–16; private providers extend both ends.
- ✅ **Images:** capture URL *and* download locally to serve (J1). Copyright not a concern at hobby scale.
- ✅ **Stale listings:** hide once end-date passed (J3).
- ✅ **Descriptions:** store full text, show snippet only (N1).

Still open:
1. **Content translation:** show listings in original language only (default), or
   auto-translate DE→EN? (Deferred — original-language default for now.)
2. **Serving:** thin local API vs. static JSON snapshot — leaning thin local API
   (`better-sqlite3`) so filters run server-side; will decide at build time.
```

## 16. Strategy & open business questions (not v1 work — thesis on file)

These are recorded for the founder, not built in v1.

- **Differentiation vs. Pro Juventute's Elternkompass** (O1): Elternkompass already aggregates
  the *Feriennet* fleet. CourseCrawler's wedge is **broader coverage** — paid private +
  cantonal + non-Feriennet sources Elternkompass misses — plus **better filtering** (KW/age/
  location/price) and **English** for the expat market. The goal is explicitly to be *more*
  than a Feriennet directory.
- **National scalability** (O2): the Feriennet fleet is country-wide and shares one HTML
  layout, so the Zürich adapter generalizes to most of Switzerland at near-zero marginal
  cost. Growth path: **win Canton Zürich, then roll out canton-by-canton on the same infra.**
- **Seasonality** (O3): demand spikes ~4×/year around school breaks. **Ignored for v1** — no
  retention/off-season strategy yet.
- **Monetization** (O4): **achieve scale before monetizing.** Candidate models to revisit
  later — referral/lead-gen fees, featured listings, provider SaaS. None pursued now.

## 17. Assumptions log

- Geocoding via static commune table for map/distance (FR4).
- Map included in v1 if low-cost (FR12) — confirmed by you.
- Python crawler + TS serve/client, SQLite as the contract (§11) — decided by you.
- Schema-driven TS type generation across the DB boundary (§11).
- Content shown untranslated; `unknown` language included by default (§10).
- `Course`↔`Occasion` modeling and UI grouping (§9).
- Age range ~4–16.
