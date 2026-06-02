// Build-time export: read the SQLite DB read-only and dump static JSON for Vercel.
// This is the ONLY place better-sqlite3 is used (runs locally, never on Vercel).
// The loadCourses/buildMeta/buildAdmin logic is lifted verbatim from the (now-retired)
// web/server/index.ts — keep them in sync if the DB shape changes.
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import type { Course, Occasion, Meta, WeekInfo } from "../shared/types.ts";
import { communeInfo, bezirkSortKey } from "../shared/bezirk.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> web/ -> repo root
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DB_PATH = process.env.CC_DB ?? path.join(REPO_ROOT, "data", "kidscampfinder.sqlite");
const OUT_DIR = path.join(__dirname, "..", "public", "api");

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}. Run the crawler first.`);
  process.exit(1);
}
const db = new Database(DB_PATH, { readonly: true });

const todayISO = () => new Date().toISOString().slice(0, 10);

function isoWeekDates(year: number, week: number): { start: string; end: string } {
  // ISO week: week 1 contains the first Thursday. Monday of the given week.
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - (dow - 1) + (dow <= 4 ? 0 : 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

interface Row {
  [k: string]: any;
}

function loadCourses(): Course[] {
  const courseRows = db.prepare("SELECT * FROM course").all() as Row[];
  const occRows = db.prepare("SELECT * FROM occasion").all() as Row[];
  const occByCourse = new Map<string, Occasion[]>();
  for (const o of occRows) {
    const occ: Occasion = {
      startDate: o.start_date,
      endDate: o.end_date,
      startTime: o.start_time,
      endTime: o.end_time,
      isoYear: o.iso_year,
      isoWeekStart: o.iso_week_start,
      isoWeekEnd: o.iso_week_end,
      holidayPeriod: o.holiday_period,
      registrationDeadline: o.registration_deadline,
      spotsAvailable: o.spots_available,
    };
    if (!occByCourse.has(o.course_id)) occByCourse.set(o.course_id, []);
    occByCourse.get(o.course_id)!.push(occ);
  }

  const today = todayISO();
  const courses: Course[] = [];
  for (const r of courseRows) {
    // hide cross-source duplicates
    let raw: any = {};
    try {
      raw = JSON.parse(r.raw || "{}");
    } catch {
      raw = {};
    }
    if (raw.dup_of) continue;

    const allOcc = occByCourse.get(r.id) ?? [];
    // keep only non-stale occasions (no end date, or end date today/future)
    const occ = allOcc.filter((o) => !o.endDate || o.endDate >= today);
    if (allOcc.length > 0 && occ.length === 0) continue; // fully past

    const dated = occ.filter((o) => o.startDate).map((o) => o.startDate!) as string[];
    const nextDate = dated.length ? dated.sort()[0] : null;
    const weeks = occ
      .flatMap((o) => [o.isoWeekStart, o.isoWeekEnd])
      .filter((w): w is number => w != null);
    const wMin = weeks.length ? Math.min(...weeks) : null;
    const wMax = weeks.length ? Math.max(...weeks) : null;
    const weekLabel =
      wMin == null ? "" : wMin === wMax ? `KW ${wMin}` : `KW ${wMin}–${wMax}`;

    const ci = communeInfo(r.commune);

    courses.push({
      id: r.id,
      source: r.source,
      sourceUrl: r.source_url,
      title: r.title,
      snippet: r.description_snippet,
      provider: r.provider,
      topics: JSON.parse(r.topics || "[]"),
      format: r.format,
      costType: r.cost_type,
      priceChf: r.price_chf,
      ageMin: r.age_min,
      ageMax: r.age_max,
      language: r.language,
      commune: r.commune,
      communeClean: ci?.clean ?? r.commune,
      bezirk: ci?.bezirk ?? null,
      inZH: ci?.inZH ?? false,
      venueName: r.venue_name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      imagePath: r.image_local_path,
      lastSeen: r.last_seen,
      occasions: occ.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "")),
      nextDate,
      weekLabel,
    });
  }
  return courses;
}

function buildMeta(courses: Course[]): Meta {
  const today = todayISO();
  const communes = new Set<string>();
  const bezirke = new Set<string>();
  const topics = new Set<string>();
  const formats = new Set<string>();
  const costTypes = new Set<string>();
  const weekMap = new Map<string, WeekInfo>();
  let ageMin = 99,
    ageMax = 0,
    maxPrice = 0;

  for (const c of courses) {
    if (c.communeClean) communes.add(c.communeClean);
    if (c.bezirk) bezirke.add(c.bezirk);
    c.topics.forEach((t) => topics.add(t));
    if (c.format) formats.add(c.format);
    if (c.costType) costTypes.add(c.costType);
    if (c.ageMin != null) ageMin = Math.min(ageMin, c.ageMin);
    if (c.ageMax != null) ageMax = Math.max(ageMax, c.ageMax);
    if (c.priceChf != null) maxPrice = Math.max(maxPrice, c.priceChf);
    for (const o of c.occasions) {
      if (o.isoYear && o.isoWeekStart) {
        for (let w = o.isoWeekStart; w <= (o.isoWeekEnd ?? o.isoWeekStart); w++) {
          const { start, end } = isoWeekDates(o.isoYear, w);
          if (end < today) continue; // don't list weeks that are already over
          const key = `${o.isoYear}-${w}`;
          if (!weekMap.has(key)) {
            weekMap.set(key, { isoYear: o.isoYear, isoWeek: w, startDate: start, endDate: end, courseCount: 0 });
          }
          weekMap.get(key)!.courseCount++;
        }
      }
    }
  }

  return {
    total: courses.length,
    sources: [...new Set(courses.map((c) => c.source))].sort(),
    communes: [...communes].sort((a, b) => a.localeCompare(b, "de")),
    bezirke: [...bezirke].sort((a, b) => bezirkSortKey(a).localeCompare(bezirkSortKey(b))),
    topics: [...topics].sort(),
    formats: [...formats].sort(),
    costTypes: [...costTypes].sort(),
    weeks: [...weekMap.values()].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    ageMin: ageMin === 99 ? 0 : ageMin,
    ageMax: ageMax === 0 ? 18 : ageMax,
    maxPrice: Math.ceil(maxPrice / 10) * 10,
  };
}

function buildAdmin() {
  const total = (db.prepare("SELECT COUNT(*) n FROM course").get() as Row).n as number;
  const duplicates = (db.prepare("SELECT COUNT(*) n FROM course WHERE raw LIKE '%dup_of%'").get() as Row).n as number;
  const occasions = (db.prepare("SELECT COUNT(*) n FROM occasion").get() as Row).n as number;

  const bySource = (db
    .prepare(
      `SELECT c.source AS source, COUNT(DISTINCT c.id) AS courses,
              COUNT(o.id) AS occasions
       FROM course c LEFT JOIN occasion o ON o.course_id = c.id
       GROUP BY c.source ORDER BY courses DESC`,
    )
    .all() as Row[]).map((r) => ({ source: r.source, courses: r.courses, occasions: r.occasions }));

  const dist = (col: string) => {
    const rows = db.prepare(`SELECT ${col} k, COUNT(*) n FROM course GROUP BY ${col}`).all() as Row[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.k ?? "—"] = r.n;
    return out;
  };
  const byCost = dist("cost_type");
  const byFormat = dist("format");

  // topics live in a JSON array column
  const byTopic: Record<string, number> = {};
  for (const r of db.prepare("SELECT topics FROM course").all() as Row[]) {
    for (const t of JSON.parse(r.topics || "[]")) byTopic[t] = (byTopic[t] ?? 0) + 1;
  }

  const byCommune = (db
    .prepare("SELECT commune, COUNT(*) count FROM course WHERE commune IS NOT NULL GROUP BY commune ORDER BY count DESC")
    .all() as Row[]).map((r) => ({ commune: r.commune, count: r.count }));

  const cov = (where: string) => {
    const n = (db.prepare(`SELECT COUNT(*) n FROM course WHERE ${where}`).get() as Row).n as number;
    return { n, pct: total ? Math.round((100 * n) / total) : 0 };
  };
  const datedN = (db.prepare("SELECT COUNT(DISTINCT course_id) n FROM occasion WHERE start_date IS NOT NULL").get() as Row).n as number;
  const coverage: Record<string, { n: number; pct: number }> = {
    image: cov("image_local_path IS NOT NULL AND image_local_path != ''"),
    coordinates: cov("lat IS NOT NULL"),
    age: cov("age_min IS NOT NULL"),
    price: cov("price_chf IS NOT NULL"),
    commune: cov("commune IS NOT NULL"),
    datedOccasion: { n: datedN, pct: total ? Math.round((100 * datedN) / total) : 0 },
  };

  const runs = db.prepare("SELECT * FROM crawl_run ORDER BY id DESC LIMIT 50").all() as Row[];

  // "true potential" — data-aware estimates of headroom
  const feriennetCourses = bySource
    .filter((s) => String(s.source).startsWith("feriennet"))
    .reduce((a, s) => a + s.courses, 0);
  const feriennetInstances = bySource.filter((s) => String(s.source).startsWith("feriennet")).length;
  const discoveredProviders = bySource.filter((s) => String(s.source).startsWith("discovered:")).length;
  const unique = total - duplicates;
  const potential = [
    {
      label: "Other holiday periods (autumn/winter/spring)",
      status: "untapped" as const,
      estimate: feriennetCourses * 2,
      note: "Biggest lever. Only the active summer period is published/crawled on Feriennet; autumn/winter/spring add ~2× once communes publish them.",
    },
    {
      label: `Deeper long-tail discovery (${discoveredProviders} providers found)`,
      status: "partial" as const,
      estimate: 150,
      note: `The discovery scout already found ${discoveredProviders} independent providers; more exist via social media (Instagram/FB) + deeper search. NB: organic extraction is thin (~24% of discovered rows have age+price+date) — a verification pass would enrich existing rows rather than add new ones.`,
    },
    {
      label: `More Feriennet ZH commune instances (${feriennetInstances} crawled)`,
      status: "partial" as const,
      estimate: 40,
      note: "A few more standalone commune instances may exist beyond those probed.",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    totals: { courses: total, uniqueCourses: unique, duplicates, occasions },
    bySource,
    byTopic,
    byCost,
    byFormat,
    byCommune,
    coverage,
    runs,
    potential,
  };
}

// --- write the static JSON ---
fs.mkdirSync(OUT_DIR, { recursive: true });

const courses = loadCourses();
const meta = buildMeta(courses);
const admin = buildAdmin();

fs.writeFileSync(path.join(OUT_DIR, "courses.json"), JSON.stringify({ count: courses.length, courses }));
fs.writeFileSync(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta));
fs.writeFileSync(path.join(OUT_DIR, "admin.json"), JSON.stringify(admin));

console.log(
  `Exported ${courses.length} courses → ${OUT_DIR}\n` +
    `  meta: ${meta.total} total, ${meta.communes.length} communes, ${meta.bezirke.length} bezirke, ${meta.weeks.length} weeks\n` +
    `  admin: ${admin.totals.courses} courses (${admin.totals.duplicates} dup), ${admin.totals.occasions} occasions`,
);
