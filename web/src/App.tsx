import { useEffect, useMemo, useState } from "react";
import type { Course, Meta } from "../shared/types.ts";
import { fetchCourses, fetchMeta } from "./api.ts";
import { makeT, type Lang } from "./i18n.ts";
import { CourseCard } from "./components/CourseCard.tsx";
import { CourseDetail } from "./components/CourseDetail.tsx";
import { MapView } from "./components/MapView.tsx";
import { Admin } from "./components/Admin.tsx";
import { Explore } from "./components/Explore.tsx";
import { RangeSlider, MaxSlider } from "./components/RangeSlider.tsx";

type Filters = {
  week: string;
  bezirk: string;
  topic: string;
  format: string;
  q: string;
  ageMin: number | null; // null = untouched (full range)
  ageMax: number | null;
  maxPrice: number | null; // null = untouched (no cap)
};

const EMPTY: Filters = {
  week: "", bezirk: "", topic: "", format: "", q: "",
  ageMin: null, ageMax: null, maxPrice: null,
};

export function App() {
  const [lang, setLang] = useState<Lang>("de");
  const [route, setRoute] = useState<string>(window.location.hash);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [courses, setCourses] = useState<Course[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [detail, setDetail] = useState<{ list: Course[]; idx: number } | null>(null);

  const { t, topic, format } = useMemo(() => makeT(lang), [lang]);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    fetchMeta().then(setMeta).catch(console.error);
  }, []);

  // build the API query, omitting sliders that are at their full (untouched) range
  const query = useMemo(() => {
    const q: Record<string, string> = {};
    if (filters.week) q.week = filters.week;
    if (filters.bezirk) q.bezirk = filters.bezirk;
    if (filters.topic) q.topic = filters.topic;
    if (filters.format) q.format = filters.format;
    if (filters.q) q.q = filters.q;
    if (meta) {
      if (filters.ageMin != null && filters.ageMin > meta.ageMin) q.ageMin = String(filters.ageMin);
      if (filters.ageMax != null && filters.ageMax < meta.ageMax) q.ageMax = String(filters.ageMax);
      if (filters.maxPrice != null && filters.maxPrice < meta.maxPrice) q.maxPrice = String(filters.maxPrice);
    }
    return q;
  }, [filters, meta]);

  useEffect(() => {
    setLoading(true);
    const id = setTimeout(() => {
      fetchCourses(query)
        .then((r) => {
          setCourses(r.courses);
          setCount(r.count);
        })
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(id);
  }, [query]);

  if (route === "#admin") {
    return <Admin lang={lang} onBack={() => (window.location.hash = "#browse")} />;
  }
  // Explore (map-first) is now the main view; the old grid lives at #browse.
  if (route !== "#browse") {
    return <Explore lang={lang} />;
  }

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const activeFilterCount = Object.keys(query).length;

  // slider display values (fall back to full range when untouched)
  const ageLo = filters.ageMin ?? meta?.ageMin ?? 0;
  const ageHi = filters.ageMax ?? meta?.ageMax ?? 18;
  const priceVal = filters.maxPrice ?? meta?.maxPrice ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🎒</span>
          <div>
            <h1>{t("title")}</h1>
            <p className="sub">{t("subtitle")}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <input
            className="search"
            placeholder={t("search")}
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
          />
          <div className="lang-toggle">
            <button className={lang === "de" ? "on" : ""} onClick={() => setLang("de")}>DE</button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
          <a className="admin-link" href="#">🗺 {t("map")}</a>
          <a className="admin-link" href="#admin">📊 {t("admin")}</a>
        </div>
      </header>

      <div className="body">
        <aside className="filters">
          <Field label={t("week")}>
            <select value={filters.week} onChange={(e) => set({ week: e.target.value })}>
              <option value="">{t("allWeeks")}</option>
              {meta?.weeks.map((w) => (
                <option key={w.isoWeek} value={String(w.isoWeek)}>
                  {fmtLong(w.startDate)} – {fmtLong(w.endDate)} · KW {w.isoWeek}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`${t("age")} · ${ageLo}–${ageHi} ${t("ages")}`}>
            {meta && (
              <RangeSlider
                min={meta.ageMin}
                max={meta.ageMax}
                valueMin={ageLo}
                valueMax={ageHi}
                onChange={(lo, hi) => set({ ageMin: lo, ageMax: hi })}
                format={(n) => `${n}`}
              />
            )}
          </Field>

          <Field label={t("bezirk")}>
            <select value={filters.bezirk} onChange={(e) => set({ bezirk: e.target.value })}>
              <option value="">{t("allBezirke")}</option>
              {meta?.bezirke.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>

          <Field label={t("topic")}>
            <select value={filters.topic} onChange={(e) => set({ topic: e.target.value })}>
              <option value="">{t("allTopics")}</option>
              {meta?.topics.map((tp) => <option key={tp} value={tp}>{topic(tp)}</option>)}
            </select>
          </Field>

          <Field label={`${t("maxCost")}${priceVal > 0 && filters.maxPrice != null && meta && filters.maxPrice < meta.maxPrice ? ` · ≤ CHF ${priceVal}` : ""}`}>
            {meta && (
              <MaxSlider
                min={0}
                max={meta.maxPrice}
                step={10}
                value={priceVal}
                onChange={(v) => set({ maxPrice: v })}
                format={(n) => (n === 0 ? t("free") : `CHF ${n}`)}
                maxLabel={t("noLimit")}
              />
            )}
          </Field>

          <Field label={t("format")}>
            <select value={filters.format} onChange={(e) => set({ format: e.target.value })}>
              <option value="">{t("anyFormat")}</option>
              {meta?.formats.map((f) => <option key={f} value={f}>{format(f)}</option>)}
            </select>
          </Field>

          {activeFilterCount > 0 && (
            <button className="reset" onClick={() => setFilters(EMPTY)}>✕ {t("reset")}</button>
          )}
        </aside>

        <main className="results">
          <div className="results-head">
            <span><strong>{count}</strong> {t("results")}</span>
            <div className="view-toggle">
              <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>☰ {t("list")}</button>
              <button className={view === "map" ? "on" : ""} onClick={() => setView("map")}>🗺 {t("map")}</button>
            </div>
          </div>

          {count === 0 && !loading ? (
            <div className="empty">
              <p className="empty-title">{t("noResults")}</p>
              <p>{t("broaden")}</p>
            </div>
          ) : view === "map" ? (
            <MapView courses={courses} onSelect={(c) => { const i = courses.findIndex((x) => x.id === c.id); if (i >= 0) setDetail({ list: courses, idx: i }); }} />
          ) : (
            <div className={"grid" + (loading ? " loading" : "")}>
              {courses.map((c, i) => (
                <CourseCard key={c.id} course={c} lang={lang} onClick={() => setDetail({ list: courses, idx: i })} />
              ))}
            </div>
          )}
        </main>
      </div>

      {detail && (
        <CourseDetail
          courses={detail.list}
          index={detail.idx}
          lang={lang}
          onIndexChange={(i) => setDetail((d) => (d ? { ...d, idx: i } : d))}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "long" });
}
