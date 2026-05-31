"""FastAPI service feeding the Serenity Analysis frontend.

    uvicorn api.main:app --reload --port 8000

Response shapes conform to frontend/src/lib/api.ts (the contract). Fields backed
by the v1 data model are computed from the DB; analytics not yet tracked in v1
(e.g. 观点变化, 预警规则, heat-trend history, AI meta-report prose) return honest
empty/neutral defaults rather than fabricated numbers.
"""
from __future__ import annotations

import os
import sqlite3
from typing import Any, Optional

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from storage import db

app = FastAPI(title="声纳 Sonar API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CHAINS = ["芯片/算力", "光模块/网络", "AI基础设施", "数据中心电力", "云与软件"]
CHAIN_KEYS = {"芯片/算力": "chip", "光模块/网络": "optical", "AI基础设施": "infra",
              "数据中心电力": "power", "云与软件": "cloud", "其他": "other"}
SENT_LABEL = {"bullish": "看多", "bearish": "看空", "neutral": "中性"}


def _conn() -> sqlite3.Connection:
    return db.connect()


def _rows(cur) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]


def _pct(frac: Optional[float]) -> float:
    return round((frac or 0) * 100, 2)


def _stat(key: str, label: str, value: Any, delta: str, tone: str) -> dict:
    return {"key": key, "label": label, "value": value, "delta": delta, "tone": tone}


def _kol_obj(row: sqlite3.Row | dict) -> dict:
    r = dict(row)
    return {
        "id": str(r.get("kol_id") or r.get("id") or ""),
        "handle": "@" + (r.get("handle") or ""),
        "name": r.get("display_name") or r.get("handle") or "",
        "avatarUrl": r.get("avatar_url"),
        "verified": False,  # not tracked in v1
        "hitRate": _pct(r.get("hit_rate")) if r.get("hit_rate") is not None else None,
        "note": r.get("note"),
        "region": r.get("region"),
    }


def _tickers_for(c: sqlite3.Connection, tweet_id: str) -> list[dict]:
    return _rows(c.execute(
        """SELECT tt.ticker, tt.industry_chain, tt.target_price, r.t1
           FROM tweet_tickers tt
           LEFT JOIN ticker_returns r ON r.tweet_id = tt.tweet_id AND r.ticker = tt.ticker
           WHERE tt.tweet_id = ?""", (tweet_id,)))


def _tweet_obj(c: sqlite3.Connection, row: sqlite3.Row | dict) -> dict:
    t = dict(row)
    tks = _tickers_for(c, t["id"])
    topics = sorted({tk["industry_chain"] for tk in tks if tk.get("industry_chain")})
    return {
        "id": t["id"],
        "kol": _kol_obj(t),
        "text": t.get("text", ""),
        "createdAt": t.get("created_at") or t.get("scraped_at"),
        "sentiment": t.get("view") or "neutral",
        "relatedStocks": [{"ticker": tk["ticker"], "name": tk["ticker"],
                           "changePct": _pct(tk.get("t1"))} for tk in tks],
        "topics": topics,
        "engagement": {"replies": t.get("reply_count", 0), "retweets": t.get("retweets", 0),
                       "likes": t.get("likes", 0), "views": t.get("views", 0)},
        "aiSummary": t.get("summary"),
        "confidence": _pct(t.get("confidence")) if t.get("confidence") is not None else None,
        "relevance": _pct(t.get("relevance")) if t.get("relevance") is not None else None,
    }


# ----- /health -----

@app.get("/health")
def health():
    return {"ok": True}


# ----- /settings/llm (UI-editable API keys + model + fallback chain) -----

class LLMConfigBody(BaseModel):
    chain: list[str]
    providers: dict


@app.get("/settings/llm")
def get_llm_settings():
    """Return the LLM config with API keys MASKED (never expose full keys)."""
    from analysis.config import load_config, BUILTINS
    cfg = load_config()
    safe = {}
    for pid, p in cfg.get("providers", {}).items():
        key = p.get("api_key") or ""
        safe[pid] = {
            "label": p.get("label") or BUILTINS.get(pid, {}).get("label", pid),
            "base_url": p.get("base_url", ""), "model": p.get("model", ""),
            "has_key": bool(key), "key_hint": ("••••" + key[-4:]) if len(key) >= 4 else ("已设置" if key else ""),
            "builtin": pid in BUILTINS,
        }
    return {"chain": cfg.get("chain", []), "providers": safe,
            "builtins": list(BUILTINS.keys())}


@app.post("/settings/llm")
def save_llm_settings(body: LLMConfigBody):
    """Save config. Empty api_key for a provider keeps its existing stored key."""
    from analysis.config import load_config, save_config
    cur = load_config()
    cur_providers = cur.get("providers", {})
    merged = {}
    for pid, p in body.providers.items():
        existing = cur_providers.get(pid, {})
        new_key = (p.get("api_key") or "").strip()
        merged[pid] = {
            "label": p.get("label") or existing.get("label") or pid,
            "base_url": (p.get("base_url") or "").strip(),
            "model": (p.get("model") or "").strip(),
            "api_key": new_key if new_key else existing.get("api_key", ""),
        }
    save_config({"chain": [c for c in body.chain if c in merged], "providers": merged})
    return {"ok": True}


class LLMTestBody(BaseModel):
    provider_id: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None


@app.post("/settings/llm/test")
def test_llm_provider(body: LLMTestBody):
    """Test one provider with a tiny call. Uses stored key if api_key omitted."""
    from analysis.config import load_config
    base_url, api_key, model = body.base_url, body.api_key, body.model
    if body.provider_id:
        p = load_config().get("providers", {}).get(body.provider_id, {})
        base_url = base_url or p.get("base_url")
        api_key = api_key or p.get("api_key")
        model = model or p.get("model")
    if not (base_url and api_key and model):
        return {"ok": False, "error": "base_url / api_key / model 不完整"}
    try:
        from openai import OpenAI
        r = OpenAI(base_url=base_url, api_key=api_key, timeout=30).chat.completions.create(
            model=model, messages=[{"role": "user", "content": "ping"}], max_tokens=5)
        return {"ok": True, "model": model, "reply": (r.choices[0].message.content or "")[:40]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


# ----- /overview -----

@app.get("/overview")
def overview():
    c = _conn()
    trackable = c.execute("SELECT COUNT(DISTINCT ticker) n FROM tweet_tickers").fetchone()["n"]
    priced = c.execute("SELECT COUNT(DISTINCT ticker) n FROM ticker_returns WHERE base_price IS NOT NULL").fetchone()["n"]
    new7d = c.execute("SELECT COUNT(*) n FROM tweets WHERE is_reply=0 AND created_at >= datetime('now','-7 days')").fetchone()["n"]
    changed24h = c.execute("SELECT COUNT(*) n FROM tweet_analysis WHERE analyzed_at >= datetime('now','-1 day')").fetchone()["n"]
    inactive = c.execute("SELECT COUNT(*) n FROM kols WHERE active=0").fetchone()["n"]
    stats = [
        _stat("trackable", "可跟踪AI", trackable, "实时监控中", "blue"),
        _stat("new7d", "7天新增", new7d, "近7天", "green"),
        _stat("priced", "已匹配价格", priced, "可计算收益", "purple"),
        _stat("changed", "观点变化", changed24h, "近24h", "amber"),
        _stat("removed", "剔除跟踪", inactive, "已停跟踪", "red"),
    ]
    categories = []
    for ch in CHAINS:
        n = c.execute("SELECT COUNT(DISTINCT ticker) n FROM tweet_tickers WHERE industry_chain=?", (ch,)).fetchone()["n"]
        categories.append({"key": CHAIN_KEYS[ch], "label": ch, "count": n})
    top = _rows(c.execute(
        """SELECT tt.ticker, MAX(tt.industry_chain) AS chain,
                  MAX(MAX(COALESCE(r.t1,0),COALESCE(r.t5,0),COALESCE(r.t10,0),COALESCE(r.t20,0))) AS mx
           FROM ticker_returns r JOIN tweet_tickers tt
             ON tt.tweet_id=r.tweet_id AND tt.ticker=r.ticker
           GROUP BY tt.ticker ORDER BY mx DESC LIMIT 5"""))
    topReturns = [{"ticker": r["ticker"], "chain": r["chain"] or "其他",
                   "maxReturnPct": _pct(r["mx"])} for r in top]
    return {"stats": stats, "categories": categories, "topReturns": topReturns}


# ----- /tweets -----

@app.get("/tweets")
def list_tweets(q: Optional[str] = None, sentiment: Optional[str] = None,
                topic: Optional[str] = None, min_relevance: float = 0, limit: int = 50):
    c = _conn()
    sql = """SELECT t.id, t.text, t.created_at, t.scraped_at, t.likes, t.retweets,
                    t.reply_count, t.views, t.kol_id, k.handle, k.display_name,
                    k.avatar_url, k.hit_rate, a.view, a.confidence, a.relevance, a.summary
             FROM tweets t JOIN kols k ON k.id=t.kol_id
             LEFT JOIN tweet_analysis a ON a.tweet_id=t.id
             WHERE t.is_reply=0"""
    params: list = []
    if sentiment:
        sql += " AND a.view=?"; params.append(sentiment)
    if q:
        sql += " AND t.text LIKE ?"; params.append(f"%{q}%")
    if topic:
        sql += " AND t.id IN (SELECT tweet_id FROM tweet_tickers WHERE industry_chain=?)"; params.append(topic)
    if min_relevance > 0:
        # treat un-scored (NULL) as 0.5 so they aren't hidden before re-analysis
        sql += " AND COALESCE(a.relevance, 0.5) >= ?"; params.append(min_relevance)
    sql += " ORDER BY t.created_at DESC LIMIT ?"; params.append(limit)
    tweets = [_tweet_obj(c, r) for r in c.execute(sql, params).fetchall()]

    today = c.execute("SELECT COUNT(*) n FROM tweets WHERE is_reply=0 AND created_at >= date('now')").fetchone()["n"]
    kols = c.execute("SELECT COUNT(*) n FROM kols WHERE active=1").fetchone()["n"]
    highconf = c.execute("SELECT COUNT(*) n FROM tweet_analysis WHERE confidence >= 0.85").fetchone()["n"]
    avg_eng = c.execute("SELECT COALESCE(AVG(likes+retweets+reply_count),0) a FROM tweets WHERE is_reply=0").fetchone()["a"]
    stats = [
        _stat("today", "今日新增推文", today, "今日", "blue"),
        _stat("kols", "覆盖KOL", kols, "活跃账号", "purple"),
        _stat("highconf", "高置信观点", highconf, "≥85%", "green"),
        _stat("alerts", "触发预警", 0, "近24h", "amber"),
        _stat("engage", "平均互动量", round(avg_eng), "每条", "red"),
    ]
    trend = _rows(c.execute(
        """SELECT date(created_at) AS date, COUNT(*) AS count FROM tweets
           WHERE is_reply=0 AND created_at >= datetime('now','-7 days')
           GROUP BY date(created_at) ORDER BY date"""))
    dist_rows = c.execute(
        "SELECT view, COUNT(*) n FROM tweet_analysis GROUP BY view").fetchall()
    total = sum(r["n"] for r in dist_rows) or 1
    label = {"bullish": ("看多", "bullish"), "bearish": ("看空", "bearish"), "neutral": ("中性", "neutral")}
    sentimentDist = [{"name": label.get(r["view"], (r["view"], "neutral"))[0],
                      "value": round(r["n"] * 100 / total),
                      "sentiment": label.get(r["view"], ("", "neutral"))[1]} for r in dist_rows]
    return {"stats": stats, "trend": trend, "sentimentDist": sentimentDist, "tweets": tweets}


@app.get("/tweets/{tweet_id}")
def tweet_detail(tweet_id: str):
    c = _conn()
    row = c.execute(
        """SELECT t.*, k.handle, k.display_name, k.avatar_url, k.hit_rate,
                  a.view, a.confidence, a.summary
           FROM tweets t JOIN kols k ON k.id=t.kol_id
           LEFT JOIN tweet_analysis a ON a.tweet_id=t.id WHERE t.id=?""", (tweet_id,)).fetchone()
    if not row:
        return {"error": "not found"}
    base = _tweet_obj(c, row)
    tks = _rows(c.execute(
        """SELECT tt.ticker, tt.target_price, a.confidence,
                  r.t1, r.t5, r.t10, r.t20
           FROM tweet_tickers tt
           LEFT JOIN tweet_analysis a ON a.tweet_id=tt.tweet_id
           LEFT JOIN ticker_returns r ON r.tweet_id=tt.tweet_id AND r.ticker=tt.ticker
           WHERE tt.tweet_id=?""", (tweet_id,)))
    stockBreakdown = [{
        "ticker": t["ticker"], "name": t["ticker"],
        "strength": _pct(t.get("confidence")),
        "targetPrice": f"${t['target_price']}" if t.get("target_price") else None,
        "change24h": _pct(t.get("t1")),
    } for t in tks]
    primary = tks[0] if tks else {}
    returnTracking = [{"day": d, "returnPct": _pct(primary.get(k))}
                      for d, k in (("T+1", "t1"), ("T+5", "t5"), ("T+10", "t10"), ("T+20", "t20"))
                      if primary.get(k) is not None]
    base.update({
        "keyPoints": [],  # not generated in v1
        "stockBreakdown": stockBreakdown,
        "historicalHitRate": _pct(row["hit_rate"]) if row["hit_rate"] is not None else 0,
        "returnTracking": returnTracking,
    })
    return base


def _deepread_context(c: sqlite3.Connection, tweet_id: str, text: str) -> str:
    """Gather CURRENT info to ground the deep-read: Finnhub news (DB) + live web search."""
    import asyncio
    tickers = [r["ticker"] for r in c.execute(
        "SELECT DISTINCT ticker FROM tweet_tickers WHERE tweet_id=?", (tweet_id,)).fetchall()]
    news_lines = []
    for tk in tickers[:4]:
        for nr in c.execute(
            "SELECT headline FROM ticker_news WHERE ticker=? ORDER BY datetime DESC LIMIT 3", (tk,)):
            if nr["headline"]:
                news_lines.append(f"- [{tk}] {nr['headline']}")
    # live web search (DuckDuckGo via crawl4ai)
    if tickers:
        meta = c.execute("SELECT company_name FROM ticker_meta WHERE ticker=?", (tickers[0],)).fetchone()
        query = f"{(meta['company_name'] if meta and meta['company_name'] else tickers[0])} stock news"
    else:
        query = text.strip()[:80]
    search_lines = []
    try:
        from scraper.search import web_search
        for r in asyncio.run(web_search(query, n=5)):
            search_lines.append(f"- {r['title']} — {r['snippet'][:120]}")
    except Exception:  # noqa: BLE001
        pass
    parts = []
    if news_lines:
        parts.append("公司新闻(Finnhub):\n" + "\n".join(news_lines[:8]))
    if search_lines:
        parts.append(f'联网检索("{query}"):\n' + "\n".join(search_lines[:5]))
    return "\n\n".join(parts)


@app.get("/tweets/{tweet_id}/deepread")
def tweet_deepread(tweet_id: str):
    """Lazy + cached deep read: 翻译 + 解读 + 事实/观点/建议 + 可靠性."""
    import json
    c = _conn()
    row = c.execute("SELECT * FROM tweet_deepread WHERE tweet_id=?", (tweet_id,)).fetchone()
    if row:
        r = dict(row)
        for k in ("facts", "opinions", "suggestions", "reliability"):
            try:
                r[k] = json.loads(r[k]) if r[k] else []
            except (json.JSONDecodeError, TypeError):
                r[k] = []
        return r
    t = c.execute("SELECT t.text, k.handle FROM tweets t JOIN kols k ON k.id=t.kol_id WHERE t.id=?",
                  (tweet_id,)).fetchone()
    if not t:
        return {"error": "not found"}
    context = _deepread_context(c, tweet_id, t["text"])
    try:
        from analysis.llm import LLMChain
        from analysis.analyze import deepread_tweet
        d, model = deepread_tweet(LLMChain(), t["handle"], t["text"], context=context)
    except Exception as e:  # noqa: BLE001
        return {"error": f"deepread failed: {e}", "lang": "", "translation": "",
                "interpretation": "", "facts": [], "opinions": [], "suggestions": [], "reliability": []}
    c.execute(
        """INSERT OR REPLACE INTO tweet_deepread
             (tweet_id, lang, translation, interpretation, facts, opinions, suggestions, reliability, model)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tweet_id, d["lang"], d["translation"], d["interpretation"],
         json.dumps(d["facts"], ensure_ascii=False), json.dumps(d["opinions"], ensure_ascii=False),
         json.dumps(d["suggestions"], ensure_ascii=False), json.dumps(d["reliability"], ensure_ascii=False),
         model))
    c.commit()
    return {"tweet_id": tweet_id, "model": model, **d}


# ----- /stocks -----

def _stock_stats(c: sqlite3.Connection) -> list[dict]:
    trackable = c.execute("SELECT COUNT(DISTINCT ticker) n FROM tweet_tickers").fetchone()["n"]
    consensus = c.execute(
        """SELECT COUNT(*) n FROM (
             SELECT tt.ticker,
               SUM(a.view='bullish') b, SUM(a.view='bearish') be, COUNT(*) tot
             FROM tweet_tickers tt LEFT JOIN tweet_analysis a ON a.tweet_id=tt.tweet_id
             GROUP BY tt.ticker HAVING tot>0 AND MAX(b,be)*1.0/tot >= 0.8)""").fetchone()["n"]
    return [
        _stat("trackable", "可跟踪股票", trackable, "全市场", "blue"),
        _stat("rising", "今日热度上升", 0, "+热度", "red"),
        _stat("consensus", "高共识股票", consensus, "观点一致", "green"),
        _stat("recognized", "高识别股票", trackable, "AI识别", "purple"),
        _stat("graded", "观点分级股票", trackable, "已分级", "amber"),
    ]


@app.get("/stocks")
def list_stocks(page: int = 1, pageSize: int = 20, q: Optional[str] = None,
                category: Optional[str] = None, tier: Optional[str] = None):
    from analysis.market import market_position
    c = _conn()
    where, params = [], []
    if category:
        where.append("tt.industry_chain=?"); params.append(category)
    if q:
        where.append("tt.ticker LIKE ?"); params.append(f"%{q.upper()}%")
    if tier == "off_index":
        where.append("tt.ticker NOT IN (SELECT ticker FROM index_constituents)")
    elif tier == "in_index":
        where.append("tt.ticker IN (SELECT ticker FROM index_constituents)")
    wsql = (" WHERE " + " AND ".join(where)) if where else ""
    total = c.execute(f"SELECT COUNT(DISTINCT tt.ticker) n FROM tweet_tickers tt{wsql}", params).fetchone()["n"]
    offset = max(0, (page - 1) * pageSize)
    rows = _rows(c.execute(
        f"""SELECT tt.ticker,
                   MAX(tt.industry_chain) AS chain,
                   MAX(m.company_name) AS company,
                   COUNT(DISTINCT tt.tweet_id) AS mentions,
                   SUM(a.view='bullish') AS b, SUM(a.view='bearish') AS be,
                   AVG(r.t5) AS avg_t5
            FROM tweet_tickers tt
            LEFT JOIN tweet_analysis a ON a.tweet_id=tt.tweet_id
            LEFT JOIN ticker_returns r ON r.tweet_id=tt.tweet_id AND r.ticker=tt.ticker
            LEFT JOIN ticker_meta m ON m.ticker=tt.ticker
            {wsql}
            GROUP BY tt.ticker ORDER BY mentions DESC LIMIT ? OFFSET ?""",
        params + [pageSize, offset]))
    max_m = max((r["mentions"] for r in rows), default=1) or 1
    items = []
    for r in rows:
        b, be = r["b"] or 0, r["be"] or 0
        sent = "bullish" if b > be else ("bearish" if be > b else "neutral")
        mp = market_position(c, r["ticker"])
        items.append({
            "id": r["ticker"], "ticker": r["ticker"], "company": r["company"] or r["ticker"],
            "chain": r["chain"] or "其他",
            "heat": round(r["mentions"] * 100 / max_m),
            "sentiment": sent, "mentions30d": r["mentions"],
            "return5d": _pct(r["avg_t5"]),
            "riskLevel": "high" if not mp["inIndex"] else "medium",
            "marketTier": mp["tier"], "marketLabel": mp["label"], "sp500Weight": mp["sp500Weight"],
        })
    return {"stats": _stock_stats(c), "total": total, "page": page,
            "pageSize": pageSize, "items": items}


@app.get("/stocks/{ticker}")
def stock_detail(ticker: str):
    ticker = ticker.upper()
    c = _conn()
    s = c.execute(
        """SELECT COUNT(DISTINCT tt.tweet_id) mentions,
                  SUM(a.view='bullish') b, SUM(a.view='bearish') be,
                  SUM(a.view='neutral') ne, AVG(r.t5) avg_t5, MAX(tt.industry_chain) chain
           FROM tweet_tickers tt
           LEFT JOIN tweet_analysis a ON a.tweet_id=tt.tweet_id
           LEFT JOIN ticker_returns r ON r.tweet_id=tt.tweet_id AND r.ticker=tt.ticker
           WHERE tt.ticker=?""", (ticker,)).fetchone()
    b, be, ne = (s["b"] or 0), (s["be"] or 0), (s["ne"] or 0)
    sent = "bullish" if b > be else ("bearish" if be > b else "neutral")
    tot = b + be + ne
    sent_label = SENT_LABEL[sent]
    if tot and max(b, be) / tot >= 0.7:
        sent_label = ("极度" if sent != "neutral" else "") + SENT_LABEL[sent]
    rep = [_tweet_obj(c, r) for r in c.execute(
        """SELECT t.id, t.text, t.created_at, t.scraped_at, t.likes, t.retweets,
                  t.reply_count, t.views, t.kol_id, k.handle, k.display_name,
                  k.avatar_url, k.hit_rate, a.view, a.confidence, a.summary
           FROM tweet_tickers tt JOIN tweets t ON t.id=tt.tweet_id
           JOIN kols k ON k.id=t.kol_id
           LEFT JOIN tweet_analysis a ON a.tweet_id=t.id
           WHERE tt.ticker=? ORDER BY t.created_at DESC LIMIT 10""", (ticker,)).fetchall()]
    topKols = [_kol_obj(r) for r in c.execute(
        """SELECT k.id, k.handle, k.display_name, k.avatar_url, k.hit_rate
           FROM tweet_tickers tt JOIN tweets t ON t.id=tt.tweet_id
           JOIN kols k ON k.id=t.kol_id WHERE tt.ticker=?
           GROUP BY k.id ORDER BY COUNT(*) DESC LIMIT 5""", (ticker,)).fetchall()]
    # return distribution buckets over t5
    buckets = {"<-5%": 0, "-5~0%": 0, "0~5%": 0, "5~10%": 0, ">10%": 0}
    for r in c.execute("SELECT t5 FROM ticker_returns WHERE ticker=? AND t5 IS NOT NULL", (ticker,)):
        v = r["t5"] * 100
        if v < -5: buckets["<-5%"] += 1
        elif v < 0: buckets["-5~0%"] += 1
        elif v < 5: buckets["0~5%"] += 1
        elif v < 10: buckets["5~10%"] += 1
        else: buckets[">10%"] += 1
    meta = c.execute("SELECT company_name FROM ticker_meta WHERE ticker=?", (ticker,)).fetchone()
    from analysis.market import market_position
    return {
        "ticker": ticker, "company": (meta["company_name"] if meta else None) or ticker,
        "marketPosition": market_position(c, ticker),
        "heat": min(100, (s["mentions"] or 0)), "mentions30d": s["mentions"] or 0,
        "return5d": _pct(s["avg_t5"]), "sentiment": sent, "sentimentLabel": sent_label,
        "riskLevel": "medium",
        "heatTrend": [],  # no per-date heat history in v1
        "kolCoverage": [{"name": k["name"], "value": 1} for k in topKols],
        "opinionStructure": [{"name": "看多", "value": b}, {"name": "中性", "value": ne},
                             {"name": "看空", "value": be}],
        "returnDistribution": [{"bucket": k, "count": v} for k, v in buckets.items()],
        "topKols": topKols, "representativeTweets": rep,
        "aiLogic": {"consensus": "", "drivers": [], "risks": []},  # not generated in v1
    }


@app.get("/stocks/{ticker}/timeline")
def stock_timeline(ticker: str):
    """Map every KOL mention (first + subsequent) onto the close-price series.
    Returns the price curve since first mention + each mention's price and the
    return from that mention to latest, plus total return since first mention."""
    from datetime import datetime
    from analysis import prices as P
    ticker = ticker.upper()
    c = _conn()
    mentions = _rows(c.execute(
        """SELECT t.id AS tweet_id, t.created_at, t.url, k.handle, k.display_name,
                  a.view, a.summary, s.action, s.target_price
           FROM tweet_tickers tt
           JOIN tweets t ON t.id = tt.tweet_id
           JOIN kols k ON k.id = t.kol_id
           LEFT JOIN tweet_analysis a ON a.tweet_id = t.id
           LEFT JOIN tweet_signals s ON s.tweet_id = t.id AND s.ticker = tt.ticker
           WHERE tt.ticker = ? AND t.created_at IS NOT NULL
           ORDER BY t.created_at""", (ticker,)))
    if not mentions:
        return {"ticker": ticker, "prices": [], "mentions": [], "totalReturnSinceFirst": None}
    first = P._to_date(mentions[0]["created_at"]) or datetime.now()
    series = P.close_series(ticker, first)
    last_close = series[-1]["close"] if series else None
    out_m = []
    for m in mentions:
        d = (m["created_at"] or "")[:10]
        price_date, price = P.point_on_or_after(series, d)
        ret = round((last_close - price) / price * 100, 2) if (price and last_close) else None
        out_m.append({
            "tweetId": m["tweet_id"], "date": d, "priceDate": price_date, "url": m["url"],
            "handle": "@" + (m["handle"] or ""), "name": m["display_name"] or m["handle"],
            "view": m["view"] or "neutral", "action": m["action"],
            "summary": m["summary"], "targetPrice": m["target_price"],
            "priceAtMention": price, "returnSince": ret,
        })
    first_price = out_m[0]["priceAtMention"] if out_m else None
    total = round((last_close - first_price) / first_price * 100, 2) if (first_price and last_close) else None
    return {"ticker": ticker, "prices": series, "mentions": out_m,
            "totalReturnSinceFirst": total, "firstMentionDate": out_m[0]["date"] if out_m else None}


# ----- /mention-performance -----

@app.get("/mention-performance")
def mention_performance():
    """股票池 / 首次提及后表现 / 行业压力 / 热点。Uses stored forward returns (fast);
    per-stock live mapping is /stocks/{ticker}/timeline."""
    c = _conn()
    stocks = _rows(c.execute(
        """SELECT tt.ticker,
                  MAX(m.company_name) AS company,
                  MAX(tt.industry_chain) AS chain,
                  MIN(t.created_at) AS first_mention,
                  COUNT(DISTINCT tt.tweet_id) AS mentions,
                  MAX(MAX(COALESCE(r.t1,0),COALESCE(r.t5,0),COALESCE(r.t10,0),COALESCE(r.t20,0))) AS max_ret,
                  AVG(r.t5) AS avg_t5
           FROM tweet_tickers tt
           JOIN tweets t ON t.id = tt.tweet_id
           LEFT JOIN ticker_meta m ON m.ticker = tt.ticker
           LEFT JOIN ticker_returns r ON r.tweet_id = tt.tweet_id AND r.ticker = tt.ticker
           GROUP BY tt.ticker ORDER BY mentions DESC"""))
    from analysis.market import market_position
    for s in stocks:
        s["company"] = s["company"] or s["ticker"]
        s["chain"] = s["chain"] or "其他"
        s["firstMention"] = (s.pop("first_mention") or "")[:10]
        s["maxReturn"] = _pct(s.pop("max_ret"))
        s["avgReturn5d"] = _pct(s.pop("avg_t5"))
        mp = market_position(c, s["ticker"])
        s["marketTier"] = mp["tier"]
        s["sp500Weight"] = mp["sp500Weight"]
    chains = _rows(c.execute(
        """SELECT tt.industry_chain AS chain,
                  COUNT(DISTINCT tt.tweet_id) AS mentions,
                  SUM(a.view='bullish') AS bullish, SUM(a.view='bearish') AS bearish,
                  AVG(r.t5) AS avg_t5
           FROM tweet_tickers tt
           LEFT JOIN tweet_analysis a ON a.tweet_id = tt.tweet_id
           LEFT JOIN ticker_returns r ON r.tweet_id = tt.tweet_id AND r.ticker = tt.ticker
           WHERE tt.industry_chain IS NOT NULL
           GROUP BY tt.industry_chain ORDER BY mentions DESC"""))
    for ch in chains:
        ch["avgReturn5d"] = _pct(ch.pop("avg_t5"))
    hot = _rows(c.execute(
        """SELECT tt.ticker, MAX(m.company_name) AS company, COUNT(*) AS recent
           FROM tweet_tickers tt
           JOIN tweets t ON t.id = tt.tweet_id
           LEFT JOIN ticker_meta m ON m.ticker = tt.ticker
           WHERE t.created_at >= datetime('now','-7 days')
           GROUP BY tt.ticker ORDER BY recent DESC LIMIT 10"""))
    for h in hot:
        h["company"] = h["company"] or h["ticker"]
    positive = sum(1 for s in stocks if s["maxReturn"] > 0)
    stats = [
        _stat("pool", "股票池", len(stocks), "被提及标的", "blue"),
        _stat("positive", "正收益标的", positive, "提及后", "green"),
        _stat("chains", "行业集群", len(chains), "产业链", "purple"),
        _stat("hot", "热点标的", len(hot), "近7天", "amber"),
    ]
    return {"stats": stats, "stocks": stocks, "chains": chains, "hot": hot}


# ----- /industry -----

@app.get("/industry")
def industry():
    """产业链集群视图：每个集群的提及热度、多空、头部标的、关联 KOL、平均收益。"""
    c = _conn()
    clusters = _rows(c.execute(
        """SELECT tt.industry_chain AS chain,
                  COUNT(DISTINCT tt.tweet_id) AS mentions,
                  COUNT(DISTINCT tt.ticker) AS tickers,
                  COUNT(DISTINCT t.kol_id) AS kols,
                  SUM(a.view='bullish') AS bullish, SUM(a.view='bearish') AS bearish,
                  SUM(a.view='neutral') AS neutral, AVG(r.t5) AS avg_t5
           FROM tweet_tickers tt
           JOIN tweets t ON t.id = tt.tweet_id
           LEFT JOIN tweet_analysis a ON a.tweet_id = tt.tweet_id
           LEFT JOIN ticker_returns r ON r.tweet_id = tt.tweet_id AND r.ticker = tt.ticker
           WHERE tt.industry_chain IS NOT NULL
           GROUP BY tt.industry_chain ORDER BY mentions DESC"""))
    for ch in clusters:
        b, be = ch["bullish"] or 0, ch["bearish"] or 0
        ch["sentiment"] = "bullish" if b > be else ("bearish" if be > b else "neutral")
        ch["avgReturn5d"] = _pct(ch.pop("avg_t5"))
        ch["topTickers"] = _rows(c.execute(
            """SELECT tt.ticker, MAX(m.company_name) AS company, COUNT(*) AS n
               FROM tweet_tickers tt LEFT JOIN ticker_meta m ON m.ticker=tt.ticker
               WHERE tt.industry_chain=? GROUP BY tt.ticker ORDER BY n DESC LIMIT 6""",
            (ch["chain"],)))
        for tk in ch["topTickers"]:
            tk["company"] = tk["company"] or tk["ticker"]
    stats = [
        _stat("clusters", "产业链集群", len(clusters), "活跃", "blue"),
        _stat("tickers", "覆盖标的", sum(c0["tickers"] for c0 in clusters), "全链条", "purple"),
        _stat("mentions", "总提及", sum(c0["mentions"] for c0 in clusters), "累计", "green"),
    ]
    return {"stats": stats, "clusters": clusters}


# ----- /performance (战绩：胜率回测) -----

@app.get("/performance")
def performance():
    """胜率 = 信号方向兑现比例(看多后上行/看空后下行,以 t5 衡量)。SPY 相对超额留待后续。"""
    c = _conn()
    rows = _rows(c.execute(
        """SELECT a.view, tt.industry_chain AS chain, r.t5
           FROM ticker_returns r
           JOIN tweet_tickers tt ON tt.tweet_id=r.tweet_id AND tt.ticker=r.ticker
           JOIN tweet_analysis a ON a.tweet_id=r.tweet_id
           WHERE r.t5 IS NOT NULL AND a.view IN ('bullish','bearish')"""))

    def winrate(items):
        n = len(items)
        if not n:
            return {"n": 0, "winRate": None, "avgExcess": None}
        wins = sum(1 for x in items if (x["t5"] > 0) == (x["view"] == "bullish"))
        avg = sum(x["t5"] for x in items) / n * 100
        return {"n": n, "winRate": round(wins * 100 / n, 1), "avgExcess": round(avg, 2)}

    by_view = [{"group": SENT_LABEL.get(v, v), **winrate([x for x in rows if x["view"] == v])}
               for v in ("bullish", "bearish")]
    chains = sorted({x["chain"] for x in rows if x["chain"]})
    by_chain = [{"group": ch, **winrate([x for x in rows if x["chain"] == ch])} for ch in chains]
    overall = winrate(rows)
    stats = [
        _stat("covered", "覆盖样本", overall["n"], "已兑现(t5)", "blue"),
        _stat("winrate", "总胜率", f'{overall["winRate"]}%' if overall["winRate"] is not None else "—", "方向兑现", "green"),
        _stat("pending", "待兑现", c.execute("SELECT COUNT(*) n FROM ticker_returns WHERE t5 IS NULL").fetchone()["n"], "需≥5交易日", "amber"),
    ]
    return {"stats": stats, "overall": overall, "byView": by_view, "byChain": by_chain,
            "note": "样本随交易日累积；SPY 相对超额、校准曲线、反身性窗口、隐含组合等待后续接入。"}


# ----- /supply-chain (供应链：图谱壳) -----

@app.get("/supply-chain")
def supply_chain():
    """供应链角色图谱 — 关系数据待 LLM/人工构建,先返回按产业链的分组占位。"""
    c = _conn()
    chains = _rows(c.execute(
        """SELECT tt.industry_chain AS chain, COUNT(DISTINCT tt.ticker) AS tickers
           FROM tweet_tickers tt WHERE tt.industry_chain IS NOT NULL
           GROUP BY tt.industry_chain ORDER BY tickers DESC"""))
    for ch in chains:
        ch["companies"] = [{"ticker": r["ticker"], "company": r["company"] or r["ticker"]}
                           for r in c.execute(
            """SELECT tt.ticker, MAX(m.company_name) AS company FROM tweet_tickers tt
               LEFT JOIN ticker_meta m ON m.ticker=tt.ticker
               WHERE tt.industry_chain=? GROUP BY tt.ticker LIMIT 12""", (ch["chain"],))]
    stats = [
        _stat("nodes", "节点(公司)", c.execute("SELECT COUNT(DISTINCT ticker) n FROM tweet_tickers").fetchone()["n"], "图谱覆盖", "blue"),
        _stat("chains", "角色分层", len(chains), "产业链", "purple"),
        _stat("edges", "供应链边", 0, "待构建", "amber"),
    ]
    return {"stats": stats, "tiers": chains, "events": [],
            "note": "供应链上下游关系(边)与传导事件待后续用 LLM 构建种子图谱。"}


# ----- /multi-source (多源：信号源管理 + 共识分层) -----

@app.get("/multi-source")
def multi_source():
    c = _conn()
    tweet_tickers = c.execute("SELECT COUNT(DISTINCT ticker) n FROM tweet_tickers").fetchone()["n"]
    news_tickers = c.execute("SELECT COUNT(DISTINCT ticker) n FROM ticker_news").fetchone()["n"]
    news_total = c.execute("SELECT COUNT(*) n FROM ticker_news").fetchone()["n"]
    sources = [
        {"id": "tweets", "name": "KOL 推文", "type": "primary", "enabled": True,
         "note": f"主源 · {tweet_tickers} 标的覆盖"},
        {"id": "news", "name": "公司新闻 (Finnhub)", "type": "news",
         "enabled": news_total > 0,
         "note": f"{news_total} 条 · {news_tickers} 标的" if news_total else "未抓取（运行 fetch_news 启用）"},
        {"id": "disclosure", "name": "公司披露 / 财报", "type": "disclosure",
         "enabled": False, "note": "为控成本暂未接入"},
    ]
    # consensus: per ticker, how many distinct sources cover it
    rows = _rows(c.execute(
        """SELECT tt.ticker, MAX(m.company_name) AS company,
                  COUNT(DISTINCT tt.tweet_id) AS tweet_count,
                  (SELECT COUNT(*) FROM ticker_news n WHERE n.ticker = tt.ticker) AS news_count
           FROM tweet_tickers tt LEFT JOIN ticker_meta m ON m.ticker = tt.ticker
           GROUP BY tt.ticker ORDER BY tweet_count DESC LIMIT 50"""))
    consensus = []
    for r in rows:
        srcs = 1 + (1 if (r["news_count"] or 0) > 0 else 0)
        consensus.append({
            "ticker": r["ticker"], "company": r["company"] or r["ticker"],
            "tweetCount": r["tweet_count"], "newsCount": r["news_count"] or 0,
            "sources": srcs, "tier": "多源共识" if srcs >= 2 else "单源",
        })
    stats = [
        _stat("covered", "覆盖股票", len(consensus), "多源", "blue"),
        _stat("enabled", "启用源", sum(1 for s in sources if s["enabled"]), "活跃", "green"),
        _stat("configured", "配置源", len(sources), "推文+新闻+披露", "purple"),
    ]
    return {"stats": stats, "sources": sources, "consensus": consensus}


# ----- /stance-changes (Phase 3 groundwork: 立场演变 / 边际变化) -----

@app.get("/stance-changes")
def stance_changes():
    """Per (KOL, ticker) view evolution over time → a marginal-change feed.
    kind: flip(立场翻转) / new(新增关注) / reaffirm(持续确认). Derived from the
    timestamped mention history; becomes richer as repeated scrapes accumulate."""
    from collections import defaultdict
    c = _conn()
    rows = _rows(c.execute(
        """SELECT t.kol_id, k.handle, k.display_name, tt.ticker, a.view, a.confidence,
                  t.created_at, m.company_name
           FROM tweet_tickers tt
           JOIN tweets t ON t.id = tt.tweet_id
           JOIN kols k ON k.id = t.kol_id
           LEFT JOIN tweet_analysis a ON a.tweet_id = t.id
           LEFT JOIN ticker_meta m ON m.ticker = tt.ticker
           WHERE a.view IS NOT NULL AND t.created_at IS NOT NULL
           ORDER BY t.kol_id, tt.ticker, t.created_at"""))
    groups: dict[tuple, list] = defaultdict(list)
    for r in rows:
        groups[(r["kol_id"], r["ticker"])].append(r)

    changes = []
    for (_kid, ticker), seq in groups.items():
        last = seq[-1]
        prior = next((r for r in reversed(seq[:-1]) if r["view"] != last["view"]), None)
        if len(seq) == 1:
            kind = "new"
        elif prior is not None:
            kind = "flip"
        else:
            kind = "reaffirm"
        changes.append({
            "handle": "@" + (last["handle"] or ""),
            "name": last["display_name"] or last["handle"],
            "ticker": ticker, "company": last["company_name"] or ticker,
            "kind": kind, "currentView": last["view"],
            "priorView": prior["view"] if prior else None,
            "latestDate": (last["created_at"] or "")[:10], "mentions": len(seq),
        })
    order = {"flip": 0, "new": 1, "reaffirm": 2}
    changes.sort(key=lambda x: (order.get(x["kind"], 3), x["latestDate"]), reverse=False)
    changes.sort(key=lambda x: x["latestDate"], reverse=True)
    return {"changes": changes}


# ----- /ai/report -----

@app.get("/ai/report")
def ai_report():
    c = _conn()
    summaries = c.execute("SELECT COUNT(*) n FROM tweet_analysis").fetchone()["n"]
    signals = c.execute("SELECT COUNT(*) n FROM tweet_analysis WHERE confidence>=0.85").fetchone()["n"]
    chains = _rows(c.execute(
        """SELECT tt.industry_chain chain, COUNT(DISTINCT tt.tweet_id) mentions,
                  SUM(a.view='bullish') b, SUM(a.view='bearish') be
           FROM tweet_tickers tt LEFT JOIN tweet_analysis a ON a.tweet_id=tt.tweet_id
           WHERE tt.industry_chain IS NOT NULL
           GROUP BY tt.industry_chain ORDER BY mentions DESC LIMIT 5"""))
    clusters = []
    for i, ch in enumerate(chains):
        tickers = [r["ticker"] for r in c.execute(
            "SELECT ticker, COUNT(*) n FROM tweet_tickers WHERE industry_chain=? GROUP BY ticker ORDER BY n DESC LIMIT 5",
            (ch["chain"],)).fetchall()]
        b, be = ch["b"] or 0, ch["be"] or 0
        conf = round(max(b, be) * 100 / (b + be)) if (b + be) else 0
        clusters.append({"id": f"c{i}", "title": ch["chain"], "confidence": conf,
                         "relatedStocks": tickers, "kols": [], "heatSpark": []})
    stats = [
        _stat("summaries", "今日AI摘要", summaries, "已生成", "blue"),
        _stat("clusters", "新观点聚类", len(clusters), "今日", "purple"),
        _stat("signals", "高置信信号", signals, "≥85%", "green"),
        _stat("review", "需人工复核", 0, "待处理", "amber"),
        _stat("alerts", "预警建议", 0, "建议关注", "red"),
    ]
    # Meta-report prose (highlights/logic/divergences/ideas/trends) is not generated
    # in v1 — return empty so the frontend shows clean empty states.
    return {"stats": stats, "highlights": [], "bullishLogic": [], "bearishLogic": [],
            "divergences": [], "tradeIdeas": [], "clusters": clusters,
            "signalTrend": [], "topicEmergence": []}


class AskBody(BaseModel):
    question: str


@app.post("/ai/ask")
def ai_ask(body: AskBody):
    """Answer a research question, grounded in recent analyzed tweets."""
    c = _conn()
    ctx = _rows(c.execute(
        """SELECT k.handle, a.view, a.summary FROM tweet_analysis a
           JOIN tweets t ON t.id=a.tweet_id JOIN kols k ON k.id=t.kol_id
           ORDER BY a.analyzed_at DESC LIMIT 30"""))
    try:
        from analysis.llm import LLMChain
        chain = LLMChain()
        context = "\n".join(f"- @{r['handle']} [{r['view']}] {r['summary']}" for r in ctx) or "（暂无数据）"
        system = "你是股票投研助手,基于给定的近期 KOL 观点回答用户问题,用中文,简洁专业。只输出 JSON {\"answer\": \"...\"}。"
        user = f"近期 KOL 观点:\n{context}\n\n用户问题:{body.question}"
        out, _ = chain.chat_json(system, user)
        return {"answer": out.get("answer", "（无法生成回答）")}
    except Exception:  # noqa: BLE001 - no keys / provider down
        return {"answer": "（演示模式）后端 AI 服务暂未配置或不可用。配置 .env 中的 LLM key 后,"
                          "此处将基于实时推文与分析数据返回研究回答。"}


# ----- /watchlist -----

@app.get("/watchlist")
def watchlist():
    """v1: KOLs + top-mentioned stocks are real; rules/channels/feed are app config
    not yet persisted (alert delivery is out of v1 scope)."""
    c = _conn()
    kols = [_kol_obj(r) for r in c.execute(
        """SELECT id, handle, display_name, avatar_url, hit_rate, note, region
           FROM kols WHERE active=1 ORDER BY region, handle""").fetchall()]
    n_kols = len(kols)
    watched = _rows(c.execute(
        """SELECT tt.ticker, MAX(tt.industry_chain) chain, MAX(t.created_at) last_mention,
                  AVG(r.t1) chg
           FROM tweet_tickers tt JOIN tweets t ON t.id=tt.tweet_id
           LEFT JOIN ticker_returns r ON r.tweet_id=tt.tweet_id AND r.ticker=tt.ticker
           GROUP BY tt.ticker ORDER BY COUNT(*) DESC LIMIT 10"""))
    from analysis import finnhub
    stocks = []
    for w in watched:
        q = finnhub.get_quote(w["ticker"])  # real-time daily change %
        change = round(q["dp"], 2) if q and q.get("dp") is not None else _pct(w["chg"])
        stocks.append({"ticker": w["ticker"], "chain": w["chain"] or "其他",
                       "lastMention": w["last_mention"], "sentimentChange": "neutral",
                       "priceChangePct": change, "aiHint": "", "alertStatus": "muted"})
    n_stocks = c.execute("SELECT COUNT(DISTINCT ticker) n FROM tweet_tickers").fetchone()["n"]
    today = c.execute("SELECT COUNT(*) n FROM tweets WHERE is_reply=0 AND scraped_at >= date('now')").fetchone()["n"]
    stats = [
        _stat("kols", "关注KOL", n_kols, "已关注", "blue"),
        _stat("stocks", "关注股票", n_stocks, "资产池", "purple"),
        _stat("themes", "自定义主题", len(CHAINS), "主题追踪", "green"),
        _stat("alerts", "已开启预警", 0, "规则", "amber"),
        _stat("updates", "今日更新", today, "条动态", "red"),
    ]
    channels = [{"name": "站内通知", "enabled": True}, {"name": "邮件", "enabled": False},
                {"name": "微信", "enabled": False}, {"name": "Webhook", "enabled": False}]
    return {"stats": stats, "kols": kols, "stocks": stocks, "rules": [],
            "channels": channels, "feed": []}


# ----- KOL management (first-class following) -----

class KolBody(BaseModel):
    handle: str
    display_name: Optional[str] = None
    tags: Optional[str] = None


# In-memory refresh status so the UI can show "scraping…" per handle.
_refresh_status: dict[str, str] = {}


async def _refresh_kol(handle: str, limit: int) -> None:
    """Background: scrape one KOL, analyze new tweets, track prices."""
    from scraper import x_scraper
    from analysis import analyze, prices
    handle_l = handle.lstrip("@").lower()
    _refresh_status[handle_l] = "scraping"
    conn = db.connect()
    try:
        kol_id = db.upsert_kol(conn, handle_l)
        known = {r["id"] for r in conn.execute(
            "SELECT id FROM tweets WHERE kol_id=? AND is_reply=0", (kol_id,))}
        tweets, _ = await x_scraper.scrape_timeline(handle_l, limit=limit, known_ids=known or None)
        for t in tweets:
            t["kol_id"] = kol_id
            db.upsert_tweet(conn, t)
        db.mark_kol_scraped(conn, kol_id)
        _refresh_status[handle_l] = "analyzing"
        analyze.run(conn)
        prices.run(conn)
        _refresh_status[handle_l] = "done"
    except Exception as e:  # noqa: BLE001
        _refresh_status[handle_l] = f"error: {e}"


@app.get("/kols")
def list_kols():
    c = _conn()
    rows = _rows(c.execute(
        """SELECT k.id, k.handle, k.display_name, k.avatar_url, k.tags, k.hit_rate, k.active,
                  k.note, k.region, k.last_scraped, k.last_backfill, COUNT(t.id) AS tweet_count
           FROM kols k LEFT JOIN tweets t ON t.kol_id=k.id AND t.is_reply=0
           GROUP BY k.id ORDER BY k.active DESC, k.hit_rate DESC NULLS LAST, tweet_count DESC"""))
    for r in rows:
        r["status"] = _refresh_status.get(r["handle"], "idle")
        # buy/sell-point hit rates from evaluated signals
        buy = c.execute(
            """SELECT COUNT(*) n, SUM(s.eval_hit) h FROM tweet_signals s
               JOIN tweets t ON t.id=s.tweet_id
               WHERE t.kol_id=? AND s.action IN ('buy','add') AND s.eval_hit IS NOT NULL""",
            (r["id"],)).fetchone()
        sell = c.execute(
            """SELECT COUNT(*) n, SUM(s.eval_hit) h FROM tweet_signals s
               JOIN tweets t ON t.id=s.tweet_id
               WHERE t.kol_id=? AND s.action IN ('trim','sell') AND s.eval_hit IS NOT NULL""",
            (r["id"],)).fetchone()
        r["buyHitRate"] = round(buy["h"] * 100 / buy["n"], 1) if buy["n"] else None
        r["buySignals"] = buy["n"]
        r["sellHitRate"] = round(sell["h"] * 100 / sell["n"], 1) if sell["n"] else None
        r["sellSignals"] = sell["n"]
    return rows


@app.post("/kols")
def add_kol(body: KolBody, background: BackgroundTasks):
    """Register a KOL and kick off the first scrape in the background."""
    c = _conn()
    handle_l = body.handle.lstrip("@").lower()
    kol_id = db.upsert_kol(c, handle_l, body.display_name, body.tags)
    c.execute("UPDATE kols SET active=1 WHERE id=?", (kol_id,))
    c.commit()
    background.add_task(_refresh_kol, handle_l, int(os.getenv("SCRAPE_TWEET_LIMIT", "30")))
    return {"id": kol_id, "handle": handle_l, "status": "scraping"}


@app.post("/kols/{handle}/refresh")
def refresh_kol(handle: str, background: BackgroundTasks):
    background.add_task(_refresh_kol, handle.lstrip("@").lower(),
                        int(os.getenv("SCRAPE_TWEET_LIMIT", "30")))
    return {"handle": handle.lstrip("@").lower(), "status": "scraping"}


@app.delete("/kols/{handle}")
def remove_kol(handle: str):
    c = _conn()
    c.execute("UPDATE kols SET active=0 WHERE handle=?", (handle.lstrip("@").lower(),))
    c.commit()
    return {"handle": handle.lstrip("@").lower(), "active": False}
