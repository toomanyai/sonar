-- Stock KOL Monitor schema (SQLite)

CREATE TABLE IF NOT EXISTS kols (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    handle        TEXT UNIQUE NOT NULL,          -- without leading @, lowercased
    display_name  TEXT,
    avatar_url    TEXT,
    tags          TEXT,                          -- comma-separated topic tags
    active        INTEGER NOT NULL DEFAULT 1,
    mention_count INTEGER NOT NULL DEFAULT 0,
    hit_rate      REAL,                          -- rolled up from ticker_returns
    note          TEXT,                          -- 领域/风格简介
    region        TEXT,                          -- cn | en
    created_at    TEXT DEFAULT (datetime('now')),
    last_scraped  TEXT,
    last_backfill TEXT                            -- 历史回填游标(最近一次深挖时间)
);

CREATE TABLE IF NOT EXISTS tweets (
    id          TEXT PRIMARY KEY,                -- X status id
    kol_id      INTEGER NOT NULL REFERENCES kols(id),
    text        TEXT NOT NULL,
    created_at  TEXT,                            -- tweet timestamp (ISO)
    likes       INTEGER DEFAULT 0,
    retweets    INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    views       INTEGER DEFAULT 0,
    url         TEXT,
    is_reply    INTEGER NOT NULL DEFAULT 0,
    scraped_at  TEXT DEFAULT (datetime('now')),
    analyzed    INTEGER NOT NULL DEFAULT 0       -- 0 = needs LLM analysis
);
CREATE INDEX IF NOT EXISTS idx_tweets_kol ON tweets(kol_id);
CREATE INDEX IF NOT EXISTS idx_tweets_analyzed ON tweets(analyzed);

CREATE TABLE IF NOT EXISTS tweet_analysis (
    tweet_id    TEXT PRIMARY KEY REFERENCES tweets(id),
    view        TEXT,                            -- bullish | bearish | neutral
    confidence  REAL,                            -- 0..1
    relevance   REAL,                            -- 0..1 投研价值分(低=闲聊/玩笑)
    summary     TEXT,
    model       TEXT,                            -- which provider/model produced it
    analyzed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tweet_tickers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id       TEXT NOT NULL REFERENCES tweets(id),
    ticker         TEXT NOT NULL,
    industry_chain TEXT,                         -- 芯片/算力, 光模块/网络, ...
    target_price   REAL,
    UNIQUE(tweet_id, ticker)
);
CREATE INDEX IF NOT EXISTS idx_tickers_ticker ON tweet_tickers(ticker);

-- Per-(tweet,ticker) trade signal: the KOL's buy/sell-point call.
CREATE TABLE IF NOT EXISTS tweet_signals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id     TEXT NOT NULL REFERENCES tweets(id),
    ticker       TEXT NOT NULL,
    action       TEXT,                             -- buy|add|hold|trim|sell|watch|avoid
    entry_low    REAL,                             -- 买点区间下沿
    entry_high   REAL,                             -- 买点区间上沿
    target_price REAL,                             -- 卖点/目标价
    stop_loss    REAL,                             -- 止损位
    eval_hit     INTEGER,                          -- 1 hit / 0 miss / NULL pending (vs t5)
    UNIQUE(tweet_id, ticker)
);
CREATE INDEX IF NOT EXISTS idx_signals_ticker ON tweet_signals(ticker);

-- Index constituents + weights (slickcharts) — "市场地位" / signal-quality layer.
CREATE TABLE IF NOT EXISTS index_constituents (
    index_name TEXT NOT NULL,                      -- sp500 | nasdaq100 | dowjones
    ticker     TEXT NOT NULL,
    company    TEXT,
    weight     REAL,                               -- percent, e.g. 7.43
    rank       INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (index_name, ticker)
);
CREATE INDEX IF NOT EXISTS idx_constituents_ticker ON index_constituents(ticker);

-- Per-tweet "deep read" (lazy, cached): translation + interpretation + 事实/观点/建议 + 可靠性.
CREATE TABLE IF NOT EXISTS tweet_deepread (
    tweet_id       TEXT PRIMARY KEY REFERENCES tweets(id),
    lang           TEXT,                          -- en | zh | ...
    translation    TEXT,                          -- 中文翻译(原文非中文时)
    interpretation TEXT,                          -- 这位KOL在说什么(白话)
    facts          TEXT,                          -- JSON array
    opinions       TEXT,                          -- JSON array
    suggestions    TEXT,                          -- JSON array
    reliability    TEXT,                          -- JSON array of {point, level, reason}
    model          TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
);

-- Company news (Finnhub) — the second signal source for multi-source consensus.
CREATE TABLE IF NOT EXISTS ticker_news (
    id          TEXT PRIMARY KEY,                 -- finnhub article id (as text)
    ticker      TEXT NOT NULL,
    headline    TEXT,
    summary     TEXT,
    source      TEXT,
    url         TEXT,
    datetime    TEXT,                             -- ISO
    fetched_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_news_ticker ON ticker_news(ticker);

-- Cached company metadata from Finnhub (free tier): profile2 fields.
CREATE TABLE IF NOT EXISTS ticker_meta (
    ticker       TEXT PRIMARY KEY,
    company_name TEXT,
    industry     TEXT,                             -- finnhubIndustry (e.g. Semiconductors)
    exchange     TEXT,
    logo         TEXT,
    weburl       TEXT,
    updated_at   TEXT DEFAULT (datetime('now'))
);

-- Replies collected into the data layer; analysis deferred (v1 out of scope).
CREATE TABLE IF NOT EXISTS replies (
    id              TEXT PRIMARY KEY,            -- X status id of the reply
    parent_tweet_id TEXT NOT NULL REFERENCES tweets(id),
    author          TEXT,
    text            TEXT,
    created_at      TEXT,
    likes           INTEGER DEFAULT 0,
    scraped_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_tweet_id);

-- Forward-return / hit-rate tracking per (tweet, ticker).
CREATE TABLE IF NOT EXISTS ticker_returns (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id    TEXT NOT NULL REFERENCES tweets(id),
    ticker      TEXT NOT NULL,
    view        TEXT,                            -- copied from analysis at record time
    base_date   TEXT,                            -- trading day used as t0
    base_price  REAL,
    t1          REAL,                            -- forward return fractions
    t5          REAL,
    t10         REAL,
    t20         REAL,
    hit         INTEGER,                         -- 1 if direction matched view (t5), else 0, NULL pending
    updated_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(tweet_id, ticker)
);
CREATE INDEX IF NOT EXISTS idx_returns_ticker ON ticker_returns(ticker);
