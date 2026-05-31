"""LLM analysis pass: sentiment/view + ticker + industry-chain extraction."""
from __future__ import annotations

import sqlite3
from typing import Any

from analysis.llm import LLMChain
from analysis.prompts import (ANALYSIS_SYSTEM, analysis_user_prompt,
                              DEEPREAD_SYSTEM, deepread_user_prompt)
from storage import db

REL_LEVELS = {"可能靠谱", "存疑", "无法验证"}

VALID_VIEWS = {"bullish", "bearish", "neutral"}
VALID_CHAINS = {"芯片/算力", "光模块/网络", "AI基础设施", "数据中心电力", "云与软件", "其他"}
VALID_ACTIONS = {"buy", "add", "hold", "trim", "sell", "watch", "avoid"}


def _num(v: Any) -> Any:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _clean(result: dict[str, Any]) -> dict[str, Any]:
    view = str(result.get("view", "neutral")).lower()
    if view not in VALID_VIEWS:
        view = "neutral"
    try:
        conf = float(result.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    try:
        rel = float(result.get("relevance", 0.5))
    except (TypeError, ValueError):
        rel = 0.5
    rel = max(0.0, min(1.0, rel))
    tickers = []
    for t in result.get("tickers", []) or []:
        sym = str(t.get("ticker", "")).strip().upper()
        if not sym:
            continue
        chain = t.get("industry_chain")
        if chain not in VALID_CHAINS:
            chain = "其他"
        action = str(t.get("action", "watch")).lower().strip()
        if action not in VALID_ACTIONS:
            action = "watch"
        tickers.append({
            "ticker": sym, "industry_chain": chain, "target_price": _num(t.get("target_price")),
            "action": action, "entry_low": _num(t.get("entry_low")),
            "entry_high": _num(t.get("entry_high")), "stop_loss": _num(t.get("stop_loss")),
        })
    return {"view": view, "confidence": conf, "relevance": rel,
            "summary": str(result.get("summary", "")).strip(), "tickers": tickers}


def analyze_tweet(chain: LLMChain, handle: str, text: str) -> tuple[dict[str, Any], str]:
    raw, model = chain.chat_json(ANALYSIS_SYSTEM, analysis_user_prompt(handle, text))
    return _clean(raw), model


def _clean_deepread(r: dict[str, Any]) -> dict[str, Any]:
    def arr(x):
        return [str(i).strip() for i in (x or []) if str(i).strip()]
    rel = []
    for it in (r.get("reliability") or []):
        if isinstance(it, dict) and it.get("point"):
            lvl = str(it.get("level", "")).strip()
            if lvl not in REL_LEVELS:
                lvl = "无法验证"
            rel.append({"point": str(it["point"]).strip(), "level": lvl,
                        "reason": str(it.get("reason", "")).strip()})
    return {
        "lang": str(r.get("lang", "")).strip().lower(),
        "translation": str(r.get("translation", "")).strip(),
        "interpretation": str(r.get("interpretation", "")).strip(),
        "facts": arr(r.get("facts")), "opinions": arr(r.get("opinions")),
        "suggestions": arr(r.get("suggestions")), "reliability": rel,
    }


def deepread_tweet(chain: LLMChain, handle: str, text: str,
                   context: str = "") -> tuple[dict[str, Any], str]:
    raw, model = chain.chat_json(DEEPREAD_SYSTEM, deepread_user_prompt(handle, text, context),
                                 max_tokens=1600)
    return _clean_deepread(raw), model


def run(conn: sqlite3.Connection, limit: int = 100) -> int:
    chain = LLMChain()
    rows = db.unanalyzed_tweets(conn, limit=limit)
    done = 0
    for row in rows:
        kol = conn.execute("SELECT handle FROM kols WHERE id = ?", (row["kol_id"],)).fetchone()
        handle = kol["handle"] if kol else "?"
        try:
            result, model = analyze_tweet(chain, handle, row["text"])
        except Exception as e:  # noqa: BLE001
            print(f"  ! analyze failed for {row['id']}: {e}")
            continue
        db.save_analysis(conn, row["id"], result["view"], result["confidence"],
                         result["summary"], model, result["tickers"],
                         relevance=result["relevance"])
        done += 1
        tickers = ", ".join(t["ticker"] for t in result["tickers"]) or "-"
        print(f"  ✓ {row['id']} [{result['view']} {result['confidence']:.2f} rel{result['relevance']:.2f}] {tickers}")
    return done


if __name__ == "__main__":
    c = db.connect()
    db.init_db(c)
    print(f"Analyzed {run(c)} tweets")
