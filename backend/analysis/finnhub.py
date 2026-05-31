"""Finnhub free-tier client: company profile, real-time quote, company news.

Historical OHLC (/stock/candle) is NOT on the free tier — forward returns stay on
yfinance (analysis/prices.py). Free tier ~60 req/min, so callers should batch and
cache (company profiles are cached in the ticker_meta table).
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

BASE = "https://finnhub.io/api/v1"
API_KEY = os.getenv("FINNHUB_API_KEY", "")


def _get(path: str, params: dict[str, Any]) -> Optional[Any]:
    if not API_KEY:
        return None
    params = {**params, "token": API_KEY}
    try:
        r = httpx.get(f"{BASE}{path}", params=params, timeout=15)
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:  # noqa: BLE001
        return None


def get_profile(symbol: str) -> Optional[dict]:
    """Company profile: name, exchange, finnhubIndustry, logo, marketCapitalization."""
    d = _get("/stock/profile2", {"symbol": symbol.upper()})
    return d if d else None


def get_quote(symbol: str) -> Optional[dict]:
    """Real-time quote: c (current), d (change), dp (change %), pc (prev close)."""
    d = _get("/quote", {"symbol": symbol.upper()})
    if not d or d.get("c") in (None, 0):
        return None
    return d


def get_company_news(symbol: str, frm: str, to: str) -> list[dict]:
    d = _get("/company-news", {"symbol": symbol.upper(), "from": frm, "to": to})
    return d if isinstance(d, list) else []


def enrich_tickers(conn, max_age_days: int = 30) -> int:
    """Fetch & cache company profiles for tickers missing fresh ticker_meta rows."""
    rows = conn.execute(
        """SELECT DISTINCT tt.ticker FROM tweet_tickers tt
           LEFT JOIN ticker_meta m ON m.ticker = tt.ticker
           WHERE m.ticker IS NULL
              OR m.updated_at < datetime('now', ?)""",
        (f"-{max_age_days} days",),
    ).fetchall()
    done = 0
    for r in rows:
        ticker = r["ticker"]
        p = get_profile(ticker)
        if not p or not p.get("name"):
            continue
        conn.execute(
            """INSERT INTO ticker_meta (ticker, company_name, industry, exchange, logo, weburl, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(ticker) DO UPDATE SET
                 company_name=excluded.company_name, industry=excluded.industry,
                 exchange=excluded.exchange, logo=excluded.logo, weburl=excluded.weburl,
                 updated_at=datetime('now')""",
            (ticker, p.get("name"), p.get("finnhubIndustry"), p.get("exchange"),
             p.get("logo"), p.get("weburl")),
        )
        done += 1
    conn.commit()
    return done


def fetch_news(conn, days_back: int = 7, max_tickers: int = 40) -> int:
    """Fetch recent company news for mentioned tickers (the 2nd source). Free tier
    ~60 req/min so cap the number of tickers per run."""
    from datetime import datetime, timedelta
    to = datetime.now().strftime("%Y-%m-%d")
    frm = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    tickers = [r["ticker"] for r in conn.execute(
        """SELECT DISTINCT tt.ticker FROM tweet_tickers tt
           JOIN ticker_meta m ON m.ticker = tt.ticker
           ORDER BY tt.ticker LIMIT ?""", (max_tickers,)).fetchall()]
    n = 0
    for ticker in tickers:
        for a in get_company_news(ticker, frm, to)[:15]:
            if not a.get("id"):
                continue
            dt = datetime.utcfromtimestamp(a["datetime"]).isoformat() if a.get("datetime") else None
            conn.execute(
                """INSERT OR IGNORE INTO ticker_news (id, ticker, headline, summary, source, url, datetime)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (str(a["id"]), ticker, a.get("headline"), a.get("summary"),
                 a.get("source"), a.get("url"), dt))
            n += 1
    conn.commit()
    return n


if __name__ == "__main__":
    print("profile:", get_profile("NVDA"))
    print("quote:", get_quote("NVDA"))
