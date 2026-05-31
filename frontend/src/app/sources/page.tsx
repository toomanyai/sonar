"use client";

import Link from "next/link";
import { Card, CardHeader, PageTitle } from "@/components/Primitives";

const OFFICIAL = [
  { name: "小红书", handle: "@SonarResearch", note: "图文研究笔记与每日观点速递", disabled: true },
  { name: "X (Twitter)", handle: "@SonarResearch", note: "实时信号与边际变化提醒", disabled: true },
];

const NAV = [
  { href: "/", label: "总览", desc: "按边际变化重排的今日优先队列" },
  { href: "/tweets", label: "推文", desc: "最新公开观点与公司线索复核" },
  { href: "/stocks", label: "股票", desc: "个股详情 + 提及×价格时间线" },
  { href: "/mentions", label: "提及表现", desc: "首次提及后的后续收益跟踪" },
  { href: "/performance", label: "战绩", desc: "方向兑现胜率回测（非实盘）" },
  { href: "/supply-chain", label: "供应链", desc: "按角色分层的公司节点图谱" },
  { href: "/multi-source", label: "多源", desc: "信号源管理与多源共识分层" },
  { href: "/industries", label: "行业", desc: "产业链集群的观察广度与压力" },
  { href: "/ai", label: "分析", desc: "AI 研究简报与边际变化" },
];

const CHANGELOG = [
  { date: "2026-05-31", text: "新增 战绩 / 供应链 / 多源 / 关于 四个页面，并对齐路由命名。" },
  { date: "2026-05-30", text: "上线 边际变化优先队列（总览 + 分析页）。" },
  { date: "2026-05-29", text: "提及×价格时间线：在收盘价走势上标注每次提及。" },
];

export default function SourcesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="关于与导航"
        subtitle="官方账号、站内导航、更新公告与用法说明"
      />

      {/* 官方账号 */}
      <Card>
        <CardHeader title="官方账号" subtitle="关注获取研究笔记与信号提醒" />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {OFFICIAL.map((o) => (
            <div
              key={o.name}
              className="flex items-center justify-between rounded-xl border border-slate-100 p-4"
            >
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-slate-800">
                  {o.name}
                </div>
                <div className="mt-0.5 text-[12px] text-slate-400">{o.handle}</div>
                <div className="mt-1 text-[12px] text-slate-500">{o.note}</div>
              </div>
              <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-400">
                即将开放
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* 站内导航 */}
      <Card>
        <CardHeader title="站内导航" subtitle="各模块用途速览" />
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40"
            >
              <div className="text-[14px] font-semibold text-slate-800">
                {n.label}
              </div>
              <div className="mt-1 text-[12px] text-slate-500">{n.desc}</div>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 更新公告 */}
        <Card>
          <CardHeader title="更新公告" subtitle="近期改动" />
          <div className="divide-y divide-slate-100">
            {CHANGELOG.map((c) => (
              <div key={c.date} className="flex gap-4 px-5 py-3.5">
                <span className="shrink-0 text-[12px] font-medium text-slate-400">
                  {c.date}
                </span>
                <span className="text-[13px] text-slate-600">{c.text}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 用法说明 */}
        <Card>
          <CardHeader title="用法说明" subtitle="如何使用核心模块" />
          <div className="space-y-4 p-5 text-[13px] leading-relaxed text-slate-600">
            <div>
              <div className="mb-1 font-semibold text-slate-800">股票时间线</div>
              <p>
                在个股详情查看收盘价走势，圆点标注每次 KOL
                提及。注意：作者立场与价格动量是两件事，需分开处理。
              </p>
            </div>
            <div>
              <div className="mb-1 font-semibold text-slate-800">
                战绩 / 供应链 / 多源
              </div>
              <p>
                战绩为方向兑现的胜率回测（跑赢 SPY 为胜，非实盘）；供应链按角色分层展示公司节点关系（非观点）；多源按覆盖该标的的信号源数量分层，
                源越多共识越强。
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* 反馈引导 */}
      <Card>
        <CardHeader title="反馈与建议" subtitle="帮助我们改进" />
        <div className="p-5 text-[13px] text-slate-600">
          数据口径、信号源或新功能有建议？欢迎通过官方账号私信反馈。本平台仅供研究参考，不构成任何投资建议。
        </div>
      </Card>
    </div>
  );
}
