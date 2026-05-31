"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  getOverviewStats,
  getStanceChanges,
  type OverviewData,
  type StanceChange,
} from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import StanceFeed from "@/components/StanceFeed";
import {
  Card,
  CardHeader,
  CategoryChip,
  SearchBox,
  Dropdown,
  Tag,
  LoadingState,
} from "@/components/Primitives";
import { cn } from "@/lib/ui";

const CHAIN_FILTERS = [
  "全部链条",
  "芯片算力",
  "光模块",
  "AI基础设施",
  "数据中心电力",
  "云与软件",
];

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [changes, setChanges] = useState<StanceChange[]>([]);
  const [activeChain, setActiveChain] = useState("全部链条");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    getOverviewStats().then(setData);
    getStanceChanges().then((r) => setChanges(r.changes));
  }, []);

  if (!data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <StatCardRow stats={data.stats} />

      {/* 今日优先队列（边际变化） */}
      <Card>
        <CardHeader
          title="今日优先队列"
          subtitle="按边际变化重排：优先处理立场翻转 / 新增 / 持续确认的标的"
        />
        <StanceFeed changes={changes} max={8} />
      </Card>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {data.categories.map((c) => (
          <CategoryChip
            key={c.key}
            label={c.label}
            count={c.count}
            active={activeCat === c.key}
            onClick={() =>
              setActiveCat((prev) => (prev === c.key ? null : c.key))
            }
          />
        ))}
      </div>

      {/* Main tracking card */}
      <Card>
        <CardHeader
          title="AI产业链提及后收益跟踪"
          subtitle="基于 KOL 推文提及时点，跟踪关联个股的后续最大收益率"
        />
        <div className="space-y-4 p-5">
          {/* Search + chain filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchBox
              placeholder="搜索股票代码 / 公司 / 链条…"
              value={q}
              onChange={setQ}
              className="lg:max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              {CHAIN_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveChain(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                    activeChain === f
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Dropdown filters */}
          <div className="flex flex-wrap gap-2">
            <Dropdown label="队列" options={["全部队列", "核心池", "观察池"]} />
            <Dropdown label="观点" options={["全部观点", "看多", "中性", "看空"]} />
            <Dropdown label="收益" options={["不限", ">100%", ">300%", ">500%"]} />
            <Dropdown label="时间" options={["近7天", "近30天", "近90天", "全部"]} />
            <Dropdown label="排序" options={["最大收益率", "提及热度", "最新提及"]} />
          </div>

          {/* Top returns table */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <span className="text-[13px] font-semibold text-slate-700">
                最大收益率 5 只
              </span>
              <span className="text-[12px] text-slate-400">
                按提及后峰值收益排序
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[12px] text-slate-400">
                  <th className="px-4 py-2 font-medium">代码</th>
                  <th className="px-4 py-2 font-medium">所属链条</th>
                  <th className="px-4 py-2 text-right font-medium">最大收益率</th>
                </tr>
              </thead>
              <tbody>
                {data.topReturns.map((r) => (
                  <tr
                    key={r.ticker}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900">
                        {r.ticker}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Tag>{r.chain}</Tag>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600">
                        <ArrowUpRight className="h-4 w-4" />
                        {r.maxReturnPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
