"""Orchestrate: scrape -> store -> LLM analyze -> price-track.

    python pipeline.py                      # all KOLs in kols.yaml
    python pipeline.py --kol KotlinerBTC    # one handle
    python pipeline.py --kol KotlinerBTC --limit 20 --replies
    python pipeline.py --analyze-only       # skip scraping, just analyze + prices
"""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import yaml

from analysis import analyze, prices
from scraper import x_scraper
from storage import db

KOLS_YAML = Path(__file__).resolve().parent / "kols.yaml"


def load_seed_kols() -> list[dict]:
    data = yaml.safe_load(KOLS_YAML.read_text()) or {}
    return data.get("kols", [])


def sync_roster(conn) -> int:
    """Upsert every KOL in kols.yaml into the DB (active=1) with name/note/region.
    Does NOT scrape — the scheduler picks them up. Returns count."""
    n = 0
    for k in load_seed_kols():
        kid = db.upsert_kol(conn, k["handle"], k.get("display_name"),
                            k.get("tags"), note=k.get("note"), region=k.get("region"))
        conn.execute("UPDATE kols SET active=1 WHERE id=?", (kid,))
        n += 1
    conn.commit()
    return n


def add_seed_kols(handles: list[str]) -> list[str]:
    """Append new handles to kols.yaml (deduped). Returns the newly added handles."""
    data = yaml.safe_load(KOLS_YAML.read_text()) or {}
    kols = data.get("kols", [])
    existing = {k["handle"].lstrip("@").lower() for k in kols}
    added = []
    for h in handles:
        hl = h.strip().lstrip("@")
        if not hl or hl.lower() in existing:
            continue
        kols.append({"handle": hl})
        existing.add(hl.lower())
        added.append(hl)
    data["kols"] = kols
    KOLS_YAML.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
    return added


async def scrape_kol(conn, handle: str, display_name: str | None, tags: str | None,
                     limit: int, with_replies: bool) -> int:
    kol_id = db.upsert_kol(conn, handle, display_name, tags)
    handle_l = handle.lstrip("@").lower()
    known = {r["id"] for r in conn.execute(
        "SELECT id FROM tweets WHERE kol_id=? AND is_reply=0", (kol_id,))}
    print(f"Scraping @{handle} (limit {limit}, known {len(known)}) ...")
    tweets, caught_up = await x_scraper.scrape_timeline(
        handle_l, limit=limit, known_ids=known or None)
    new = 0
    for t in tweets:
        t["kol_id"] = kol_id
        if db.upsert_tweet(conn, t):
            new += 1
        if with_replies and t.get("url"):
            try:
                for r in await x_scraper.scrape_replies(t["url"], limit=20):
                    db.upsert_reply(conn, r)
            except Exception as e:  # noqa: BLE001
                print(f"    ! replies failed for {t['id']}: {e}")
    db.mark_kol_scraped(conn, kol_id)
    flag = "" if caught_up else "  ⚠ 可能未追平(达到滚动上限)"
    print(f"  {len(tweets)} scraped, {new} new{flag}")
    return new


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kol", help="single handle (default: all in kols.yaml)")
    ap.add_argument("--add", help="comma-separated handles to add to kols.yaml, then scrape all")
    ap.add_argument("--limit", type=int, default=x_scraper.DEFAULT_LIMIT)
    ap.add_argument("--replies", action="store_true", help="also collect replies")
    ap.add_argument("--analyze-only", action="store_true", help="skip scraping")
    ap.add_argument("--no-prices", action="store_true", help="skip price tracking")
    args = ap.parse_args()

    conn = db.connect()
    db.init_db(conn)

    if args.add:
        added = add_seed_kols(args.add.split(","))
        print(f"Added to kols.yaml: {added or '(all already present)'}")

    if not args.analyze_only:
        if args.kol:
            await scrape_kol(conn, args.kol, None, None, args.limit, args.replies)
        else:
            for k in load_seed_kols():
                await scrape_kol(conn, k["handle"], k.get("display_name"),
                                 k.get("tags"), args.limit, args.replies)

    print("Analyzing tweets ...")
    n = analyze.run(conn)
    print(f"  analyzed {n}")

    print("Enriching company metadata + news (Finnhub) ...")
    from analysis import finnhub
    print(f"  enriched {finnhub.enrich_tickers(conn)} tickers")
    print(f"  fetched {finnhub.fetch_news(conn)} news rows")

    # Index constituents (slickcharts) — only if missing/stale (weights change slowly).
    have = conn.execute("SELECT COUNT(*) n FROM index_constituents").fetchone()["n"]
    if have == 0:
        print("Fetching index constituents (slickcharts) ...")
        try:
            from scraper import indices
            print(f"  indices {indices.fetch_indices(conn)}")
        except Exception as e:  # noqa: BLE001
            print(f"  ! index fetch failed: {e}")

    if not args.no_prices:
        print("Tracking forward returns ...")
        m = prices.run(conn)
        print(f"  tracked {m} (tweet,ticker) pairs")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
