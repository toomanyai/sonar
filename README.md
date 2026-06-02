# 声纳 Sonar — KOL 声音里的投研信号

Monitor stock-related KOL tweets on X, run an LLM analysis pass (view / sentiment,
ticker + industry-chain extraction), track forward stock returns to score each
KOL's hit-rate, and serve it all to a Next.js dashboard.

## Stack
- **Scraper**: crawl4ai (Playwright) with a logged-in managed-browser profile
- **Analysis**: OpenAI-compatible LLM chain (UI-configurable) — NVIDIA v4-flash → DeepSeek，可在设置页改 key/模型/回退链
- **Prices**: yfinance (forward returns T+1/5/10/20)
- **Storage**: SQLite (`data/app.db`)
- **API**: FastAPI (`:8000`) · **Frontend**: Next.js + Tailwind (`:3000`)

## 🚀 启动（日常）

已经部署过、配好 key 和 X 登录后，每次启动只需开**两个终端**各跑一条：

```bash
# 终端 1 — 后端 API
cd /Users/matongming/AI/stock-kol-monitor/backend
.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000

# 终端 2 — 前端界面
cd /Users/matongming/AI/stock-kol-monitor/frontend
npm run dev
```

然后浏览器打开 **http://localhost:3000**。

停止：`lsof -ti:8000 | xargs kill`（后端）、`lsof -ti:3000 | xargs kill`（前端）。

> 国内网络：后端/前端本身不需要代理；但 yfinance/联网搜索/抓取若不通，给当前终端 `export HTTPS_PROXY=http://127.0.0.1:2023 HTTP_PROXY=http://127.0.0.1:2023` 再启动。

可选——让数据自动持续更新（盘中 3h / 盘外 6h，详见「定时抓取」）：
```bash
cp deploy/com.stockkol.scheduler.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.stockkol.scheduler.plist
```

## 首次部署（只做一次）

1. **装依赖**（见下「Backend setup」+ `cd frontend && npm install`）
2. **配 key**：`cp backend/.env.example backend/.env` 填至少一个 LLM key + Finnhub key；或启动后在网页右上角 **⚙ 设置页** 里配
3. **登录 X**：`cd backend && .venv/bin/python -m scraper.x_profile`（浏览器手动登录一次）
4. **跑一遍出数据**：`.venv/bin/python pipeline.py`（抓 `kols.yaml` 里所有 KOL → 分析 → 入库）
5. **启动**（见上「🚀 启动」）

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
frontend/                Next.js dashboard (总览/推文/股票/提及表现/战绩/供应链/多源/行业/分析/关注我/设置)
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
