"""Scrape index constituents + weights from slickcharts (S&P500 / Nasdaq100 / Dow).

slickcharts is Cloudflare-protected, so we use crawl4ai's real browser (curl/WebFetch
get 403). Weights change slowly — refresh weekly is plenty. Gives each mentioned
ticker a "market position" (index membership + weight) = a signal-quality layer:
a KOL pumping a 7%-weight megacap vs a non-index microcap is very different.
"""
from __future__ import annotations

import asyncio
import re
from typing import Any

from bs4 import BeautifulSoup

INDEX_URLS = {
    "sp500": "https://www.slickcharts.com/sp500",
    "nasdaq100": "https://www.slickcharts.com/nasdaq100",
    "dowjones": "https://www.slickcharts.com/dowjones",
}


def _parse_table(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table")
    if not table:
        return []
    out = []
    for tr in table.select("tbody tr"):
        tds = [td.get_text(" ", strip=True) for td in tr.select("td")]
        if len(tds) < 4:
            continue
        # columns: # | Company | Symbol | Weight | Price | Chg | % Chg
        try:
            rank = int(re.sub(r"[^\d]", "", tds[0]) or 0)
        except ValueError:
            rank = 0
        company = tds[1]
        symbol = tds[2].upper().strip()
        weight = None
        m = re.search(r"([\d.]+)", tds[3])
        if m:
            weight = float(m.group(1))
        if symbol:
            out.append({"rank": rank, "company": company, "ticker": symbol, "weight": weight})
    return out


async def _fetch(url: str) -> str:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    b = BrowserConfig(browser_type="chromium", headless=True)
    async with AsyncWebCrawler(config=b) as c:
        r = await c.arun(url=url, config=CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS, wait_for="css:table", page_timeout=60_000))
        return r.html or ""


async def fetch_all() -> dict[str, list[dict]]:
    result = {}
    for name, url in INDEX_URLS.items():
        html = await _fetch(url)
        rows = _parse_table(html)
        result[name] = rows
    return result


def fetch_indices(conn) -> dict[str, int]:
    """Scrape all indices and upsert into index_constituents. Returns counts."""
    data = asyncio.run(fetch_all())
    counts = {}
    for index_name, rows in data.items():
        for r in rows:
            conn.execute(
                """INSERT INTO index_constituents (index_name, ticker, company, weight, rank, updated_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(index_name, ticker) DO UPDATE SET
                     company=excluded.company, weight=excluded.weight,
                     rank=excluded.rank, updated_at=datetime('now')""",
                (index_name, r["ticker"], r["company"], r["weight"], r["rank"]),
            )
        counts[index_name] = len(rows)
    conn.commit()
    return counts


if __name__ == "__main__":
    data = asyncio.run(fetch_all())
    for name, rows in data.items():
        print(f"{name}: {len(rows)} rows; top:", [(r['ticker'], r['weight']) for r in rows[:3]])
