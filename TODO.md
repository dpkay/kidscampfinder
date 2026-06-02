# TODO

Forward-looking work items, split by area. (See also the admin dashboard's "true potential"
panel for live data-headroom estimates.)

---

# Frontend

## Migrate map markers to `AdvancedMarkerElement` (perf + un-deprecate)

**Why:** `google.maps.Marker` is deprecated (non-breaking — Google promises 12+ months notice
and ongoing bug fixes, so no rush). The real win is **performance**: `AdvancedMarkerElement`
is GPU/DOM-rendered far more efficiently than the legacy `Marker`, which is what forces the
current *hide-all-markers-during-zoom* workaround in `web/src/components/ClusteredMarkers.tsx`.
Migrating would very likely fix zoom smoothness **at the source** and let us delete that whole
hide/show + safety-timeout mechanism.

**What it needs:**
- A **Map ID** (free, ~2 min in Google Cloud Console → Maps → Map Management). AdvancedMarkers
  only render on a map that has a `mapId`. Add it to the `<Map mapId="…">` in `Explore.tsx`
  (env var, e.g. `VITE_GOOGLE_MAPS_MAP_ID`).
- Rewrite marker creation in `ClusteredMarkers.tsx`: `new google.maps.Marker({icon})` →
  `new google.maps.marker.AdvancedMarkerElement({content})`. The dot + hover-dot become small
  DOM/SVG elements; the cluster renderer's count-badge marker likewise becomes an
  `AdvancedMarkerElement` with HTML content.
- Verify `@googlemaps/markerclusterer` is fed `AdvancedMarkerElement`s (it supports them) and
  that the hover-sync (`setIcon`→swap `content`/CSS class) and click/mouseover listeners still
  work (AdvancedMarker uses `gmp-click` / `addEventListener` rather than `addListener("click")`).

**Then:** remove the wheel/touch/idle hide-show + safety-timeout block in `ClusteredMarkers.tsx`
and re-test zoom on a real phone.

**Effort:** moderate. **Blocker:** need the Map ID first.

## Smaller / nice-to-have

- **Filter sheet result count** (UX audit #2) — show a live "N Kurse anzeigen" on the filter
  sheet's apply button so you don't filter blind. Skipped earlier; revisit if it bugs us.
- **Content translation for EN** — UI + dates are localized, but course titles/descriptions
  stay German. Optional auto-translate (DE→EN) for the expat audience (PRD §10, deferred).
- **Card ↔ marker auto-scroll** — hover-sync highlights both ways; could also scroll the
  hovered marker's card into view in the sheet (currently highlight only).
- **Badge / gate `needs_verify` (discovered) courses** — the ~352 discovered long-tail rows are
  lower-trust; visually distinguish them (or add a toggle) so they're not mixed silently with
  trusted platform data on the public site. Pairs with the data-side re-extraction below.

---

# Data / crawler

## Verification + re-extraction pass for discovered courses  ⭐ (the real fix for the long tail)

**Why:** discovery now *finds* providers well, but the LLM extraction is **thin** — only ~24%
of discovered (Haiku-extracted) rows have age + price + date together (56% / 43% / 72%
individually). **VeraBJJ is the canary:** the pipeline discovers it organically, but its record
is title-only (null age/price/dates) even though those are plainly in the scraped page. So this
isn't a VeraBJJ bug — it's the general extraction-quality gap, and this pass is what closes it
the *right* way (uniformly, not by hand-patching individual providers).

**What it needs:**
- Re-extract each discovered page (re-use the dumped `discovery_out/pages/*.json`, or re-fetch
  from a Swiss IP) with a **focused, small-batch** LLM pass (small batches materially raise
  recall — see TDD §14b; 14-page batches ~tripled yield vs 26). Prompt it to specifically fill
  `age_min/max`, `price_chf`, and `occasions` (dates) when present in the text.
- **Verify** before clearing `needs_verify`: dates parse to 2026/2027, price is numeric, commune
  resolves (ideally to a real ZH commune), title looks like a real kids' holiday camp. An
  adversarial second pass ("is this actually a ZH kids' holiday course?") is cheap insurance.
- Re-ingest (idempotent via `kidscampfinder.discovery`); clear `needs_verify` only on rows that
  pass. Then `cd web && npm run export` to refresh the static JSON.
- **Measure recall/quality against held-out probes** (VeraBJJ as one of several) — do **not**
  special-case the probe (that's the overfitting trap we already hit).

**Productionize:** today extraction is run via Haiku **subagents**; the standalone version swaps
those for **Claude Haiku API** calls with a forced structured-output tool + prompt caching on
`EXTRACT.md` (needs `ANTHROPIC_API_KEY`). See TDD §14b.

**Effort:** moderate. **Impact:** high — this is what makes the discovered half trustworthy
enough to surface alongside platform data.

## Other data headroom (also shown in the admin "true potential" panel)

- **Other holiday periods (autumn/winter/spring)** — the biggest lever (~2× the Feriennet
  set). Only the active **summer** period is published on Feriennet right now; re-crawl when
  communes publish the other periods (distinct `period_ids`).
- **Deeper long-tail discovery** — more independent providers via **social media**
  (Instagram/Facebook — where many small providers actually post; the hard, unsolved part) and
  a broader search query matrix. ~92 providers found so far.
- **More Feriennet ZH commune instances** — a few standalone `<commune>.feriennet…` instances
  may exist beyond the 10 probed (long-tail, mostly tiny).
- **Logiscool** (Zürich coding) — deferred; bookable camps load behind a cookie-consent +
  booking widget (no programs API on render). Revisit via its booking API or a click-driven
  Playwright flow if it becomes worthwhile (codora already covers ZH coding).
- **ToS / scraping posture** — treated leniently for this local/personal project; revisit
  before any commercial use (PRD §13).
</content>
