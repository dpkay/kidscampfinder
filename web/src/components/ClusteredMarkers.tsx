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

export function ClusteredMarkers({
  courses,
  onSelect,
}: {
  courses: Course[];
  onSelect: (c: Course) => void;
}) {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const byId = useRef<Map<string, google.maps.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return;
    clusterer.current = new MarkerClusterer({ map, renderer });
    // Perf: legacy markers are repositioned per-frame during a zoom animation (hundreds of
    // DOM reflows). Hide the whole cluster layer the INSTANT a zoom gesture starts — on the
    // raw wheel/pinch DOM events, which fire several frames before Google's `zoom_changed`,
    // so there's no choppy repositioning before they vanish. Restore (re-cluster once) on idle.
    let hidden = false;
    const hide = () => { if (!hidden) { clusterer.current?.setMap(null); hidden = true; } };
    const show = () => { if (hidden) { clusterer.current?.setMap(map); clusterer.current?.render(); hidden = false; } };
    const div = map.getDiv();
    const onWheel = () => hide();
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length >= 2) hide(); };
    div.addEventListener("wheel", onWheel, { passive: true });
    div.addEventListener("touchstart", onTouchStart, { passive: true });
    const zl = map.addListener("zoom_changed", hide); // fallback (dblclick, programmatic)
    const il = map.addListener("idle", show);
    return () => {
      div.removeEventListener("wheel", onWheel);
      div.removeEventListener("touchstart", onTouchStart);
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
        have.set(id, m);
        toAdd.push(m);
      }
    }
    if (toRemove.length) clusterer.current.removeMarkers(toRemove, true);
    if (toAdd.length) clusterer.current.addMarkers(toAdd, true);
    if (toRemove.length || toAdd.length) clusterer.current.render();
  }, [map, courses]);

  return null;
}
