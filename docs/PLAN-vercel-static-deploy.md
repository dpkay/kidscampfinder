# Plan: Deploy CourseCrawler to Vercel as a static site (Scope A)

> **Status:** approved, not yet implemented.
> **Audience:** any agent working on the deploy. Read this before touching `web/`.
> **One-line summary:** Eliminate the runtime Express server. Ship the SPA + pre-generated
> static JSON to Vercel. The crawler is **unchanged** and keeps using SQLite internally.

---

## 0. For the executing agent — read first

- **Repo root (absolute):** `/home/dpkay/sandbox/20260601-coursecrawler`. Every path below is
  relative to it. Run all web commands from `web/`.
- **Prereqs already in place:** Node + npm; `web/node_modules` is installed (incl. `tsx`,
  `better-sqlite3`, `vite`). The SQLite DB exists locally at `data/coursecrawler.sqlite`
  (gitignored) and images at `data/images/` (gitignored, ~708 files / ~162 MB). You do not need
  to install anything or run the crawler.
- **Your ownership boundary (IMPORTANT — another agent is working in parallel):** you own
  **`web/`** (the SPA + the new export script) and a new **`vercel.json`**. You do **NOT** own
  `crawler/` or `data/`. **Another agent may be actively editing `crawler/`/`data/` right now.**
  Treat `data/coursecrawler.sqlite` and `data/images/` as **read-only inputs**. Do not run the
  crawler, do not regenerate or move the DB, do not edit anything under `crawler/`. If the data
  shape looks wrong, surface it — don't "fix" it upstream.
- **DB freshness / serialization:** the export reads `data/coursecrawler.sqlite`. If a crawl may
  be in progress, run the export only against a settled DB (no active writer) — otherwise the
  JSON captures a half-finished crawl. Coordinate with the data agent on timing if unsure.
- **Hard stop before live deploy:** implement everything and verify **locally** (§8). Do **NOT**
  run `vercel login` / `vercel --prod` yourself — login is interactive and user-driven.
  Authoring `vercel.json` + writing down the env-var steps is in scope; actually pushing to
  Vercel is **out of scope** and left to the user.
- **Hand back:** the diff (new export script, refactored `api.ts` + new `filter.ts`, server
  wiring removed, `vercel.json`), the generated `web/public/api/*.json`, and confirmation the
  client build contains **no `better-sqlite3`**.

## 1. Why we're doing this

The app today is a Vite/React SPA backed by an Express server (`web/server/index.ts`) that
opens a **read-only SQLite DB** with the native module `better-sqlite3` and serves
`/api/*` + `/images/*`. Vercel is serverless: no long-running server, no persistent local
filesystem, and native modules + a local SQLite file are awkward there.

Crucially, **the data is read-only at request time** — it only ever changes when the crawler
runs (a batch job on the user's machine). So there is no reason to have a server in the
request path at all. We pre-compute everything to static JSON at build time and serve it
from Vercel's CDN.

## 2. The decision (and what was explicitly rejected)

We are doing **Scope A**, NOT Scope B.

- **Scope A (this plan):** The crawler stays 100% as-is — SQLite remains its private internal
  format. We add a **build-time export step** that reads the SQLite read-only and dumps JSON.
  Vercel serves the JSON statically. `better-sqlite3` survives **only** in that export script,
  which runs on the user's machine — **never on Vercel**.
- **Scope B (rejected for now):** Rip SQLite out of the crawler too. Deferred — it's a separable
  ~half-day refactor of 7 files. Do **not** start it as part of this work.

> **Do NOT** "helpfully" rewrite the crawler, change `crawler/coursecrawler/db.py`, or remove
> SQLite from the crawler. That is out of scope. If SQLite in the crawler looks like dead weight
> to you — it's intentional for now; see `docs/` history / ask the user.

## 3. Architecture: before → after

**Before (local dev today):**
```
crawler (python + sqlite)  ->  data/coursecrawler.sqlite + data/images/
                                          |
                          Express (better-sqlite3, :8787)
                            /api/meta, /api/courses?<filters>, /api/course/:id, /api/admin
                            /images/*
                                          |
                                   Vite SPA (:5173, proxies /api + /images)
```

**After (Scope A, on Vercel):**
```
crawler (python + sqlite)  ->  data/coursecrawler.sqlite + data/images/   [unchanged, local only]
                                          |
              [LOCAL build step] export script (better-sqlite3, read-only)
                                          |
                  web/public/api/courses.json, meta.json, admin.json   (committed)
                  web/public/images/*                                   (committed or Blob — see §6)
                                          |
                                   Vite build  ->  static dist/
                                          |
                                    Vercel CDN (no server, no functions)
                            SPA fetches courses.json ONCE, filters in-browser
```

**Key invariant other agents must respect:** Vercel runs **only `vite build`**. It has no DB,
no Python, no crawler. The JSON and images are **committed build inputs**, produced by a local
step. Vercel never sees SQLite.

## 4. Where the server's logic goes

`web/server/index.ts` does three things. Each moves somewhere:

| Server responsibility | Function today | Moves to |
|---|---|---|
| Reshape rows → nested `Course[]`, build `Meta` | `loadCourses()`, `buildMeta()` | **Export script** (run locally, writes `courses.json` + `meta.json`) |
| Admin aggregations | `buildAdmin()` | **Export script** (writes `admin.json`) |
| Filtering `/api/courses?week=…` | `applyFilters()` | **Client-side** (SPA filters the in-memory array) |
| Static file serving (`/images`, SPA fallback) | `express.static` | **Vercel CDN** (static assets + `vercel.json` rewrite) |

The reshape/aggregate code already exists and is correct — the export script is largely a
copy of `loadCourses`/`buildMeta`/`buildAdmin` that writes to disk instead of `res.json()`.

## 5. Concrete work items

### 5a. New: export script — `web/scripts/export.ts`
- Open `data/coursecrawler.sqlite` read-only with `better-sqlite3` (reuse `CC_DB` env override
  like the server does). From `web/scripts/export.ts`, the repo root is `path.resolve(__dirname,
  "..", "..")` → DB at `<root>/data/coursecrawler.sqlite`, images at `<root>/data/images/`.
- Reuse the existing `loadCourses()` / `buildMeta()` / `buildAdmin()` logic **verbatim** —
  copying it from `web/server/index.ts` is fine (the server is being deleted, so no shared-module
  wiring is needed). Copy these together, they're interdependent:
  - `loadCourses()`, `buildMeta()`, `buildAdmin()`, `applyFilters()` (filter goes client-side —
    see §5b — but copy it out before deleting the server).
  - the helpers `todayISO()` and `isoWeekDates()`.
  - the imports `communeInfo` and `bezirkSortKey` from `web/shared/bezirk.ts`, and the
    `Course` / `Occasion` / `Meta` / `WeekInfo` types from `web/shared/types.ts`.
  None of these touch Express — they're pure functions over DB rows / arrays.
- Write:
  - `web/public/api/courses.json`  → `{ count, courses: Course[] }` (the full set, all 748)
  - `web/public/api/meta.json`     → `Meta`
  - `web/public/api/admin.json`    → `AdminData`
- Run via a package.json script, e.g. `"export": "tsx scripts/export.ts"`.
- **WAL note:** the live DB has a `-wal` sidecar. Opening read-only reads committed state, which
  is fine. If data looks stale, run a `PRAGMA wal_checkpoint` in the crawler or open the DB
  normally once before exporting. Don't copy the `-wal`/`-shm` files to Vercel.

### 5b. Client-side filtering refactor
- `web/src/api.ts`:
  - `fetchMeta()` → `fetch("/api/meta.json")` (static).
  - `fetchAdmin()` → `fetch("/api/admin.json")` (static).
  - `fetchCourses(filters)` → fetch `/api/courses.json` **once** (cache the result in a module
    variable / promise), then apply `applyFilters` **in-memory** and return the filtered slice.
- Port `applyFilters()` from `web/server/index.ts` into a client util (e.g. `web/src/filter.ts`)
  — it's pure (array in, array out), no DB calls. Keep the exact same filter semantics
  (week / age overlap / bezirk / commune / topic / cost / format / maxPrice / q / bbox / sort).
- `web/src/components/Explore.tsx` already filters bbox client-side (`visible` memo) and fetches
  the whole set per filter-change — so the call site barely changes; it just resolves against
  the cached JSON instead of the network.
- The static JSON paths (`/api/*.json`) work in dev too because they live under `web/public/`
  (Vite serves `public/` at root). The dev proxy in `vite.config.ts` for `/api` + `/images`
  can be **removed** once the server is gone — but keep it until the cutover is verified.

### 5c. Delete the runtime server
- Remove `web/server/index.ts` from the production path. (Can keep it in git history; just stop
  building/running it.) Drop the `dev:api` / `api` npm scripts and `concurrently` once the SPA
  reads static JSON.
- Move `better-sqlite3` (+ `@types/better-sqlite3`) so it's only needed by the export script.
  It must NOT end up in anything Vercel installs/builds for the client. Simplest: keep it as a
  `devDependency` and ensure the Vercel build command is just `vite build` (no export).

### 5d. Build & Vercel wiring
- **`vercel.json`** (repo root or `web/`): set the project root to `web/`, build command
  `vite build` (or `npm run build`), output dir `dist`, framework `vite`, and an SPA fallback
  rewrite so client routes return `index.html`:
  ```json
  { "rewrites": [{ "source": "/((?!api/|images/|assets/).*)", "destination": "/index.html" }] }
  ```
  (Tune the negative-lookahead to whatever folders hold real static files.)
- **Vercel build does NOT run the export** (no DB present). Workflow is:
  1. locally: run crawler → `npm run export` → commit the regenerated `web/public/api/*.json`
     (and images, per §6) → push.
  2. Vercel auto-builds `vite build` and deploys.
- Provide a convenience local script, e.g. `"deploy:data": "npm run export && git add web/public/api web/public/images && git commit -m 'data refresh' "` (optional).

### 5e. Google Maps key
- `web/.env` has `VITE_GOOGLE_MAPS_API_KEY` (gitignored). It's a `VITE_` var → embedded in the
  client bundle (public by nature). Add it in the **Vercel project env vars** so the build picks
  it up. Recommend restricting the key by HTTP referrer to the Vercel domain in Google Cloud.

## 6. Images (162 MB, 708 files) — DECIDED: commit them

> **Decision (confirmed by the user): Option 1 — commit the images into the repo.** No open
> branch remains; implement this directly.

**Implementation:**
- Copy all files from `<root>/data/images/` into `web/public/images/` and commit them.
  (`data/` is gitignored; `web/public/images/` is tracked.)
- Vercel's CDN then serves them at `/images/*`, which **already matches** the existing
  `imagePath` values ("images/<hash>.png", consumed in `CourseDetail.tsx` / `Explore.tsx` as
  `"/" + imagePath`). So there is **no code change** for images — only the file copy + commit.
- This adds ~162 MB to git history. That is acceptable here and was explicitly approved: the
  filenames are content/URL hashes, so future re-exports only add *new* images rather than
  rewriting existing ones (history won't balloon on each crawl).
- Make sure `web/public/images/` is **not** caught by a `.gitignore` rule (the existing ignore is
  for `data/`, so this is fine, but verify the copy is actually tracked before relying on it).

> Rejected alternative (do not implement): hosting images on Vercel Blob / an external bucket with
> URL rewriting. Kept here only so a reader knows it was considered.

## 7. What does NOT change (do not touch)

- The entire `crawler/` tree (Python). SQLite stays the crawler's internal store.
- `crawler/coursecrawler/db.py`, `schema.sql`, ingestion, dedup, geo, images stages.
- The `Course` / `Meta` / `AdminData` TypeScript shapes in `web/shared/types.ts` and
  `web/src/api.ts` — the JSON is exactly these shapes, so types are reused as-is.

## 8. Acceptance criteria

- [ ] `npm run export` produces `web/public/api/{courses,meta,admin}.json` from the SQLite DB.
- [ ] `npm run build` (just `vite build`) succeeds with **no `better-sqlite3` in the bundle**.
- [ ] SPA loads, lists courses, all filters work (week/age/bezirk/commune/topic/cost/format/
      price/search/map-bbox), course detail opens, images render, `/admin` renders.
- [ ] No `/api/*` network calls hit a server — only static `*.json` fetches.
- [ ] Deployed to a Vercel URL; Maps renders with the env-var key.
- [ ] Crawler still runs unchanged and a re-export reflects new data after redeploy.

## 9. Deploy mechanics (CLI)

The `vercel` CLI is fully non-interactive (scriptable by an agent) **except** the one-time
login. The user runs `! vercel login` once in-session; after that an agent can do
`vercel link`, `vercel env add VITE_GOOGLE_MAPS_API_KEY`, `vercel --prod --yes`, etc.
GitHub repo: `git@github.com:dpkay/kidscampfinder.git` (currently out of date — has no `data/`
and no built frontend, both gitignored; this plan changes what's committed under `web/public/`).

---

## 10. Migration log — IMPLEMENTED 2026-06-02 (local; deploy pending user)

Executed by the data/crawler agent (frontend agent stood down for this). Local verification
passed; the live `vercel` step is left to the user (§0 hard stop).

**Created**
- `web/scripts/export.ts` — read-only `better-sqlite3` export. Lifts `loadCourses()` /
  `buildMeta()` / `buildAdmin()` + `todayISO()` / `isoWeekDates()` **verbatim** from the
  *current* `web/server/index.ts` (incl. bezirk/`communeInfo`, bbox, past-week filter,
  chronological week sort, `Meta.bezirke`/`maxPrice`). Honors `CC_DB`; DB at `<root>/data/`.
  Writes `web/public/api/{courses,meta,admin}.json`. Run via `npm run export`.
- `web/src/filter.ts` — `applyFilters()` ported verbatim as a pure fn (sorts a copy, since the
  source array is now a shared cache).
- `web/vercel.json` — framework `vite`, build `vite build`, output `dist`, SPA-fallback rewrite
  excluding `/api/`, `/images/`, `/assets/`.

**Changed**
- `web/src/api.ts` — `fetchMeta`→`/api/meta.json`, `fetchAdmin`→`/api/admin.json`;
  `fetchCourses` fetches `/api/courses.json` **once** (module-level cached promise) then filters
  in-memory via `filter.ts`. Signatures/return shapes unchanged → call sites untouched.
- `web/vite.config.ts` — `basicSsl()` gated to `command === "serve"` (so prod `vite build`
  doesn't load the dev-only SSL plugin); removed the `/api` + `/images` dev proxies.
- `web/package.json` — `dev`→`vite`, `dev:host`→`vite --host`, added `export`; dropped
  `dev:api`/`api`/`dev:vite`/`concurrently`. `better-sqlite3` → devDependency; removed unused
  `express` + `@types/express` (only the retired server used them).
- `web/src/util.ts` — **deleted the jugendsportcamps homepage band-aid**; `linkOut` now returns
  `course.sourceUrl` for all sources (the crawler fixed the `/camp/<slug>` URLs at source — see
  `docs/ISSUE-jugendsportcamps-urls.md`).
- `web/server/index.ts` — left on disk (git history), no longer in dev/build path.
- Image `src` sites (`CourseDetail.tsx`, `Explore.tsx` `"/" + imagePath`) — **not** touched
  (Option 1 keeps relative `images/<hash>` paths correct).

**Images (§6, Option 1):** 708 files copied `data/images/` → `web/public/images/` and committed
(~162 MB). Served by Vercel CDN at `/images/*`, matching existing `imagePath`. (`.gitignore`
entry that briefly excluded them was removed.)

**Verification**
- `npm run export` ✓ wrote all three JSONs.
- `npm run build` ✓ (`dist/assets/index-*.js` ≈ 235 KB / 77 KB gz).
- **No `better-sqlite3` in the client bundle** ✓ (grep of `dist/assets/` is clean).
- `courses.count == courses.length == meta.total`.

**Findings / notes**
- **`courses.json` holds 687 courses, not 748/805.** This is correct, not a bug: `loadCourses()`
  drops `dup_of` rows and **fully-past** courses (all occasions ended before today). `admin.json`
  reports the raw totals (805 rows, 8 dups, 1164 occasions). The figure is **date-sensitive** and
  drops as occasions pass; a re-export after each crawl refreshes it. The ~69 discovered/
  `needs_verify` rows are **included** (they are not what gets filtered — only dups/fully-past
  are).
- **Re-deploy workflow:** locally `python -m coursecrawler.run` → `cd web && npm run export` →
  `git add web/public/api web/public/images && commit && push` → Vercel rebuilds.
- **Pre-existing (out of scope):** `web/src/components/Explore.tsx:159` references `onBack` /
  `t("close")` not in scope there. Did **not** block `vite build` (Vite/esbuild doesn't run
  `tsc`). Flag for the frontend agent.
- **README** still documents the old two-server (`npm run api`, :8787) dev flow — now stale;
  needs a post-cutover pass (frontend agent offered to do it).
- This commit also snapshots the frontend agent's prior **uncommitted** UI refactor (Google Maps
  map view, `Explore`/`BottomSheet`/`FilterSheet`, `bezirk`/`inZH`) — first time it's in git, so
  the committed `web/` is internally consistent and buildable.

**Remaining for the user (live deploy):** `! vercel login` (once, interactive) → then an agent
can `vercel link` + `vercel env add VITE_GOOGLE_MAPS_API_KEY` (referrer-restrict the key) +
`vercel --prod --yes`.
