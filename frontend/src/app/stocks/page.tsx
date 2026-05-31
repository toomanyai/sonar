"use client";

import { useEffect, useState } from "react";
import { Flame, TrendingUp, ShieldAlert } from "lucide-react";
import {
  getStocks,
  getStockDetail,
  type StockListResult,
  type StockDetail,
} from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import {
  Card,
  PageTitle,
  CategoryChip,
  SearchBox,
  Dropdown,
  Tag,
  LoadingState,
  Avatar,
} from "@/components/Primitives";
import { Donut, LineTrend, Bars } from "@/components/Charts";
import TweetCard from "@/components/TweetCard";
import {
  cn,
  SENTIMENT_META,
  RISK_META,
  pctColor,
  fmtPct,
  SENTIMENT_COLORS,
  MARKET_TIER_META,
} from "@/lib/ui";

const TIER_FILTERS: { key: string; label: string; tier?: "in_index" | "off_index" }[] = [
  { key: "all", label: "全部" },
  { key: "in", label: "指数成分", tier: "in_index" },
  { key: "off", label: "非指数小盘", tier: "off_index" },
];

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "chip", label: "芯片/算力" },
  { key: "optical", label: "光模块/网络" },
  { key: "infra", label: "AI基础设施" },
  { key: "power", label: "数据中心电力" },
  { key: "cloud", label: "云与软件" },
];

const DETAIL_TABS = ["概览", "提及趋势", "KOL观点", "财务关联", "事件驱动"];

export default function StocksPage() {
  const [list, setList] = useState<StockListResult | null>(null);
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("概览");
  const [tierKey, setTierKey] = useState("all");

  useEffect(() => {
    const tier = TIER_FILTERS.find((t) => t.key === tierKey)?.tier;
    getStocks({ tier }).then((res) => {
      setList(res);
      if (res.items[0]) setSelected((prev) => prev ?? res.items[0].ticker);
    });
  }, [tierKey]);

  useEffect(() => {
    if (selected) getStockDetail(selected).then(setDetail);
  }, [selected]);

  if (!list) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageTitle title="股票洞察" subtitle="个股提及热度、情绪偏向与提及后收益跟踪" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* LEFT */}
        <div className="space-y-4 xl:col-span-2">
          <SearchBox
            placeholder="搜索股票代码 / 公司名…"
            value={q}
            onChange={setQ}
          />

          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <CategoryChip
                key={c.key}
                label={c.label}
                active={cat === c.key}
                onClick={() => setCat(c.key)}
              />
            ))}
          </div>

          {/* 市场地位筛选（来自指数成分+权重） */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-slate-400">市场地位</span>
            {TIER_FILTERS.map((t) => (
              <CategoryChip
                key={t.key}
                label={t.label}
                active={tierKey === t.key}
                onClick={() => setTierKey(t.key)}
              />
            ))}
          </div>

          <StatCardRow stats={list.stats} />

          <div className="flex flex-wrap gap-2">
            <Dropdown label="情绪偏向" options={["全部", "看多", "中性", "看空"]} />
            <Dropdown label="风险等级" options={["全部", "低", "中", "高"]} />
            <Dropdown label="提及数" options={["不限", ">100", ">200", ">300"]} />
            <Dropdown label="排序" options={["提及热度", "提及后收益", "提及数"]} />
          </div>

          {/* Ranked table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead className="bg-slate-50 text-[11px] text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">代码</th>
                    <th className="px-3 py-2.5 font-medium">公司</th>
                    <th className="px-3 py-2.5 font-medium">所属链条</th>
                    <th className="px-3 py-2.5 font-medium">市场地位</th>
                    <th className="px-3 py-2.5 font-medium">提及热度</th>
                    <th className="px-3 py-2.5 font-medium">情绪偏向</th>
                    <th className="px-3 py-2.5 text-right font-medium">近30天</th>
                    <th className="px-3 py-2.5 text-right font-medium">收益(5天)</th>
                    <th className="px-3 py-2.5 font-medium">风险</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((s, i) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelected(s.ticker)}
                      className={cn(
                        "cursor-pointer border-t border-slate-100 transition-colors hover:bg-blue-50/50",
                        selected === s.ticker && "bg-blue-50/60"
                      )}
                    >
                      <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {s.ticker}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{s.company}</td>
                      <td className="px-3 py-3">
                        <Tag>{s.chain}</Tag>
                      </td>
                      <td className="px-3 py-3">
                        {s.marketTier ? (
                          <span
                            title={s.marketLabel}
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                              MARKET_TIER_META[s.marketTier] ?? MARKET_TIER_META["大盘"]
                            )}
                          >
                            {s.marketTier}
                            {s.sp500Weight != null && (
                              <span className="ml-1 font-normal opacity-70">
                                {s.sp500Weight}%
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-700">
                            {s.heat}
                          </span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${s.heat}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5",
                            SENTIMENT_META[s.sentiment].text
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              SENTIMENT_META[s.sentiment].dot
                            )}
                          />
                          {SENTIMENT_META[s.sentiment].label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">
                        {s.mentions30d}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-medium",
                          pctColor(s.return5d)
                        )}
                      >
                        {fmtPct(s.return5d)}
                      </td>
                      <td className="px-3 py-3">
                        <Tag className={RISK_META[s.riskLevel].chip}>
                          {RISK_META[s.riskLevel].label}
                        </Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[12px] text-slate-400">
              <span>
                共 {list.total.toLocaleString()} 只 · 第 {list.page} 页
              </span>
              <div className="flex gap-1">
                <button className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-500 hover:bg-slate-50">
                  上一页
                </button>
                <button className="rounded-md border border-slate-200 bg-blue-600 px-2.5 py-1 text-white">
                  1
                </button>
                <button className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-500 hover:bg-slate-50">
                  2
                </button>
                <button className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-500 hover:bg-slate-50">
                  下一页
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT detail drawer */}
        <div className="xl:col-span-1">
          {!detail ? (
            <Card>
              <LoadingState />
            </Card>
          ) : (
            <Card className="sticky top-20">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Avatar name={detail.ticker} size={44} />
                  <div>
                    <div className="text-lg font-bold text-slate-900">
                      {detail.ticker}
                    </div>
                    <div className="text-[13px] text-slate-400">
                      {detail.company}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-5">
                {/* 5 metric cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  <Metric label="提及热度" value={detail.heat} icon={<Flame className="h-4 w-4 text-red-500" />} />
                  <Metric label="近30天提及" value={detail.mentions30d} />
                  <Metric
                    label="提及后收益(5天)"
                    value={fmtPct(detail.return5d)}
                    valueClass={pctColor(detail.return5d)}
                    icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
                  />
                  <Metric
                    label="情绪偏向"
                    value={detail.sentimentLabel}
                    valueClass={SENTIMENT_META[detail.sentiment].text}
                  />
                  <Metric
                    label="风险等级"
                    value={RISK_META[detail.riskLevel].label}
                    icon={<ShieldAlert className="h-4 w-4 text-amber-500" />}
                  />
                </div>

                {/* Tabs */}
                <div className="flex gap-1 overflow-x-auto border-b border-slate-100 pb-px">
                  {DETAIL_TABS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                        tab === t
                          ? "border-blue-600 text-blue-700"
                          : "border-transparent text-slate-400 hover:text-slate-600"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* 提及热度趋势 */}
                <div>
                  <p className="mb-1 text-[13px] font-semibold text-slate-700">
                    提及热度趋势
                  </p>
                  <LineTrend
                    data={detail.heatTrend}
                    xKey="date"
                    yKey="heat"
                    height={140}
                  />
                </div>

                {/* Two donuts */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-1 text-[13px] font-semibold text-slate-700">
                      KOL覆盖
                    </p>
                    <Donut data={detail.kolCoverage} height={120} />
                  </div>
                  <div>
                    <p className="mb-1 text-[13px] font-semibold text-slate-700">
                      观点结构
                    </p>
                    <Donut
                      data={detail.opinionStructure}
                      colors={[
                        SENTIMENT_COLORS.bullish,
                        SENTIMENT_COLORS.neutral,
                        SENTIMENT_COLORS.bearish,
                      ]}
                      height={120}
                    />
                  </div>
                </div>

                {/* 后续收益分布 */}
                <div>
                  <p className="mb-1 text-[13px] font-semibold text-slate-700">
                    后续收益分布（5天）
                  </p>
                  <Bars
                    data={detail.returnDistribution}
                    xKey="bucket"
                    yKey="count"
                    height={150}
                  />
                </div>

                {/* 主要KOL讨论 */}
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-slate-700">
                    主要KOL讨论
                  </p>
                  <div className="space-y-2">
                    {detail.topKols.map((k) => (
                      <div
                        key={k.id}
                        className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2"
                      >
                        <Avatar name={k.name} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium text-slate-800">
                            {k.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {k.handle}
                          </div>
                        </div>
                        {k.hitRate != null && (
                          <span className="text-[12px] font-medium text-blue-600">
                            命中 {k.hitRate}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 最新代表性推文 */}
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-slate-700">
                    最新代表性推文
                  </p>
                  <div className="space-y-2">
                    {detail.representativeTweets.map((t) => (
                      <TweetCard key={t.id} tweet={t} />
                    ))}
                  </div>
                </div>

                {/* AI核心逻辑 */}
                <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <p className="text-[13px] font-semibold text-blue-700">
                    AI核心逻辑
                  </p>
                  <div>
                    <p className="text-[12px] font-medium text-slate-500">
                      市场共识
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                      {detail.aiLogic.consensus}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-slate-500">
                      关键驱动
                    </p>
                    <ul className="mt-1 space-y-1">
                      {detail.aiLogic.drivers.map((d) => (
                        <li
                          key={d}
                          className="flex items-start gap-1.5 text-[13px] text-slate-600"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-slate-500">
                      潜在风险
                    </p>
                    <ul className="mt-1 space-y-1">
                      {detail.aiLogic.risks.map((r) => (
                        <li
                          key={r}
                          className="flex items-start gap-1.5 text-[13px] text-slate-600"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
      <div className="flex items-center gap-1 text-[11px] text-slate-400">
        {icon}
        {label}
      </div>
      <div className={cn("mt-0.5 text-lg font-bold text-slate-900", valueClass)}>
        {value}
      </div>
    </div>
  );
}
