import { useEffect } from "react";
import type { Meta } from "../../shared/types.ts";
import { makeT, type Lang } from "../i18n.ts";
import { RangeSlider, MaxSlider } from "./RangeSlider.tsx";
import type { ExploreFilters } from "./Explore.tsx";

export function FilterSheet({
  filters,
  meta,
  lang,
  onChange,
  onReset,
  onClose,
}: {
  filters: ExploreFilters;
  meta: Meta;
  lang: Lang;
  onChange: (patch: Partial<ExploreFilters>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t, topic, format } = makeT(lang);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ageLo = filters.ageMin ?? meta.ageMin;
  const ageHi = filters.ageMax ?? meta.ageMax;
  const priceVal = filters.maxPrice ?? meta.maxPrice;

  return (
    <div className="fs-overlay" onClick={onClose}>
      <div className="fs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="fs-head">
          <h3>{t("filter") ?? "Filter"}</h3>
          <button className="fs-close" onClick={onClose}>✕</button>
        </div>

        <label className="field">
          <span>{t("week")}</span>
          <select value={filters.week} onChange={(e) => onChange({ week: e.target.value })}>
            <option value="">{t("allWeeks")}</option>
            {meta.weeks.map((w) => (
              <option key={`${w.isoYear}-${w.isoWeek}`} value={String(w.isoWeek)}>
                {fmtD(w.startDate)} – {fmtD(w.endDate, true)} · KW {w.isoWeek} ({w.courseCount})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{t("age")} · {ageLo}–{ageHi} {t("ages")}</span>
          <RangeSlider
            min={meta.ageMin}
            max={meta.ageMax}
            valueMin={ageLo}
            valueMax={ageHi}
            onChange={(lo, hi) => onChange({ ageMin: lo, ageMax: hi })}
          />
        </label>

        <label className="field">
          <span>{t("topic")}</span>
          <select value={filters.topic} onChange={(e) => onChange({ topic: e.target.value })}>
            <option value="">{t("allTopics")}</option>
            {meta.topics.map((tp) => <option key={tp} value={tp}>{topic(tp)}</option>)}
          </select>
        </label>

        <label className="field">
          <span>{t("maxCost")}{filters.maxPrice != null && filters.maxPrice < meta.maxPrice ? ` · ≤ CHF ${priceVal}` : ""}</span>
          <MaxSlider
            min={0}
            max={meta.maxPrice}
            step={10}
            value={priceVal}
            onChange={(v) => onChange({ maxPrice: v })}
            format={(n) => (n === 0 ? t("free") : `CHF ${n}`)}
            maxLabel={t("noLimit")}
          />
        </label>

        <label className="field">
          <span>{t("format")}</span>
          <select value={filters.format} onChange={(e) => onChange({ format: e.target.value })}>
            <option value="">{t("anyFormat")}</option>
            {meta.formats.map((f) => <option key={f} value={f}>{format(f)}</option>)}
          </select>
        </label>

        <div className="fs-actions">
          <button className="reset" onClick={onReset}>✕ {t("reset")}</button>
          <button className="cta" onClick={onClose}>{t("showResults") ?? "Anzeigen"}</button>
        </div>
      </div>
    </div>
  );
}

function fmtD(iso: string, withYear = false): string {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}),
  });
}
