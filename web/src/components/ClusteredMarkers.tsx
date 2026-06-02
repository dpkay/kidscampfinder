import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Renderer } from "@googlemaps/markerclusterer";
import type { Course } from "../../shared/types.ts";

const BRAND = "#2f6df0";

// Polished cluster badge: soft halo + solid brand core + white count. Size scales gently.
function clusterSize(count: number): number {
  if (count < 5) return 36;
  if (count < 15) return 42;
  if (count < 40) return 50;
  return 58;
}

const renderer: Renderer = {
  render({ count, position }) {
    const s = clusterSize(count);
    const r = s / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
      <circle cx="${r}" cy="${r}" r="${r - 1}" fill="${BRAND}" opacity="0.22"/>
      <circle cx="${r}" cy="${r}" r="${r - 7}" fill="${BRAND}" stroke="#fff" stroke-width="2.5"/>
    </svg>`;
    return new google.maps.Marker({
      position,
      icon: {
        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(s, s),
        anchor: new google.maps.Point(r, r),
        labelOrigin: new google.maps.Point(r, r),
      },
      label: {
        text: String(count),
        color: "#fff",
        fontSize: count > 99 ? "12px" : "13px",
        fontWeight: "700",
      },
      title: `${count} Kurse`,
      zIndex: 1000 + count,
    });
  },
};

// Clean single-course dot (replaces the default red pin).
function dotIcon(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 7,
    fillColor: BRAND,
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 2,
  };
}

// Enlarged/darkened dot for the hovered course (synced with the result list).
function dotIconHover(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 11,
    fillColor: "#1f50bd",
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 3,
  };
}

export function ClusteredMarkers({
  courses,
  onSelect,
  hoverId,
  onHover,
}: {
  courses: Course[];
  onSelect: (c: Course) => void;
  hoverId: string | null;
  onHover: (id: string | null) => void;
}) {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const byId = useRef<Map<string, google.maps.Marker>>(new Map());
  const prevHover = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  useEffect(() => {
    if (!map) return;
    clusterer.current = new MarkerClusterer({ map, renderer });
    // Perf: legacy markers are repositioned per-frame during a zoom animation (hundreds of
    // DOM reflows). Hide the whole cluster layer the INSTANT a zoom gesture starts — on the
    // raw wheel/pinch DOM events, which fire several frames before Google's `zoom_changed`,
    // so there's no choppy repositioning before they vanish. Restore (re-cluster once) on idle.
    let hidden = false;
    let safety: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      clearTimeout(safety);
      if (hidden) { clusterer.current?.setMap(map); clusterer.current?.render(); hidden = false; }
    };
    const hide = () => { if (!hidden) { clusterer.current?.setMap(null); hidden = true; } };
    // PRIMARY show trigger is `idle` — it fires AFTER Maps' finalize-snap zoom animation, which
    // is exactly when the markers can be repositioned for free. The timeout below is only a
    // FALLBACK for gestures that produce no `idle` (no zoom change). It's armed at the END of a
    // gesture and is long enough (650ms > the snap animation) that the real `idle` always wins
    // in the normal case — so markers never reappear mid-animation, and never get stuck.
    const armSafety = () => { clearTimeout(safety); safety = setTimeout(show, 650); };
    const div = map.getDiv();
    const onWheel = (e: WheelEvent) => {
      const z = map.getZoom() ?? 0;
      const minZ = (map.get("minZoom") as number | undefined) ?? 0;
      const maxZ = (map.get("maxZoom") as number | undefined) ?? 21;
      if ((e.deltaY > 0 && z <= minZ) || (e.deltaY < 0 && z >= maxZ)) return; // no zoom possible
      hide();
      armSafety(); // reset on each wheel tick → fires 650ms after the last one
    };
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length >= 2) hide(); };
    const onTouchEnd = () => { if (hidden) armSafety(); }; // arm only when fingers lift
    div.addEventListener("wheel", onWheel, { passive: true });
    div.addEventListener("touchstart", onTouchStart, { passive: true });
    div.addEventListener("touchend", onTouchEnd, { passive: true });
    div.addEventListener("touchcancel", onTouchEnd, { passive: true });
    const zl = map.addListener("zoom_changed", hide); // dblclick / programmatic (always → idle)
    const il = map.addListener("idle", show);
    return () => {
      clearTimeout(safety);
      div.removeEventListener("wheel", onWheel);
      div.removeEventListener("touchstart", onTouchStart);
      div.removeEventListener("touchend", onTouchEnd);
      div.removeEventListener("touchcancel", onTouchEnd);
      zl.remove();
      il.remove();
      clusterer.current?.clearMarkers();
      clusterer.current = null;
      byId.current.clear();
    };
  }, [map]);

  // Diff markers by course id: only create/remove what actually changed (filters),
  // never on pan/zoom. The clusterer re-clusters client-side as the camera moves.
  useEffect(() => {
    if (!map || !clusterer.current) return;
    const want = new Map(
      courses.filter((c) => c.lat != null && c.lng != null).map((c) => [c.id, c] as const),
    );
    const have = byId.current;
    const toAdd: google.maps.Marker[] = [];
    const toRemove: google.maps.Marker[] = [];

    for (const [id, m] of have) {
      if (!want.has(id)) {
        toRemove.push(m);
        have.delete(id);
      }
    }
    for (const [id, c] of want) {
      if (!have.has(id)) {
        const m = new google.maps.Marker({ position: { lat: c.lat!, lng: c.lng! }, icon: dotIcon() });
        m.addListener("click", () => onSelectRef.current(c));
        m.addListener("mouseover", () => onHoverRef.current(c.id));
        m.addListener("mouseout", () => onHoverRef.current(null));
        have.set(id, m);
        toAdd.push(m);
      }
    }
    if (toRemove.length) clusterer.current.removeMarkers(toRemove, true);
    if (toAdd.length) clusterer.current.addMarkers(toAdd, true);
    if (toRemove.length || toAdd.length) clusterer.current.render();
  }, [map, courses]);

  // Highlight the hovered course's marker (only un-clustered/visible ones show it). Reset just
  // the previously-hovered one rather than re-styling every marker.
  useEffect(() => {
    const have = byId.current;
    const prev = prevHover.current;
    if (prev && prev !== hoverId) {
      const pm = have.get(prev);
      if (pm) { pm.setIcon(dotIcon()); pm.setZIndex(undefined); }
    }
    if (hoverId) {
      const hm = have.get(hoverId);
      if (hm) { hm.setIcon(dotIconHover()); hm.setZIndex(100000); }
    }
    prevHover.current = hoverId;
  }, [hoverId, courses]);

  return null;
}
