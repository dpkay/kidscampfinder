import type { Course } from "../../shared/types.ts";
import { makeT, type Lang } from "../i18n.ts";

const TOPIC_EMOJI: Record<string, string> = {
  sports: "⚽", languages: "💬", coding: "💻", arts: "🎨", music: "🎵",
  science: "🔬", food: "🧁", academic: "📚", nature: "🌳", other: "✨",
};

export function CourseCard({ course, lang, onClick }: { course: Course; lang: Lang; onClick: () => void }) {
  const { t, topic } = makeT(lang);
  const img = course.imagePath ? "/" + course.imagePath : null;
  const ages =
    course.ageMin != null
      ? course.ageMin === course.ageMax
        ? `${course.ageMin} ${t("ages")}`
        : `${course.ageMin}–${course.ageMax} ${t("ages")}`
      : null;
  const nRuns = course.occasions.length;

  return (
    <article className="card" onClick={onClick}>
      <div className="card-img">
        {img ? (
          <img src={img} alt={course.title} loading="lazy" />
        ) : (
          <div className="card-img-ph">{TOPIC_EMOJI[course.topics[0]] ?? "🎒"}</div>
        )}
        {course.costType === "free" && <span className="badge free">{t("free")}</span>}
        {course.costType === "paid" && course.priceChf != null && (
          <span className="badge price">CHF {Math.round(course.priceChf)}</span>
        )}
      </div>
      <div className="card-body">
        <h3>{course.title}</h3>
        <div className="card-meta">
          {course.weekLabel && <span className="chip week">{course.weekLabel}</span>}
          {ages && <span className="chip">{ages}</span>}
          {nRuns > 1 && <span className="chip">{nRuns}× {t("runs")}</span>}
        </div>
        <div className="card-topics">
          {course.topics.slice(0, 3).map((tp) => (
            <span key={tp} className="topic-chip">{TOPIC_EMOJI[tp] ?? ""} {topic(tp)}</span>
          ))}
        </div>
        {course.communeClean && (
          <div className="card-commune">📍 {course.communeClean}{course.bezirk && !course.bezirk.startsWith("Ausser") ? ` · ${course.bezirk}` : ""}</div>
        )}
        <div className="card-source">{prettySource(course.source)}</div>
      </div>
    </article>
  );
}

export function prettySource(source: string): string {
  if (source.startsWith("feriennet:")) return "Feriennet · " + source.split(":")[1];
  if (source === "ferienprogramm") return "ferienprogramm.ch";
  return source;
}
