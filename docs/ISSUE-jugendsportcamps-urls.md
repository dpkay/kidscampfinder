# Issue: jugendsportcamps.ch `source_url` values are all 404

**Owner:** crawler fork (`crawler/coursecrawler/adapters/jugendsportcamps.py`)
**Severity:** high — every one of the ~217 jugendsportcamps courses has a broken link-out.
**Reported from:** frontend (the "Zur Anbieter-Seite" button consistently 404s).

## Symptom

All jugendsportcamps courses store a `source_url` like:

```
https://www.jugendsportcamps.ch/de/camp/tanz-fabrik-camp-21
https://www.jugendsportcamps.ch/de/camp/reiten-auf-der-curlyranch-1
```

Opening any of these in a browser renders the site's SPA **404 page**:
> "Ooops! Seite leider nicht gefunden — Fehlercode: 404 Not Found"

(`curl` returns HTTP 200 for them because the site is a client-rendered SPA — it always
serves the 200 shell, then the JS router decides 404. So a status-code check passes; you must
render the page to see the 404.)

## Root cause

`jugendsportcamps.py` builds the detail URL from the API's `slug` field:

```python
API = "https://api.jugendsportcamps.ch/api/public-camps"
slug = camp.get("slug")
url  = f"https://www.jugendsportcamps.ch/de/camp/{slug}"   # <-- this pattern does not exist
```

**That URL scheme does not exist on the public site.** jugendsportcamps.ch is a search/map
SPA with **no stable per-camp detail URLs at all.**

## What was tested (all render the SPA 404)

| URL tried | Result |
|---|---|
| `/de/camp/<slug>` (e.g. `tanz-fabrik-camp-21`) | 404 |
| `/de/camp/<slug-without-suffix>` (`tanz-fabrik-camp`) | 404 |
| `/de/camp/<id>` (e.g. `23784`) | 404 |
| `/de/camp/<slug>-<id>` | 404 |
| `/de/sportcamp/<slug>`, `/de/camps/<slug>` | 404 |
| `/de/camps` (the listing route itself) | **404** |
| `/sitemap.xml` | returns the SPA shell, no camp URLs |
| homepage `/` | ✅ 200 (valid) |
| `/login` | ✅ valid |

The homepage's own nav only exposes `/` and `/login` as anchor `href`s — everything else
(camp list, map, camp details) is JS-driven with **no addressable URLs**. The `/de/camps`
listing page has zero `<a href>` camp links.

## The API (for reference)

`GET https://api.jugendsportcamps.ch/api/public-camps` returns camp objects:

```
keys: id, slug, enabled, title, city, lat, long, price, start_date, start_date_timestamp,
      end_date, end_date_timestamp, generation_from, generation_to, gender, j_and_s,
      teaser_image, organisation, sports_categories, signonState
```

Neither `slug` nor `id` maps to any reachable public page. There is no `url`/`link`/`seo`
field in the payload.

## Recommended fix (crawler)

Since there is no deep-linkable detail URL, **stop fabricating one.** Options, best first:

1. **Store the homepage** as `source_url`: `https://www.jugendsportcamps.ch/` (guaranteed
   valid; the homepage is the camp search/map UI). Simple and correct-ish.
2. If you can find a query-param the SPA honors (none was found in testing), build a
   pre-filtered search URL by city/sport/title so users land closer to the camp.
3. Add a `has_detail_url` / `detail_url IS NULL` notion so consumers can render "search on
   jugendsportcamps.ch" instead of a dead link.

## Related data-quality smell (worth a look while you're in there)

The jugendsportcamps rows contain many **duplicates and copies**:
- `TANZ-FABRIK CAMP` appears repeatedly with slug suffixes `-15 / -19 / -20 / -21`.
- Entries titled `Kopie - Einsteigerkurs Rudern` ("Kopie" = copy).

These look like template/draft/variant records from the API. Consider filtering out `Kopie -`
titles and de-duplicating obvious variants, or confirm they're genuinely distinct sessions.

## Interim frontend mitigation (already shipped, web fork)

`web/src/util.ts` → `linkOut(course)` overrides the link-out for `source.includes("jugendsport")`
to the homepage so the button no longer 404s. This is a **band-aid**; the real fix is to store
a valid `source_url` in the crawler so all consumers (and any future export) are correct. Once
the crawler stores a valid URL, the frontend override can be removed.

## Diagnosis (2026-06-01)

**The earlier report's conclusion was wrong.** A clean, per-camp deep link DOES exist. The
bug is a single spurious `/de/` path segment in the constructed URL. The slug itself is
correct — the API resolves it directly.

### Root cause

The adapter builds `https://www.jugendsportcamps.ch/de/camp/{slug}`. The SPA has **no
locale-prefixed routes at all**. Its real Vue router route for a camp detail page is
`/camp/:campSlug` — with **no `/de/` prefix**. Because `/de/camp/...` matches no defined
route, the client-side router falls through to the catch-all route
`/:pathMatch(.*)*`, which renders the "404 Not Found" component. That is exactly the SPA 404
the frontend saw. (And, as the report noted, every URL returns HTTP 200 from the static SPA
shell, so a status-code check can't see this — you have to inspect the route table / render.)

### Evidence

1. **The SPA route table** (extracted from the JS bundle
   `https://www.jugendsportcamps.ch/assets/index-BEpi5Tc2.js`). All defined paths:

   ```
   ""  "/"  "/:authorSlug([a-zA-Z0-9]{2,5})"  "/:pathMatch(.*)*"  "/backoffice"
   "/benutzer-aktivieren"  "/camp-bearbeiten/:campSlug"  "/camp-erstellen"
   "/camp-kopieren/:campSlug"  "/camp/:campSlug"  "/email-aktivieren"
   "/konto-editieren"  "/login"  "/logout"  "/passwort-aendern"
   "/passwort-wiederherstellen"  "/registrierung"  "/uebersicht"
   ```

   There is **`/camp/:campSlug`** but **no `/de/...` route of any kind**. `grep 'path:"/de'`
   on the bundle returns nothing, so `/de/camp/<slug>` is unmatched → catch-all → 404.

2. **The detail route fetches by slug**, confirming the slug is the right key. The component
   for `/camp/:campSlug` calls the API constant `PUBLIC_CAMP_DETAILS` (`= "/public-camp"`)
   with `{ camp: campSlug }`. Hitting that endpoint with a real slug returns the camp:

   ```
   $ curl -sS "https://api.jugendsportcamps.ch/api/public-camp?camp=sportcamp-schwyz"
   {"code":2000,"message":"camp loaded",...,"body":{"id":"23784","slug":"sportcamp-schwyz",
    "title":"«fit4future» Sportcamp Schwyz","city":"Schwyz, Switzerland",...}}
   ```

   So the slug from `public-camps` is valid and addressable; only the page path was wrong.

3. **Status codes** (all 200 because it's a static SPA shell — confirms the report's note
   that status alone is useless here; the difference is purely client-side routing):

   | URL tested | HTTP | Route match (from bundle) |
   |---|---|---|
   | `https://www.jugendsportcamps.ch/de/camp/sportcamp-schwyz` (current code) | 200 shell | none → catch-all → **renders 404** |
   | `https://www.jugendsportcamps.ch/camp/sportcamp-schwyz` (fix) | 200 shell | **`/camp/:campSlug` → renders the camp** |

   Real (slug, id) pairs used: `sportcamp-schwyz`/`23784`, `abenteuer-sport-herbst`/`23782`,
   `reitcamp-st-bernhard-herbst-4`/`23774` (from
   `https://api.jugendsportcamps.ch/api/public-camps?offset=0&limit=5`).

### Correct URL pattern

```
https://www.jugendsportcamps.ch/camp/{slug}
```

i.e. drop the `/de/` segment; keep the existing `slug`. (The slug, not the id, is the route
param — `/camp/:campSlug` and the `?camp=<slug>` API both key on slug.)

### Precise one-line code change (`jugendsportcamps.py`, line 86)

Current:
```python
        url = f"https://www.jugendsportcamps.ch/de/camp/{slug}"
```
Fixed:
```python
        url = f"https://www.jugendsportcamps.ch/camp/{slug}"
```

That single edit makes every `source_url` resolve to its real camp detail page. The
`web/src/util.ts` `linkOut` homepage override can be removed once the crawler re-runs with
this fix. (The duplicate / `Kopie -` data-quality note above still stands and is unrelated.)
