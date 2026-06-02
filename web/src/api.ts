import type { Course, Meta } from "../shared/types.ts";

export async function fetchMeta(): Promise<Meta> {
  const r = await fetch("/api/meta");
  if (!r.ok) throw new Error("meta failed");
  return r.json();
}

export async function fetchCourses(
  filters: Record<string, string>,
): Promise<{ count: number; courses: Course[] }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const r = await fetch("/api/courses?" + params.toString());
  if (!r.ok) throw new Error("courses failed");
  return r.json();
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
  const r = await fetch("/api/admin");
  if (!r.ok) throw new Error("admin failed");
  return r.json();
}
