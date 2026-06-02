/**
 * Centralized API client for the 声纳 Sonar (KOL 投研信号) frontend.
 *
 * ALL network calls live here so the backend contract is in one place.
 * The FastAPI backend (http://localhost:8000) should conform to the
 * interfaces + endpoint shapes below.
 *
 * When the backend is unreachable, each function falls back to MOCK data
 * (clearly marked with the `MOCK_` prefix). To go fully live, delete every
 * `MOCK_*` const and the `withFallback` wrapper — nothing else references them.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

/* ------------------------------------------------------------------ */
/* Shared domain types                                                 */
/* ------------------------------------------------------------------ */

export type Sentiment = "bullish" | "bearish" | "neutral" | "uncertain";

export interface StatCardData {
  /** machine key, stable across renders */
  key: string;
  label: string;
  value: string | number;
  /** optional sublabel / delta text shown under the value */
  delta?: string;
  /** pastel tint: blue | red | green | amber | purple */
  tone: "blue" | "red" | "green" | "amber" | "purple";
}

export interface Category {
  key: string;
  label: string;
  count: number;
}

export interface RelatedStock {
  ticker: string;
  name?: string;
  /** % price change vs reference, e.g. 7.3 for +7.3% */
  changePct: number;
}

export interface Kol {
  id: string;
  handle: string;
  name: string;
  avatarUrl?: string;
  verified: boolean;
  /** 历史命中率, 0-100 */
  hitRate?: number;
  followers?: number;
  /** 领域/风格简介 */
  note?: string | null;
  /** cn | en */
  region?: string | null;
}

export interface Tweet {
  id: string;
  kol: Kol;
  /** 原推文 X 链接 */
  url?: string;
  text: string;
  createdAt: string; // ISO
  sentiment: Sentiment;
  relatedStocks: RelatedStock[];
  topics: string[];
  engagement: {
    replies: number;
    retweets: number;
    likes: number;
    views: number;
  };
  aiSummary?: string;
  /** AI 置信度, 0-100 */
  confidence?: number;
  /** 投研价值分, 0-100 (低=闲聊/玩笑) */
  relevance?: number | null;
}

export interface TweetDetail extends Tweet {
  keyPoints: string[];
  /** 关联股票 with 观点强度 / KOL目标 / 近24h涨跌 */
  stockBreakdown: {
    ticker: string;
    name: string;
    /** 观点强度, 0-100 */
    strength: number;
    targetPrice?: string;
    change24h: number;
  }[];
  /** 历史命中率 (近90天), 0-100 */
  historicalHitRate: number;
  /** 后续收益跟踪 T+1..T+5 */
  returnTracking: { day: string; returnPct: number }[];
}

export interface ChainReturn {
  ticker: string;
  chain: string;
  /** 最大收益率, e.g. 707 for 707% */
  maxReturnPct: number;
}

export interface OverviewData {
  stats: StatCardData[];
  categories: Category[];
  topReturns: ChainReturn[];
}

export interface MarketPosition {
  indices: string[];
  sp500Weight: number | null;
  tier: string; // 权重股 | 大盘 | 非指数
  inIndex: boolean;
  label: string;
}

export interface Stock {
  id: string;
  ticker: string;
  company: string;
  chain: string;
  /** 提及热度, 0-100 */
  heat: number;
  sentiment: Sentiment;
  /** 近30天提及数 */
  mentions30d: number;
  /** 提及后收益(5天) % */
  return5d: number;
  riskLevel: "low" | "medium" | "high";
  /** 市场地位（指数成分+权重） */
  marketTier?: string;
  marketLabel?: string;
  sp500Weight?: number | null;
}

export interface StockListResult {
  stats: StatCardData[];
  total: number;
  page: number;
  pageSize: number;
  items: Stock[];
}

export interface StockDetail {
  ticker: string;
  company: string;
  marketPosition?: MarketPosition;
  heat: number;
  mentions30d: number;
  return5d: number;
  sentiment: Sentiment;
  sentimentLabel: string; // e.g. 极度看多
  riskLevel: "low" | "medium" | "high";
  /** 提及热度趋势 */
  heatTrend: { date: string; heat: number }[];
  /** KOL覆盖 donut */
  kolCoverage: { name: string; value: number }[];
  /** 观点结构 donut */
  opinionStructure: { name: string; value: number }[];
  /** 后续收益分布 (5天) bar */
  returnDistribution: { bucket: string; count: number }[];
  topKols: Kol[];
  representativeTweets: Tweet[];
  aiLogic: {
    consensus: string;
    drivers: string[];
    risks: string[];
  };
}

export interface AnalysisCluster {
  id: string;
  title: string;
  /** 置信度, 0-100 */
  confidence: number;
  relatedStocks: string[];
  kols: Kol[];
  /** 讨论热度 sparkline */
  heatSpark: number[];
}

export interface AIReport {
  stats: StatCardData[];
  /** 今日重点 */
  highlights: string[];
  bullishLogic: { text: string; confidence: number }[];
  bearishLogic: { text: string; confidence: number }[];
  /** 分歧点 */
  divergences: string[];
  /** 潜在交易线索 */
  tradeIdeas: { text: string; confidence: number }[];
  clusters: AnalysisCluster[];
  /** 信号演化趋势 */
  signalTrend: { date: string; bullish: number; bearish: number }[];
  /** 话题涌现 */
  topicEmergence: { topic: string; value: number }[];
}

export interface WatchedStock {
  ticker: string;
  chain: string;
  lastMention: string;
  sentimentChange: Sentiment;
  priceChangePct: number;
  aiHint: string;
  alertStatus: "active" | "muted";
}

export interface AlertRule {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
}

export interface WatchlistFeedItem {
  id: string;
  time: string;
  text: string;
  kind: "alert" | "update" | "mention";
}

export interface WatchlistData {
  stats: StatCardData[];
  kols: Kol[];
  stocks: WatchedStock[];
  rules: AlertRule[];
  channels: { name: string; enabled: boolean }[];
  feed: WatchlistFeedItem[];
}

/* ------------------------------------------------------------------ */
/* Fetch helper with graceful MOCK fallback                            */
/* ------------------------------------------------------------------ */

async function withFallback<T>(path: string, mock: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      // always hit the network; the backend owns caching
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    // Backend unreachable / not implemented yet -> MOCK fallback.
    // Components treat this exactly like live data; delete mocks to go live.
    return mock;
  }
}

/* ------------------------------------------------------------------ */
/* Public API functions (the backend contract)                         */
/* ------------------------------------------------------------------ */

/** GET /overview */
export function getOverviewStats(): Promise<OverviewData> {
  return withFallback("/overview", MOCK_OVERVIEW);
}

/** GET /tweets?sentiment=&q=&topic= */
export function getTweets(params?: {
  q?: string;
  sentiment?: Sentiment;
  topic?: string;
  /** 0-1 投研价值阈值，过滤低价值推文 */
  minRelevance?: number;
}): Promise<TweetsResponse> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.sentiment) qs.set("sentiment", params.sentiment);
  if (params?.topic) qs.set("topic", params.topic);
  if (params?.minRelevance) qs.set("min_relevance", String(params.minRelevance));
  const suffix = qs.toString() ? `?${qs}` : "";
  return withFallback(`/tweets${suffix}`, MOCK_TWEETS_RESPONSE);
}

/** GET /tweets/{id} */
export function getTweetDetail(id: string): Promise<TweetDetail> {
  return withFallback(`/tweets/${id}`, MOCK_TWEET_DETAIL);
}

export interface ReliabilityItem {
  point: string;
  level: string; // 可能靠谱 | 存疑 | 无法验证
  reason: string;
}
export interface DeepRead {
  lang: string;
  translation: string;
  interpretation: string;
  facts: string[];
  opinions: string[];
  suggestions: string[];
  reliability: ReliabilityItem[];
}

/** GET /tweets/{id}/deepread — 翻译 + 解读 + 事实/观点/建议 + 可靠性（懒加载+缓存，首次较慢） */
export function getTweetDeepRead(id: string): Promise<DeepRead> {
  return withFallback(`/tweets/${id}/deepread`, {
    lang: "", translation: "", interpretation: "",
    facts: [], opinions: [], suggestions: [], reliability: [],
  });
}

/** GET /stocks?page=&pageSize=&q=&category= */
export function getStocks(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  category?: string;
  tier?: "off_index" | "in_index";
}): Promise<StockListResult> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.q) qs.set("q", params.q);
  if (params?.category) qs.set("category", params.category);
  if (params?.tier) qs.set("tier", params.tier);
  const suffix = qs.toString() ? `?${qs}` : "";
  return withFallback(`/stocks${suffix}`, MOCK_STOCK_LIST);
}

/** GET /stocks/{ticker} */
export function getStockDetail(ticker: string): Promise<StockDetail> {
  return withFallback(`/stocks/${ticker}`, MOCK_STOCK_DETAIL);
}

/** GET /ai/report */
export function getAIReport(): Promise<AIReport> {
  return withFallback("/ai/report", MOCK_AI_REPORT);
}

/** POST /ai/ask  { question } -> { answer } */
export async function askAI(question: string): Promise<{ answer: string }> {
  try {
    const res = await fetch(`${API_BASE}/ai/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { answer: string };
  } catch {
    return {
      answer:
        "（演示模式）后端 AI 服务尚未连接。接入后端后此处将返回基于实时推文与持仓数据的研究回答。",
    };
  }
}

/** GET /watchlist */
export function getWatchlist(): Promise<WatchlistData> {
  return withFallback("/watchlist", MOCK_WATCHLIST);
}

/** POST /kols { handle } -> registers a KOL and starts a background scrape */
export async function addKol(handle: string): Promise<{ handle: string; status: string }> {
  const res = await fetch(`${API_BASE}/kols`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: handle.replace(/^@/, "") }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** DELETE /kols/{handle} -> stops following (deactivates) */
export async function removeKol(handle: string): Promise<void> {
  await fetch(`${API_BASE}/kols/${encodeURIComponent(handle.replace(/^@/, ""))}`, {
    method: "DELETE",
  });
}

/** POST /kols/{handle}/refresh -> re-scrape this KOL in the background */
export async function refreshKol(handle: string): Promise<void> {
  await fetch(`${API_BASE}/kols/${encodeURIComponent(handle.replace(/^@/, ""))}/refresh`, {
    method: "POST",
  });
}

export interface TweetsResponse {
  stats: StatCardData[];
  trend: { date: string; count: number }[];
  sentimentDist: { name: string; value: number; sentiment: Sentiment }[];
  tweets: Tweet[];
}

/* ------------------------------------------------------------------ */
/* 设置：LLM API key / 模型 / 回退链                                     */
/* ------------------------------------------------------------------ */

export interface LLMProviderView {
  label: string;
  base_url: string;
  model: string;
  has_key: boolean;
  key_hint: string;
  builtin: boolean;
}
export interface LLMSettings {
  chain: string[];
  providers: Record<string, LLMProviderView>;
  builtins: string[];
}
export interface LLMProviderSave {
  label: string;
  base_url: string;
  model: string;
  api_key: string; // 空=保留原 key
}

export function getLLMSettings(): Promise<LLMSettings> {
  return withFallback("/settings/llm", { chain: [], providers: {}, builtins: [] });
}

export async function saveLLMSettings(
  chain: string[],
  providers: Record<string, LLMProviderSave>
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/settings/llm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chain, providers }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function testLLMProvider(body: {
  provider_id?: string;
  base_url?: string;
  api_key?: string;
  model?: string;
}): Promise<{ ok: boolean; model?: string; reply?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/settings/llm/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Phase 2: 提及表现 / 行业 / 提及×价格时间线                            */
/* ------------------------------------------------------------------ */

export interface PerfStock {
  ticker: string;
  company: string;
  chain: string;
  firstMention: string;
  mentions: number;
  maxReturn: number;
  avgReturn5d: number;
  marketTier?: string;
  sp500Weight?: number | null;
}
export interface ChainPressure {
  chain: string;
  mentions: number;
  bullish: number;
  bearish: number;
  avgReturn5d: number;
}
export interface HotStock {
  ticker: string;
  company: string;
  recent: number;
}
export interface MentionPerformance {
  stats: StatCardData[];
  stocks: PerfStock[];
  chains: ChainPressure[];
  hot: HotStock[];
}

export interface IndustryCluster {
  chain: string;
  mentions: number;
  tickers: number;
  kols: number;
  bullish: number;
  bearish: number;
  neutral: number;
  sentiment: Sentiment;
  avgReturn5d: number;
  topTickers: { ticker: string; company: string; n: number }[];
}
export interface IndustryData {
  stats: StatCardData[];
  clusters: IndustryCluster[];
}

export interface MentionPoint {
  tweetId: string;
  date: string;
  priceDate?: string | null;
  url?: string;
  handle: string;
  name: string;
  view: Sentiment;
  action?: string;
  summary?: string;
  targetPrice?: number | null;
  priceAtMention: number | null;
  returnSince: number | null;
}
export interface StockTimeline {
  ticker: string;
  prices: { date: string; close: number }[];
  mentions: MentionPoint[];
  totalReturnSinceFirst: number | null;
  firstMentionDate?: string;
}

/** GET /mention-performance */
export function getMentionPerformance(): Promise<MentionPerformance> {
  return withFallback("/mention-performance", MOCK_MENTION_PERF);
}

/** GET /industry */
export function getIndustry(): Promise<IndustryData> {
  return withFallback("/industry", MOCK_INDUSTRY);
}

/** GET /stocks/{ticker}/timeline — first + subsequent mentions on the price curve */
export function getStockTimeline(ticker: string): Promise<StockTimeline> {
  return withFallback(`/stocks/${ticker}/timeline`, MOCK_TIMELINE);
}

/* 个股研报（免费数据版，仿一页式研报） */
export interface StockReport {
  ticker: string;
  company: string;
  sector: string;
  updated: string;
  price: {
    current: number | null;
    changePct: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    marketCap: number | null;
    volume: number | null;
  };
  targets: {
    low: number | null;
    mean: number | null;
    high: number | null;
    current: number | null;
    numAnalysts: number | null;
    recommendation: string | null;
  };
  ratingZones: {
    buyBelow?: number;
    watch?: [number, number];
    riskAbove?: number;
    position?: string;
  };
  metrics: { label: string; value: number | null }[];
  scores: {
    technical: { score: number; trend?: number; mom3m?: number; volAnn?: number };
    fundamental: {
      score: number;
      grossMargin?: number;
      netMargin?: number;
      roe?: number;
      revGrowth?: number;
      fwdPE?: number;
    };
  };
  financials: { item: string; value: number | null; yoy?: number | null; unit?: string }[];
  performance: {
    d1?: number | null;
    d5?: number | null;
    m1?: number | null;
    m3?: number | null;
    ytd?: number | null;
    y1?: number | null;
  };
  institutions: {
    pctInstitutions: number | null;
    topHolders: { holder: string; pct: number }[];
  };
  news: { datetime: string; headline: string; source: string; url: string }[];
  kol: { mentions: number; bullish: number; bearish: number };
  aiView: { core: string; bull: string[]; risk: string[]; catalyst: string[]; error?: string };
}

/** GET /stocks/{ticker}/report — 一页式个股研报（首次生成约 30-40 秒，之后缓存秒回） */
export function getStockReport(ticker: string): Promise<StockReport> {
  return withFallback(`/stocks/${ticker}/report`, MOCK_STOCK_REPORT);
}

export interface StanceChange {
  handle: string;
  name: string;
  ticker: string;
  company: string;
  kind: "flip" | "new" | "reaffirm";
  currentView: Sentiment;
  priorView: Sentiment | null;
  latestDate: string;
  mentions: number;
}

/** GET /stance-changes — 立场演变 / 边际变化 feed */
export function getStanceChanges(): Promise<{ changes: StanceChange[] }> {
  return withFallback("/stance-changes", { changes: [] });
}

export interface MultiSourceData {
  stats: StatCardData[];
  sources: { id: string; name: string; type: string; enabled: boolean; note: string }[];
  consensus: {
    ticker: string;
    company: string;
    tweetCount: number;
    newsCount: number;
    sources: number;
    tier: string;
  }[];
}

/** GET /multi-source — 信号源管理 + 多源共识分层 */
export function getMultiSource(): Promise<MultiSourceData> {
  return withFallback("/multi-source", MOCK_MULTI_SOURCE);
}

export interface WinRateGroup {
  group: string;
  n: number;
  winRate: number | null;
  avgExcess: number | null;
}
export interface PerformanceData {
  stats: StatCardData[];
  overall: { n: number; winRate: number | null; avgExcess: number | null };
  byView: WinRateGroup[];
  byChain: WinRateGroup[];
  note: string;
}

/** GET /performance — 战绩：胜率回测 */
export function getPerformance(): Promise<PerformanceData> {
  return withFallback("/performance", MOCK_PERFORMANCE);
}

export interface SupplyChainTier {
  chain: string;
  tickers: number;
  companies: { ticker: string; company: string }[];
}
export interface SupplyChainData {
  stats: StatCardData[];
  tiers: SupplyChainTier[];
  events: unknown[];
  note: string;
}

/** GET /supply-chain — 供应链角色图谱(壳) */
export function getSupplyChain(): Promise<SupplyChainData> {
  return withFallback("/supply-chain", MOCK_SUPPLY_CHAIN);
}

/* ================================================================== */
/* MOCK DATA — delete this whole section to run fully against backend  */
/* ================================================================== */

const MOCK_MENTION_PERF: MentionPerformance = {
  stats: [
    { key: "pool", label: "股票池", value: 0, delta: "被提及标的", tone: "blue" },
    { key: "positive", label: "正收益标的", value: 0, delta: "提及后", tone: "green" },
    { key: "chains", label: "行业集群", value: 0, delta: "产业链", tone: "purple" },
    { key: "hot", label: "热点标的", value: 0, delta: "近7天", tone: "amber" },
  ],
  stocks: [],
  chains: [],
  hot: [],
};

const MOCK_INDUSTRY: IndustryData = {
  stats: [
    { key: "clusters", label: "产业链集群", value: 0, delta: "活跃", tone: "blue" },
    { key: "tickers", label: "覆盖标的", value: 0, delta: "全链条", tone: "purple" },
    { key: "mentions", label: "总提及", value: 0, delta: "累计", tone: "green" },
  ],
  clusters: [],
};

const MOCK_TIMELINE: StockTimeline = {
  ticker: "",
  prices: [],
  mentions: [],
  totalReturnSinceFirst: null,
};

const MOCK_MULTI_SOURCE: MultiSourceData = {
  stats: [
    { key: "covered", label: "覆盖股票", value: 0, delta: "多源", tone: "blue" },
    { key: "enabled", label: "启用源", value: 1, delta: "推文", tone: "green" },
    { key: "configured", label: "配置源", value: 2, delta: "推文+新闻", tone: "purple" },
  ],
  sources: [],
  consensus: [],
};

const MOCK_PERFORMANCE: PerformanceData = {
  stats: [
    { key: "covered", label: "覆盖样本", value: 0, delta: "已兑现(t5)", tone: "blue" },
    { key: "winrate", label: "总胜率", value: "—", delta: "方向兑现", tone: "green" },
    { key: "pending", label: "待兑现", value: 0, delta: "需≥5交易日", tone: "amber" },
  ],
  overall: { n: 0, winRate: null, avgExcess: null },
  byView: [],
  byChain: [],
  note: "样本随交易日累积。",
};

const MOCK_STOCK_REPORT: StockReport = {
  ticker: "", company: "", sector: "", updated: "",
  price: { current: null, changePct: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, marketCap: null, volume: null },
  targets: { low: null, mean: null, high: null, current: null, numAnalysts: null, recommendation: null },
  ratingZones: {},
  metrics: [],
  scores: { technical: { score: 0 }, fundamental: { score: 0 } },
  financials: [],
  performance: {},
  institutions: { pctInstitutions: null, topHolders: [] },
  news: [],
  kol: { mentions: 0, bullish: 0, bearish: 0 },
  aiView: { core: "", bull: [], risk: [], catalyst: [] },
};

const MOCK_SUPPLY_CHAIN: SupplyChainData = {
  stats: [
    { key: "nodes", label: "节点(公司)", value: 0, delta: "图谱覆盖", tone: "blue" },
    { key: "chains", label: "角色分层", value: 0, delta: "产业链", tone: "purple" },
    { key: "edges", label: "供应链边", value: 0, delta: "待构建", tone: "amber" },
  ],
  tiers: [],
  events: [],
  note: "供应链关系待后续构建。",
};

const MOCK_KOLS: Kol[] = [
  {
    id: "k1",
    handle: "@SemiAnalyst",
    name: "半导体观察",
    verified: true,
    hitRate: 71.2,
    followers: 184000,
  },
  {
    id: "k2",
    handle: "@AIChipsDaily",
    name: "AI芯片日报",
    verified: true,
    hitRate: 64.8,
    followers: 92000,
  },
  {
    id: "k3",
    handle: "@DCPowerWatch",
    name: "数据中心电力研究",
    verified: false,
    hitRate: 58.4,
    followers: 41000,
  },
  {
    id: "k4",
    handle: "@OpticalNet",
    name: "光模块前线",
    verified: true,
    hitRate: 69.0,
    followers: 73000,
  },
  {
    id: "k5",
    handle: "@CloudCapex",
    name: "云资本开支",
    verified: true,
    hitRate: 66.5,
    followers: 120000,
  },
];

const MOCK_OVERVIEW: OverviewData = {
  stats: [
    { key: "trackable", label: "可跟踪AI", value: 228, delta: "实时监控中", tone: "blue" },
    { key: "new7d", label: "7天新增", value: 36, delta: "+18.4%", tone: "green" },
    { key: "priced", label: "已匹配价格", value: 204, delta: "覆盖率 89.5%", tone: "purple" },
    { key: "changed", label: "观点变化", value: 47, delta: "近24h", tone: "amber" },
    { key: "removed", label: "剔除跟踪", value: 12, delta: "信号衰减", tone: "red" },
  ],
  categories: [
    { key: "chip", label: "芯片/算力", count: 64 },
    { key: "optical", label: "光模块/网络", count: 38 },
    { key: "infra", label: "AI基础设施", count: 52 },
    { key: "power", label: "数据中心电力", count: 29 },
    { key: "cloud", label: "云与软件", count: 45 },
  ],
  topReturns: [
    { ticker: "AXTI", chain: "芯片/算力", maxReturnPct: 707 },
    { ticker: "SNDK", chain: "AI基础设施", maxReturnPct: 621 },
    { ticker: "VRT", chain: "数据中心电力", maxReturnPct: 488 },
    { ticker: "CRDO", chain: "光模块/网络", maxReturnPct: 412 },
    { ticker: "NVDA", chain: "芯片/算力", maxReturnPct: 356 },
  ],
};

const MOCK_TWEETS: Tweet[] = [
  {
    id: "t1",
    kol: MOCK_KOLS[0],
    text: "英伟达 Blackwell 量产爬坡超预期，云厂商订单能见度延伸到明年下半年。HBM 仍是瓶颈，关注供应链上游。$NVDA $MU",
    createdAt: "2026-05-30T09:12:00Z",
    sentiment: "bullish",
    relatedStocks: [
      { ticker: "NVDA", name: "英伟达", changePct: 3.2 },
      { ticker: "MU", name: "美光", changePct: 5.1 },
    ],
    topics: ["GPU需求", "HBM", "数据中心"],
    engagement: { replies: 142, retweets: 318, likes: 1820, views: 56700 },
    aiSummary:
      "看多英伟达，核心在 Blackwell 产能释放与云厂商长订单；提示 HBM 供给约束为关键变量。",
    confidence: 92,
  },
  {
    id: "t2",
    kol: MOCK_KOLS[3],
    text: "800G 光模块需求在 Q3 持续紧张，CRDO 的 retimer 渗透率仍在提升。1.6T 升级节奏可能比市场预期更快。$CRDO $COHR",
    createdAt: "2026-05-30T08:40:00Z",
    sentiment: "bullish",
    relatedStocks: [
      { ticker: "CRDO", name: "Credo", changePct: 4.4 },
      { ticker: "COHR", name: "Coherent", changePct: 2.0 },
    ],
    topics: ["光模块", "1.6T", "网络"],
    engagement: { replies: 64, retweets: 121, likes: 880, views: 23400 },
    aiSummary: "看多光模块升级周期，1.6T 节奏与 retimer 渗透率为主要驱动。",
    confidence: 84,
  },
  {
    id: "t3",
    kol: MOCK_KOLS[2],
    text: "数据中心电力缺口被低估，电网互联排队时间拉长，VRT 这类热管理/配电环节定价权增强，但估值已不便宜。$VRT $ETN",
    createdAt: "2026-05-30T07:55:00Z",
    sentiment: "neutral",
    relatedStocks: [
      { ticker: "VRT", name: "Vertiv", changePct: -1.1 },
      { ticker: "ETN", name: "伊顿", changePct: 0.6 },
    ],
    topics: ["数据中心电力", "热管理"],
    engagement: { replies: 38, retweets: 77, likes: 412, views: 15900 },
    aiSummary: "中性偏多电力链，基本面强但估值偏高，提示回调风险。",
    confidence: 67,
  },
  {
    id: "t4",
    kol: MOCK_KOLS[4],
    text: "超大厂资本开支指引上修空间有限，部分项目延期。短期对算力链情绪偏谨慎，注意预期差。$MSFT $GOOGL",
    createdAt: "2026-05-30T06:30:00Z",
    sentiment: "bearish",
    relatedStocks: [
      { ticker: "MSFT", name: "微软", changePct: -0.8 },
      { ticker: "GOOGL", name: "谷歌", changePct: -1.4 },
    ],
    topics: ["云资本开支", "预期差"],
    engagement: { replies: 211, retweets: 402, likes: 2310, views: 88200 },
    aiSummary: "看空短期算力链情绪，认为资本开支上修空间有限、存在预期差。",
    confidence: 73,
  },
];

const MOCK_TWEETS_RESPONSE: TweetsResponse = {
  stats: [
    { key: "today", label: "今日新增推文", value: "1,286", delta: "+12.4%", tone: "blue" },
    { key: "kols", label: "覆盖KOL", value: 328, delta: "活跃账号", tone: "purple" },
    { key: "highconf", label: "高置信观点", value: 342, delta: "≥85%", tone: "green" },
    { key: "alerts", label: "触发预警", value: 18, delta: "近24h", tone: "amber" },
    { key: "engage", label: "平均互动量", value: "5,762", delta: "每条", tone: "red" },
  ],
  trend: [
    { date: "周一", count: 980 },
    { date: "周二", count: 1120 },
    { date: "周三", count: 1040 },
    { date: "周四", count: 1260 },
    { date: "周五", count: 1180 },
    { date: "周六", count: 1320 },
    { date: "今日", count: 1286 },
  ],
  sentimentDist: [
    { name: "看多", value: 46, sentiment: "bullish" },
    { name: "中性", value: 28, sentiment: "neutral" },
    { name: "看空", value: 20, sentiment: "bearish" },
    { name: "不确定", value: 6, sentiment: "uncertain" },
  ],
  tweets: MOCK_TWEETS,
};

const MOCK_TWEET_DETAIL: TweetDetail = {
  ...MOCK_TWEETS[0],
  keyPoints: [
    "Blackwell 产能爬坡超预期",
    "云厂商订单能见度延伸至明年下半年",
    "HBM 供给为核心瓶颈",
    "上游存储链有望受益",
  ],
  stockBreakdown: [
    { ticker: "NVDA", name: "英伟达", strength: 92, targetPrice: "$1,450", change24h: 3.2 },
    { ticker: "MU", name: "美光", strength: 78, targetPrice: "$180", change24h: 5.1 },
  ],
  historicalHitRate: 68.3,
  returnTracking: [
    { day: "T+1", returnPct: 1.8 },
    { day: "T+2", returnPct: 2.6 },
    { day: "T+3", returnPct: 2.1 },
    { day: "T+4", returnPct: 3.4 },
    { day: "T+5", returnPct: 4.7 },
  ],
};

const MOCK_STOCKS: Stock[] = [
  { id: "s1", ticker: "NVDA", company: "英伟达", chain: "芯片/算力", heat: 98, sentiment: "bullish", mentions30d: 412, return5d: 6.8, riskLevel: "medium" },
  { id: "s2", ticker: "MU", company: "美光", chain: "AI基础设施", heat: 91, sentiment: "bullish", mentions30d: 288, return5d: 5.2, riskLevel: "medium" },
  { id: "s3", ticker: "CRDO", company: "Credo", chain: "光模块/网络", heat: 87, sentiment: "bullish", mentions30d: 196, return5d: 4.4, riskLevel: "high" },
  { id: "s4", ticker: "VRT", company: "Vertiv", chain: "数据中心电力", heat: 83, sentiment: "neutral", mentions30d: 174, return5d: -1.1, riskLevel: "high" },
  { id: "s5", ticker: "AVGO", company: "博通", chain: "芯片/算力", heat: 80, sentiment: "bullish", mentions30d: 221, return5d: 3.6, riskLevel: "low" },
  { id: "s6", ticker: "MSFT", company: "微软", chain: "云与软件", heat: 76, sentiment: "neutral", mentions30d: 305, return5d: -0.8, riskLevel: "low" },
  { id: "s7", ticker: "COHR", company: "Coherent", chain: "光模块/网络", heat: 72, sentiment: "bullish", mentions30d: 132, return5d: 2.0, riskLevel: "medium" },
  { id: "s8", ticker: "ETN", company: "伊顿", chain: "数据中心电力", heat: 69, sentiment: "neutral", mentions30d: 118, return5d: 0.6, riskLevel: "low" },
  { id: "s9", ticker: "SNDK", company: "闪迪", chain: "AI基础设施", heat: 66, sentiment: "bullish", mentions30d: 99, return5d: 7.3, riskLevel: "high" },
  { id: "s10", ticker: "GOOGL", company: "谷歌", chain: "云与软件", heat: 63, sentiment: "bearish", mentions30d: 277, return5d: -1.4, riskLevel: "low" },
];

const MOCK_STOCK_LIST: StockListResult = {
  stats: [
    { key: "trackable", label: "可跟踪股票", value: "2,328", delta: "全市场", tone: "blue" },
    { key: "rising", label: "今日热度上升", value: 142, delta: "+热度", tone: "red" },
    { key: "consensus", label: "高共识股票", value: 86, delta: "观点一致", tone: "green" },
    { key: "recognized", label: "高识别股票", value: 64, delta: "AI识别", tone: "purple" },
    { key: "graded", label: "观点分级股票", value: 312, delta: "已分级", tone: "amber" },
  ],
  total: 2328,
  page: 1,
  pageSize: 10,
  items: MOCK_STOCKS,
};

const MOCK_STOCK_DETAIL: StockDetail = {
  ticker: "NVDA",
  company: "英伟达",
  heat: 98,
  mentions30d: 412,
  return5d: 6.8,
  sentiment: "bullish",
  sentimentLabel: "极度看多",
  riskLevel: "medium",
  heatTrend: [
    { date: "05-01", heat: 72 },
    { date: "05-08", heat: 78 },
    { date: "05-15", heat: 85 },
    { date: "05-22", heat: 91 },
    { date: "05-29", heat: 98 },
  ],
  kolCoverage: [
    { name: "芯片研究", value: 38 },
    { name: "云资本开支", value: 26 },
    { name: "宏观策略", value: 18 },
    { name: "其他", value: 18 },
  ],
  opinionStructure: [
    { name: "看多", value: 64 },
    { name: "中性", value: 22 },
    { name: "看空", value: 14 },
  ],
  returnDistribution: [
    { bucket: "<-5%", count: 8 },
    { bucket: "-5~0%", count: 22 },
    { bucket: "0~5%", count: 64 },
    { bucket: "5~10%", count: 48 },
    { bucket: ">10%", count: 26 },
  ],
  topKols: MOCK_KOLS.slice(0, 4),
  representativeTweets: MOCK_TWEETS.slice(0, 2),
  aiLogic: {
    consensus:
      "市场对英伟达在 AI 训练与推理算力的领先地位高度一致，Blackwell 周期被视为新一轮增长引擎。",
    drivers: [
      "Blackwell 量产爬坡与云厂商长订单",
      "推理需求快速放量",
      "软件生态 (CUDA) 护城河",
    ],
    risks: ["HBM 供给约束", "客户自研芯片替代", "估值处于历史高位"],
  },
};

const MOCK_AI_REPORT: AIReport = {
  stats: [
    { key: "summaries", label: "今日AI摘要", value: 228, delta: "已生成", tone: "blue" },
    { key: "clusters", label: "新观点聚类", value: 12, delta: "今日", tone: "purple" },
    { key: "signals", label: "高置信信号", value: 36, delta: "≥85%", tone: "green" },
    { key: "review", label: "需人工复核", value: 8, delta: "待处理", tone: "amber" },
    { key: "alerts", label: "预警建议", value: 5, delta: "建议关注", tone: "red" },
  ],
  highlights: [
    "算力链情绪整体偏多，但云资本开支出现首次分歧信号",
    "光模块 1.6T 升级讨论度环比上升 34%",
    "数据中心电力成为新的拥挤交易，注意估值",
  ],
  bullishLogic: [
    { text: "Blackwell 产能释放，订单能见度延伸至明年", confidence: 90 },
    { text: "推理需求放量带动整链 ASP 提升", confidence: 82 },
    { text: "HBM 供不应求，存储链受益", confidence: 78 },
  ],
  bearishLogic: [
    { text: "超大厂资本开支上修空间有限", confidence: 71 },
    { text: "部分数据中心项目延期", confidence: 64 },
  ],
  divergences: [
    "云资本开支：乐观派看长订单 vs 谨慎派看项目延期",
    "电力链：基本面强但估值分歧明显",
  ],
  tradeIdeas: [
    { text: "关注 HBM 供应链上游存储标的", confidence: 76 },
    { text: "光模块 1.6T 升级受益标的逢回调布局", confidence: 70 },
  ],
  clusters: [
    { id: "c1", title: "GPU需求", confidence: 91, relatedStocks: ["NVDA", "AVGO"], kols: MOCK_KOLS.slice(0, 3), heatSpark: [12, 18, 22, 28, 35, 41, 52] },
    { id: "c2", title: "HBM", confidence: 84, relatedStocks: ["MU", "SNDK"], kols: MOCK_KOLS.slice(1, 4), heatSpark: [8, 10, 16, 20, 24, 31, 38] },
    { id: "c3", title: "数据中心电力", confidence: 79, relatedStocks: ["VRT", "ETN"], kols: MOCK_KOLS.slice(2, 5), heatSpark: [6, 9, 11, 18, 22, 26, 33] },
    { id: "c4", title: "光模块", confidence: 86, relatedStocks: ["CRDO", "COHR"], kols: MOCK_KOLS.slice(0, 2), heatSpark: [10, 14, 19, 21, 27, 30, 40] },
    { id: "c5", title: "云资本开支", confidence: 68, relatedStocks: ["MSFT", "GOOGL"], kols: MOCK_KOLS.slice(3, 5), heatSpark: [20, 18, 22, 19, 16, 14, 12] },
  ],
  signalTrend: [
    { date: "05-24", bullish: 60, bearish: 22 },
    { date: "05-25", bullish: 64, bearish: 20 },
    { date: "05-26", bullish: 58, bearish: 26 },
    { date: "05-27", bullish: 66, bearish: 24 },
    { date: "05-28", bullish: 70, bearish: 21 },
    { date: "05-29", bullish: 68, bearish: 25 },
    { date: "05-30", bullish: 72, bearish: 23 },
  ],
  topicEmergence: [
    { topic: "1.6T", value: 34 },
    { topic: "HBM4", value: 28 },
    { topic: "推理算力", value: 41 },
    { topic: "液冷", value: 22 },
    { topic: "电网互联", value: 18 },
  ],
};

const MOCK_WATCHLIST: WatchlistData = {
  stats: [
    { key: "kols", label: "关注KOL", value: 12, delta: "已关注", tone: "blue" },
    { key: "stocks", label: "关注股票", value: 28, delta: "资产池", tone: "purple" },
    { key: "themes", label: "自定义主题", value: 7, delta: "主题追踪", tone: "green" },
    { key: "alerts", label: "已开启预警", value: 18, delta: "规则", tone: "amber" },
    { key: "updates", label: "今日更新", value: 156, delta: "条动态", tone: "red" },
  ],
  kols: MOCK_KOLS,
  stocks: [
    { ticker: "NVDA", chain: "芯片/算力", lastMention: "12分钟前", sentimentChange: "bullish", priceChangePct: 3.2, aiHint: "情绪持续走强", alertStatus: "active" },
    { ticker: "CRDO", chain: "光模块/网络", lastMention: "1小时前", sentimentChange: "bullish", priceChangePct: 4.4, aiHint: "1.6T 升级催化", alertStatus: "active" },
    { ticker: "VRT", chain: "数据中心电力", lastMention: "3小时前", sentimentChange: "neutral", priceChangePct: -1.1, aiHint: "估值偏高，注意回调", alertStatus: "muted" },
    { ticker: "MSFT", chain: "云与软件", lastMention: "5小时前", sentimentChange: "bearish", priceChangePct: -0.8, aiHint: "资本开支预期差", alertStatus: "active" },
  ],
  rules: [
    { id: "r1", title: "NVDA 情绪转向预警", description: "当 NVDA 的整体情绪从看多转为中性/看空时提醒", enabled: true },
    { id: "r2", title: "高置信看空信号", description: "任意关注股票出现 ≥85% 置信度看空观点", enabled: true },
    { id: "r3", title: "光模块主题异动", description: "光模块主题讨论热度单日上升 >30%", enabled: true },
    { id: "r4", title: "价格-情绪背离", description: "价格下跌但情绪转多 / 价格上涨但情绪转空", enabled: false },
  ],
  channels: [
    { name: "站内通知", enabled: true },
    { name: "邮件", enabled: true },
    { name: "微信", enabled: false },
    { name: "Webhook", enabled: false },
  ],
  feed: [
    { id: "f1", time: "12分钟前", text: "半导体观察 发布看多 NVDA 的高置信观点（92%）", kind: "mention" },
    { id: "f2", time: "1小时前", text: "预警触发：CRDO 光模块主题热度上升 38%", kind: "alert" },
    { id: "f3", time: "2小时前", text: "VRT 情绪由看多转为中性", kind: "update" },
    { id: "f4", time: "4小时前", text: "云资本开支 出现首次看空分歧信号", kind: "update" },
  ],
};
