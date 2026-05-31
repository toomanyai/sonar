"""Market-position layer: turn index membership + weight into a signal-quality tag.

A KOL pumping a 7%-weight megacap (NVDA) is a very different signal from one
pumping a ticker in no index at all. Tiers:
  权重股  — in S&P 500 with weight >= 1%
  大盘    — in S&P 500 (<1%) or in Nasdaq100/Dow
  非指数  — in none of the tracked indices (often small/micro-cap, higher risk)
"""
from __future__ import annotations

import sqlite3

INDEX_ZH = {"sp500": "标普500", "nasdaq100": "纳指100", "dowjones": "道指"}


def market_position(conn: sqlite3.Connection, ticker: str) -> dict:
    rows = conn.execute(
        "SELECT index_name, weight FROM index_constituents WHERE ticker=?",
        (ticker.upper(),)).fetchall()
    indices = [r["index_name"] for r in rows]
    sp = next((r["weight"] for r in rows if r["index_name"] == "sp500"), None)
    if "sp500" in indices and sp is not None and sp >= 1.0:
        tier = "权重股"
    elif indices:
        tier = "大盘"
    else:
        tier = "非指数"
    label = (f"标普500 · 权重{sp:.2f}%" if sp is not None
             else ("、".join(INDEX_ZH.get(i, i) for i in indices) if indices else "非指数标的"))
    return {"indices": indices, "sp500Weight": sp, "tier": tier,
            "inIndex": bool(indices), "label": label}
