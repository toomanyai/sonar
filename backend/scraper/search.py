"""Lightweight web search via crawl4ai (DuckDuckGo HTML endpoint, no API key).

Used to ground the deep-read in CURRENT information so the reliability assessment
isn't limited to the model's training cutoff. Returns title+snippet results; on any
failure returns [] so the caller degrades gracefully.
"""
from __future__ import annotations

from urllib.parse import quote
from typing import Any

from bs4 import BeautifulSoup


async def web_search(query: str, n: int = 6) -> list[dict[str, Any]]:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    url = f"https://html.duckduckgo.com/html/?q={quote(query)}"
    try:
        b = BrowserConfig(browser_type="chromium", headless=True)
        async with AsyncWebCrawler(config=b) as c:
            r = await c.arun(url=url, config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS, page_timeout=30_000))
            html = r.html or ""
    except Exception:  # noqa: BLE001
        return []
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for res in soup.select(".result, .web-result")[: n * 2]:
        a = res.select_one(".result__a, a.result__a")
        snip = res.select_one(".result__snippet")
        title = a.get_text(" ", strip=True) if a else ""
        snippet = snip.get_text(" ", strip=True) if snip else ""
        if title:
            out.append({"title": title, "snippet": snippet})
        if len(out) >= n:
            break
    return out


if __name__ == "__main__":
    import asyncio
    res = asyncio.run(web_search("Silver Viper Minerals SIVE NASDAQ listing"))
    print(f"{len(res)} results")
    for r in res[:5]:
        print(" -", r["title"][:70], "|", r["snippet"][:80])
