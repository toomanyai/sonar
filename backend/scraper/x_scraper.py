"""Scrape a KOL's X timeline (and a tweet's replies) with crawl4ai.

Runs inside the logged-in session saved by x_profile.py (storage_state.json loaded
into a fresh headless context — no managed-browser/CDP). X virtualizes the timeline
(only a few tweets are in the DOM at once), so we use crawl4ai session stepping:
load the page, then repeatedly scroll within the SAME session and re-parse the
rendered HTML, deduping tweets by status id across steps until we have enough.
"""
from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path
from typing import Any, Optional

from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

PROFILE_NAME = os.getenv("X_PROFILE_NAME", "x-stock-kol")
DEFAULT_LIMIT = int(os.getenv("SCRAPE_TWEET_LIMIT", "30"))
SCROLL_DELAY = float(os.getenv("SCRAPE_SCROLL_DELAY", "2.5"))
HEADLESS = os.getenv("SCRAPE_HEADLESS", "true").lower() != "false"


def _profile_dir(name: str) -> str:
    return str(Path.home() / ".crawl4ai" / "profiles" / name)


def _storage_state(name: str) -> Optional[str]:
    """Path to the logged-in session saved by x_profile.py, if it exists."""
    p = Path(_profile_dir(name)) / "storage_state.json"
    return str(p) if p.exists() else None


_NUM_RE = {
    "replies": re.compile(r"([\d,.]+\s*[KkMm]?)\s+(?:replies|reply|回复)"),
    "retweets": re.compile(r"([\d,.]+\s*[KkMm]?)\s+(?:reposts|repost|retweets|转推)"),
    "likes": re.compile(r"([\d,.]+\s*[KkMm]?)\s+(?:likes|like|喜欢)"),
    "views": re.compile(r"([\d,.]+\s*[KkMm]?)\s+(?:views|view|查看)"),
}


def _parse_count(s: str) -> int:
    s = s.replace(",", "").replace(" ", "").strip()
    try:
        if s.lower().endswith("k"):
            return int(float(s[:-1]) * 1_000)
        if s.lower().endswith("m"):
            return int(float(s[:-1]) * 1_000_000)
        return int(float(s))
    except ValueError:
        return 0


def _parse_aria(aria: str) -> dict[str, int]:
    out = {k: 0 for k in _NUM_RE}
    for key, rx in _NUM_RE.items():
        m = rx.search(aria)
        if m:
            out[key] = _parse_count(m.group(1))
    return out


def _parse_articles(html: str) -> list[dict[str, Any]]:
    """Extract raw tweet dicts from rendered article nodes."""
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for art in soup.select('article[data-testid="tweet"]'):
        link = art.select_one('a[href*="/status/"]')
        if not link:
            continue
        href = link.get("href", "")
        m = re.search(r"/status/(\d+)", href)
        if not m:
            continue
        te = art.select_one('[data-testid="tweetText"]')
        text = te.get_text(" ", strip=True) if te else ""
        tm = art.select_one("time")
        ts = tm.get("datetime") if tm else None
        grp = art.select_one('[role="group"]')
        aria = grp.get("aria-label", "") if grp else ""
        out.append({"id": m.group(1), "href": href, "text": text,
                    "created_at": ts, "aria": aria})
    return out


def _normalize(raw: list[dict[str, Any]], handle: str, limit: int) -> list[dict[str, Any]]:
    handle_l = handle.lstrip("@").lower()
    tweets = []
    for r in raw:
        href = r.get("href", "")
        author = href.lstrip("/").split("/")[0].lower() if href else ""
        if author and author != handle_l:  # skip reposts/replies from others
            continue
        counts = _parse_aria(r.get("aria", ""))
        tweets.append({
            "id": r["id"], "text": r.get("text", ""), "created_at": r.get("created_at"),
            "url": f"https://x.com{href}" if href.startswith("/") else href,
            "likes": counts["likes"], "retweets": counts["retweets"],
            "reply_count": counts["replies"], "views": counts["views"],
        })
    return tweets[:limit]


MAX_SCROLL_STEPS = int(os.getenv("SCRAPE_MAX_SCROLL_STEPS", "40"))
CAUGHT_UP_THRESHOLD = 5  # stop after seeing this many already-known tweets


async def _scrape_with_scroll(url: str, limit: int, session_id: str,
                              known_ids: Optional[set[str]] = None,
                              max_scrolls: Optional[int] = None) -> list[dict[str, Any]]:
    """Load a page then scroll within the same session, accumulating tweets.

    Stops when ANY of: collected `limit` new tweets; re-connected with previously
    stored tweets (>= CAUGHT_UP_THRESHOLD known ids seen — guarantees no gap vs the
    last scrape); page stopped yielding new tweets; or the scroll safety cap.
    Returns (tweets, caught_up) — caught_up=False means we hit the cap and may have
    missed tweets between this run and the last (only possible for very prolific
    accounts posting more than the scroll window between scrapes).
    """
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

    known_ids = known_ids or set()
    browser = BrowserConfig(browser_type="chromium", headless=HEADLESS,
                            storage_state=_storage_state(PROFILE_NAME))
    seen: dict[str, dict] = {}
    order: list[str] = []
    known_hits = 0

    def collect(html: str) -> int:
        nonlocal known_hits
        added = 0
        for r in _parse_articles(html or ""):
            if r["id"] in known_ids:
                known_hits += 1
            if r["id"] not in seen:
                seen[r["id"]] = r
                order.append(r["id"])
                added += 1
        return added

    caught_up = not known_ids  # if no baseline, "caught up" is N/A
    async with AsyncWebCrawler(config=browser) as crawler:
        first = CrawlerRunConfig(
            session_id=session_id, cache_mode=CacheMode.BYPASS,
            wait_for="css:article[data-testid='tweet']",
            page_timeout=60_000, delay_before_return_html=2.0)
        r = await crawler.arun(url=url, config=first)
        collect(r.html)

        scroll_js = "window.scrollBy(0, document.documentElement.clientHeight * 2);"
        cap_steps = max_scrolls if max_scrolls is not None else max(MAX_SCROLL_STEPS, limit)
        stale, max_steps = 0, cap_steps
        for _ in range(max_steps):
            if len(seen) >= limit:
                break
            if known_ids and known_hits >= CAUGHT_UP_THRESHOLD:
                caught_up = True
                break
            step = CrawlerRunConfig(
                session_id=session_id, js_only=True, js_code=scroll_js,
                cache_mode=CacheMode.BYPASS, delay_before_return_html=SCROLL_DELAY)
            r = await crawler.arun(url=url, config=step)
            if collect(r.html) == 0:
                stale += 1
                if stale >= 3:
                    break
            else:
                stale = 0
    return [seen[i] for i in order], caught_up


async def scrape_timeline(handle: str, limit: int = DEFAULT_LIMIT,
                          known_ids: Optional[set[str]] = None) -> tuple[list[dict[str, Any]], bool]:
    """Returns (tweets, caught_up). Pass known_ids (already-stored status ids for this
    KOL) to scroll only until re-connecting with prior data — guarantees no gap."""
    handle = handle.lstrip("@")
    cap = max(limit, 500) if known_ids else limit  # when catching up, let it run
    raw, caught_up = await _scrape_with_scroll(
        f"https://x.com/{handle}", cap, f"tl-{handle}", known_ids)
    return _normalize(raw, handle, len(raw)), caught_up


async def scrape_history(handle: str, max_scrolls: int = 35) -> list[dict[str, Any]]:
    """Deep backfill: scroll bounded-deep into a KOL's timeline (ignoring known ids)
    to capture OLDER tweets. Bounded by max_scrolls to cap time + ban risk. upsert
    dedupes the recent overlap; the value is the older tweets newly reached."""
    handle = handle.lstrip("@")
    raw, _ = await _scrape_with_scroll(
        f"https://x.com/{handle}", 10_000, f"hist-{handle}",
        known_ids=None, max_scrolls=max_scrolls)
    return _normalize(raw, handle, len(raw))


async def scrape_replies(status_url: str, limit: int = 30) -> list[dict[str, Any]]:
    parent_m = re.search(r"/status/(\d+)", status_url)
    parent_id = parent_m.group(1) if parent_m else None
    raw, _ = await _scrape_with_scroll(status_url, limit + 1, f"rp-{parent_id}")
    replies = []
    for r in raw:
        if r["id"] == parent_id:
            continue
        href = r.get("href", "")
        author = href.lstrip("/").split("/")[0] if href else None
        counts = _parse_aria(r.get("aria", ""))
        replies.append({"id": r["id"], "parent_tweet_id": parent_id, "author": author,
                        "text": r.get("text", ""), "created_at": r.get("created_at"),
                        "likes": counts["likes"]})
    return replies[:limit]


if __name__ == "__main__":
    import sys
    h = sys.argv[1] if len(sys.argv) > 1 else "KotlinerBTC"
    tweets, caught_up = asyncio.run(scrape_timeline(h, limit=15))
    print(f"Scraped {len(tweets)} tweets from @{h} (caught_up={caught_up})")
    for t in tweets[:8]:
        print(f"  {t['id']} | {t['created_at']} | ❤{t['likes']} 👁{t['views']} | {t['text'][:60]!r}")
