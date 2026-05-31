"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMultiSource, type MultiSourceData } from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import {
  Card,
  CardHeader,
  PageTitle,
  LoadingState,
  EmptyState,
} from "@/components/Primitives";
import { cn } from "@/lib/ui";

export default function MultiSourcePage() {
  const [data, setData] = useState<MultiSourceData | null>(null);

  useEffect(() => {
    getMultiSource().then(setData);
  }, []);

  if (!data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageTitle
        title="多源"
        subtitle="按多源共识为股票分层；enabled 的信号源进入共识计算"
      />
      <StatCardRow stats={data.stats} />

      {/* 信号源管理 */}
      <Card>
        <CardHeader
          title="信号源管理"
          subtitle="已配置的外部观察源；当前仅推文主源启用，其它为控成本暂未抓取"
        />
        {data.sources.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.sources.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-slate-800">
                      {s.name}
                    </span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      {s.type}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-slate-400">
                    {s.note}
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset",
                    s.enabled
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-slate-100 text-slate-500 ring-slate-200"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      s.enabled ? "bg-emerald-500" : "bg-slate-400"
                    )}
                  />
                  {s.enabled ? "启用中" : "未启用"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 多源共识 */}
      <Card>
        <CardHeader
          title="多源共识"
          subtitle="按覆盖该标的的信号源数量分层"
        />
        {data.consensus.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">代码</th>
                  <th className="px-4 py-2.5 font-medium">公司</th>
                  <th className="px-4 py-2.5 text-right font-medium">推文数</th>
                  <th className="px-4 py-2.5 text-right font-medium">新闻数</th>
                  <th className="px-4 py-2.5 text-right font-medium">信号源</th>
                  <th className="px-4 py-2.5 text-right font-medium">分层</th>
                </tr>
              </thead>
              <tbody>
                {data.consensus.map((c) => {
                  const multi = c.sources > 1;
                  return (
                    <tr
                      key={c.ticker}
                      className="border-t border-slate-100 hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3 font-semibold text-blue-700">
                        <Link href={`/stocks/${c.ticker}`}>{c.ticker}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.company}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {c.tweetCount}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {c.newsCount}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {c.sources}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                            multi
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-slate-100 text-slate-500 ring-slate-200"
                          )}
                        >
                          {multi ? "多源共识" : "单源"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
