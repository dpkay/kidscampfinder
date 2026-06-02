# Discovery crawler — catching the long tail

## The problem

Our platform adapters (Feriennet fleet, ferienprogramm, jugendsportcamps, codora, friLingue)
are high-yield: one adapter → hundreds of courses. But they only see providers that **list on
a platform**. The long tail — an independent gym, a studio's Wix site, a science-camp startup —
advertises only on **its own website** and is invisible to platform crawling.

This is exactly how we missed `verabjj.ch/summer-camp-2026` (a Zürich kids' BJJ camp): it isn't
on any platform we crawl, so there was never a path to it. The complaint was a coverage gap,
not a bug.

## The pipeline

```
search (many queries)  →  filter candidates  →  EXTRACT (per arbitrary page)  →  dedup vs DB  →  persist
```

1. **Search** — a matrix of queries (`{topic} × {region} × "ferien/sommercamp kinder 2026"`,
   DE + EN). DuckDuckGo's HTML endpoint works keyless; a paid search API gives better recall.
2. **Filter** — drop domains we already crawl and obvious non-providers; fetch each candidate.
3. **Extract** — the hard part. Every site's HTML differs and most have **no structured data**
   (VeraBJJ's only JSON-LD is Wix boilerplate; the real details — *"03–07 August", "Ages 4–5",
   "450 CHF/week"* — are free-form prose). Reliable extraction needs an **LLM**.
4. **Dedup** — discovery re-finds platform courses, so every record is fuzzy-matched
   (`rapidfuzz` on normalized title within the same commune) against the existing DB and skipped
   if already covered. See `crawler/coursecrawler/discovery.py`.
5. **Persist** — as `source="discovered:<domain>"` with `raw.needs_verify=true`,
   `raw.confidence`, and the originating `raw.query`, so the web layer can treat discovered
   data as **lower-trust** than platform data (badge it, or gate it behind a toggle).

`discovery.py` owns steps 4–5 (the safe-landing part) and is extractor-agnostic: feed it a list
of normalized records and it normalizes (KW derivation, snippet, commune geocode), dedups, and
upserts. CLI: `python -m coursecrawler.discovery records.json`.

## What's built now: the agent-driven prototype

Per the chosen approach, **extraction is currently agent-driven** (Claude Code drives it with
its `WebSearch` + `WebFetch` tools): search → fetch candidate pages → the agent extracts
structured records → `discovery.ingest()`. This proves the loop end-to-end and ingests real
long-tail sites today, **without a standalone API key**. It is not yet a headless, repeatable
crawler — re-running it means asking the agent to do another discovery pass.

**Discovered in the first pass (12 courses, 4 providers — all Zürich long-tail, none on any
platform):**

| Provider | Courses | Topic | Note |
|---|---|---|---|
| `verabjj.ch` | 2 | sports (BJJ) | the original complaint — now listed |
| `sparkscience.ch` | 4 | science | GZ Wollishofen (1 is Risch-Rotkreuz/ZG) |
| `xlabs.ch` | 5 | science/arts | chemistry, engineering, forensics |
| `closeencounterstheatre.com` | 1 (2 sessions) | arts | acting/singing/dancing |

This lifted **science 33 → 42** and added a theatre/arts provider — diversity platforms missed.

## Productionizing (the standalone crawler)

To run without the agent in the loop, step 3 needs a programmatic LLM. Sketch:

```
discovery/
  search.py     # DDG (keyless) or a search API → candidate URLs
  extract.py    # fetch + clean to text → Claude (Haiku) with a StructuredOutput tool →
                #   validated records JSON. Use prompt caching on the system/instructions.
  run.py        # search → extract → discovery.ingest(), with a per-run budget cap
```

- **LLM:** Claude Haiku is the right cost/quality tier; force a structured-output tool so the
  model returns schema-valid JSON (no parsing), and cache the long extraction instructions.
  **Requires `ANTHROPIC_API_KEY`** (none is set in this environment today — the blocker that led
  us to the agent-driven prototype).
- **Cost:** ~fractions of a cent per page with Haiku; scales with candidate count.
- **Verification:** a second adversarial pass ("is this really a ZH kids' holiday course? do the
  dates/price/age check out?") before clearing `needs_verify`. Cheap insurance against
  extraction noise.

## Known caveats (seen in the first pass)

- **Extraction noise:** the LLM occasionally mislabels (e.g. a NUEJOS summer camp got a "winter
  sports" description). Hence `needs_verify=true` on all discovered rows and a recommended
  verification pass.
- **Out-of-canton spill:** ZH-targeted searches surface near-border providers (NUEJOS in Baar/ZG,
  one Spark camp in Risch-Rotkreuz/ZG). We store the true commune; the web layer's `inZH`/Bezirk
  lookup is the precise canton filter. NUEJOS and ZSF were *found but not ingested* in this pass
  (Baar location / no individually-bookable camps exposed) — candidates for a verified run.
- **No images yet** for discovered courses (topic-emoji placeholder); `og:image` extraction is an
  easy add.
- **Trust:** discovered data should be visually distinguished in the UI and is a candidate for a
  lightweight human/LLM review queue.
