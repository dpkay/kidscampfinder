import type { Course, Meta } from "../shared/types.ts";
import { applyFilters } from "./filter.ts";

export async function fetchMeta(): Promise<Meta> {
  const r = await fetch("/api/meta.json");
  if (!r.ok) throw new Error("meta failed");
  return r.json();
}

// The full course set is now static JSON served from the CDN. Fetch it ONCE
// (cached in a module-level promise) and filter in-memory — same return shape
// callers always expected from the old /api/courses endpoint.
let allCoursesPromise: Promise<Course[]> | null = null;
function loadAllCourses(): Promise<Course[]> {
  if (!allCoursesPromise) {
    allCoursesPromise = fetch("/api/courses.json")
      .then((r) => {
        if (!r.ok) throw new Error("courses failed");
        return r.json();
      })
      .then((d: { count: number; courses: Course[] }) => d.courses)
      .catch((e) => {
        allCoursesPromise = null; // allow retry on failure
        throw e;
      });
  }
  return allCoursesPromise;
}

export async function fetchCourses(
  filters: Record<string, string>,
): Promise<{ count: number; courses: Course[] }> {
  const all = await loadAllCourses();
  const courses = applyFilters(all, filters);
  return { count: courses.length, courses };
}

export interface AdminData {
  generatedAt: string;
  totals: { courses: number; uniqueCourses: number; duplicates: number; occasions: number };
  bySource: { source: string; courses: number; occasions: number }[];
  byTopic: Record<string, number>;
  byCost: Record<string, number>;
  byFormat: Record<string, number>;
  byCommune: { commune: string; count: number }[];
  coverage: Record<string, { n: number; pct: number }>;
  runs: {
    id: number;
    started_at: string;
    finished_at: string;
    source: string;
    fetched: number;
    parsed: number;
    new: number;
    updated: number;
    errors: number;
    note: string;
  }[];
  potential: {
    label: string;
    status: "crawled" | "untapped" | "partial";
    estimate: number;
    note: string;
  }[];
}

export async function fetchAdmin(): Promise<AdminData> {
  const r = await fetch("/api/admin.json");
  if (!r.ok) throw new Error("admin failed");
  return r.json();
}
