# Kids' Holiday Courses & Camps in Canton Zürich — Source Inventory

*Original research: June 2026. Confidence noted per item; unverified items marked
**[unverified]**. Feeds the "Sources" section of the PRD.*

*Updated 2026-06-02: implementation status + the discovery (long-tail) layer below. The
original research inventory further down is preserved as background. (Technical design of the
discovery pipeline lives in [`TDD.md`](TDD.md) §12.)*

---

## Implementation status (2026-06-02)

Platform sources actually crawled (dataset ≈ **1,090 raw / ~950 active courses**):

| Source | Status | Method | Notes |
|---|---|---|---|
| **Feriennet fleet** | ✅ | `adapters/feriennet.py` — one HTML parser, **10 ZH instances** | ferienplausch (regional, ~51 communes) + standalone communes (pfaeffikon, urdorf, neftenbach, thalwil, stadel, horgen, bachenbülach, glattfelden, oberengstringen), found by probing `<commune>.feriennet.projuventute.ch` (unknown → 302 "notfound"). |
| **ferienprogramm.ch** | ✅ | `adapters/ferienprogramm.py` (static cards) | Winterthur–Thurgau; school-grade→age. |
| **jugendsportcamps.ch** | ✅ | `adapters/jugendsportcamps.py` — **public JSON API** | National ~880 → kept ~217 in a ZH bbox. Detail URL `/camp/<slug>` (see `ISSUE-jugendsportcamps-urls.md`). |
| **codora.ch** | ✅ | `adapters/codora.py` (WordPress/MEC) | Zürich coding/robotics. |
| **friLingue** | ✅ | `adapters/frilingue.py` (static) | Swiss **residential language** camps (mostly non-ZH). |
| **Logiscool** | ⏸ deferred | — | Booking-widget walled; low ROI (codora covers ZH coding). |

**No headless browser is used** in the platform adapters — every shipped source is a JSON API
or server-rendered HTML.

## Discovery layer — the long tail

Platform adapters only see providers that *list on a platform*. Independent provider sites (a
gym's own page, a Wix studio) are invisible to that — which is how we initially missed
`verabjj.ch`. The discovery layer closes the gap (technical design: [`TDD.md`](TDD.md) §12):

```
local scout (Startpage search, Swiss IP) → per-domain nav-link crawl → dump pages
   → Haiku-subagent extraction (small batches) → dedup → ingest source="discovered:<domain>"
```

- **Must run from a Swiss IP.** The hosted agent egresses US → US-localized, consent/CAPTCHA-
  walled results that never surface hyperlocal ZH gyms. A residential/VPN Swiss IP via
  **Startpage** (Google results, no wall, no browser) returns the real Zürich-local results.
- A broad query matrix surfaced **189 candidate domains**; crawling all of them + small-batch
  Haiku extraction yielded **~355 discovered courses across ~93 long-tail providers** — dance
  schools, judo/BJJ clubs, music/theatre camps, science labs, sport weeks, adventure camps:
  exactly the diversity platforms miss.
- **Lower trust.** Discovered rows carry `needs_verify=true` + a confidence score; extraction
  quality is uneven (Haiku sometimes gets a title but misses age/price/dates present in the
  text). Treat as candidates — badge/gate for any public deploy.
- **Held-out recall test.** `verabjj.ch` was withheld as ground truth; with the domain cap
  removed and small extraction batches, the pipeline re-discovers it **organically** (search
  rank #172 → nav crawl → extraction), confirming general recall rather than a one-off patch.
- **Caveats:** out-of-canton spill (near-border providers like Baar/ZG, Risch-Rotkreuz/ZG —
  stored with true commune, filtered by the web layer's `inZH`/Bezirk lookup); discovered
  courses mostly lack local images (topic placeholder); a verification pass (re-check
  dates/age/price, clear `needs_verify`) is the recommended next step.


**Complete discovered-provider list:**

<details>
<summary><b>All 93 discovered providers</b> (snapshot 2026-06-02, 355 courses; canonical machine-readable list = <code>crawler/discovery_seed.json</code>)</summary>

| provider | n | provider | n | provider | n |
|---|--:|---|--:|---|--:|
| `11ts-academy.ch` | 16 | `judo-club-uster.ch` | 1 | `reiten-total.ch` | 1 |
| `academicus.co` | 1 | `kampfkunstzuerich.ch` | 1 | `reitschulekolbenhof.ch` | 1 |
| `aquakidz.ch` | 9 | `karate-schulen.ch` | 1 | `reitstallzumaettenberg.ch` | 1 |
| `baholz.ch` | 2 | `kikuka.ch` | 3 | `risingstar-tennis.ch` | 3 |
| `bauernhof-ferien.ch` | 2 | `kinder-camps.ch` | 4 | `robomatik.ch` | 1 |
| `begleitetesmalen.com` | 2 | `kindersportwoche.ch` | 6 | `sah-schweiz.ch` | 4 |
| `bjjcampfinder.com` | 1 | `kinderthur.ch` | 1 | `sail.ch` | 1 |
| `bjjglobetrotters.com` | 1 | `kletterschule.ch` | 4 | `schildkroetli-swimmers.ch` | 1 |
| `budo-wil.ch` | 1 | `kungfufighting.ch` | 1 | `schwimmschulepape.ch` | 1 |
| `buehnerei.ch` | 2 | `limmatsharks.com` | 2 | `she-ceramics.ch` | 1 |
| `camprock.ch` | 9 | `littlescientists.ch` | 1 | `simplytheatre.com` | 1 |
| `chess4kids.ch` | 4 | `lolabrause.ch` | 8 | `sparkscience.ch` | 5 |
| `chlini-einsteins.ch` | 4 | `lordz.ch` | 10 | `sports-professionals.ch` | 3 |
| `circusbellissimo.ch` | 1 | `malspielraum.ch` | 11 | `ss.scmeilen.ch` | 3 |
| `closeencounterstheatre.com` | 1 | `mental-stark4.com` | 9 | `startbahn29.ch` | 16 |
| `codecampworld.ch` | 11 | `metzenthin.ch` | 1 | `swiss-barcaacademy.com` | 7 |
| `dance4fun.ch` | 1 | `moving-sportcamps.ch` | 7 | `tanz-zwicky.ch` | 2 |
| `dancegallery.ch` | 4 | `mssports.ch` | 5 | `techsparkacademy.ch` | 3 |
| `en.artiloft.ch` | 8 | `musicalcamp.ch` | 7 | `theater-purpur.ch` | 1 |
| `explorit.ch` | 1 | `newdanceacademy.ch` | 1 | `toepferei8008.ch` | 2 |
| `faeger.ch` | 1 | `nextleveltennis.ch` | 2 | `twist-tkd.ch` | 2 |
| `fcwitikon.ch` | 4 | `pferde-erlebnisse.ch` | 1 | `verabjj.ch` | 3 |
| `fcz.ch` | 11 | `plusport.ch` | 7 | `wassersport-camp.ch` | 3 |
| `ffzh.ch` | 5 | `pony-reitschule.ch` | 3 | `wwf-zh.ch` | 1 |
| `filacro.ch` | 4 | `ponyakademie.ch` | 1 | `xlabs.ch` | 8 |
| `filmkids.ch` | 8 | `ponyreiten-dietlikon.ch` | 3 | `yenhan-dancecenter.ch` | 2 |
| `frmclinics.ch` | 9 | `ponyreitenzuerich.ch` | 2 | `youngexplorersclub.ch` | 3 |
| `gc-amicitia.ch` | 2 | `projektwoche.ch` | 2 | `zirkusquartier.ch` | 4 |
| `horatkeramik.com` | 1 | `rainbow-ranch.ch` | 2 | `zsf.ch` | 4 |
| `insideout-tennis.com` | 2 | `reformiert-zuerich.ch` | 6 | `zuerich.krebsliga.ch` | 2 |
| `insieme-zuerich.ch` | 16 | `reiten-erleben.ch` | 6 | `zuerioberland24.ch` | 2 |

</details>
---

## Appendix — original research report (June 2026, background)

*Historical context only. The plan it proposed (including the crawl strategy) has been
**executed** — see **Implementation status** and **Discovery layer** at the top of this file.*

### Executive summary

The key finding: **Pro Juventute's "Feriennet"** is a shared, open-source booking
platform (`onegov.feriennet`, built on **OneGov Cloud** by **Seantis GmbH**) that powers
**210+ Ferienpässe across Switzerland**, each on its own subdomain
(`<name>.feriennet.projuventute.ch`). They all share identical HTML structure, URL filter
grammar, and data model. **One adapter crawls the entire Feriennet fleet** — by far the
highest-value target. A second, smaller shared platform is **ferienprogramm.ch**
(Winterthur region). Everything else is single-commune sites, cantonal programs, or
private providers with bespoke HTML.

---

## 1. Shared platforms (HIGH crawl value)

### 1.1 Pro Juventute "Feriennet" — primary target

- **What:** Booking platform for supervised holiday offers, operated by **Pro Juventute**,
  built on open-source **OneGov Cloud / `onegov.feriennet`** (vendor **Seantis GmbH**).
  Source on GitHub (`OneGov/onegov-cloud`) and PyPI (`onegov.feriennet`).
- **Scale:** **210+ Ferienpässe nationally** since 2010; each instance region/commune-scoped.
- **Offerings:** Mostly free/low-cost communal Ferienpass activities (sports, crafts,
  baking, farm days, excursions, theatre, water sports) plus some paid camps.
- **Age:** Typically **6–16** (Zürich instance); platform filter spans 0–16+.
- **URL pattern (key for crawling):** `https://<organization>.feriennet.projuventute.ch/activities`
  - Filter grammar consistent: `…/activities?filter=municipalities%3A<Name>+period_ids%3A<uuid>&page=N`
  - Facets: municipalities (51 in ZH instance), categories (33), age, price band, week,
    weekday, duration, free-spots.
- **Per-activity public HTML data:** title, age range, price ("ab 50.00 CHF"),
  available-spots count, category, dates. Provider/org name usually NOT on the card.
- **Data model (open source):** `Activity` (stable content) → `Occasion` (date/period
  instance) → `Booking`, grouped by `Period`. Maps cleanly to a normalized schema.
- **Structured data / API:**
  - **No public JSON catalog API.** CSV/Excel/JSON export exists but is **admin-only**.
  - Public iCal/ICS exists but is the **per-attendee booking calendar** (personal,
    token-bound) — NOT a public catalog feed. Not usable for bulk.
  - **Practical conclusion:** crawl the public, paginated, filterable HTML `/activities`
    listing. One parser works across all 210+ instances.
- **ToS / scraping:** Each instance links AGB/Datenschutz; full legal text not readable via
  fetch. No explicit anti-scraping clause observed but **[unverified — confirm per instance]**.
- **URLs:**
  - Platform / how communes join: https://www.projuventute.ch/de/eltern/lehrpersonen-fachpersonen/feriennet/
  - **Elternkompass** central directory (~4,151 offerings, filter region/age, links into
    each booking site): https://kompass.projuventute.ch/ — use to **enumerate every
    Feriennet instance** to crawl.
  - Source: https://github.com/OneGov/onegov-cloud • https://pypi.org/project/onegov.feriennet/
  - Data-model docs: https://onegov.github.io/onegov-cloud/feriennet.html
- **Business note:** Feriennet charges operators CHF 1/booking (Ferienpässe) or
  CHF 2/booking (camp providers); no setup/annual fee.

### 1.2 Ferienplausch Zürich (flagship Feriennet instance for the canton)

- **Listings:** https://ferienplausch.feriennet.projuventute.ch/activities
- **Operator:** **Verein Ferienplausch** (assoc., Hedingen) — uses Pro Juventute's Feriennet
  platform; older sources call it "Pro Juventute Ferienplausch."
- **Offerings:** 250–300+ half-/full-/multi-day supervised courses. **Age 6–16.**
- **Coverage:** **51 municipalities** across the Zürich region (incl. Zürich, Winterthur,
  regions Affoltern am Albis and Meilen).
- **Companion:** **ZVV-FerienPass** (Zürcher Verkehrsverbund) — separate ~CHF 30
  transit/admission pass, ages 6–16. https://www.zvv.ch/de/freizeit-und-events/ferienpass.html

### 1.3 ferienprogramm.ch — secondary shared platform (Winterthur region)

- **URL:** https://ferienprogramm.ch/ (courses: https://ferienprogramm.ch/kurse/)
- **Operator:** small independent **association** (Winterthur); providers self-upload,
  small per-booking admin fee. Not Pro Juventute, not OneGov.
- **Offerings:** Holiday/leisure courses, kindergarten→upper secondary; spring/autumn
  emphasis. Open regardless of residence.
- **Coverage:** Winterthur + nearby (Frauenfeld, Illnau-Effretikon, Fällanden, etc., into TG).
- **Data:** None visible — **plain HTML scrape**. ToS unclear **[unverified]**.

---

## 2. Individual commune / cantonal programs

| Program | URL | Operator | Offerings / age | Platform | Data |
|---|---|---|---|---|---|
| Stadt Zürich Ferienplausch (Sport) | https://www.stadt-zuerich.ch/de/stadtleben/sport-und-erholung/sport-fuer-kinder-jugendliche/veranstaltungen/ferienplausch.html | Stadt Zürich Sportamt | City sports, summer weeks 1 & 5; all ages | Bookings via Feriennet (folds into fleet crawl) **[partly unverified — name collision]** | HTML + Feriennet |
| Stadt Zürich – Ferienangebote hub | https://www.stadt-zuerich.ch/ferienangebote-fuer-kinder | Stadt Zürich | Hub linking city holiday offers | n/a | HTML |
| Kanton Zürich Jugendsportcamps | https://www.zh.ch/de/sport-kultur/sport/kinder-jugendsport/jugendsportcamps.html → https://www.jugendsportcamps.ch | Kanton ZH Sportamt | ~30 camps, 1,300+ kids/yr; ski, climbing, dance, ball sports, windsurf; age per camp | bespoke | Searchable DB, **no API**; scrape |
| Ferienpass Wädenswil | https://www.ferienpass-waedenswil.ch | Commune Wädenswil | Camp, pony, rowing, climbing; bundles ZVV pass | **[unverified — Feriennet or bespoke?]** | HTML |
| Stadt Winterthur – Ferien-/Freizeitangebote | https://stadt.winterthur.ch/themen/leben-in-winterthur/kinder-jugendliche-und-familien/ferien-und-freizeitangebote | Stadt Winterthur | Holiday care + sports; links out | bespoke / links out | HTML |
| DWS Feriensportkurse (Winterthur) | https://dwswinterthur.ch/index.php/feriensportkurse | Sports umbrella assoc. | Daytime sports courses | bespoke | HTML |

**Communes within the ZVV-FerienPass / Ferienplausch ambit** (pass via Migros, activities
on Feriennet): Dietikon, Dübendorf, Kloten, Uster, Wädenswil, Wetzikon, Winterthur, plus
smaller (Geroldswil, Glattfelden, Maschwanden). For Uster/Dübendorf/Kloten/Dietikon/Wetzikon
no separate booking portal found — appear **subsumed by the Ferienplausch Zürich instance**
**[partly unverified per commune]**.

**Other Feriennet instances (fleet illustration, not all ZH):** `chur.`, `uznach.`,
`rupperswil.`, `solothurn.`, `brig.`, `zurzach.`, `regioferienpass.` — enumerate the ZH
subset via Elternkompass.

---

## 3. Private providers / aggregators serving Zürich

| Provider | URL | Offerings / age | Coverage |
|---|---|---|---|
| Logiscool Zürich | https://www.logiscool.com/en-ch/locations/zurich/camps | Coding/digital/AI camps, 30+ topics | Zürich + national |
| Code Camp Switzerland | https://www.codecampworld.ch/unsere-camps | Kids' programming camps | Regional |
| codora | https://codora.ch/sommerferiencamps-fuer-kinder-und-jugendliche/ | Tech/skills summer camps | Regional |
| friLingue | https://www.frilingue.ch/feriencamp-schweiz | Language + sport camps, 8–17 | National |
| Lyceum Alpinum Zuoz | https://www.lyceum-alpinum.ch/de/feriencamp-schweiz/sommercamp/ | Language/sport/IT/theatre summer camp | National (GR) |
| Kinder-Camps | https://kinder-camps.ch/camp-angebot/ (book: https://anmeldung.kinder-camps.ch/) | Polysport, football, dance, martial arts | National, filterable |
| Camprock | https://www.camprock.ch/ | Nature/sport/adventure, 9–16 | National |
| Mental-Stark4 | https://mental-stark4.com/feriencamp-kinder/ | Sport/holiday camps | Zürich |
| Zoo Zürich Ferienangebote | https://www.zoo.ch/de/erlebnisse-im-zoo/erlebnisse/ferienangebote-fuer-kinder | Nature/animal courses | Zürich |
| Zürcher Tierschutz – Jugend | https://www.zuerchertierschutz.ch | Animal-protection holiday courses | Zürich |

---

## 4. Existing aggregators / competitors

| Name | URL | What it does | Overlap |
|---|---|---|---|
| **Pro Juventute Elternkompass** | https://kompass.projuventute.ch/ | ~4,151 offerings, filter region/age, links into Feriennet booking sites — Pro Juventute's own meta-directory | **High** — already aggregates the Feriennet fleet; also a useful enumeration seed |
| campcheck24 | https://campcheck24.com/ | Camp/language-trip comparison DE/AT/CH/EU | Medium |
| Ferien 4 Kids | https://www.ferien4kids.at/ | "Largest" holiday-camp platform, direct booking | Medium (AT) |
| Kinder-Camps | https://kinder-camps.ch/ | Camp directory + booking | Medium |
| Famigros (Migros) | https://famigros.migros.ch/.../ferienkurse-fuer-kinder | Family-courses listing | Low/med |
| lolabrause.ch | https://lolabrause.ch/ | Swiss family leisure calendar | Low (events) |
| ronorp | https://ronorp.net/zurich/rons-tips/family-life | Zürich family tips | Low |
| familienleben.ch | https://www.familienleben.ch/ | Family tips/excursions | Low |
| zh.ch family overview | https://www.zh.ch/de/familie/... | Cantonal hub (mostly 0–5) | Low |

No competitor does a clean, structured, **canton-Zürich-wide crawl/aggregation of bookable
kids' holiday courses** as intended — **Elternkompass is the nearest**, limited to the Pro
Juventute ecosystem.

---

## 5. Crawl strategy — EXECUTED

The strategy this report proposed has been implemented; see **Implementation status** (top).
In short: the Feriennet fleet (one parser, 10 ZH instances) + ferienprogramm + jugendsportcamps
(via its JSON API) + codora + friLingue were built, then the **discovery layer** added ~93
long-tail providers. Logiscool was the one recommended target deferred (booking-widget walled).

*Residual open item from the original research:* ToS/Datenschutz was treated leniently for this
local/personal project — revisit before any public/commercial use (see PRD §13). The original
Feriennet name-collision and per-commune-portal questions were resolved during implementation.
