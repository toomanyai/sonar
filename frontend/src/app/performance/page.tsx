"use client";

import { useEffect, useState } from "react";
import { getPerformance, type PerformanceData, type WinRateGroup } from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import {
  Card,
  CardHeader,
  PageTitle,
  LoadingState,
  EmptyState,
} from "@/components/Primitives";
import { cn, pctColor, fmtPct } from "@/lib/ui";

function fmtRate(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}

function GroupTable({
  groups,
  groupLabel,
}: {
  groups: WinRateGroup[];
  groupLabel: string;
}) {
  if (groups.length === 0) return <EmptyState />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-[13px]">
        <thead className="bg-slate-50 text-[11px] text-slate-400">
          <tr>
            <th className="px-4 py-2.5 font-medium">{groupLabel}</th>
            <th className="px-4 py-2.5 text-right font-medium">样本 n</th>
            <th className="px-4 py-2.5 text-right font-medium">胜率</th>
            <th className="px-4 py-2.5 text-right font-medium">均值超额</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr
              key={g.group}
              className="border-t border-slate-100 hover:bg-slate-50/60"
            >
              <td className="px-4 py-3 font-medium text-slate-700">{g.group}</td>
              <td className="px-4 py-3 text-right text-slate-500">{g.n}</td>
              <td className="px-4 py-3 text-right font-medium text-slate-700">
                {fmtRate(g.winRate)}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right",
                  g.avgExcess == null ? "text-slate-400" : pctColor(g.avgExcess)
                )}
              >
                {g.avgExcess == null ? "—" : fmtPct(g.avgExcess)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);

  useEffect(() => {
    getPerformance().then(setData);
  }, []);

  if (!data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageTitle
        title="战绩"
        subtitle="KOL 提及后方向兑现的胜率回测（跑赢 SPY 为胜，非实盘）"
      />
      <StatCardRow stats={data.stats} />

      {/* 总胜率 overall */}
      <Card>
        <CardHeader title="总胜率" subtitle="所有已兑现样本的方向兑现比例" />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 p-4">
            <div className="text-[12px] text-slate-400">总样本</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {data.overall.n}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 p-4">
            <div className="text-[12px] text-slate-400">胜率</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">
              {fmtRate(data.overall.winRate)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 p-4">
            <div className="text-[12px] text-slate-400">均值超额</div>
            <div
              className={cn(
                "mt-1 text-2xl font-bold",
                data.overall.avgExcess == null
                  ? "text-slate-400"
                  : pctColor(data.overall.avgExcess)
              )}
            >
              {data.overall.avgExcess == null
                ? "—"
                : fmtPct(data.overall.avgExcess)}
            </div>
          </div>
        </div>
      </Card>

      {/* 分组后续表现 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="分组后续表现 · 按观点" subtitle="看多 / 看空方向兑现" />
          <GroupTable groups={data.byView} groupLabel="观点" />
        </Card>
        <Card>
          <CardHeader title="分组后续表现 · 按链条" subtitle="各产业链方向兑现" />
          <GroupTable groups={data.byChain} groupLabel="链条" />
        </Card>
      </div>

      {/* 进阶切面（数据稀疏，先搭壳） */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="校准曲线" subtitle="置信度 vs 实际兑现" />
          <EmptyState message="数据累积中" />
        </Card>
        <Card>
          <CardHeader title="反身性窗口" subtitle="短期反身性 / 后续反应 / 中期信号" />
          <EmptyState message="数据累积中" />
        </Card>
        <Card>
          <CardHeader title="隐含组合" subtitle="机械等权持有（非实盘）" />
          <EmptyState message="数据累积中" />
        </Card>
      </div>

      <p className="px-1 text-[12px] text-slate-400">{data.note}</p>
    </div>
  );
}
