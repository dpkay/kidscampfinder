import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import type { Course, Meta } from "../../shared/types.ts";
import { fetchCourses, fetchMeta } from "../api.ts";
import { makeT, type Lang } from "../i18n.ts";
import { ClusteredMarkers } from "./ClusteredMarkers.tsx";
import { BottomSheet } from "./BottomSheet.tsx";
import { FilterSheet } from "./FilterSheet.tsx";
import { CourseDetail } from "./CourseDetail.tsx";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const DEFAULT_CENTER = { lat: 47.2575, lng: 8.6915 }; // Männedorf

export type ExploreFilters = {
  week: string;
  topic: string;
  format: string;
  ageMin: number | null;
  ageMax: number | null;
  maxPrice: number | null;
};
const EMPTY: ExploreFilters = { week: "", topic: "", format: "", ageMin: null, ageMax: null, maxPrice: null };

const TOPIC_EMOJI: Record<string, string> = {
  sports: "⚽", languages: "💬", coding: "💻", arts: "🎨", music: "🎵",
  science: "🔬", food: "🧁", academic: "📚", nature: "🌳", other: "✨",
};

export function Explore({ lang, onLang }: { lang: Lang; onLang?: (l: Lang) => void }) {
  const { t, topic, format } = useMemo(() => makeT(lang), [lang]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filters, setFilters] = useState<ExploreFilters>(EMPTY);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [bounds, setBounds] = useState<{ w: number; s: number; e: number; n: number } | null>(null);
  const [detail, setDetail] = useState<{ list: Course[]; idx: number } | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sheetH, setSheetH] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const sheetHRef = useRef(0);
  const appliedOffset = useRef(0);

  // the map area the sheet leaves visible — capped at half so expanding the sheet to read
  // the list doesn't keep shrinking the result region / re-panning the map.
  const effSheetPx = () => Math.min(sheetHRef.current, 0.5 * window.innerHeight);

  useEffect(() => { fetchMeta().then(setMeta).catch(console.error); }, []);

  // Fetch the whole filtered set ONCE per filter change (no bbox). The map clusters all of
  // these client-side, so panning/zooming never hits the network or rebuilds markers.
  const query = useMemo(() => {
    const q: Record<string, string> = {};
    if (filters.week) q.week = filters.week;
    if (filters.topic) q.topic = filters.topic;
    if (filters.format) q.format = filters.format;
    if (meta) {
      if (filters.ageMin != null && filters.ageMin > meta.ageMin) q.ageMin = String(filters.ageMin);
      if (filters.ageMax != null && filters.ageMax < meta.ageMax) q.ageMax = String(filters.ageMax);
      if (filters.maxPrice != null && filters.maxPrice < meta.maxPrice) q.maxPrice = String(filters.maxPrice);
    }
    return q;
  }, [filters, meta]);

  useEffect(() => {
    fetchCourses(query).then((r) => setAllCourses(r.courses)).catch(console.error);
  }, [query]);

  // The bottom-sheet list = courses inside the current viewport, filtered in-memory (no fetch).
  const visible = useMemo(() => {
    if (!bounds) return allCourses;
    return allCourses.filter(
      (c) => c.lat != null && c.lng != null &&
        c.lat >= bounds.s && c.lat <= bounds.n && c.lng >= bounds.w && c.lng <= bounds.e,
    );
  }, [allCourses, bounds]);
  const count = visible.length;

  const set = (patch: Partial<ExploreFilters>) => setFilters((f) => ({ ...f, ...patch }));

  // Make the browser Back button close the detail overlay (not leave the site): push a
  // history entry when it opens; Back/swipe/Esc all go through history.back() → popstate.
  const detailOpen = detail !== null;
  useEffect(() => {
    if (!detailOpen) return;
    window.history.pushState({ cd: true }, "");
    const onPop = () => setDetail(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [detailOpen]);

  const onSheetHeight = (px: number) => {
    sheetHRef.current = px;
    setSheetH(px);
  };

  const locate = () => {
    if (!navigator.geolocation) { setGeoMsg("Standort wird nicht unterstützt"); return; }
    setGeoMsg("Standort wird ermittelt…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(p);
        setGeoMsg(null);
        const m = mapRef.current;
        if (m) {
          m.setZoom(Math.max(13, m.getZoom() ?? 13));
          m.panTo(p);
          // place the located point in the VISIBLE section (above the sheet), not behind it
          const off = effSheetPx() / 2;
          if (off > 1) m.panBy(0, off);
          appliedOffset.current = off;
        }
      },
      (err) => setGeoMsg(err.code === err.PERMISSION_DENIED ? "Standortzugriff verweigert" : "Standort nicht verfügbar (HTTPS nötig)"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  // Keep the logical center inside the VISIBLE (uncovered) section: shift the map up by half
  // the effective sheet height. Reconciles on sheet open/close and once the map is ready.
  // panBy(0,+k) moves content up by k (map y-axis runs north→south).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    const desired = effSheetPx() / 2;
    const delta = desired - appliedOffset.current;
    if (Math.abs(delta) > 0.5) m.panBy(0, delta);
    appliedOffset.current = desired;
  }, [sheetH, mapReady]);

  // recompute the visible-section bounds (used for the list) — also after the sheet resizes
  const recomputeBounds = (m: google.maps.Map) => {
    const b = m.getBounds();
    if (!b) return;
    const sw = b.getSouthWest(), ne = b.getNorthEast();
    const north = ne.lat(), south = sw.lat();
    const H = window.innerHeight;
    const visFrac = (H - effSheetPx()) / H; // top fraction not covered by the sheet
    const visSouth = north - (north - south) * visFrac;
    setBounds({ w: sw.lng(), s: visSouth, e: ne.lng(), n: north });
  };
  useEffect(() => {
    if (mapRef.current && mapReady) recomputeBounds(mapRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetH]);

  useEffect(() => {
    if (!geoMsg || geoMsg.endsWith("…")) return;
    const id = window.setTimeout(() => setGeoMsg(null), 4000);
    return () => clearTimeout(id);
  }, [geoMsg]);

  if (!API_KEY) {
    return (
      <div className="explore-missing">
        <p>🗺️ Google Maps key not configured — add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>web/.env</code>.</p>
        <button className="cta" onClick={onBack}>← {t("close")}</button>
      </div>
    );
  }

  // summary pill text
  const line1 = filters.topic ? `${t("coursesIn")} ${topic(filters.topic)}` : t("allCourses");
  const weekStr = (() => {
    if (!filters.week || !meta) return t("anyWeek");
    const w = meta.weeks.find((x) => String(x.isoWeek) === filters.week);
    if (!w) return t("anyWeek");
    return `${fmtDe(w.startDate)} – ${fmtDe(w.endDate)}`;
  })();
  const ageStr = meta && (filters.ageMin != null || filters.ageMax != null)
    ? `${filters.ageMin ?? meta.ageMin}–${filters.ageMax ?? meta.ageMax} ${t("ages")}`
    : t("anyAgeShort");
  const priceStr = meta && filters.maxPrice != null && filters.maxPrice < meta.maxPrice
    ? (filters.maxPrice === 0 ? t("free") : `max ${filters.maxPrice} CHF`)
    : t("anyPriceShort");
  const formatStr = filters.format ? format(filters.format) : t("anyFormatShort");
  const line2 = `${weekStr} · ${ageStr} · ${priceStr} · ${formatStr}`;

  return (
    <div className="explore">
      <APIProvider apiKey={API_KEY}>
        <Map
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={12}
          minZoom={7}
          maxZoom={18}
          gestureHandling="greedy"
          disableDefaultUI={true}
          clickableIcons={false}
          style={{ position: "absolute", inset: 0 }}
          onIdle={(e) => {
            mapRef.current = e.map;
            if (!mapReady) setMapReady(true);
            recomputeBounds(e.map);
          }}
        >
          <ClusteredMarkers
            courses={allCourses}
            onSelect={(c) => {
              const i = allCourses.findIndex((x) => x.id === c.id);
              if (i >= 0) setDetail({ list: allCourses, idx: i });
            }}
          />
          {userPos && (
            <Marker
              position={userPos}
              zIndex={99999}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8, fillColor: "#1a73e8", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3,
              }}
            />
          )}
        </Map>
      </APIProvider>

      {/* top bar: language toggle + summary pill + admin */}
      <div className="explore-top">
        <div className="explore-lang">
          <button className={lang === "de" ? "on" : ""} onClick={() => onLang?.("de")}>DE</button>
          <button className={lang === "en" ? "on" : ""} onClick={() => onLang?.("en")}>EN</button>
        </div>
        <button className="summary-pill" onClick={() => setFilterOpen(true)}>
          <span className="sp-line1">{filters.topic ? `${TOPIC_EMOJI[filters.topic] ?? ""} ` : "🔎 "}{line1}</span>
          <span className="sp-line2">{line2}</span>
        </button>
        <a className="explore-admin" href="#admin" title="Admin">📊</a>
      </div>

      {/* bottom sheet with results */}
      <button
        className="explore-locate"
        style={{ bottom: `calc(${Math.min(sheetH, 0.5 * (typeof window !== "undefined" ? window.innerHeight : 800))}px + 14px)` }}
        onClick={locate}
        aria-label="Mein Standort"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="7" />
          <line x1="12" y1="1" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="23" />
          <line x1="1" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="23" y2="12" />
          <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {geoMsg && <div className="geo-toast">{geoMsg}</div>}

      <BottomSheet
        initial="half"
        onHeightChange={onSheetHeight}
        header={
          <div className="sheet-count">
            <strong>{count}</strong> {t("results")} <span className="muted">· {t("inThisArea")}</span>
          </div>
        }
      >
        <div className="sheet-list">
          {visible.map((c, i) => (
            <CompactCard key={c.id} course={c} lang={lang} onClick={() => setDetail({ list: visible, idx: i })} />
          ))}
          {count === 0 && <p className="sheet-empty">{t("noResults")} — {t("broaden")}</p>}
        </div>
      </BottomSheet>

      {filterOpen && meta && (
        <FilterSheet
          filters={filters}
          meta={meta}
          lang={lang}
          onChange={set}
          onReset={() => setFilters(EMPTY)}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {detail && (
        <CourseDetail
          courses={detail.list}
          index={detail.idx}
          lang={lang}
          onIndexChange={(i) => setDetail((d) => (d ? { ...d, idx: i } : d))}
          onClose={() => window.history.back()}
        />
      )}
    </div>
  );
}

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]; // getDay() order (Sun=0)
const weekdayOf = (iso: string) => new Date(iso + "T12:00:00").getDay();

// Format chip with weekdays:
//   single-day (Ganztag/Halbtag) → distinct days you can pick, e.g. "Ganztag: Mo, Mi"
//   multi-day  (Mehrtägig/Wochenkurs/Lager) → the session span when all sessions share one
//     pattern (e.g. "Mehrtägig: Mo-Mi"); if sessions differ → "Mehrtägig: verschiedene".
function formatLabel(course: Course, fmt: (k: string) => string, various: string): string | null {
  if (!course.format || course.format === "unknown") return null;
  const label = fmt(course.format);
  const occ = course.occasions.filter((o) => o.startDate);
  if (occ.length === 0) return label;

  if (course.format === "half_day" || course.format === "full_day") {
    const days = [...new Set(occ.map((o) => weekdayOf(o.startDate!)))].sort((a, b) => a - b);
    return days.length <= 4 ? `${label}: ${days.map((d) => WD[d]).join(", ")}` : label;
  }

  // distinct (start→end weekday) session patterns, for real multi-day spans (2–6 days)
  const pats = new Set<string>();
  for (const o of occ) {
    const s = new Date(o.startDate! + "T12:00:00");
    const e = o.endDate ? new Date(o.endDate + "T12:00:00") : s;
    const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    if (days >= 2 && days < 7) pats.add(`${s.getDay()}-${e.getDay()}`);
  }
  if (pats.size === 0) return label; // no usable span (missing end dates / week+ camp)
  if (pats.size > 1) return `${label}: ${various}`;
  const [s, e] = [...pats][0].split("-").map(Number);
  return `${label}: ${WD[s]}-${WD[e]}`;
}

function CompactCard({ course, lang, onClick }: { course: Course; lang: Lang; onClick: () => void }) {
  const { t, topic, format } = makeT(lang);
  const img = course.imagePath ? "/" + course.imagePath : null;
  const ages = course.ageMin != null
    ? (course.ageMin === course.ageMax ? `${course.ageMin}` : `${course.ageMin}–${course.ageMax}`) + ` ${t("ages")}`
    : null;
  return (
    <article className="ccard" onClick={onClick}>
      <div className="ccard-img">
        {img ? <img src={img} alt={course.title} loading="lazy" /> : <div className="ccard-ph">{TOPIC_EMOJI[course.topics[0]] ?? "🎒"}</div>}
      </div>
      <div className="ccard-body">
        <h4>{course.title}</h4>
        <div className="ccard-chips">
          {course.weekLabel && <span className="chip week">{course.weekLabel}</span>}
          {ages && <span className="chip">{ages}</span>}
          {(() => { const fl = formatLabel(course, format, t("various")); return fl && <span className="chip">{fl}</span>; })()}
          {course.costType === "free"
            ? <span className="chip free">{t("free")}</span>
            : course.priceChf != null ? <span className="chip price">CHF {Math.round(course.priceChf)}</span> : null}
        </div>
        <div className="ccard-sub">📍 {course.communeClean} · {topic(course.topics[0] ?? "other")}</div>
      </div>
    </article>
  );
}

function fmtDe(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "long" });
}
