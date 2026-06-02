import { useEffect, useRef, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import type { Course } from "../../shared/types.ts";
import { makeT, type Lang } from "../i18n.ts";
import { prettySource } from "./CourseCard.tsx";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const THRESH = 70; // px to commit a swipe

const TOPIC_EMOJI: Record<string, string> = {
  sports: "⚽", languages: "💬", coding: "💻", arts: "🎨", music: "🎵",
  science: "🔬", food: "🧁", academic: "📚", nature: "🌳", other: "✨",
};

type Mode = "" | "close" | "page" | "scroll";

export function CourseDetail({
  courses,
  index,
  lang,
  onIndexChange,
  onClose,
}: {
  courses: Course[];
  index: number;
  lang: Lang;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const { t, topic, format } = makeT(lang);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [anim, setAnim] = useState(false);
  const g = useRef<{ sx: number; sy: number; mode: Mode; atTop: boolean; atBottom: boolean } | null>(null);

  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;

  const snapBack = () => { setAnim(true); setOff({ x: 0, y: 0 }); };
  const close = (dir: number) => { setAnim(true); setOff({ x: dir * vw(), y: 0 }); window.setTimeout(onClose, 210); };
  const page = (dir: number) => {
    if ((dir > 0 && index >= courses.length - 1) || (dir < 0 && index <= 0)) return snapBack();
    setAnim(true);
    setOff({ x: 0, y: dir > 0 ? -vh() : vh() }); // slide current out
    window.setTimeout(() => {
      setAnim(false);
      setOff({ x: 0, y: dir > 0 ? vh() : -vh() }); // new card waits off-screen, opposite side
      onIndexChange(index + dir);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      requestAnimationFrame(() => requestAnimationFrame(() => { setAnim(true); setOff({ x: 0, y: 0 }); }));
    }, 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "ArrowLeft") onClose();
      else if (e.key === "ArrowUp") page(1);
      else if (e.key === "ArrowDown") page(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, courses.length]);

  const onDown = (e: React.PointerEvent) => {
    const s = scrollRef.current;
    g.current = {
      sx: e.clientX, sy: e.clientY, mode: "",
      atTop: !s || s.scrollTop <= 0,
      atBottom: !s || s.scrollTop + s.clientHeight >= s.scrollHeight - 1,
    };
    setAnim(false);
  };
  const onMove = (e: React.PointerEvent) => {
    const st = g.current;
    if (!st) return;
    const dx = e.clientX - st.sx, dy = e.clientY - st.sy;
    if (!st.mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy)) st.mode = "close";
      else if ((dy > 0 && st.atTop) || (dy < 0 && st.atBottom)) st.mode = "page";
      else st.mode = "scroll";
    }
    if (st.mode === "close") setOff({ x: dx, y: 0 });
    else if (st.mode === "page") setOff({ x: 0, y: dy * 0.5 });
  };
  const onUp = (e: React.PointerEvent) => {
    const st = g.current;
    g.current = null;
    if (!st) return;
    const dx = e.clientX - st.sx, dy = e.clientY - st.sy;
    if (st.mode === "close" && Math.abs(dx) > THRESH) return close(dx > 0 ? 1 : -1);
    if (st.mode === "page" && Math.abs(dy) > THRESH) return page(dy < 0 ? 1 : -1);
    snapBack();
  };

  const course = courses[index];
  if (!course) return null;
  const img = course.imagePath ? "/" + course.imagePath : null;
  const ages = course.ageMin != null
    ? (course.ageMin === course.ageMax ? `${course.ageMin}` : `${course.ageMin}–${course.ageMax}`) + ` ${t("ages")}`
    : "—";
  const daysAgo = Math.round((Date.now() - new Date(course.lastSeen).getTime()) / 86400000);
  const opacity = g.current?.mode === "close" || (anim && off.x !== 0)
    ? Math.max(0.3, 1 - Math.abs(off.x) / vw())
    : 1;

  return (
    <div className="cd" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
         onPointerCancel={() => { g.current = null; snapBack(); }}>
      <button className="cd-back" onClick={onClose} aria-label="Zurück">←</button>
      <div className="cd-counter">{index + 1} / {courses.length}</div>

      <div
        className="cd-page"
        style={{
          transform: `translate3d(${off.x}px, ${off.y}px, 0)`,
          transition: anim ? "transform .22s cubic-bezier(.4,0,.2,1)" : "none",
          opacity,
        }}
      >
        <div className="cd-scroll" ref={scrollRef}>
          {img
            ? <img className="cd-img" src={img} alt={course.title} draggable={false} />
            : <div className="cd-img cd-img-ph">{TOPIC_EMOJI[course.topics[0]] ?? "🎒"}</div>}
          <div className="cd-content">
            <h2>{course.title}</h2>
            <div className="cd-chips">
              {course.topics.map((tp) => <span key={tp} className="topic-chip">{TOPIC_EMOJI[tp] ?? ""} {topic(tp)}</span>)}
              <span className="chip">{format(course.format)}</span>
              <span className="chip">{ages}</span>
              {course.costType === "free"
                ? <span className="chip free">{t("free")}</span>
                : course.priceChf != null ? <span className="chip price">CHF {course.priceChf.toFixed(2)}</span> : null}
            </div>

            {course.snippet && <p className="cd-snippet">{course.snippet}</p>}

            {(course.communeClean || course.address) && (
              <div className="modal-loc">
                📍 <strong>{course.communeClean}</strong>
                {course.bezirk && <span className="bezirk-tag"> · {course.bezirk}</span>}
                {course.address && <div className="addr">{course.address}</div>}
              </div>
            )}

            {course.lat != null && course.lng != null && API_KEY && (
              <div className="modal-map" style={{ pointerEvents: "none" }}>
                <APIProvider apiKey={API_KEY}>
                  <Map defaultCenter={{ lat: course.lat, lng: course.lng }} defaultZoom={14}
                       gestureHandling="none" disableDefaultUI
                       style={{ height: "170px", width: "100%", borderRadius: "10px" }}>
                    <Marker position={{ lat: course.lat, lng: course.lng }} />
                  </Map>
                </APIProvider>
              </div>
            )}

            <div className="modal-dates">
              <h4>{t("dates")}</h4>
              <ul>
                {course.occasions.map((o, i) => (
                  <li key={i}>
                    <span className="kw">KW {o.isoWeekStart}</span>{" "}
                    {fmtDate(o.startDate)}{o.endDate && o.endDate !== o.startDate ? ` – ${fmtDate(o.endDate)}` : ""}
                    {o.startTime && <span className="time"> · {o.startTime}{o.endTime ? `–${o.endTime}` : ""}</span>}
                    {o.spotsAvailable != null && <span className="spots"> · {o.spotsAvailable} {t("spots")}</span>}
                  </li>
                ))}
              </ul>
              <div className="deadline">
                {t("deadline")}: {course.occasions[0]?.registrationDeadline ? fmtDate(course.occasions[0].registrationDeadline) : t("unknown")}
              </div>
            </div>

            <a className="cta" href={course.sourceUrl} target="_blank" rel="noopener noreferrer">{t("toProvider")}</a>
            <div className="provenance">{t("source")}: {prettySource(course.source)} · {t("updated")} {daysAgo} {t("daysAgo")}</div>
            <p className="disclaimer">⚠️ {t("disclaimer")}</p>
            <div className="cd-hint">{t("swipeHint")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "short" });
}
