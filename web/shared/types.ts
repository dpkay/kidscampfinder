// Shared types across the Express API and the React client.
// These mirror the SQLite schema (crawler/coursecrawler/schema.sql).

export interface Occasion {
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  isoYear: number | null;
  isoWeekStart: number | null;
  isoWeekEnd: number | null;
  holidayPeriod: string | null;
  registrationDeadline: string | null; // null = unknown
  spotsAvailable: number | null;
}

export interface Course {
  id: string;
  source: string;
  sourceUrl: string;
  title: string;
  snippet: string | null;
  provider: string | null;
  topics: string[];
  format: string;
  costType: string; // free | paid | unknown
  priceChf: number | null;
  ageMin: number | null;
  ageMax: number | null;
  language: string;
  commune: string | null;
  communeClean: string | null;
  bezirk: string | null;
  inZH: boolean;
  venueName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  imagePath: string | null; // e.g. "images/<hash>.jpg"
  lastSeen: string;
  occasions: Occasion[];
  // derived
  nextDate: string | null;
  weekLabel: string; // "KW 29" or "KW 29–31"
}

export interface WeekInfo {
  isoYear: number;
  isoWeek: number;
  startDate: string;
  endDate: string;
  courseCount: number;
}

export interface Meta {
  total: number;
  sources: string[];
  communes: string[];
  bezirke: string[];
  topics: string[];
  formats: string[];
  costTypes: string[];
  weeks: WeekInfo[];
  ageMin: number;
  ageMax: number;
  maxPrice: number;
}

export interface CourseQuery {
  week?: string; // isoWeek number
  ageMin?: string;
  ageMax?: string;
  bezirk?: string;
  commune?: string;
  topic?: string;
  cost?: string;
  format?: string;
  maxPrice?: string;
  q?: string;
  bbox?: string; // "west,south,east,north" (lng,lat,lng,lat)
}
