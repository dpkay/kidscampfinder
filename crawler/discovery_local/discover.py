"""Local discovery scout — RUN THIS ON YOUR OWN MACHINE (ideally NordVPN → Switzerland).

WHY LOCAL: the hosted agent egresses from a US datacenter, so Google serves US-localized,
consent/CAPTCHA-walled results and never surfaces hyperlocal Zürich providers — that's how we
missed verabjj.ch (a Zürich gym whose camp ranks #2 on *your* Swiss Google but is invisible
from a US IP). Running here, from a residential Swiss IP in a real browser, Google returns the
same Zürich-local results you see.

PIPELINE
  geo-localized Google search (Playwright, real browser)   # solves geo + consent + JS
    → candidate provider domains (+ social links kept aside)
    → crawl each site's homepage + nav/internal links for camp pages (httpx)   # finds the
       /summer-camp-2026 page even when it's missing from sitemap.xml (it's in the nav)
    → dump {url, title, text} to ./discovery_out/

HANDOFF: zip/commit ./discovery_out/ and hand it back to Claude → it extracts structured
course records and runs `python -m coursecrawler.discovery <records.json>`. (Or run extraction
yourself with an LLM key — see docs/discovery.md.)

SETUP (on your machine)
  python3 -m venv .venv && source .venv/bin/activate
  pip install playwright httpx selectolax
  playwright install chromium
  # connect NordVPN to Switzerland, then:
  python discover.py --max-domains 40

The search step needs the real browser (Playwright). The site-crawl step is plain httpx.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from selectolax.parser import HTMLParser

OUT = Path(__file__).parent / "discovery_out"
PAGES = OUT / "pages"

# Platforms we already crawl via dedicated adapters — skip as candidates.
KNOWN_PLATFORMS = {
    "feriennet.projuventute.ch", "projuventute.ch", "kompass.projuventute.ch",
    "ferienprogramm.ch", "jugendsportcamps.ch", "zh.ch", "codora.ch", "frilingue.ch",
    "stadt-zuerich.ch",
}
SOCIAL = {"instagram.com", "facebook.com", "tiktok.com", "youtube.com", "linkedin.com"}

# Query matrix: topic × (region) × holiday, DE + EN. Edit/extend freely.
TOPICS_DE = ["sommercamp", "ferienkurs", "ferienlager", "tagescamp", "kampfsport ferien",
             "tanz ferienkurs", "musik ferienkurs", "kunst ferienworkshop", "reitlager",
             "schwimmkurs ferien", "wissenschaft feriencamp", "koch kurs kinder ferien"]
TOPICS_EN = ["summer camp kids", "holiday camp children", "jiu jitsu kids summer camp",
             "coding camp kids", "theatre camp kids", "science camp kids"]
REGIONS = ["zürich", "winterthur", "zürich oberland", "zürich see", "uster", "dietikon"]
YEAR = "2026"


def queries() -> list[str]:
    qs = []
    for t in TOPICS_DE:
        for r in REGIONS[:3]:
            qs.append(f"{t} kinder {r} {YEAR}")
    for t in TOPICS_EN:
        qs.append(f"{t} {REGIONS[0]} {YEAR}")
    # dedupe, keep order
    seen, out = set(), []
    for q in qs:
        if q not in seen:
            seen.add(q); out.append(q)
    return out


def domain_of(url: str) -> str:
    h = (urlparse(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


# ----------------------------------------------------------------------------- search

def google_search(query: str, page) -> list[dict]:
    """Scrape one Google results page using a real browser (handles consent + JS)."""
    page.goto(
        "https://www.google.com/search?" + httpx.QueryParams(
            {"q": query, "hl": "de", "gl": "ch", "num": "20"}
        ).__str__(),
        wait_until="domcontentloaded",
        timeout=30000,
    )
    # consent: click "Alle akzeptieren" / "Accept all" if the dialog shows
    for label in ("Alle akzeptieren", "Accept all", "Ich stimme zu", "I agree"):
        try:
            btn = page.get_by_role("button", name=label)
            if btn.count():
                btn.first.click(timeout=2500)
                page.wait_for_timeout(800)
                break
        except Exception:
            pass
    page.wait_for_timeout(1200)
    hits = []
    # organic results: anchors that wrap an <h3>
    for a in page.query_selector_all("a:has(h3)"):
        href = a.get_attribute("href") or ""
        if not href.startswith("http"):
            continue
        h3 = a.query_selector("h3")
        title = h3.inner_text() if h3 else ""
        hits.append({"url": href, "title": title, "query": query})
    return hits


# ----------------------------------------------------------------------------- crawl

CAMP_HINT = re.compile(r"(camp|ferien|sommer|summer|holiday|kurs|lager|workshop|programm|program)", re.I)


def crawl_site(domain: str, client: httpx.Client, max_pages: int = 6) -> list[dict]:
    """Fetch a provider's homepage, follow internal nav links to camp-ish pages, dump text.

    Catches pages orphaned from sitemap.xml but present in the nav (e.g. verabjj.ch's
    /summer-camp-2026).
    """
    base = f"https://{domain}/"
    pages: list[dict] = []
    try:
        home = client.get(base)
        home.raise_for_status()
    except Exception as e:
        print(f"   ! {domain}: homepage failed ({e})")
        return pages

    def keep(html: str, url: str):
        tree = HTMLParser(html)
        for s in tree.css("script,style,nav,footer,header"):
            s.decompose()
        text = re.sub(r"\s+", " ", tree.text()).strip()
        pages.append({"url": url, "title": _title(tree), "text": text[:6000]})

    keep(home.text, base)

    # internal links that look camp-related
    tree = HTMLParser(home.text)
    seen = {base}
    candidates = []
    for a in tree.css("a[href]"):
        href = a.attributes.get("href", "")
        full = urljoin(base, href)
        if domain_of(full) != domain or full in seen:
            continue
        link_txt = (a.text() or "") + " " + href
        if CAMP_HINT.search(link_txt):
            seen.add(full)
            candidates.append(full)

    for url in candidates[: max_pages - 1]:
        try:
            r = client.get(url)
            if r.status_code == 200 and "text/html" in r.headers.get("content-type", ""):
                keep(r.text, url)
            time.sleep(0.5)
        except Exception:
            continue
    return pages


def _title(tree: HTMLParser) -> str:
    t = tree.css_first("title")
    return t.text(strip=True) if t else ""


# ----------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description="Local discovery scout (run on your machine, VPN→CH)")
    ap.add_argument("--max-domains", type=int, default=40)
    ap.add_argument("--max-queries", type=int, default=0, help="limit queries (0 = all)")
    ap.add_argument("--headful", action="store_true", help="show the browser (debug)")
    args = ap.parse_args()

    OUT.mkdir(exist_ok=True)
    PAGES.mkdir(exist_ok=True)

    from playwright.sync_api import sync_playwright

    qs = queries()
    if args.max_queries:
        qs = qs[: args.max_queries]
    print(f"[scout] {len(qs)} queries")

    all_hits: list[dict] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headful)
        ctx = browser.new_context(locale="de-CH",
                                   user_agent=("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                               "AppleWebKit/537.36 (KHTML, like Gecko) "
                                               "Chrome/120.0 Safari/537.36"))
        page = ctx.new_page()
        for q in qs:
            try:
                hits = google_search(q, page)
                print(f"   '{q}' → {len(hits)} hits")
                all_hits.extend(hits)
                time.sleep(1.5)
            except Exception as e:
                print(f"   ! query failed '{q}': {e}")
        browser.close()

    (OUT / "hits.json").write_text(json.dumps(all_hits, ensure_ascii=False, indent=1))

    # candidate domains (exclude platforms); keep social links aside
    social_hits, domains = [], []
    seen_d = set()
    for h in all_hits:
        d = domain_of(h["url"])
        if d in SOCIAL:
            social_hits.append(h); continue
        if d in KNOWN_PLATFORMS or not d or d in seen_d:
            continue
        seen_d.add(d); domains.append(d)
    domains = domains[: args.max_domains]
    (OUT / "social.json").write_text(json.dumps(social_hits, ensure_ascii=False, indent=1))
    print(f"[scout] {len(domains)} candidate domains, {len(social_hits)} social links")

    # crawl each candidate site
    with httpx.Client(follow_redirects=True, timeout=20,
                      headers={"User-Agent": "Mozilla/5.0 (compatible; coursecrawler-scout)"}) as client:
        for i, d in enumerate(domains, 1):
            print(f"   [{i}/{len(domains)}] crawl {d}")
            for pg in crawl_site(d, client):
                key = hashlib.sha1(pg["url"].encode()).hexdigest()[:16]
                (PAGES / f"{key}.json").write_text(json.dumps(pg, ensure_ascii=False, indent=1))

    n = len(list(PAGES.glob("*.json")))
    print(f"\n[scout] done. {n} candidate pages saved to {PAGES}")
    print("        zip/commit discovery_out/ and hand it to Claude for extraction → ingest.")


if __name__ == "__main__":
    main()
