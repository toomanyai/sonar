"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getIndustry, type IndustryData } from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import {
  Card,
  PageTitle,
  LoadingState,
  EmptyState,
} from "@/components/Primitives";
import { cn, pctColor, fmtPct, SENTIMENT_META } from "@/lib/ui";

export default function IndustryPage() {
  const [data, setData] = useState<IndustryData | null>(null);

  useEffect(() => {
    getIndustry().then(setData);
  }, []);

  if (!data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageTitle title="行业" subtitle="AI 产业链集群：提及热度、多空结构与头部标的" />
      <StatCardRow stats={data.stats} />

      {data.clusters.length === 0 ? (
        <Card>
          <EmptyState />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {data.clusters.map((ch) => {
            const meta = SENTIMENT_META[ch.sentiment];
            const tot = ch.bullish + ch.bearish + ch.neutral || 1;
            return (
              <Card key={ch.chain}>
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <div className="text-[15px] font-semibold text-slate-900">{ch.chain}</div>
                    <div className="mt-0.5 text-[12px] text-slate-400">
                      {ch.tickers} 标的 · {ch.kols} KOL · {ch.mentions} 提及
                    </div>
                  </div>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset", meta.chip)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                </div>

                <div className="px-5 py-4">
                  {/* 多空结构条 */}
                  <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-emerald-400" style={{ width: `${(ch.bullish / tot) * 100}%` }} />
                    <div className="bg-slate-300" style={{ width: `${(ch.neutral / tot) * 100}%` }} />
                    <div className="bg-red-400" style={{ width: `${(ch.bearish / tot) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[11px]">
                    <span className="text-emerald-600">看多 {ch.bullish}</span>
                    <span className="text-slate-400">中性 {ch.neutral}</span>
                    <span className="text-red-500">看空 {ch.bearish}</span>
                    <span className={pctColor(ch.avgReturn5d)}>5日均 {fmtPct(ch.avgReturn5d)}</span>
                  </div>

                  {/* 头部标的 */}
                  <div className="mt-4">
                    <div className="mb-2 text-[11px] text-slate-400">头部标的</div>
                    <div className="flex flex-wrap gap-2">
                      {ch.topTickers.map((tk) => (
                        <Link
                          key={tk.ticker}
                          href={`/stocks/${tk.ticker}`}
                          title={tk.company}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                        >
                          {tk.ticker}
                          <span className="ml-1 text-slate-400">{tk.n}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
