"""Self-gating scheduler for periodic scraping.

Designed to be fired frequently by launchd (e.g. every 30 min). It decides whether
enough time has passed to scrape, based on the US market session:
  - regular session (09:30–16:00 ET, Mon–Fri): scrape every 3h
  - otherwise (pre/post/overnight/weekend):     scrape every 6h

A last-run timestamp file makes it sleep-resilient: if the Mac was asleep past a
slot, the next wake fires a catch-up run. Scraping uses the per-KOL known-id
"catch up" logic in the scraper, so overlapping windows never duplicate and gaps
are avoided (status_id is the primary key → upsert dedupes).

    python scheduler.py            # run if due
    python scheduler.py --force    # scrape now regardless
    python scheduler.py --status   # print session + due info, do nothing

Market holidays are not modeled in v1 (weekday + clock only).
"""
from __future__ import annotations

import argparse
import asyncio
import os
from datetime import datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from analysis import analyze, prices
from pipeline import scrape_kol
from scraper import x_scraper
from storage import db

# Rotating batch: scrape this many least-recently-scraped KOLs per fire (gentler
# on a large roster → lower ban risk). Cycles through everyone over several fires.
SCRAPE_BATCH = int(os.getenv("SCRAPE_BATCH", "10"))
# Deep history backfill: one KOL per fire, this many extra scroll screens.
BACKFILL_SCROLLS = int(os.getenv("BACKFILL_SCROLLS", "35"))

ET = ZoneInfo("America/New_York")
LAST_RUN = Path(__file__).resolve().parents[1] / "data" / ".last_scrape"
SESSION_INTERVAL = timedelta(hours=3)
OFFHOURS_INTERVAL = timedelta(hours=6)


def in_market_session(now_et: datetime) -> bool:
    if now_et.weekday() >= 5:  # Sat/Sun
        return False
    return time(9, 30) <= now_et.time() <= time(16, 0)


def current_interval(now_et: datetime) -> timedelta:
    return SESSION_INTERVAL if in_market_session(now_et) else OFFHOURS_INTERVAL


def last_run() -> datetime | None:
    if LAST_RUN.exists():
        try:
            return datetime.fromisoformat(LAST_RUN.read_text().strip())
        except ValueError:
            return None
    return None


def mark_run(ts: datetime) -> None:
    LAST_RUN.parent.mkdir(parents=True, exist_ok=True)
    LAST_RUN.write_text(ts.isoformat())


def is_due(now: datetime) -> tuple[bool, str]:
    now_et = now.astimezone(ET)
    interval = current_interval(now_et)
    sess = "盘中" if in_market_session(now_et) else "盘外"
    prev = last_run()
    if prev is None:
        return True, f"{sess} 间隔{interval} | 首次运行"
    elapsed = now - prev
    due = elapsed >= interval
    return due, f"{sess} 间隔{interval} | 距上次{elapsed} | {'到点' if due else '未到点'}"


async def run_scrape(limit: int = 40) -> None:
    conn = db.connect()
    db.init_db(conn)
    total = conn.execute("SELECT COUNT(*) n FROM kols WHERE active=1").fetchone()["n"]
    # rotating batch: least-recently-scraped first (NULLs first)
    batch = conn.execute(
        """SELECT handle, display_name, tags FROM kols WHERE active=1
           ORDER BY last_scraped IS NOT NULL, last_scraped LIMIT ?""",
        (SCRAPE_BATCH,)).fetchall()
    print(f"Scheduled scrape: {len(batch)}/{total} KOLs (rotating batch)")
    for k in batch:
        try:
            await scrape_kol(conn, k["handle"], k["display_name"], k["tags"], limit, False)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {k['handle']} failed: {e}")

    # one deep history backfill per fire (least-backfilled first)
    bf = conn.execute(
        """SELECT id, handle FROM kols WHERE active=1
           ORDER BY last_backfill IS NOT NULL, last_backfill LIMIT 1""").fetchone()
    if bf:
        try:
            hist = await x_scraper.scrape_history(bf["handle"], max_scrolls=BACKFILL_SCROLLS)
            new = 0
            for t in hist:
                t["kol_id"] = bf["id"]
                if db.upsert_tweet(conn, t):
                    new += 1
            conn.execute("UPDATE kols SET last_backfill=datetime('now') WHERE id=?", (bf["id"],))
            conn.commit()
            print(f"  backfilled @{bf['handle']}: {len(hist)} deep, {new} new old tweets")
        except Exception as e:  # noqa: BLE001
            print(f"  ! backfill @{bf['handle']} failed: {e}")

    print("Analyzing ...")
    print(f"  analyzed {analyze.run(conn)}")
    print(f"  tracked {prices.run(conn)} (tweet,ticker) pairs")
    from analysis import finnhub
    finnhub.enrich_tickers(conn)
    finnhub.fetch_news(conn)
    # Index weights change slowly — refresh at most weekly.
    stale = conn.execute(
        "SELECT MAX(updated_at) m FROM index_constituents").fetchone()["m"]
    if stale is None or stale < (datetime.now(ET).strftime("%Y-%m-%d")):
        try:
            from scraper import indices
            indices.fetch_indices(conn)
        except Exception as e:  # noqa: BLE001
            print(f"  ! index refresh failed: {e}")

    # Pre-warm research reports for the most-mentioned tickers so user clicks are
    # instant (get_report skips any still-fresh within its TTL).
    try:
        from analysis.report import get_report
        top = conn.execute(
            """SELECT ticker, COUNT(DISTINCT tweet_id) n FROM tweet_tickers
               GROUP BY ticker HAVING n >= 2 ORDER BY n DESC LIMIT 8""").fetchall()
        warmed = 0
        for r in top:
            try:
                get_report(conn, r["ticker"])
                warmed += 1
            except Exception:  # noqa: BLE001
                pass
        print(f"  pre-warmed {warmed} research reports")
    except Exception as e:  # noqa: BLE001
        print(f"  ! report pre-warm failed: {e}")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="scrape now regardless of schedule")
    ap.add_argument("--status", action="store_true", help="print due status only")
    ap.add_argument("--limit", type=int, default=40)
    args = ap.parse_args()

    now = datetime.now(ET)
    due, why = is_due(now)
    if args.status:
        print(why)
        return
    if not (due or args.force):
        print(f"Not due. {why}")
        return
    await run_scrape(args.limit)
    mark_run(now)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
