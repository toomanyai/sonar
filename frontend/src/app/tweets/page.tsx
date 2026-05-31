"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Target, TrendingUp } from "lucide-react";
import {
  getTweets,
  getTweetDetail,
  getTweetDeepRead,
  type Tweet,
  type TweetsResponse,
  type TweetDetail,
  type DeepRead,
  type Sentiment,
} from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import {
  Card,
  CardHeader,
  PageTitle,
  SearchBox,
  Tag,
  LoadingState,
  EmptyState,
} from "@/components/Primitives";
import TweetCard from "@/components/TweetCard";
import { LineTrend, Donut, MultiLine } from "@/components/Charts";
import { cn, SENTIMENT_META, pctColor, fmtPct, SENTIMENT_COLORS } from "@/lib/ui";

const SENT_FILTERS: { key: Sentiment | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "bullish", label: "看多" },
  { key: "neutral", label: "中性" },
  { key: "bearish", label: "看空" },
  { key: "uncertain", label: "不确定" },
];

// 投研价值过滤（relevance 0-100；null 视为 50 不隐藏）
const REL_FILTERS: { key: string; label: string; min: number }[] = [
  { key: "all", label: "全部", min: 0 },
  { key: "rel", label: "仅投研相关", min: 40 },
  { key: "high", label: "高价值", min: 70 },
];

// 排序维度（互动也是质量信号）
const SORT_OPTIONS: { key: string; label: string; score: (t: Tweet) => number }[] = [
  { key: "latest", label: "最新", score: (t) => new Date(t.createdAt).getTime() || 0 },
  { key: "views", label: "高观看", score: (t) => t.engagement.views },
  {
    key: "engagement",
    label: "高互动",
    score: (t) => t.engagement.replies + t.engagement.retweets + t.engagement.likes,
  },
  { key: "likes", label: "高点赞", score: (t) => t.engagement.likes },
];

export default function TweetsPage() {
  const [data, setData] = useState<TweetsResponse | null>(null);
  const [detail, setDetail] = useState<TweetDetail | null>(null);
  const [deep, setDeep] = useState<DeepRead | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sent, setSent] = useState<Sentiment | "all">("all");
  const [relKey, setRelKey] = useState("all");
  const [sortKey, setSortKey] = useState("latest");
  const [q, setQ] = useState("");

  useEffect(() => {
    getTweets().then((res) => {
      setData(res);
      if (res.tweets[0]) setSelectedId(res.tweets[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    getTweetDetail(selectedId).then(setDetail);
    setDeep(null);
    setDeepLoading(true);
    let cancelled = false;
    getTweetDeepRead(selectedId)
      .then((d) => {
        if (!cancelled) setDeep(d);
      })
      .finally(() => {
        if (!cancelled) setDeepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const minRel = REL_FILTERS.find((r) => r.key === relKey)?.min ?? 0;
  const filtered = useMemo(() => {
    if (!data) return [];
    const scorer = SORT_OPTIONS.find((s) => s.key === sortKey) ?? SORT_OPTIONS[0];
    return data.tweets
      .filter((t) => {
        if (sent !== "all" && t.sentiment !== sent) return false;
        if (minRel > 0 && (t.relevance ?? 50) < minRel) return false;
        if (q && !t.text.includes(q) && !t.kol.name.includes(q)) return false;
        return true;
      })
      .sort((a, b) => scorer.score(b) - scorer.score(a));
  }, [data, sent, minRel, sortKey, q]);

  if (!data) return <LoadingState />;

  const sentDonut = data.sentimentDist.map((d) => ({
    name: d.name,
    value: d.value,
  }));
  const sentColors = data.sentimentDist.map((d) => SENTIMENT_COLORS[d.sentiment]);

  return (
    <div className="space-y-6">
      <PageTitle title="推文监控" subtitle="实时聚合 KOL 推文、AI 观点提炼与关联个股表现" />

      {/* Stats + charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StatCardRow stats={data.stats} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-3">
            <p className="mb-1 text-[12px] font-medium text-slate-500">推文趋势</p>
            <LineTrend data={data.trend} xKey="date" yKey="count" height={120} />
          </Card>
          <Card className="p-3">
            <p className="mb-1 text-[12px] font-medium text-slate-500">
              情绪/观点分布
            </p>
            <Donut data={sentDonut} colors={sentColors} height={120} />
          </Card>
        </div>
      </div>

      {/* Filter row */}
      <Card className="p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchBox
            placeholder="搜索推文内容 / KOL…"
            value={q}
            onChange={setQ}
            className="lg:max-w-xs"
          />
          <div className="flex flex-wrap gap-2">
            {SENT_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setSent(f.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  sent === f.key
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* 投研价值过滤：滤掉闲聊/玩笑 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-slate-400">价值</span>
            {REL_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setRelKey(f.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  relKey === f.key
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* 排序：互动也是质量信号 */}
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <span className="text-[12px] text-slate-400">排序</span>
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSortKey(s.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  sortKey === s.key
                    ? "bg-amber-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Main split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: tweet list */}
        <div className="space-y-3 lg:col-span-3">
          {filtered.length === 0 ? (
            <Card>
              <EmptyState message="没有符合条件的推文" />
            </Card>
          ) : (
            filtered.map((t) => (
              <TweetCard
                key={t.id}
                tweet={t}
                active={t.id === selectedId}
                onClick={() => setSelectedId(t.id)}
              />
            ))
          )}
        </div>

        {/* Right: detail panel */}
        <div className="lg:col-span-2">
          <Card className="sticky top-20">
            <CardHeader title="推文详情" subtitle="AI 提炼与关联个股表现" />
            {!detail ? (
              <EmptyState message="选择一条推文查看详情" />
            ) : (
              <div className="space-y-5 p-5">
                {/* 中文翻译（原文非中文时） */}
                {deep?.translation && deep.lang !== "zh" && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-1 text-[12px] font-semibold text-slate-500">
                      中文翻译
                    </p>
                    <p className="text-[13px] leading-relaxed text-slate-600">
                      {deep.translation}
                    </p>
                  </div>
                )}

                {/* AI 解读：这位KOL在说什么 */}
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <p className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-blue-700">
                    <Sparkles className="h-3.5 w-3.5" /> AI 解读 · 这位 KOL 在说什么
                  </p>
                  {deepLoading ? (
                    <p className="text-[13px] text-slate-400">AI 深读中…</p>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-slate-600">
                      {deep?.interpretation || detail.aiSummary || "—"}
                    </p>
                  )}
                </div>

                {/* 事实 / 观点 / 建议 */}
                {!deepLoading &&
                  ([
                    { label: "事实", items: deep?.facts ?? [], dot: "bg-blue-500" },
                    { label: "观点", items: deep?.opinions ?? [], dot: "bg-amber-500" },
                    { label: "建议", items: deep?.suggestions ?? [], dot: "bg-emerald-500" },
                  ] as const).map(
                    (sec) =>
                      sec.items.length > 0 && (
                        <div key={sec.label}>
                          <p className="mb-1.5 text-[13px] font-semibold text-slate-700">
                            {sec.label}
                          </p>
                          <ul className="space-y-1.5">
                            {sec.items.map((p, i) => (
                              <li key={i} className="flex items-start gap-2 text-[13px] text-slate-600">
                                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", sec.dot)} />
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                  )}

                {/* 可靠性评估 */}
                {!deepLoading && (deep?.reliability?.length ?? 0) > 0 && (
                  <div>
                    <p className="mb-1.5 text-[13px] font-semibold text-slate-700">
                      可靠性评估
                    </p>
                    <div className="space-y-2">
                      {deep!.reliability.map((r, i) => (
                        <div key={i} className="rounded-lg border border-slate-100 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[13px] text-slate-700">{r.point}</span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                                r.level === "可能靠谱"
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                  : r.level === "存疑"
                                  ? "bg-amber-50 text-amber-700 ring-amber-200"
                                  : "bg-slate-100 text-slate-500 ring-slate-200"
                              )}
                            >
                              {r.level}
                            </span>
                          </div>
                          {r.reason && (
                            <p className="mt-1 text-[12px] text-slate-400">{r.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 关联股票 table */}
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-slate-700">
                    关联股票
                  </p>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-slate-50 text-[11px] text-slate-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">代码/名称</th>
                          <th className="px-3 py-2 font-medium">观点强度</th>
                          <th className="px-3 py-2 font-medium">目标</th>
                          <th className="px-3 py-2 text-right font-medium">24h</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.stockBreakdown.map((s) => (
                          <tr key={s.ticker} className="border-t border-slate-100">
                            <td className="px-3 py-2">
                              <div className="font-semibold text-slate-800">
                                {s.ticker}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {s.name}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 text-slate-600">
                                <Target className="h-3.5 w-3.5 text-blue-500" />
                                {s.strength}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {s.targetPrice ?? "—"}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2 text-right font-medium",
                                pctColor(s.change24h)
                              )}
                            >
                              {fmtPct(s.change24h)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 历史命中率 */}
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-[13px] text-slate-500">
                    历史命中率（近90天）
                  </span>
                  <span className="text-xl font-bold text-blue-600">
                    {detail.historicalHitRate}%
                  </span>
                </div>

                {/* 后续收益跟踪 */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    后续收益跟踪
                    <span className="ml-1 font-normal text-slate-400">
                      ({detail.stockBreakdown[0]?.ticker})
                    </span>
                  </p>
                  <MultiLine
                    data={detail.returnTracking}
                    xKey="day"
                    series={[
                      { key: "returnPct", color: "#10b981", label: "收益%" },
                    ]}
                    height={160}
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[12px] text-slate-400">观点：</span>
                  <Tag className={SENTIMENT_META[detail.sentiment].chip}>
                    {SENTIMENT_META[detail.sentiment].label}
                  </Tag>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
