"""Single-stock research report assembly (free data only).

Combines yfinance (financials, metrics, market performance, analyst targets,
institutional holders), Finnhub (profile + news, already in DB), our own KOL
signal data, and an LLM "AI investment view". Heuristic technical/fundamental
scores. Rating zones are derived transparently from analyst consensus targets
(not a proprietary valuation model).

Cached in the ticker_report table (JSON blob) with a TTL since fundamentals
barely move intraday.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any, Optional

import yfinance as yf


def _pct(a, b):
    if a is None or b in (None, 0):
        return None
    return round((a - b) / b * 100, 2)


def _perf_from_history(hist) -> dict:
    if hist is None or hist.empty:
        return {}
    closes = hist["Close"].dropna()
    if closes.empty:
        return {}
    last = closes.iloc[-1]
    dates = closes.index

    def ret(days):
        if len(closes) > days:
            base = closes.iloc[-days - 1]
            return float(round((last - base) / base * 100, 2)) if base else None
        return None

    # YTD
    ytd = None
    yr = dates[-1].year
    ytd_rows = closes[[d.year == yr for d in dates]]
    if not ytd_rows.empty and ytd_rows.iloc[0]:
        ytd = float(round((last - ytd_rows.iloc[0]) / ytd_rows.iloc[0] * 100, 2))
    return {"d1": ret(1), "d5": ret(5), "m1": ret(21), "m3": ret(63),
            "ytd": ytd, "y1": ret(251)}


def _technical_score(info: dict, hist) -> dict:
    """Heuristic 0-100 from trend / momentum / volatility."""
    score = 50.0
    detail = {}
    if hist is not None and not hist.empty:
        closes = hist["Close"].dropna()
        if len(closes) > 60:
            last = float(closes.iloc[-1])
            ma50 = float(closes.iloc[-50:].mean())
            trend = (last - ma50) / ma50 * 100
            detail["trend"] = round(trend, 1)
            score += max(-20, min(20, trend))  # above/below 50d MA
            m3 = (last - float(closes.iloc[-63])) / float(closes.iloc[-63]) * 100
            detail["mom3m"] = round(m3, 1)
            score += max(-15, min(15, m3 / 3))
            vol = float(closes.iloc[-63:].pct_change().std()) * (252 ** 0.5) * 100
            detail["volAnn"] = round(vol, 1)
            score -= max(0, (vol - 40) / 6)  # penalize high vol
    return {"score": int(max(0, min(100, score))), **detail}


def _fundamental_score(info: dict) -> dict:
    score = 50.0
    detail = {}
    gm = info.get("grossMargins")
    pm = info.get("profitMargins")
    roe = info.get("returnOnEquity")
    growth = info.get("revenueGrowth")
    fpe = info.get("forwardPE")
    if gm is not None:
        detail["grossMargin"] = round(gm * 100, 1); score += min(15, gm * 25)
    if pm is not None:
        detail["netMargin"] = round(pm * 100, 1); score += min(15, pm * 40)
    if roe is not None:
        detail["roe"] = round(roe * 100, 1); score += min(12, roe * 40)
    if growth is not None:
        detail["revGrowth"] = round(growth * 100, 1); score += max(-10, min(15, growth * 50))
    if fpe and fpe > 0:
        detail["fwdPE"] = round(fpe, 1); score -= min(20, max(0, (fpe - 25) / 4))  # high PE penalty
    return {"score": int(max(0, min(100, score))), **detail}


def _rating_zones(current, mean, low, high) -> dict:
    """Transparent bands relative to analyst consensus mean."""
    if not mean:
        return {}
    buy = round(mean * 0.85, 2)
    risk = round(mean * 1.10, 2)
    pos = "买入区间" if current < buy else ("风险区间" if current > risk else "观察区间")
    return {"buyBelow": buy, "watch": [buy, risk], "riskAbove": risk, "position": pos}


def build_report(conn: sqlite3.Connection, ticker: str) -> dict:
    ticker = ticker.upper()
    t = yf.Ticker(ticker)
    try:
        info = t.info or {}
    except Exception:  # noqa: BLE001
        info = {}
    try:
        hist = t.history(period="1y", auto_adjust=True)
    except Exception:  # noqa: BLE001
        hist = None

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev = info.get("previousClose")
    mean = info.get("targetMeanPrice"); low = info.get("targetLowPrice"); high = info.get("targetHighPrice")

    # company name / sector from our ticker_meta (Finnhub), fallback yfinance
    meta = conn.execute("SELECT company_name, industry FROM ticker_meta WHERE ticker=?", (ticker,)).fetchone()
    company = (meta["company_name"] if meta else None) or info.get("longName") or ticker
    sector = (meta["industry"] if meta else None) or info.get("sector") or info.get("industry") or ""

    # institutions
    holders = []
    try:
        ih = t.institutional_holders
        if ih is not None and not ih.empty and "pctHeld" in ih.columns:
            for _, r in ih.head(5).iterrows():
                holders.append({"holder": str(r["Holder"]), "pct": round(float(r["pctHeld"]) * 100, 2)})
    except Exception:  # noqa: BLE001
        pass

    # news from DB (Finnhub)
    news = [dict(r) for r in conn.execute(
        """SELECT datetime, headline, source, url FROM ticker_news
           WHERE ticker=? ORDER BY datetime DESC LIMIT 8""", (ticker,)).fetchall()]

    # our KOL angle
    kol = conn.execute(
        """SELECT COUNT(DISTINCT tt.tweet_id) mentions,
                  SUM(a.view='bullish') b, SUM(a.view='bearish') be
           FROM tweet_tickers tt LEFT JOIN tweet_analysis a ON a.tweet_id=tt.tweet_id
           WHERE tt.ticker=?""", (ticker,)).fetchone()
    kol_block = {"mentions": kol["mentions"] or 0, "bullish": kol["b"] or 0, "bearish": kol["be"] or 0}

    metrics = [
        {"label": "最新价", "value": price},
        {"label": "日内涨跌%", "value": _pct(price, prev)},
        {"label": "52周高", "value": info.get("fiftyTwoWeekHigh")},
        {"label": "52周低", "value": info.get("fiftyTwoWeekLow")},
        {"label": "P/E TTM", "value": round(info["trailingPE"], 1) if info.get("trailingPE") else None},
        {"label": "Forward P/E", "value": round(info["forwardPE"], 1) if info.get("forwardPE") else None},
        {"label": "毛利率%", "value": round(info["grossMargins"] * 100, 1) if info.get("grossMargins") else None},
        {"label": "净利率%", "value": round(info["profitMargins"] * 100, 1) if info.get("profitMargins") else None},
        {"label": "ROE%", "value": round(info["returnOnEquity"] * 100, 1) if info.get("returnOnEquity") else None},
    ]
    financials = [
        {"item": "营业收入", "value": info.get("totalRevenue"), "yoy": round(info["revenueGrowth"] * 100, 1) if info.get("revenueGrowth") else None},
        {"item": "毛利率", "value": round(info["grossMargins"] * 100, 1) if info.get("grossMargins") else None, "unit": "%"},
        {"item": "净利率", "value": round(info["profitMargins"] * 100, 1) if info.get("profitMargins") else None, "unit": "%"},
        {"item": "经营现金流", "value": info.get("operatingCashflow")},
        {"item": "自由现金流", "value": info.get("freeCashflow")},
        {"item": "现金及短投", "value": info.get("totalCash")},
        {"item": "总债务", "value": info.get("totalDebt")},
    ]

    report = {
        "ticker": ticker, "company": company, "sector": sector,
        "updated": datetime.utcnow().isoformat(),
        "price": {
            "current": price, "changePct": _pct(price, prev),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"), "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
            "marketCap": info.get("marketCap"), "volume": info.get("volume") or info.get("regularMarketVolume"),
        },
        "targets": {
            "low": low, "mean": mean, "high": high, "current": price,
            "numAnalysts": info.get("numberOfAnalystOpinions"),
            "recommendation": info.get("recommendationKey"),
        },
        "ratingZones": _rating_zones(price, mean, low, high) if price else {},
        "metrics": metrics,
        "scores": {"technical": _technical_score(info, hist), "fundamental": _fundamental_score(info)},
        "financials": financials,
        "performance": _perf_from_history(hist),
        "institutions": {"pctInstitutions": round(info["heldPercentInstitutions"] * 100, 1) if info.get("heldPercentInstitutions") else None, "topHolders": holders},
        "news": news,
        "kol": kol_block,
        "aiView": _ai_view(conn, ticker, company, sector, metrics, financials, kol_block, news),
    }
    return report


def _ai_view(conn, ticker, company, sector, metrics, financials, kol, news) -> dict:
    """LLM synthesis: 核心观点 + 看多 + 风险 + 催化, grounded in the assembled data."""
    try:
        from analysis.llm import LLMChain
        m = {x["label"]: x["value"] for x in metrics}
        f = {x["item"]: x.get("value") for x in financials}
        news_lines = "\n".join(f"- {n['headline']}" for n in news[:5]) or "（无）"
        ctx = (f"标的: {ticker} {company} ({sector})\n"
               f"估值/盈利: PE {m.get('P/E TTM')}, FwdPE {m.get('Forward P/E')}, 毛利 {m.get('毛利率%')}%, "
               f"净利 {m.get('净利率%')}%, ROE {m.get('ROE%')}%\n"
               f"财务: 营收同比 {f.get('营业收入') and ''}, FCF {f.get('自由现金流')}\n"
               f"KOL: 被提及{kol['mentions']}次(看多{kol['bullish']}/看空{kol['bearish']})\n"
               f"近期新闻:\n{news_lines}")
        system = ("你是资深美股研究员。基于给定的基本面+新闻+KOL数据,对该标的做一段综合研判。"
                  "严格输出 JSON: {\"core\":\"一句话核心观点\",\"bull\":[\"看多逻辑\"],"
                  "\"risk\":[\"风险提示\"],\"catalyst\":[\"关键催化\"]}。各 2-4 条,简体中文,只依据给定数据,不臆造。")
        out, _ = LLMChain().chat_json(system, ctx, max_tokens=900)
        return {"core": str(out.get("core", "")),
                "bull": [str(x) for x in (out.get("bull") or [])][:4],
                "risk": [str(x) for x in (out.get("risk") or [])][:4],
                "catalyst": [str(x) for x in (out.get("catalyst") or [])][:4]}
    except Exception as e:  # noqa: BLE001
        return {"core": "", "bull": [], "risk": [], "catalyst": [], "error": str(e)[:80]}


def get_report(conn: sqlite3.Connection, ticker: str, ttl_hours: int = 12) -> dict:
    ticker = ticker.upper()
    row = conn.execute(
        """SELECT data, updated_at FROM ticker_report WHERE ticker=?
           AND updated_at > datetime('now', ?)""", (ticker, f"-{ttl_hours} hours")).fetchone()
    if row:
        try:
            return json.loads(row["data"])
        except json.JSONDecodeError:
            pass
    rep = build_report(conn, ticker)
    # round-trip through json to coerce any stray numpy types into plain Python
    blob = json.dumps(rep, ensure_ascii=False, default=float)
    conn.execute(
        """INSERT INTO ticker_report (ticker, data, updated_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(ticker) DO UPDATE SET data=excluded.data, updated_at=datetime('now')""",
        (ticker, blob))
    conn.commit()
    return json.loads(blob)
