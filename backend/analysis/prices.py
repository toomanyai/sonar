"""Forward-return / hit-rate tracking via yfinance.

For each (tweet, ticker) with an analyzed view, find the first trading day on or
after the tweet date (t0), then compute forward returns at +1/+5/+10/+20 trading
days. "hit" = direction of the t5 return matches the KOL's view (bullish/bearish).
neutral views are recorded but never counted as hit/miss.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from typing import Optional

import yfinance as yf

HORIZONS = {"t1": 1, "t5": 5, "t10": 10, "t20": 20}


def _to_date(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:len(fmt) + 6], fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _forward_returns(ticker: str, t0: datetime) -> Optional[dict]:
    end = t0 + timedelta(days=60)
    try:
        hist = yf.Ticker(ticker).history(start=t0.strftime("%Y-%m-%d"),
                                         end=end.strftime("%Y-%m-%d"), auto_adjust=True)
    except Exception:  # noqa: BLE001
        return None
    if hist is None or hist.empty:
        return None
    closes = hist["Close"].tolist()
    dates = [d.strftime("%Y-%m-%d") for d in hist.index]
    base = closes[0]
    if not base:
        return None
    out = {"base_date": dates[0], "base_price": round(base, 4)}
    for name, h in HORIZONS.items():
        out[name] = round((closes[h] - base) / base, 4) if h < len(closes) else None
    return out


def close_series(ticker: str, start: datetime) -> list[dict]:
    """Daily close prices from `start` to today, as [{date, close}]."""
    try:
        hist = yf.Ticker(ticker).history(start=start.strftime("%Y-%m-%d"),
                                         auto_adjust=True)
    except Exception:  # noqa: BLE001
        return []
    if hist is None or hist.empty:
        return []
    return [{"date": d.strftime("%Y-%m-%d"), "close": round(c, 4)}
            for d, c in zip(hist.index, hist["Close"].tolist())]


def price_on_or_after(series: list[dict], date_str: str) -> Optional[float]:
    for p in series:
        if p["date"] >= date_str:
            return p["close"]
    return None


def point_on_or_after(series: list[dict], date_str: str) -> tuple[Optional[str], Optional[float]]:
    """First (date, close) on or after date_str — used to snap a mention onto the curve."""
    for p in series:
        if p["date"] >= date_str:
            return p["date"], p["close"]
    return None, None


def _pending(conn: sqlite3.Connection, limit: int) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT tt.tweet_id, tt.ticker, t.created_at, a.view
           FROM tweet_tickers tt
           JOIN tweets t ON t.id = tt.tweet_id
           JOIN tweet_analysis a ON a.tweet_id = tt.tweet_id
           LEFT JOIN ticker_returns r ON r.tweet_id = tt.tweet_id AND r.ticker = tt.ticker
           WHERE r.id IS NULL OR r.t20 IS NULL
           LIMIT ?""",
        (limit,),
    ).fetchall()


def run(conn: sqlite3.Connection, limit: int = 200) -> int:
    done = 0
    for row in _pending(conn, limit):
        t0 = _to_date(row["created_at"])
        if t0 is None:
            continue
        fr = _forward_returns(row["ticker"], t0)
        if fr is None:
            continue
        view = row["view"]
        hit = None
        if fr.get("t5") is not None and view in ("bullish", "bearish"):
            hit = int((fr["t5"] > 0) == (view == "bullish"))
        conn.execute(
            """INSERT INTO ticker_returns
                 (tweet_id, ticker, view, base_date, base_price, t1, t5, t10, t20, hit, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(tweet_id, ticker) DO UPDATE SET
                 base_date=excluded.base_date, base_price=excluded.base_price,
                 t1=excluded.t1, t5=excluded.t5, t10=excluded.t10, t20=excluded.t20,
                 hit=excluded.hit, updated_at=datetime('now')""",
            (row["tweet_id"], row["ticker"], view, fr["base_date"], fr["base_price"],
             fr["t1"], fr["t5"], fr["t10"], fr["t20"], hit),
        )
        done += 1
    conn.commit()
    _rollup_hit_rate(conn)
    eval_signals(conn)
    return done


def eval_signals(conn: sqlite3.Connection) -> int:
    """Score buy/sell-point calls against forward return (t5).
    买点(buy/add): 命中 = 之后上行(t5>0). 卖点(trim/sell): 命中 = 之后下行(t5<0).
    hold/watch/avoid 不评分。Returns number of signals scored."""
    rows = conn.execute(
        """SELECT s.id, s.action, r.t5
           FROM tweet_signals s
           JOIN ticker_returns r ON r.tweet_id=s.tweet_id AND r.ticker=s.ticker
           WHERE r.t5 IS NOT NULL AND s.action IN ('buy','add','trim','sell')""").fetchall()
    n = 0
    for row in rows:
        if row["action"] in ("buy", "add"):
            hit = 1 if row["t5"] > 0 else 0
        else:  # trim, sell
            hit = 1 if row["t5"] < 0 else 0
        conn.execute("UPDATE tweet_signals SET eval_hit=? WHERE id=?", (hit, row["id"]))
        n += 1
    conn.commit()
    return n


def _rollup_hit_rate(conn: sqlite3.Connection) -> None:
    conn.execute(
        """UPDATE kols SET hit_rate = (
              SELECT ROUND(AVG(r.hit) * 1.0, 4)
              FROM ticker_returns r
              JOIN tweets t ON t.id = r.tweet_id
              WHERE t.kol_id = kols.id AND r.hit IS NOT NULL
           )"""
    )
    conn.commit()


if __name__ == "__main__":
    from storage import db
    c = db.connect()
    print(f"Tracked returns for {run(c)} (tweet,ticker) pairs")
