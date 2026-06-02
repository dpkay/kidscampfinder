export function prettySource(source: string): string {
  if (source.startsWith("feriennet:")) return "Feriennet · " + source.split(":")[1];
  const names: Record<string, string> = {
    ferienprogramm: "ferienprogramm.ch",
    codora: "codora.ch",
    jugendsportcamps: "jugendsportcamps.ch",
  };
  return names[source] ?? source;
}

// Link-out target for a course. The crawler now stores correct per-source URLs
// (incl. jugendsportcamps /camp/<slug>), so we just use sourceUrl as-is.
export function linkOut(course: { source: string; sourceUrl: string }): string {
  return course.sourceUrl;
}
