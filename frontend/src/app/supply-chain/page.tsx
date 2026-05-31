"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupplyChain, type SupplyChainData } from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import {
  Card,
  CardHeader,
  PageTitle,
  LoadingState,
  EmptyState,
} from "@/components/Primitives";

export default function SupplyChainPage() {
  const [data, setData] = useState<SupplyChainData | null>(null);

  useEffect(() => {
    getSupplyChain().then(setData);
  }, []);

  if (!data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageTitle
        title="供应链"
        subtitle="按供应链角色分层的公司节点图谱（节点=结构关系，非观点）"
      />
      <StatCardRow stats={data.stats} />

      {/* 角色分层 */}
      <Card>
        <CardHeader
          title="角色分层"
          subtitle="按产业链角色聚合的公司节点；点击代码查看个股"
        />
        {data.tiers.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.tiers.map((t) => (
              <div
                key={t.chain}
                className="rounded-xl border border-slate-100 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-slate-800">
                    {t.chain}
                  </span>
                  <span className="text-[12px] text-slate-400">
                    {t.tickers} 节点
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.companies.map((c) => (
                    <Link
                      key={c.ticker}
                      href={`/stocks/${c.ticker}`}
                      title={c.company}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                    >
                      {c.ticker}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 传导事件 */}
      <Card>
        <CardHeader
          title="传导事件"
          subtitle="从高优先级事件沿供应链边传导的二阶观察清单（分数=衰减后优先级）"
        />
        <EmptyState
          message={
            data.events.length > 0
              ? `${data.events.length} 个传导事件`
              : "供应链关系待后续构建"
          }
        />
      </Card>

      <p className="px-1 text-[12px] text-slate-400">{data.note}</p>
    </div>
  );
}
