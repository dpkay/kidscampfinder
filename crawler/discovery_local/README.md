# Local discovery scout

Run this **on your own machine** (ideally with **NordVPN → Switzerland**). It does the
geo-sensitive half of discovery that the hosted agent can't: from a residential Swiss IP, a
real browser gets the **Zürich-localized, non-consent-walled Google results you actually see**
— including hyperlocal gyms and Instagram hits the US datacenter never surfaces.

## Why this exists
The hosted crawler egresses from a **US datacenter**. Google there is US-localized and
consent/CAPTCHA-walled, so it never finds e.g. `verabjj.ch/summer-camp-2026` (a Zürich camp
that ranks #2 on *your* Swiss Google). Searching from your machine fixes the geography.

## Setup
```bash
cd crawler/discovery_local
python3 -m venv .venv && source .venv/bin/activate
pip install playwright httpx selectolax
playwright install chromium
# connect NordVPN to Switzerland
python discover.py --max-domains 40
# debug the search visually: python discover.py --headful --max-queries 3
```

## What it does
1. **Search** (Playwright, real browser): runs a query matrix (`crawler/discovery_local/discover.py`
   → `TOPICS_*`, `REGIONS`) against Google `hl=de gl=ch`, clicks through consent, scrapes
   organic result links. Edit the query lists to widen coverage.
2. **Crawl** (httpx): for each candidate provider domain (platforms we already cover are
   skipped), fetches the homepage and follows **nav/internal links** to camp-ish pages
   (`camp|ferien|sommer|summer|kurs|lager|workshop|programm`). This catches pages that are
   **missing from `sitemap.xml` but present in the nav** — exactly verabjj.ch/summer-camp-2026.
3. **Dump** to `discovery_out/`:
   - `hits.json` — all search results
   - `social.json` — Instagram/Facebook/etc. links (kept aside; harder to extract)
   - `pages/<hash>.json` — `{url, title, text}` for each candidate camp page

## Handoff (extraction → ingest)
Extraction (turning free-form page text into structured course records) needs an LLM. Two ways:
- **Hand `discovery_out/` back to Claude** (zip it, or `git add` + commit it) → it extracts
  records and runs `python -m coursecrawler.discovery <records.json>` (dedups vs the DB,
  persists as `discovered:<domain>` with `needs_verify`).
- **Or run extraction yourself** with an `ANTHROPIC_API_KEY` (see `docs/discovery.md` for the
  Claude-Haiku structured-output approach).

## Status
- Crawl step **verified**: from `verabjj.ch` it reaches `/summer-camp-2026` and captures
  Ages/August/Jiu-Jitsu/CHF signals.
- Search step must run from a Swiss IP — it cannot be validated from the hosted US egress
  (that's the whole point).
