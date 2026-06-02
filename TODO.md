# TODO

Forward-looking work items. (Crawler/data headroom lives in the README "Status & next steps".)

---

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

---

## Smaller / nice-to-have

- **Filter sheet result count** (UX audit #2) — show a live "N Kurse anzeigen" on the filter
  sheet's apply button so you don't filter blind. Skipped earlier; revisit if it bugs us.
- **Content translation for EN** — UI + dates are localized, but course titles/descriptions
  stay German. Optional auto-translate (DE→EN) for the expat audience (PRD §10, deferred).
- **Card ↔ marker auto-scroll** — hover-sync highlights both ways; could also scroll the
  hovered marker's card into view in the sheet (currently highlight only).
