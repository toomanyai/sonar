"""SQLite connection + upsert helpers for the Stock KOL Monitor."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Iterable, Optional

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "app.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def connect(db_path: Path | str = DB_PATH) -> sqlite3.Connection:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")  # wait up to 30s on a locked DB
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_PATH.read_text())
    _migrate(conn)
    conn.commit()


def _migrate(conn: sqlite3.Connection) -> None:
    """Add columns to existing tables that predate later schema additions."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(kols)")}
    for col, ddl in (("note", "note TEXT"), ("region", "region TEXT"),
                     ("last_backfill", "last_backfill TEXT")):
        if col not in cols:
            conn.execute(f"ALTER TABLE kols ADD COLUMN {ddl}")
    acols = {r["name"] for r in conn.execute("PRAGMA table_info(tweet_analysis)")}
    if "relevance" not in acols:
        conn.execute("ALTER TABLE tweet_analysis ADD COLUMN relevance REAL")
    conn.commit()


# ----- KOLs -----

def upsert_kol(conn: sqlite3.Connection, handle: str, display_name: Optional[str] = None,
               tags: Optional[str] = None, avatar_url: Optional[str] = None,
               note: Optional[str] = None, region: Optional[str] = None) -> int:
    handle = handle.lstrip("@").lower()
    cur = conn.execute(
        """INSERT INTO kols (handle, display_name, tags, avatar_url, note, region)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(handle) DO UPDATE SET
             display_name = COALESCE(excluded.display_name, kols.display_name),
             tags         = COALESCE(excluded.tags, kols.tags),
             avatar_url   = COALESCE(excluded.avatar_url, kols.avatar_url),
             note         = COALESCE(excluded.note, kols.note),
             region       = COALESCE(excluded.region, kols.region)
        """,
        (handle, display_name, tags, avatar_url, note, region),
    )
    conn.commit()
    if cur.lastrowid:
        row = conn.execute("SELECT id FROM kols WHERE handle = ?", (handle,)).fetchone()
        return row["id"]
    return conn.execute("SELECT id FROM kols WHERE handle = ?", (handle,)).fetchone()["id"]


def mark_kol_scraped(conn: sqlite3.Connection, kol_id: int) -> None:
    conn.execute("UPDATE kols SET last_scraped = datetime('now') WHERE id = ?", (kol_id,))
    conn.commit()


# ----- Tweets -----

def upsert_tweet(conn: sqlite3.Connection, tweet: dict[str, Any]) -> bool:
    """Insert a tweet if new; otherwise refresh its engagement counts.
    Returns True ONLY when the tweet was newly inserted (accurate new-count)."""
    params = {
        "id": tweet["id"],
        "kol_id": tweet["kol_id"],
        "text": tweet.get("text", ""),
        "created_at": tweet.get("created_at"),
        "likes": tweet.get("likes", 0),
        "retweets": tweet.get("retweets", 0),
        "reply_count": tweet.get("reply_count", 0),
        "views": tweet.get("views", 0),
        "url": tweet.get("url"),
        "is_reply": int(tweet.get("is_reply", 0)),
    }
    cur = conn.execute(
        """INSERT OR IGNORE INTO tweets (id, kol_id, text, created_at, likes, retweets,
                               reply_count, views, url, is_reply)
           VALUES (:id, :kol_id, :text, :created_at, :likes, :retweets,
                   :reply_count, :views, :url, :is_reply)""",
        params,
    )
    inserted = cur.rowcount > 0
    if not inserted:  # already have it → just refresh engagement
        conn.execute(
            """UPDATE tweets SET likes=:likes, retweets=:retweets,
                 reply_count=:reply_count, views=:views WHERE id=:id""",
            params,
        )
    conn.commit()
    return inserted


def upsert_reply(conn: sqlite3.Connection, reply: dict[str, Any]) -> None:
    conn.execute(
        """INSERT OR IGNORE INTO replies (id, parent_tweet_id, author, text, created_at, likes)
           VALUES (:id, :parent_tweet_id, :author, :text, :created_at, :likes)""",
        {
            "id": reply["id"],
            "parent_tweet_id": reply["parent_tweet_id"],
            "author": reply.get("author"),
            "text": reply.get("text", ""),
            "created_at": reply.get("created_at"),
            "likes": reply.get("likes", 0),
        },
    )
    conn.commit()


def unanalyzed_tweets(conn: sqlite3.Connection, limit: int = 100) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM tweets WHERE analyzed = 0 AND is_reply = 0 ORDER BY scraped_at LIMIT ?",
        (limit,),
    ).fetchall()


# ----- Analysis -----

def save_analysis(conn: sqlite3.Connection, tweet_id: str, view: str, confidence: float,
                  summary: str, model: str, tickers: Iterable[dict[str, Any]],
                  relevance: Optional[float] = None) -> None:
    conn.execute(
        """INSERT INTO tweet_analysis (tweet_id, view, confidence, relevance, summary, model)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(tweet_id) DO UPDATE SET
             view = excluded.view, confidence = excluded.confidence,
             relevance = excluded.relevance,
             summary = excluded.summary, model = excluded.model,
             analyzed_at = datetime('now')""",
        (tweet_id, view, confidence, relevance, summary, model),
    )
    for t in tickers:
        sym = t["ticker"].upper()
        conn.execute(
            """INSERT OR IGNORE INTO tweet_tickers (tweet_id, ticker, industry_chain, target_price)
               VALUES (?, ?, ?, ?)""",
            (tweet_id, sym, t.get("industry_chain"), t.get("target_price")),
        )
        if t.get("action"):
            conn.execute(
                """INSERT INTO tweet_signals
                     (tweet_id, ticker, action, entry_low, entry_high, target_price, stop_loss)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(tweet_id, ticker) DO UPDATE SET
                     action=excluded.action, entry_low=excluded.entry_low,
                     entry_high=excluded.entry_high, target_price=excluded.target_price,
                     stop_loss=excluded.stop_loss""",
                (tweet_id, sym, t.get("action"), t.get("entry_low"), t.get("entry_high"),
                 t.get("target_price"), t.get("stop_loss")),
            )
    conn.execute("UPDATE tweets SET analyzed = 1 WHERE id = ?", (tweet_id,))
    conn.commit()


if __name__ == "__main__":
    c = connect()
    init_db(c)
    print(f"Initialized DB at {DB_PATH}")
