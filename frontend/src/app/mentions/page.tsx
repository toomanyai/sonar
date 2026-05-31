"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getMentionPerformance,
  type MentionPerformance,
} from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import {
  Card,
  CardHeader,
  PageTitle,
  Tag,
  LoadingState,
  EmptyState,
} from "@/components/Primitives";
import { cn, pctColor, fmtPct } from "@/lib/ui";

export default function PerformancePage() {
  const [data, setData] = useState<MentionPerformance | null>(null);

  useEffect(() => {
    getMentionPerformance().then(setData);
  }, []);

  if (!data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageTitle
        title="提及表现"
        subtitle="KOL 首次提及后的股票表现、行业压力与热点轮动"
      />
      <StatCardRow stats={data.stats} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 首次提及后表现 */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="首次提及后表现"
            subtitle="点击代码查看提及×价格时间线"
          />
          {data.stocks.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-[13px]">
                <thead className="bg-slate-50 text-[11px] text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">代码</th>
                    <th className="px-4 py-2.5 font-medium">公司</th>
                    <th className="px-4 py-2.5 font-medium">链条</th>
                    <th className="px-4 py-2.5 font-medium">首次提及</th>
                    <th className="px-4 py-2.5 text-right font-medium">提及数</th>
                    <th className="px-4 py-2.5 text-right font-medium">最大收益率</th>
                    <th className="px-4 py-2.5 text-right font-medium">5日均收益</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stocks.map((s) => (
                    <tr key={s.ticker} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-semibold text-blue-700">
                        <Link href={`/stocks/${s.ticker}`}>{s.ticker}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.company}</td>
                      <td className="px-4 py-3"><Tag>{s.chain}</Tag></td>
                      <td className="px-4 py-3 text-slate-500">{s.firstMention || "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{s.mentions}</td>
                      <td className={cn("px-4 py-3 text-right font-medium", pctColor(s.maxReturn))}>
                        {fmtPct(s.maxReturn)}
                      </td>
                      <td className={cn("px-4 py-3 text-right", pctColor(s.avgReturn5d))}>
                        {fmtPct(s.avgReturn5d)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 热点标的 */}
        <Card>
          <CardHeader title="热点标的" subtitle="近7天提及" />
          {data.hot.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.hot.map((h, i) => (
                <Link
                  key={h.ticker}
                  href={`/stocks/${h.ticker}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <span className="w-5 text-[12px] font-semibold text-slate-300">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-slate-800">{h.ticker}</div>
                    <div className="truncate text-[11px] text-slate-400">{h.company}</div>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-600">
                    {h.recent} 次
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 行业压力 */}
      <Card>
        <CardHeader title="行业压力" subtitle="各产业链提及量与多空结构" />
        {data.chains.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.chains.map((ch) => {
              const tot = ch.bullish + ch.bearish || 1;
              const bullPct = Math.round((ch.bullish / tot) * 100);
              return (
                <div key={ch.chain} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-medium text-slate-800">{ch.chain}</span>
                    <span className="text-[12px] text-slate-400">{ch.mentions} 提及</span>
                  </div>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-emerald-400" style={{ width: `${bullPct}%` }} />
                    <div className="bg-red-400" style={{ width: `${100 - bullPct}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                    <span className="text-emerald-600">看多 {ch.bullish}</span>
                    <span className={pctColor(ch.avgReturn5d)}>均 {fmtPct(ch.avgReturn5d)}</span>
                    <span className="text-red-500">看空 {ch.bearish}</span>
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
