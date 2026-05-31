"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  Mail,
  MessageSquare,
  Webhook,
  Monitor,
  Plus,
  X,
} from "lucide-react";
import {
  getWatchlist,
  addKol,
  removeKol,
  type WatchlistData,
} from "@/lib/api";
import { StatCardRow } from "@/components/StatCard";
import {
  Card,
  CardHeader,
  PageTitle,
  Tag,
  LoadingState,
  Avatar,
} from "@/components/Primitives";
import { cn, SENTIMENT_META, pctColor, fmtPct } from "@/lib/ui";

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  站内通知: <Monitor className="h-4 w-4" />,
  邮件: <Mail className="h-4 w-4" />,
  微信: <MessageSquare className="h-4 w-4" />,
  Webhook: <Webhook className="h-4 w-4" />,
};

/** UTC ISO -> 美东时间短格式 05-30 13:03 ET */
const ET_SHORT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function fmtTime(s: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const parts = ET_SHORT.formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("month")}-${g("day")} ${g("hour")}:${g("minute")} ET`;
}

const REGION_GROUPS: { key: "cn" | "en" | "other"; label: string }[] = [
  { key: "cn", label: "中文区" },
  { key: "en", label: "英文区" },
  { key: "other", label: "其他" },
];

const FEED_TONE: Record<string, string> = {
  alert: "bg-red-500",
  update: "bg-amber-500",
  mention: "bg-blue-500",
};

export default function WatchlistPage() {
  const [data, setData] = useState<WatchlistData | null>(null);
  const [newHandle, setNewHandle] = useState("");
  const [adding, setAdding] = useState(false);

  const reload = () => getWatchlist().then(setData);

  useEffect(() => {
    reload();
  }, []);

  const handleAdd = async () => {
    const h = newHandle.trim();
    if (!h || adding) return;
    setAdding(true);
    try {
      await addKol(h);
      setNewHandle("");
      await reload();
    } catch {
      // backend unreachable — no-op; mock mode can't persist
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (handle: string) => {
    await removeKol(handle);
    await reload();
  };

  if (!data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageTitle title="我的关注" subtitle="关注的 KOL、股票、主题与预警规则" />

      <StatCardRow stats={data.stats} />

      {/* Three columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 关注的KOL */}
        <Card>
          <CardHeader title="关注的KOL" subtitle={`${data.kols.length} 位`} />
          {/* Add a KOL by handle */}
          <div className="flex items-center gap-2 px-5 py-3">
            <div className="flex flex-1 items-center rounded-lg border border-slate-200 px-3 focus-within:border-blue-400">
              <span className="text-[13px] text-slate-400">@</span>
              <input
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="新增关注的 KOL handle"
                className="w-full bg-transparent px-1.5 py-2 text-[13px] outline-none placeholder:text-slate-300"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || !newHandle.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              {adding ? "抓取中" : "新增"}
            </button>
          </div>
          <div>
            {REGION_GROUPS.map(({ key, label }) => {
              const members = data.kols.filter((k) =>
                key === "other"
                  ? !k.region || (k.region !== "cn" && k.region !== "en")
                  : k.region === key
              );
              if (members.length === 0) return null;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between bg-slate-50/70 px-5 py-2">
                    <span className="text-[12px] font-semibold text-slate-500">{label}</span>
                    <span className="text-[11px] text-slate-400">{members.length} 位</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {members.map((k) => (
                      <div key={k.id} className="group flex items-start gap-3 px-5 py-3">
                        <Avatar name={k.name} size={38} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-slate-800">
                              {k.name}
                            </span>
                            <span className="shrink-0 text-[11px] text-slate-400">{k.handle}</span>
                          </div>
                          {k.note && (
                            <div className="mt-0.5 truncate text-[11px] text-slate-400" title={k.note}>
                              {k.note}
                            </div>
                          )}
                        </div>
                        {k.hitRate != null && (
                          <div className="shrink-0 text-right">
                            <div className="text-[10px] text-slate-400">命中率</div>
                            <div className="text-[13px] font-semibold text-blue-600">
                              {k.hitRate}%
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => handleRemove(k.handle)}
                          title="取消关注"
                          className="mt-1 shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 关注的股票/资产 */}
        <Card className="lg:col-span-2">
          <CardHeader title="关注的股票 / 资产" subtitle={`${data.stocks.length} 项`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">股票</th>
                  <th className="px-4 py-2.5 font-medium">所属链条</th>
                  <th className="px-4 py-2.5 font-medium">最新提及</th>
                  <th className="px-4 py-2.5 font-medium">情绪变化</th>
                  <th className="px-4 py-2.5 text-right font-medium">价格变化</th>
                  <th className="px-4 py-2.5 font-medium">AI提示</th>
                  <th className="px-4 py-2.5 font-medium">预警</th>
                </tr>
              </thead>
              <tbody>
                {data.stocks.map((s) => (
                  <tr key={s.ticker} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {s.ticker}
                    </td>
                    <td className="px-4 py-3">
                      <Tag>{s.chain}</Tag>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtTime(s.lastMention)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          SENTIMENT_META[s.sentimentChange].text
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            SENTIMENT_META[s.sentimentChange].dot
                          )}
                        />
                        {SENTIMENT_META[s.sentimentChange].label}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-medium",
                        pctColor(s.priceChangePct)
                      )}
                    >
                      {fmtPct(s.priceChangePct)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.aiHint}</td>
                    <td className="px-4 py-3">
                      {s.alertStatus === "active" ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600">
                          <Bell className="h-3.5 w-3.5" /> 已开启
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-400">
                          <BellOff className="h-3.5 w-3.5" /> 已静音
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Rules + channels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="预警规则" subtitle={`${data.rules.length} 条`} />
          <div className="divide-y divide-slate-100">
            {data.rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div>
                  <div className="text-[14px] font-medium text-slate-800">
                    {r.title}
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-400">
                    {r.description}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset",
                    r.enabled
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-slate-100 text-slate-400 ring-slate-200"
                  )}
                >
                  {r.enabled ? "启用中" : "已关闭"}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="通知渠道" />
          <div className="space-y-2 p-5">
            {data.channels.map((c) => (
              <div
                key={c.name}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-[13px] text-slate-600">
                  <span className="text-slate-400">{CHANNEL_ICONS[c.name]}</span>
                  {c.name}
                </span>
                <span
                  className={cn(
                    "h-5 w-9 rounded-full p-0.5 transition-colors",
                    c.enabled ? "bg-blue-600" : "bg-slate-200"
                  )}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-full bg-white transition-transform",
                      c.enabled && "translate-x-4"
                    )}
                  />
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Feed */}
      <Card>
        <CardHeader title="最近提醒 / 关注动态" />
        <div className="divide-y divide-slate-100">
          {data.feed.map((f) => (
            <div key={f.id} className="flex items-start gap-3 px-5 py-3.5">
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  FEED_TONE[f.kind] ?? "bg-slate-400"
                )}
              />
              <div className="flex-1">
                <p className="text-[13px] text-slate-700">{f.text}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{f.time}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
