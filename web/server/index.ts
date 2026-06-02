import express from "express";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import type { Course, Occasion, Meta, WeekInfo } from "../shared/types.ts";
import { communeInfo, bezirkSortKey } from "../shared/bezirk.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DB_PATH = process.env.CC_DB ?? path.join(REPO_ROOT, "data", "coursecrawler.sqlite");
const IMAGE_DIR = path.join(REPO_ROOT, "data", "images");
const DIST_DIR = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT ?? 8787);

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

function applyFilters(courses: Course[], q: Record<string, string | undefined>): Course[] {
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
  return out.sort((a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999"));
}

const app = express();

// In-memory cache invalidated on DB mtime change.
let cache: { mtime: number; courses: Course[]; meta: Meta } | null = null;
function getData() {
  const mtime = fs.statSync(DB_PATH).mtimeMs;
  if (!cache || cache.mtime !== mtime) {
    const courses = loadCourses();
    cache = { mtime, courses, meta: buildMeta(courses) };
  }
  return cache;
}

app.get("/api/meta", (_req, res) => {
  res.json(getData().meta);
});

app.get("/api/courses", (req, res) => {
  const { courses } = getData();
  const filtered = applyFilters(courses, req.query as Record<string, string>);
  res.json({ count: filtered.length, courses: filtered });
});

app.get("/api/course/:id", (req, res) => {
  const c = getData().courses.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: "not found" });
  res.json(c);
});

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
  const unique = total - duplicates;
  const potential = [
    {
      label: `Feriennet instances (${feriennetInstances} crawled)`,
      status: "partial" as const,
      estimate: 60,
      note: "More ZH commune instances exist beyond those probed; ~+60 courses plausible.",
    },
    {
      label: "Other holiday periods (autumn/winter/spring)",
      status: "untapped" as const,
      estimate: feriennetCourses * 2,
      note: "Only the active period is crawled. Each instance also runs other-period passes.",
    },
    {
      label: "jugendsportcamps.ch (cantonal)",
      status: "untapped" as const,
      estimate: 30,
      note: "~30 authoritative cantonal sports camps. JS-rendered → needs a Playwright adapter.",
    },
    {
      label: "Private providers (Logiscool, Kinder-Camps, friLingue, …)",
      status: "untapped" as const,
      estimate: 150,
      note: "Paid coding/sport/language segment. Each provider is a bespoke adapter.",
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

app.get("/api/admin", (_req, res) => {
  res.json(buildAdmin());
});

app.use("/images", express.static(IMAGE_DIR, { maxAge: "1h" }));
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("*", (_req, res) => res.sendFile(path.join(DIST_DIR, "index.html")));
}

app.listen(PORT, () => {
  const { meta } = getData();
  console.log(`CourseCrawler API on http://localhost:${PORT}  (${meta.total} courses, ${meta.communes.length} communes)`);
});
