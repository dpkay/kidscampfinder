export type Lang = "de" | "en";

type Dict = Record<string, { de: string; en: string }>;

const STRINGS: Dict = {
  title: { de: "Ferienkurse Kanton Zürich", en: "Holiday Courses Canton Zürich" },
  subtitle: {
    de: "Alle Kinder-Ferienkurse an einem Ort",
    en: "All kids' holiday courses in one place",
  },
  search: { de: "Suchen…", en: "Search…" },
  week: { de: "Kalenderwoche", en: "Calendar week" },
  allWeeks: { de: "Alle Wochen", en: "All weeks" },
  age: { de: "Alter des Kindes", en: "Child's age" },
  anyAge: { de: "Jedes Alter", en: "Any age" },
  bezirk: { de: "Bezirk", en: "District" },
  allBezirke: { de: "Alle Bezirke", en: "All districts" },
  topic: { de: "Thema", en: "Topic" },
  allTopics: { de: "Alle Themen", en: "All topics" },
  maxCost: { de: "Max. Kosten", en: "Max cost" },
  anyCost: { de: "Egal", en: "Any" },
  free: { de: "Gratis", en: "Free" },
  paid: { de: "Kostenpflichtig", en: "Paid" },
  noLimit: { de: "Beliebig", en: "Any" },
  format: { de: "Format", en: "Format" },
  anyFormat: { de: "Jedes Format", en: "Any format" },
  results: { de: "Kurse gefunden", en: "courses found" },
  reset: { de: "Zurücksetzen", en: "Reset" },
  map: { de: "Karte", en: "Map" },
  list: { de: "Liste", en: "List" },
  noResults: { de: "Keine Kurse gefunden", en: "No courses found" },
  broaden: {
    de: "Versuche, einen Filter zu entfernen oder eine andere Woche/Gemeinde zu wählen.",
    en: "Try removing a filter or picking a different week/municipality.",
  },
  runs: { de: "läuft", en: "runs" },
  ages: { de: "Jahre", en: "years" },
  details: { de: "Details", en: "Details" },
  toProvider: { de: "Zur Anbieter-Seite ↗", en: "To provider page ↗" },
  dates: { de: "Daten", en: "Dates" },
  deadline: { de: "Anmeldeschluss", en: "Registration deadline" },
  unknown: { de: "unbekannt", en: "unknown" },
  spots: { de: "Plätze frei", en: "spots left" },
  source: { de: "Quelle", en: "Source" },
  updated: { de: "aktualisiert", en: "updated" },
  disclaimer: {
    de: "Bitte alle Angaben direkt beim Anbieter prüfen.",
    en: "Please verify all details directly with the provider.",
  },
  admin: { de: "Admin", en: "Admin" },
  close: { de: "Schliessen", en: "Close" },
  filter: { de: "Filter", en: "Filters" },
  showResults: { de: "Anzeigen", en: "Show results" },
  allCourses: { de: "Alle Kurse", en: "All courses" },
  coursesIn: { de: "Kurse in", en: "Courses in" },
  anyWeek: { de: "alle Wochen", en: "any week" },
  anyAgeShort: { de: "alle Alter", en: "any age" },
  anyPriceShort: { de: "jeder Preis", en: "any price" },
  anyFormatShort: { de: "jedes Format", en: "any format" },
  searchHere: { de: "In diesem Bereich suchen", en: "Search this area" },
  inThisArea: { de: "in diesem Kartenausschnitt", en: "in this map area" },
  swipeHint: { de: "↕ wischen für nächste · ← wegwischen", en: "↕ swipe for next · ← swipe to dismiss" },
  daysAgo: { de: "Tg.", en: "d ago" },
};

const TOPIC_LABELS: Dict = {
  sports: { de: "Sport", en: "Sports" },
  languages: { de: "Sprachen", en: "Languages" },
  coding: { de: "Programmieren", en: "Coding" },
  arts: { de: "Kunst & Basteln", en: "Arts & crafts" },
  music: { de: "Musik", en: "Music" },
  science: { de: "Wissenschaft", en: "Science" },
  food: { de: "Kochen & Backen", en: "Cooking & baking" },
  academic: { de: "Schule & Nachhilfe", en: "Academic" },
  nature: { de: "Natur & Tiere", en: "Nature & animals" },
  other: { de: "Sonstiges", en: "Other" },
};

const FORMAT_LABELS: Dict = {
  half_day: { de: "Halbtag", en: "Half-day" },
  full_day: { de: "Ganztag", en: "Full-day" },
  multi_day: { de: "Mehrtägig", en: "Multi-day" },
  weekly: { de: "Wochenkurs", en: "Weekly" },
  residential: { de: "Lager (Übernachtung)", en: "Residential camp" },
  unknown: { de: "—", en: "—" },
};

export function makeT(lang: Lang) {
  const t = (key: string) => STRINGS[key]?.[lang] ?? key;
  const topic = (k: string) => TOPIC_LABELS[k]?.[lang] ?? k;
  const format = (k: string) => FORMAT_LABELS[k]?.[lang] ?? k;
  return { t, topic, format };
}
