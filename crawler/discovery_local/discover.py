"""Local discovery scout — finds long-tail ZH kids' camp providers.

WHY IT MUST RUN LOCALLY (on a Swiss IP): search results are geo-localized. From a US egress,
Google/Startpage return US results and never surface hyperlocal Zürich providers (that's how we
missed verabjj.ch). From a Swiss IP (your machine, or NordVPN→CH) the same search returns the
Zürich-local results you see in your browser — verified: Startpage surfaces verabjj.ch from CH.

SEARCH BACKEND: **Startpage** (serves Google results) via plain HTTP. Chosen because direct
Google scraping is CAPTCHA-walled (especially from VPN/datacenter IPs) and Bing CAPTCHA'd too,
but Startpage returned full Swiss-localized Google results with no wall and no browser needed.

PIPELINE
  Startpage search (query matrix, Swiss-localized)
    → candidate provider domains (+ social links set aside)
    → crawl each site's homepage + nav/internal links for camp pages   # catches pages
       orphaned from sitemap.xml but present in the nav (verabjj.ch/summer-camp-2026)
    → dump {url,title,text} to ./discovery_out/

HANDOFF: commit/zip ./discovery_out/ → Claude extracts structured records → discovery.ingest().

SETUP
  pip install httpx selectolax        # no browser needed
  python discover.py --max-domains 40
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

KNOWN_PLATFORMS = {
    "feriennet.projuventute.ch", "projuventute.ch", "kompass.projuventute.ch",
    "ferienprogramm.ch", "jugendsportcamps.ch", "zh.ch", "codora.ch", "frilingue.ch",
    "stadt-zuerich.ch", "startpage.com",
}
SOCIAL = {"instagram.com", "facebook.com", "tiktok.com", "youtube.com", "linkedin.com",
          "twitter.com", "x.com", "reddit.com", "mastodon.social", "pinterest.com"}

# Broad topic net — ~30 mainstream kids'-camp categories (DE). Martial arts / jiu-jitsu is
# included as one category among many (legit coverage), NOT as a pointer to any one provider.
TOPICS_DE = [
    "sommercamp", "ferienkurs", "ferienlager", "tagescamp", "feriencamp",
    "kampfsport ferien", "jiu jitsu kinder", "judo karate ferien",
    "tanz ferienkurs", "ballett ferienkurs", "hip hop tanzcamp",
    "musik ferienkurs", "gesang ferienkurs", "band feriencamp",
    "kunst ferienworkshop", "malen ferienkurs", "töpfern ferienkurs",
    "reitlager", "ponylager", "schwimmkurs ferien", "segel ferienlager",
    "wissenschaft feriencamp", "robotik ferienkurs", "programmieren ferienkurs",
    "kochkurs kinder ferien", "zirkus ferienkurs", "kletter feriencamp",
    "fussball feriencamp", "tennis feriencamp", "theater ferienkurs",
    "foto ferienkurs", "abenteuer feriencamp", "natur ferienkurs", "bauernhof ferien kinder",
]
TOPICS_EN = ["summer camp kids", "holiday camp children", "jiu jitsu kids summer camp",
             "martial arts kids camp", "coding camp kids", "theatre camp kids",
             "science camp kids", "dance camp kids", "art camp kids"]
REGIONS = ["zürich", "winterthur", "zürich oberland", "uster"]
YEAR = "2026"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def queries() -> list[str]:
    qs = []
    # every topic × Zürich; plus every 2nd topic also × Winterthur/Oberland for spread
    for i, t in enumerate(TOPICS_DE):
        qs.append(f"{t} kinder zürich {YEAR}")
        if i % 2 == 0:
            qs.append(f"{t} kinder {REGIONS[i % len(REGIONS)]} {YEAR}")
    for t in TOPICS_EN:
        qs.append(f"{t} zürich {YEAR}")
    seen, out = set(), []
    for q in qs:
        if q not in seen:
            seen.add(q); out.append(q)
    return out


def domain_of(url: str) -> str:
    h = (urlparse(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


# ----------------------------------------------------------------------------- search

def startpage_search(query: str, client: httpx.Client) -> list[dict]:
    """Startpage serves Google results; organic links are <a class='result-link'>."""
    r = client.get("https://www.startpage.com/sp/search",
                   params={"query": query, "cat": "web", "language": "deutsch"})
    if r.status_code != 200:
        return []
    tree = HTMLParser(r.text)
    hits = []
    for a in tree.css("a.result-link"):
        href = a.attributes.get("href", "")
        if href.startswith("http") and "startpage.com" not in href:
            hits.append({"url": href, "title": a.text(strip=True), "query": query})
    return hits


# ----------------------------------------------------------------------------- crawl

CAMP_HINT = re.compile(r"(camp|ferien|sommer|summer|holiday|kurs|lager|workshop|programm|program)", re.I)


def crawl_site(domain: str, client: httpx.Client, max_pages: int = 6) -> list[dict]:
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
        for s in tree.css("script,style,nav,footer,header,svg,noscript"):
            s.decompose()
        text = re.sub(r"\s+", " ", tree.text()).strip()
        title_el = tree.css_first("title")
        pages.append({"url": url, "title": title_el.text(strip=True) if title_el else "",
                      "text": text[:6000]})

    keep(home.text, base)
    tree = HTMLParser(home.text)
    seen = {base}
    candidates = []
    for a in tree.css("a[href]"):
        full = urljoin(base, a.attributes.get("href", ""))
        if domain_of(full) != domain or full in seen:
            continue
        if CAMP_HINT.search((a.text() or "") + " " + a.attributes.get("href", "")):
            seen.add(full); candidates.append(full)
    for url in candidates[: max_pages - 1]:
        try:
            r = client.get(url)
            if r.status_code == 200 and "text/html" in r.headers.get("content-type", ""):
                keep(r.text, url)
            time.sleep(0.4)
        except Exception:
            continue
    return pages


# ----------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description="Local discovery scout (run on a Swiss IP)")
    ap.add_argument("--max-domains", type=int, default=40)
    ap.add_argument("--max-queries", type=int, default=0)
    args = ap.parse_args()

    OUT.mkdir(exist_ok=True)
    PAGES.mkdir(exist_ok=True)
    qs = queries()
    if args.max_queries:
        qs = qs[: args.max_queries]
    print(f"[scout] {len(qs)} queries via Startpage")

    all_hits: list[dict] = []
    with httpx.Client(follow_redirects=True, timeout=25, headers={"User-Agent": UA}) as client:
        for q in qs:
            try:
                hits = startpage_search(q, client)
                print(f"   '{q}' → {len(hits)} hits")
                all_hits.extend(hits)
                time.sleep(2.0)  # be polite to Startpage
            except Exception as e:
                print(f"   ! query failed '{q}': {e}")

        (OUT / "hits.json").write_text(json.dumps(all_hits, ensure_ascii=False, indent=1))

        social_hits, domains, seen_d = [], [], set()
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

        for i, d in enumerate(domains, 1):
            print(f"   [{i}/{len(domains)}] crawl {d}")
            for pg in crawl_site(d, client):
                key = hashlib.sha1(pg["url"].encode()).hexdigest()[:16]
                (PAGES / f"{key}.json").write_text(json.dumps(pg, ensure_ascii=False, indent=1))

    n = len(list(PAGES.glob("*.json")))
    print(f"\n[scout] done. {n} candidate pages → {PAGES}")
    print("        hand discovery_out/ to Claude for extraction → ingest.")


if __name__ == "__main__":
    main()
