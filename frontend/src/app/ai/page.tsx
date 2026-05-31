"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  GitCompareArrows,
  Lightbulb,
  Send,
} from "lucide-react";
import {
  getAIReport,
  askAI,
  getStanceChanges,
  type AIReport,
  type StanceChange,
} from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import StanceFeed from "@/components/StanceFeed";
import {
  Card,
  CardHeader,
  PageTitle,
  Dropdown,
  Tag,
  LoadingState,
  Avatar,
} from "@/components/Primitives";
import { MultiLine, Bars, Sparkline } from "@/components/Charts";

const SUGGESTED = [
  "今天算力链的核心分歧是什么？",
  "HBM 供需有哪些新信号？",
  "光模块 1.6T 升级受益标的有哪些？",
  "哪些股票出现高置信看空信号？",
];

type ChatMsg = { role: "user" | "ai"; text: string };

export default function AIPage() {
  const [report, setReport] = useState<AIReport | null>(null);
  const [changes, setChanges] = useState<StanceChange[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "ai",
      text: "你好，我是研究助手。可以基于实时推文与持仓数据帮你分析观点、分歧与交易线索。",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAIReport().then(setReport);
    getStanceChanges().then((r) => setChanges(r.changes));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    const { answer } = await askAI(q);
    setMessages((m) => [...m, { role: "ai", text: answer }]);
    setBusy(false);
  }

  if (!report) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageTitle title="AI分析" subtitle="每日研究简报、观点聚类与研究助手" />

      <StatCardRow stats={report.stats} />

      {/* Filter row */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <Dropdown label="链条" options={["全部链条", "芯片算力", "光模块", "电力"]} />
          <Dropdown label="信号类型" options={["全部", "看多", "看空", "分歧"]} />
          <Dropdown label="置信度" options={["不限", "≥70%", "≥85%"]} />
          <Dropdown label="时间" options={["今日", "近3日", "近7日"]} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* LEFT main */}
        <div className="space-y-6 xl:col-span-2">
          {/* 今日AI研究简报 */}
          <Card>
            <CardHeader
              title="今日AI研究简报"
              subtitle="由 AI 聚合当日 KOL 观点自动生成"
              right={
                <span className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[12px] font-medium text-blue-600">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI生成
                </span>
              }
            />
            <div className="space-y-5 p-5">
              {/* 今日重点 */}
              <div>
                <p className="mb-2 text-[13px] font-semibold text-slate-700">
                  今日重点
                </p>
                <ul className="space-y-1.5">
                  {report.highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-start gap-2 text-[13px] text-slate-600"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <LogicBlock
                  title="看多逻辑"
                  tone="bull"
                  items={report.bullishLogic}
                />
                <LogicBlock
                  title="看空逻辑"
                  tone="bear"
                  items={report.bearishLogic}
                />
              </div>

              {/* 分歧点 */}
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-amber-700">
                  <GitCompareArrows className="h-4 w-4" />
                  分歧点
                </p>
                <ul className="space-y-1">
                  {report.divergences.map((d) => (
                    <li key={d} className="text-[13px] text-slate-600">
                      · {d}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 潜在交易线索 */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                  <Lightbulb className="h-4 w-4 text-blue-500" />
                  潜在交易线索
                </p>
                <div className="space-y-2">
                  {report.tradeIdeas.map((t) => (
                    <div
                      key={t.text}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5"
                    >
                      <span className="text-[13px] text-slate-600">{t.text}</span>
                      <ConfidenceBadge value={t.confidence} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* 最新AI分析 / 边际变化 */}
          <Card>
            <CardHeader
              title="最新AI分析 · 边际变化"
              subtitle="按立场演变重排：翻转 / 新增 / 持续确认"
            />
            <StanceFeed changes={changes} max={10} />
          </Card>

          {/* 观点聚类 */}
          <Card>
            <CardHeader title="观点聚类（Top 5）" subtitle="按讨论热度自动聚合" />
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
              {report.clusters.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-blue-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-slate-900">
                      {c.title}
                    </span>
                    <ConfidenceBadge value={c.confidence} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.relatedStocks.map((s) => (
                      <Tag key={s} className="bg-blue-50 text-blue-600 ring-blue-100">
                        {s}
                      </Tag>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {c.kols.map((k) => (
                        <span
                          key={k.id}
                          className="ring-2 ring-white rounded-full"
                        >
                          <Avatar name={k.name} size={26} />
                        </span>
                      ))}
                    </div>
                    <Sparkline data={c.heatSpark} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Bottom charts */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="信号演化趋势" />
              <div className="p-4">
                <MultiLine
                  data={report.signalTrend}
                  xKey="date"
                  series={[
                    { key: "bullish", color: "#10b981", label: "看多" },
                    { key: "bearish", color: "#ef4444", label: "看空" },
                  ]}
                  height={180}
                />
                <div className="mt-2 flex justify-center gap-4 text-[12px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    看多
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    看空
                  </span>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader title="话题涌现" />
              <div className="p-4">
                <Bars
                  data={report.topicEmergence}
                  xKey="topic"
                  yKey="value"
                  color="#8b5cf6"
                  height={180}
                />
              </div>
            </Card>
          </div>
        </div>

        {/* RIGHT chat */}
        <div className="xl:col-span-1">
          <Card className="sticky top-20 flex h-[calc(100vh-7rem)] flex-col">
            <CardHeader
              title="研究助手"
              subtitle="问 AI"
              right={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Sparkles className="h-4 w-4" />
                </span>
              }
            />
            <div
              ref={scrollRef}
              className="thin-scroll flex-1 space-y-3 overflow-y-auto p-4"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user" ? "flex justify-end" : "flex justify-start"
                  }
                >
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2.5 text-[13px] leading-relaxed text-white"
                        : "max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700"
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-[13px] text-slate-400">
                    思考中…
                  </div>
                </div>
              )}
            </div>

            {/* Suggested prompts */}
            <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 pt-3">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-[12px] text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 p-4"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="向研究助手提问…"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={busy}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  return (
    <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">
      置信度 {value}%
    </span>
  );
}

function LogicBlock({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "bull" | "bear";
  items: { text: string; confidence: number }[];
}) {
  const isBull = tone === "bull";
  return (
    <div
      className={
        isBull
          ? "rounded-lg border border-emerald-100 bg-emerald-50/50 p-3"
          : "rounded-lg border border-red-100 bg-red-50/50 p-3"
      }
    >
      <p
        className={
          isBull
            ? "mb-2 text-[13px] font-semibold text-emerald-700"
            : "mb-2 text-[13px] font-semibold text-red-700"
        }
      >
        {title}
      </p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.text} className="flex items-start gap-2">
            {isBull ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            )}
            <span className="flex-1 text-[13px] text-slate-600">{it.text}</span>
            <span className="shrink-0 text-[11px] font-medium text-slate-400">
              {it.confidence}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
