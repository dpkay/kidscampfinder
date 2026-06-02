"""Crawl runner: orchestrate adapters, persist, enrich, and report."""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import traceback
from collections import Counter

from . import config, db, dedup, geo, images
from .http import Fetcher
from .adapters.feriennet import FeriennetAdapter


def build_adapters(fetcher: Fetcher, only: list[str] | None) -> list:
    registry = {
        "feriennet": lambda: FeriennetAdapter(fetcher),
    }
    # additional adapters get registered here as they are built
    try:
        from .adapters.ferienprogramm import FerienprogrammAdapter
        registry["ferienprogramm"] = lambda: FerienprogrammAdapter(fetcher)
    except Exception:  # noqa: BLE001
        pass
    try:
        from .adapters.codora import CodoraAdapter
        registry["codora"] = lambda: CodoraAdapter(fetcher)
    except Exception:  # noqa: BLE001
        pass
    try:
        from .adapters.frilingue import FrilingueAdapter
        registry["frilingue"] = lambda: FrilingueAdapter(fetcher)
    except Exception:  # noqa: BLE001
        pass
    try:
        from .adapters.jugendsportcamps import JugendsportcampsAdapter
        registry["jugendsportcamps"] = lambda: JugendsportcampsAdapter(fetcher)
    except Exception:  # noqa: BLE001
        pass
    try:
        from .adapters.providers import build_provider_adapters
        for a in build_provider_adapters(fetcher):
            registry[a.source] = (lambda a=a: a)
    except Exception:  # noqa: BLE001
        pass

    selected = only or list(registry.keys())
    adapters = []
    for key in selected:
        if key in registry:
            adapters.append(registry[key]())
        else:
            print(f"  [run] unknown source '{key}' (have: {', '.join(registry)})")
    return adapters


def crawl(args) -> None:
    config.ensure_dirs()
    fetcher = Fetcher(use_cache=not args.no_cache)
    conn = db.connect()
    db.init_db(conn)

    adapters = build_adapters(fetcher, args.only)
    if not adapters:
        print("No adapters selected.")
        return

    grand = Counter()
    for adapter in adapters:
        started = db.now_iso()
        fetched = parsed = new = updated = errors = 0
        print(f"\n=== source: {adapter.source} ===")
        try:
            for course in adapter.fetch():
                fetched += 1
                try:
                    status = db.upsert_course(conn, course)
                    parsed += 1
                    new += status == "new"
                    updated += status == "updated"
                    if args.limit and parsed >= args.limit:
                        break
                except Exception as e:  # noqa: BLE001
                    errors += 1
                    print(f"  [run] upsert error: {e}")
            conn.commit()
        except Exception:  # noqa: BLE001
            errors += 1
            print(f"  [run] adapter {adapter.source} crashed:\n{traceback.format_exc()}")

        note = ""
        avg = db.trailing_avg_parsed(conn, adapter.source)
        if parsed == 0:
            note = "ALERT: 0 records parsed — adapter likely broken!"
            print(f"  ⚠️  {note}")
        elif avg and parsed < 0.5 * avg:
            note = f"ALERT: parsed {parsed} << trailing avg {avg:.0f}"
            print(f"  ⚠️  {note}")
        db.record_run(
            conn, started_at=started, source=adapter.source, fetched=fetched,
            parsed=parsed, new=new, updated=updated, errors=errors, note=note,
        )
        print(f"  {adapter.source}: fetched={fetched} parsed={parsed} "
              f"new={new} updated={updated} errors={errors}")
        for k, v in (("fetched", fetched), ("parsed", parsed), ("new", new),
                     ("updated", updated), ("errors", errors)):
            grand[k] += v

    # post-processing passes
    print("\n=== post-processing ===")
    coords = geo.backfill_coords(conn)
    print(f"  backfilled coords for {coords} courses")
    if not args.skip_images:
        n = images.fetch_images(conn, fetcher)
        print(f"  downloaded {n} images")
    dups = dedup.find_duplicates(conn)
    print(f"  flagged {dups} cross-source duplicates")

    fetcher.close()
    print(f"\n=== TOTAL: {dict(grand)} ===")
    report(conn)
    conn.close()


def report(conn: sqlite3.Connection) -> None:
    print("\n========== DATASET REPORT ==========")
    total = conn.execute("SELECT COUNT(*) n FROM course").fetchone()["n"]
    occ = conn.execute("SELECT COUNT(*) n FROM occasion").fetchone()["n"]
    dups = conn.execute("SELECT COUNT(*) n FROM course WHERE raw LIKE '%dup_of%'").fetchone()["n"]
    print(f"courses: {total}  (unique after dedup: {total - dups})   occasions: {occ}")

    def dist(col, label, expr=None):
        q = f"SELECT {expr or col} k, COUNT(*) n FROM course GROUP BY k ORDER BY n DESC"
        rows = conn.execute(q).fetchall()
        print(f"\n{label}:")
        for r in rows[:20]:
            print(f"   {str(r['k'])[:30]:<30} {r['n']}")

    dist("source", "by source")
    dist("cost_type", "by cost type")
    dist("commune", "by commune (top 20)")

    # topics (JSON arrays)
    tc = Counter()
    for r in conn.execute("SELECT topics FROM course"):
        for t in json.loads(r["topics"] or "[]"):
            tc[t] += 1
    print("\nby topic:")
    for t, n in tc.most_common():
        print(f"   {t:<14} {n}")

    # quality metrics
    def pct(where):
        n = conn.execute(f"SELECT COUNT(*) n FROM course WHERE {where}").fetchone()["n"]
        return f"{n}/{total} ({100*n/total:.0f}%)" if total else "0"
    print("\ndata quality:")
    print(f"   with image:        {pct('image_local_path IS NOT NULL')}")
    print(f"   with coordinates:  {pct('lat IS NOT NULL')}")
    print(f"   with age range:    {pct('age_min IS NOT NULL')}")
    print(f"   with price:        {pct('price_chf IS NOT NULL')}")
    print(f"   with commune:      {pct('commune IS NOT NULL')}")
    with_occ = conn.execute(
        "SELECT COUNT(DISTINCT course_id) n FROM occasion WHERE start_date IS NOT NULL"
    ).fetchone()["n"]
    print(f"   with dated occasion: {with_occ}/{total} "
          f"({100*with_occ/total:.0f}%)" if total else "0")
    print("====================================")


def main() -> None:
    p = argparse.ArgumentParser(description="CourseCrawler crawl runner")
    p.add_argument("--only", nargs="*", help="only run these sources")
    p.add_argument("--no-cache", action="store_true", help="bypass HTML cache")
    p.add_argument("--limit", type=int, default=0, help="max records per source (testing)")
    p.add_argument("--skip-images", action="store_true", help="skip image download pass")
    p.add_argument("--report", action="store_true", help="only print dataset report")
    args = p.parse_args()

    if args.report:
        conn = db.connect()
        db.init_db(conn)
        report(conn)
        conn.close()
        return
    crawl(args)


if __name__ == "__main__":
    main()
