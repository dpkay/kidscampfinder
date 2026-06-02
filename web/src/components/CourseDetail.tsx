import { useEffect, useRef, useState } from "react";
import type { Course } from "../../shared/types.ts";
import { makeT, type Lang } from "../i18n.ts";
import { prettySource, linkOut } from "../util.ts";

const THRESH = 60; // px to commit a swipe

const TOPIC_EMOJI: Record<string, string> = {
  sports: "⚽", languages: "💬", coding: "💻", arts: "🎨", music: "🎵",
  science: "🔬", food: "🧁", academic: "📚", nature: "🌳", other: "✨",
};

type Mode = "" | "close" | "page";

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
  const { t, topic, format, locale } = makeT(lang);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [anim, setAnim] = useState(false);
  const g = useRef<{ sx: number; sy: number; mode: Mode } | null>(null);

  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;

  const snapBack = () => { setAnim(true); setOff({ x: 0, y: 0 }); };
  const close = (dir: number) => { setAnim(true); setOff({ x: dir * vw(), y: 0 }); window.setTimeout(onClose, 210); };
  const page = (dir: number) => {
    if ((dir > 0 && index >= courses.length - 1) || (dir < 0 && index <= 0)) return snapBack();
    setAnim(true);
    setOff({ x: 0, y: dir > 0 ? -vh() : vh() }); // current slides out
    window.setTimeout(() => {
      setAnim(false);
      setOff({ x: 0, y: dir > 0 ? vh() : -vh() }); // next waits off-screen, opposite side
      onIndexChange(index + dir);
      requestAnimationFrame(() => requestAnimationFrame(() => { setAnim(true); setOff({ x: 0, y: 0 }); }));
    }, 210);
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
    g.current = { sx: e.clientX, sy: e.clientY, mode: "" };
    setAnim(false);
  };
  const onMove = (e: React.PointerEvent) => {
    const st = g.current;
    if (!st) return;
    const dx = e.clientX - st.sx, dy = e.clientY - st.sy;
    if (!st.mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      st.mode = Math.abs(dx) > Math.abs(dy) ? "close" : "page";
    }
    if (st.mode === "close") setOff({ x: dx, y: 0 });
    else setOff({ x: 0, y: dy * 0.6 });
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
  const opacity = Math.abs(off.x) > 0 ? Math.max(0.25, 1 - Math.abs(off.x) / vw()) : 1;

  return (
    <div className="cd" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
         onPointerCancel={() => { g.current = null; snapBack(); }}>
      <button className="cd-back" onClick={onClose} aria-label="Zurück">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" />
        </svg>
      </button>
      <div className="cd-counter">{index + 1} / {courses.length}</div>
      {showHint && <div className="cd-swipehint">{t("swipeHint")}</div>}

      <div
        className="cd-page"
        style={{
          transform: `translate3d(${off.x}px, ${off.y}px, 0)`,
          transition: anim ? "transform .21s cubic-bezier(.4,0,.2,1)" : "none",
          opacity,
        }}
      >
        <div className="cd-card">
          {img
            ? <img className="cd-img" src={img} alt={course.title} draggable={false} />
            : <div className="cd-img cd-img-ph">{TOPIC_EMOJI[course.topics[0]] ?? "🎒"}</div>}

          <div className="cd-body">
            <h2>{course.title}</h2>
            <div className="cd-chips">
              {course.topics.map((tp) => <span key={tp} className="topic-chip">{TOPIC_EMOJI[tp] ?? ""} {topic(tp)}</span>)}
              <span className="chip">{format(course.format)}</span>
              <span className="chip">{ages}</span>
              {course.costType === "free"
                ? <span className="chip free">{t("free")}</span>
                : course.priceChf != null ? <span className="chip price">CHF {Math.round(course.priceChf)}</span> : null}
            </div>

            {(course.communeClean || course.address) && (
              <div className="cd-loc">📍 <strong>{course.communeClean}</strong>{course.bezirk && <span className="bezirk-tag"> · {course.bezirk}</span>}</div>
            )}

            {course.snippet && <p className="cd-snippet">{course.snippet}</p>}

            <div className="cd-dates">
              {course.occasions.slice(0, 4).map((o, i) => {
                const multiDay = o.endDate && o.endDate !== o.startDate;
                return (
                  <span key={i} className="cd-date-pill">
                    <b>KW {o.isoWeekStart}{multiDay && o.isoWeekEnd && o.isoWeekEnd !== o.isoWeekStart ? `–${o.isoWeekEnd}` : ""}</b>
                    {" · "}{fmtDate(o.startDate, locale)}{multiDay ? ` – ${fmtDate(o.endDate, locale)}` : ""}
                    {o.startTime ? ` · ${o.startTime}` : ""}
                    {o.spotsAvailable != null ? ` · ${o.spotsAvailable} ${t("spots")}` : ""}
                  </span>
                );
              })}
              {course.occasions.length > 4 && <span className="cd-date-pill more">+{course.occasions.length - 4}</span>}
            </div>
            {course.occasions[0]?.registrationDeadline && (
              <div className="cd-deadline">⏳ {t("deadline")}: {fmtDate(course.occasions[0].registrationDeadline, locale)}</div>
            )}
          </div>

          <div className="cd-footer">
            <a className="cta" href={linkOut(course)} target="_blank" rel="noopener noreferrer">{t("toProvider")}</a>
            <div className="cd-foot-meta">
              {prettySource(course.source)} · ⚠️ {t("disclaimer")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtDate(s: string | null, locale: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}
