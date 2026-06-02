// Client-side course filtering. Ported verbatim from the (retired) Express
// server's applyFilters() — pure (array in → array out), exact same semantics
// (week / age overlap / bezirk / commune / topic / cost / format / maxPrice /
// q / bbox / chronological sort).
import type { Course } from "../shared/types.ts";

export function applyFilters(courses: Course[], q: Record<string, string | undefined>): Course[] {
  let out = courses;
  if (q.week) {
    const w = Number(q.week);
    out = out.filter((c) =>
      c.occasions.some((o) => o.isoWeekStart != null && o.isoWeekStart <= w && (o.isoWeekEnd ?? o.isoWeekStart) >= w),
    );
  }
  if (q.ageMin || q.ageMax) {
    const lo = q.ageMin ? Number(q.ageMin) : 0;
    const hi = q.ageMax ? Number(q.ageMax) : 99;
    // overlap: a course is relevant if its age band intersects [lo, hi].
    // courses with no age info are kept (don't hide them on an age filter).
    out = out.filter(
      (c) => c.ageMin == null || ((c.ageMax ?? 99) >= lo && c.ageMin <= hi),
    );
  }
  if (q.bezirk) out = out.filter((c) => c.bezirk === q.bezirk);
  if (q.commune) out = out.filter((c) => c.communeClean === q.commune);
  if (q.topic) out = out.filter((c) => c.topics.includes(q.topic!));
  if (q.cost) out = out.filter((c) => c.costType === q.cost);
  if (q.format) out = out.filter((c) => c.format === q.format);
  if (q.maxPrice) {
    const m = Number(q.maxPrice);
    out = out.filter((c) => c.priceChf == null || c.priceChf <= m);
  }
  if (q.q) {
    const needle = q.q.toLowerCase();
    out = out.filter(
      (c) =>
        c.title.toLowerCase().includes(needle) ||
        (c.snippet ?? "").toLowerCase().includes(needle) ||
        (c.commune ?? "").toLowerCase().includes(needle),
    );
  }
  if (q.bbox) {
    const parts = q.bbox.split(",").map(Number);
    if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
      const [west, south, east, north] = parts;
      out = out.filter(
        (c) =>
          c.lat != null && c.lng != null &&
          c.lat >= south && c.lat <= north && c.lng >= west && c.lng <= east,
      );
    }
  }
  // default sort: soonest date first; undated last
  return [...out].sort((a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999"));
}
