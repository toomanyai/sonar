"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ZAxis,
} from "recharts";
import {
  getStockTimeline,
  getStockDetail,
  type StockTimeline,
  type StockDetail,
} from "@/lib/api";
import {
  Card,
  CardHeader,
  PageTitle,
  Tag,
  LoadingState,
  EmptyState,
} from "@/components/Primitives";
import { cn, pctColor, fmtPct, SENTIMENT_META, MARKET_TIER_META } from "@/lib/ui";

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker || "").toUpperCase();
  const [tl, setTl] = useState<StockTimeline | null>(null);
  const [detail, setDetail] = useState<StockDetail | null>(null);

  useEffect(() => {
    if (!ticker) return;
    getStockTimeline(ticker).then(setTl);
    getStockDetail(ticker).then(setDetail);
  }, [ticker]);

  if (!tl) return <LoadingState />;

  // Merge mentions onto the price curve by snapped priceDate.
  const byDate: Record<string, number> = {};
  tl.mentions.forEach((m) => {
    if (m.priceDate && m.priceAtMention != null) byDate[m.priceDate] = m.priceAtMention;
  });
  const chartData = tl.prices.map((p) => ({
    date: p.date,
    close: p.close,
    mention: byDate[p.date] ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/stocks" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageTitle
          title={`${ticker}${detail?.company && detail.company !== ticker ? "  " + detail.company : ""}`}
          subtitle="提及 × 价格时间线：首次与后续每次提及对应的价格走势"
        />
        {detail?.marketPosition && (
          <span
            className={cn(
              "ml-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset",
              MARKET_TIER_META[detail.marketPosition.tier] ?? MARKET_TIER_META["大盘"]
            )}
            title={detail.marketPosition.label}
          >
            {detail.marketPosition.tier}
            {detail.marketPosition.label !== "非指数标的" && (
              <span className="font-normal opacity-70">· {detail.marketPosition.label}</span>
            )}
          </span>
        )}
        <Link
          href={`/stocks/${ticker}/report`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-blue-700"
        >
          <FileText className="h-4 w-4" />
          生成个股研报
        </Link>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="提及次数" value={String(tl.mentions.length)} />
        <Metric label="首次提及" value={tl.firstMentionDate || "—"} />
        <Metric
          label="自首次提及收益"
          value={tl.totalReturnSinceFirst != null ? fmtPct(tl.totalReturnSinceFirst) : "—"}
          tone={tl.totalReturnSinceFirst}
        />
        <Metric
          label="提及后5日均收益"
          value={detail ? fmtPct(detail.return5d) : "—"}
          tone={detail?.return5d}
        />
      </div>

      {/* Mention × price chart */}
      <Card>
        <CardHeader title="收盘价走势 + 提及标记" subtitle="圆点 = KOL 提及（颜色按观点）" />
        <div className="p-5">
          {chartData.length === 0 ? (
            <EmptyState message="暂无价格序列（标的可能过新或非美股）" />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
                <ZAxis range={[60, 60]} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Line type="monotone" dataKey="close" stroke="#2563eb" strokeWidth={2} dot={false} name="收盘价" />
                <Scatter dataKey="mention" fill="#f59e0b" name="提及" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Mention timeline list */}
      <Card>
        <CardHeader title="提及时间线" subtitle={`${tl.mentions.length} 次提及`} />
        {tl.mentions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-slate-100">
            {tl.mentions.map((m, i) => {
              const meta = SENTIMENT_META[m.view];
              return (
                <div key={m.tweetId} className="flex items-start gap-4 px-5 py-4">
                  <div className="flex flex-col items-center">
                    <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} />
                    {i < tl.mentions.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-slate-200" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-800">{m.name}</span>
                      <span className="text-[11px] text-slate-400">{m.handle}</span>
                      <span className="text-[11px] text-slate-400">· {m.date}</span>
                      {i === 0 && <Tag>首次提及</Tag>}
                      <span className={cn("text-[12px] font-medium", meta.text)}>{meta.label}</span>
                      {m.action && m.action !== "watch" && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">
                          {ACTION_ZH[m.action] ?? m.action}
                        </span>
                      )}
                    </div>
                    {m.summary && <p className="mt-1 text-[13px] text-slate-600">{m.summary}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-slate-400">
                      {m.priceAtMention != null && <span>提及时价 ${m.priceAtMention}</span>}
                      {m.targetPrice != null && <span>目标价 ${m.targetPrice}</span>}
                      {m.returnSince != null && (
                        <span className={pctColor(m.returnSince)}>至今 {fmtPct(m.returnSince)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

const ACTION_ZH: Record<string, string> = {
  buy: "建仓", add: "加仓", hold: "持有", trim: "减仓", sell: "卖出", avoid: "回避",
};

function Metric({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={cn("mt-1 text-[18px] font-semibold", tone != null ? pctColor(tone) : "text-slate-900")}>
        {value}
      </div>
    </div>
  );
}
