"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer, TrendingUp, AlertTriangle, Info } from "lucide-react";
import { getStockReport, type StockReport } from "@/lib/api";
import { Card, CardHeader, Tag, EmptyState } from "@/components/Primitives";
import { cn, pctColor, fmtPct } from "@/lib/ui";

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US");
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

function fmtPctOrDash(v: number | null | undefined, withSign = true): string {
  if (v == null) return "—";
  return fmtPct(v, withSign);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const RECOMMENDATION_ZH: Record<string, string> = {
  strong_buy: "强力买入",
  buy: "买入",
  hold: "持有",
  sell: "卖出",
  strong_sell: "强力卖出",
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function StockReportPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker || "").toUpperCase();
  const [report, setReport] = useState<StockReport | null>(null);

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    getStockReport(ticker).then((r) => {
      if (alive) setReport(r);
    });
    return () => {
      alive = false;
    };
  }, [ticker]);

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
        <p className="text-[14px] font-medium text-slate-600">
          正在生成研报…（首次约 30-40 秒）
        </p>
        <p className="text-[12px] text-slate-400">
          {ticker} · 实时拉取财务 / 目标价 / 机构 / 新闻并由 AI 综合
        </p>
      </div>
    );
  }

  const r = report;
  const changePct = r.price.changePct;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 report-root">
      {/* Print styling: hide nav chrome, tighten layout */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .report-root { max-width: 100% !important; }
          body { background: #fff !important; }
        }
      `}</style>

      {/* Toolbar (not printed) */}
      <div className="no-print flex items-center justify-between gap-3">
        <Link
          href={`/stocks/${ticker}`}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          返回个股
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-blue-700"
        >
          <Printer className="h-4 w-4" />
          打印 / 导出 PDF
        </button>
      </div>

      {/* 1. 页眉 + 评级区域 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{r.ticker}</h1>
              <span className="text-[15px] font-medium text-slate-600">{r.company}</span>
              <Tag className="bg-blue-50 text-blue-700 ring-blue-100">US | {r.sector || "—"}</Tag>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">更新时间 {r.updated || "—"}</p>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 md:grid-cols-6">
              <Metric
                label="最新价"
                value={fmtPrice(r.price.current)}
                valueClass={changePct != null ? pctColor(changePct) : undefined}
              />
              <Metric
                label="涨跌%"
                value={fmtPctOrDash(changePct)}
                valueClass={changePct != null ? pctColor(changePct) : undefined}
              />
              <Metric
                label="52周区间"
                value={
                  r.price.fiftyTwoWeekLow != null && r.price.fiftyTwoWeekHigh != null
                    ? `${fmtPrice(r.price.fiftyTwoWeekLow)} – ${fmtPrice(r.price.fiftyTwoWeekHigh)}`
                    : "—"
                }
              />
              <Metric label="总市值" value={fmtMoney(r.price.marketCap)} />
              <Metric label="成交量" value={fmtNum(r.price.volume)} />
              <Metric label="更新时间" value={r.updated ? r.updated.slice(0, 10) : "—"} />
            </div>
          </div>
        </Card>

        {/* 2. 投资评级区域 */}
        <Card className="bg-slate-50/40">
          <div className="px-5 py-4">
            <div className="text-[13px] font-semibold text-slate-900">投资评级区间</div>
            <p className="mt-0.5 text-[11px] text-slate-400">基于分析师一致目标价分档</p>
            <div className="mt-3 space-y-2">
              <ZoneRow
                label="买入区间"
                value={r.ratingZones.buyBelow != null ? `< ${fmtPrice(r.ratingZones.buyBelow)}` : "—"}
                tone="green"
              />
              <ZoneRow
                label="观察区间"
                value={
                  r.ratingZones.watch
                    ? `${fmtPrice(r.ratingZones.watch[0])} – ${fmtPrice(r.ratingZones.watch[1])}`
                    : "—"
                }
                tone="amber"
              />
              <ZoneRow
                label="风险区间"
                value={r.ratingZones.riskAbove != null ? `> ${fmtPrice(r.ratingZones.riskAbove)}` : "—"}
                tone="red"
              />
            </div>
            {r.ratingZones.position && (
              <div className="mt-3 rounded-lg bg-white px-3 py-2 text-[12px] text-slate-700 ring-1 ring-slate-200">
                当前位置处于 <span className="font-semibold text-slate-900">{r.ratingZones.position}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 3. 核心摘要 */}
      {r.aiView.core && (
        <Card className="border-blue-100 bg-blue-50/40">
          <div className="px-5 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">核心摘要</div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-slate-800">{r.aiView.core}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 4. 目标价区间 */}
        <Card>
          <CardHeader title="目标价区间（分析师一致预期）" />
          <div className="px-5 py-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <TargetCell label="低" value={fmtPrice(r.targets.low)} />
              <TargetCell label="均值" value={fmtPrice(r.targets.mean)} highlight />
              <TargetCell label="高" value={fmtPrice(r.targets.high)} />
            </div>

            <RangeBar
              low={r.targets.low}
              high={r.targets.high}
              mean={r.targets.mean}
              current={r.targets.current ?? r.price.current}
            />

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500">
              {r.targets.numAnalysts != null && <span>{r.targets.numAnalysts} 位分析师</span>}
              {r.targets.recommendation && (
                <Tag className="bg-blue-50 text-blue-700 ring-blue-100">
                  {RECOMMENDATION_ZH[r.targets.recommendation] ?? r.targets.recommendation}
                </Tag>
              )}
            </div>
          </div>
        </Card>

        {/* 6. 技术与基本面综合评分 */}
        <Card>
          <CardHeader title="技术与基本面综合评分" />
          <div className="grid grid-cols-2 gap-4 px-5 py-4">
            <ScoreCard
              title="技术面评分"
              score={r.scores.technical.score}
              subs={[
                ["趋势", r.scores.technical.trend],
                ["动能", r.scores.technical.mom3m],
                ["波动", r.scores.technical.volAnn],
              ]}
            />
            <ScoreCard
              title="基本面评分"
              score={r.scores.fundamental.score}
              subs={[
                ["毛利", r.scores.fundamental.grossMargin],
                ["净利", r.scores.fundamental.netMargin],
                ["ROE", r.scores.fundamental.roe],
                ["增速", r.scores.fundamental.revGrowth],
                ["FwdPE", r.scores.fundamental.fwdPE, true],
              ]}
            />
          </div>
        </Card>

        {/* 5. 关键指标 */}
        <Card>
          <CardHeader title="关键指标" />
          <div className="px-5 py-3">
            {r.metrics.length === 0 ? (
              <EmptyState message="暂无" />
            ) : (
              <table className="w-full text-[13px]">
                <tbody>
                  {r.metrics.map((m) => (
                    <tr key={m.label} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 text-slate-500">{m.label}</td>
                      <td className="py-1.5 text-right font-medium text-slate-900">
                        {m.value == null ? "—" : m.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* 8. 核心财务摘要 */}
        <Card>
          <CardHeader title="核心财务摘要" />
          <div className="px-5 py-3">
            {r.financials.length === 0 ? (
              <EmptyState message="暂无" />
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] text-slate-400">
                    <th className="py-1 text-left font-medium">项目</th>
                    <th className="py-1 text-right font-medium">数值</th>
                    <th className="py-1 text-right font-medium">同比</th>
                  </tr>
                </thead>
                <tbody>
                  {r.financials.map((f) => (
                    <tr key={f.item} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 text-slate-600">{f.item}</td>
                      <td className="py-1.5 text-right font-medium text-slate-900">
                        {f.value == null
                          ? "—"
                          : f.unit === "%"
                          ? `${f.value}%`
                          : fmtMoney(f.value)}
                      </td>
                      <td className={cn("py-1.5 text-right", f.yoy != null ? pctColor(f.yoy) : "text-slate-400")}>
                        {fmtPctOrDash(f.yoy)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {/* 7. AI 投资观点 */}
      <Card>
        <CardHeader title="AI 投资观点" subtitle="由 LLM 综合财务、技术与 KOL 信号生成" />
        <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-3">
          <ViewColumn
            title="看多逻辑"
            items={r.aiView.bull}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            sign="+"
            tone="green"
          />
          <ViewColumn
            title="风险提示"
            items={r.aiView.risk}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            sign="−"
            tone="red"
          />
          <ViewColumn
            title="关键催化"
            items={r.aiView.catalyst}
            icon={<Info className="h-3.5 w-3.5" />}
            sign="i"
            tone="blue"
          />
        </div>
      </Card>

      {/* 9. 市场表现 */}
      <Card>
        <CardHeader title="市场表现" />
        <div className="grid grid-cols-3 gap-3 px-5 py-4 sm:grid-cols-6">
          <PerfCell label="1日" value={r.performance.d1} />
          <PerfCell label="5日" value={r.performance.d5} />
          <PerfCell label="1月" value={r.performance.m1} />
          <PerfCell label="3月" value={r.performance.m3} />
          <PerfCell label="年初至今" value={r.performance.ytd} />
          <PerfCell label="1年" value={r.performance.y1} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 10. 机构持仓 */}
        <Card>
          <CardHeader
            title="机构持仓"
            subtitle={
              r.institutions.pctInstitutions != null
                ? `${r.institutions.pctInstitutions.toFixed(1)}% 机构持股`
                : undefined
            }
          />
          <div className="px-5 py-3">
            {r.institutions.topHolders.length === 0 ? (
              <EmptyState message="暂无" />
            ) : (
              <table className="w-full text-[13px]">
                <tbody>
                  {r.institutions.topHolders.map((h) => (
                    <tr key={h.holder} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 text-slate-600">{h.holder}</td>
                      <td className="py-1.5 text-right font-medium text-slate-900">
                        {h.pct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* 11. KOL 视角 */}
        <Card className="border-violet-100">
          <CardHeader title="KOL 视角" subtitle="声纳独家信号" />
          <div className="px-5 py-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">{r.kol.mentions}</span>
              <span className="text-[13px] text-slate-500">次提及</span>
            </div>
            <div className="mt-2 flex gap-4 text-[13px]">
              <span className="text-emerald-600">看多 {r.kol.bullish}</span>
              <span className="text-red-600">看空 {r.kol.bearish}</span>
            </div>
            <Link
              href={`/stocks/${ticker}`}
              className="no-print mt-3 inline-block text-[12px] font-medium text-blue-600 hover:underline"
            >
              查看提及×价格时间线 →
            </Link>
          </div>
        </Card>
      </div>

      {/* 12. 相关新闻 */}
      <Card>
        <CardHeader title="相关新闻" />
        <div className="px-5 py-3">
          {r.news.length === 0 ? (
            <EmptyState message="暂无" />
          ) : (
            <table className="w-full text-[13px]">
              <tbody>
                {r.news.map((n, i) => (
                  <tr key={`${n.url}-${i}`} className="border-b border-slate-50 last:border-0 align-top">
                    <td className="w-24 py-1.5 pr-3 text-[11px] text-slate-400">{fmtDate(n.datetime)}</td>
                    <td className="py-1.5 pr-3">
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-700 hover:text-blue-600 hover:underline"
                      >
                        {n.headline}
                      </a>
                    </td>
                    <td className="w-28 py-1.5 text-right text-[11px] text-slate-400">{n.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Footer */}
      <p className="px-1 pb-6 pt-1 text-[11px] leading-relaxed text-slate-400">
        数据来源：yfinance（财务/目标价/机构）+ Finnhub（资料/新闻）+ 本平台 KOL 信号；AI
        观点由 LLM 综合，仅供研究，不构成投资建议。
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

function Metric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={cn("mt-0.5 text-[15px] font-semibold text-slate-900", valueClass)}>{value}</div>
    </div>
  );
}

const ZONE_TONE: Record<string, string> = {
  green: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
};

function ZoneRow({ label, value, tone }: { label: string; value: string; tone: "green" | "amber" | "red" }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-semibold", ZONE_TONE[tone])}>{value}</span>
    </div>
  );
}

function TargetCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-2 py-3", highlight ? "border-blue-200 bg-blue-50/50" : "border-slate-100")}>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={cn("mt-0.5 text-[16px] font-semibold", highlight ? "text-blue-700" : "text-slate-900")}>
        {value}
      </div>
    </div>
  );
}

function RangeBar({
  low,
  high,
  mean,
  current,
}: {
  low: number | null;
  high: number | null;
  mean: number | null;
  current: number | null;
}) {
  if (low == null || high == null || high <= low) {
    return <div className="mt-4 h-2 rounded-full bg-slate-100" />;
  }
  const pos = (v: number | null) =>
    v == null ? null : Math.min(100, Math.max(0, ((v - low) / (high - low)) * 100));
  const meanPos = pos(mean);
  const curPos = pos(current);

  return (
    <div className="mt-5">
      <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-200 via-amber-200 to-red-200">
        {meanPos != null && (
          <div
            className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-blue-600"
            style={{ left: `${meanPos}%` }}
            title="均值"
          />
        )}
        {curPos != null && (
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow"
            style={{ left: `${curPos}%` }}
            title="当前价"
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
        <span>{fmtPrice(low)}</span>
        <span className="text-blue-600">均值 {fmtPrice(mean)}</span>
        <span>{fmtPrice(high)}</span>
      </div>
      <div className="mt-0.5 text-center text-[10px] text-slate-500">● 当前价 {fmtPrice(current)}</div>
    </div>
  );
}

function ScoreCard({
  title,
  score,
  subs,
}: {
  title: string;
  score: number;
  subs: [string, number | undefined, boolean?][];
}) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="text-[11px] text-slate-400">{title}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[26px] font-bold text-slate-900">{Math.round(score)}</span>
        <span className="text-[12px] text-slate-400">/100</span>
      </div>
      <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
        {subs
          .filter(([, v]) => v != null)
          .map(([label, v, raw]) => (
            <div key={label} className="flex justify-between">
              <span>{label}</span>
              <span className="font-medium text-slate-700">{raw ? v : `${v}%`}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

const VIEW_TONE: Record<string, { wrap: string; sign: string }> = {
  green: { wrap: "text-emerald-700", sign: "text-emerald-600" },
  red: { wrap: "text-red-700", sign: "text-red-600" },
  blue: { wrap: "text-blue-700", sign: "text-blue-600" },
};

function ViewColumn({
  title,
  items,
  icon,
  sign,
  tone,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  sign: string;
  tone: "green" | "red" | "blue";
}) {
  const t = VIEW_TONE[tone];
  return (
    <div>
      <div className={cn("flex items-center gap-1.5 text-[13px] font-semibold", t.wrap)}>
        {icon}
        {title}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[12px] text-slate-400">—</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-slate-600">
              <span className={cn("font-semibold", t.sign)}>{sign}</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PerfCell({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-lg border border-slate-100 px-2 py-3 text-center">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={cn("mt-0.5 text-[14px] font-semibold", value != null ? pctColor(value) : "text-slate-400")}>
        {fmtPctOrDash(value)}
      </div>
    </div>
  );
}
