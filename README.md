# 声纳 Sonar — KOL 声音里的投研信号

Monitor stock-related KOL tweets on X, run an LLM analysis pass (view / sentiment,
ticker + industry-chain extraction), track forward stock returns to score each
KOL's hit-rate, and serve it all to a Next.js dashboard.

## Stack
- **Scraper**: crawl4ai (Playwright) with a logged-in managed-browser profile
- **Analysis**: OpenAI-compatible LLM chain — NVIDIA v4-pro → DeepSeek → ds2api fallback
- **Prices**: yfinance (forward returns T+1/5/10/20)
- **Storage**: SQLite (`data/app.db`)
- **API**: FastAPI (`:8000`) · **Frontend**: Next.js + Tailwind (`:3000`)

## Backend setup

```bash
cd backend
python3 -m venv .venv
# NOTE: the local proxy resets the Tsinghua mirror; install from pypi.org:
.venv/bin/pip install -i https://pypi.org/simple -r requirements.txt
.venv/bin/python -m playwright install chromium
cp .env.example .env        # then fill in at least one LLM provider's key
```

### One-time X login (required before scraping)
crawl4ai needs a logged-in session. Run this once — a browser window opens, log
into X by hand, then press Enter:

```bash
cd backend && .venv/bin/python -m scraper.x_profile
```

The session is saved to `~/.crawl4ai/profiles/x-stock-kol` and reused on every run.
No password is stored in code.

## Run the pipeline

```bash
cd backend
.venv/bin/python pipeline.py --kol KotlinerBTC --limit 20   # scrape one KOL
.venv/bin/python pipeline.py                                # all KOLs in kols.yaml
.venv/bin/python pipeline.py --kol KotlinerBTC --replies    # also collect replies
.venv/bin/python pipeline.py --analyze-only                 # re-run LLM + prices only
```

Add KOLs by editing `backend/kols.yaml`.

## Serve

```bash
cd backend && .venv/bin/python -m uvicorn api.main:app --reload --port 8000
cd frontend && npm install && npm run dev      # http://localhost:3000
```

## Layout
```
backend/
  scraper/x_profile.py   one-time interactive X login
  scraper/x_scraper.py   timeline + reply scrape (scroll + dedupe by status id)
  analysis/llm.py        provider fallback chain
  analysis/analyze.py    view + ticker + industry-chain extraction
  analysis/prices.py     yfinance forward returns -> hit-rate
  storage/schema.sql     SQLite schema   storage/db.py  helpers
  pipeline.py            orchestrator     api/main.py    FastAPI
frontend/                Next.js dashboard (5 screens)
data/app.db              SQLite database
```

## Notes / known limits
- **Network**: a local proxy (`127.0.0.1:2023`) is the macOS system proxy; it
  reaches pypi.org but resets the Tsinghua mirror — always `pip install -i https://pypi.org/simple`.
- **X anti-bot**: keep `SCRAPE_TWEET_LIMIT` modest and scroll delays human-like.
  DOM extraction keys on `data-testid` attrs + the `/status/<id>` permalink; if X
  changes markup, patch the selectors in `scraper/x_scraper.py`.
- **v1 scope**: reply *analysis*, alert delivery, and non-US price tracking are out
  of scope (replies are collected; alerts/markets come later).
```
