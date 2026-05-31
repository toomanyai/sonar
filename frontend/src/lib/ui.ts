import type { Sentiment } from "./api";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Pastel stat-card backgrounds */
export const TONE_BG: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  purple: "bg-violet-50 text-violet-700 ring-violet-100",
};

export const SENTIMENT_META: Record<
  Sentiment,
  { label: string; chip: string; dot: string; text: string }
> = {
  bullish: {
    label: "看多",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
  },
  bearish: {
    label: "看空",
    chip: "bg-red-50 text-red-700 ring-red-200",
    dot: "bg-red-500",
    text: "text-red-600",
  },
  neutral: {
    label: "中性",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
    dot: "bg-slate-400",
    text: "text-slate-500",
  },
  uncertain: {
    label: "不确定",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-400",
    text: "text-amber-600",
  },
};

export const RISK_META: Record<
  "low" | "medium" | "high",
  { label: string; chip: string }
> = {
  low: { label: "低", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  medium: { label: "中", chip: "bg-amber-50 text-amber-700 ring-amber-200" },
  high: { label: "高", chip: "bg-red-50 text-red-700 ring-red-200" },
};

/** Market-position tier chip (指数地位 / 信号质量) */
export const MARKET_TIER_META: Record<string, string> = {
  权重股: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  大盘: "bg-slate-100 text-slate-600 ring-slate-200",
  非指数: "bg-amber-50 text-amber-700 ring-amber-200",
};

/** Color a percentage value: positive green, negative red */
export function pctColor(v: number): string {
  if (v > 0) return "text-emerald-600";
  if (v < 0) return "text-red-600";
  return "text-slate-500";
}

export function fmtPct(v: number, withSign = true): string {
  const sign = withSign && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

const ET_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** ISO(UTC) → 美东时间 ET：2026-05-30 09:40 ET（自动处理夏令时，全员一致） */
export function fmtDateTime(iso?: string | null, withZone = true): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const parts = ET_FMT.formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const s = `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
  return withZone ? `${s} ET` : s;
}

/** Donut / chart palette */
export const CHART_COLORS = [
  "#2563eb",
  "#10b981",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
];

export const SENTIMENT_COLORS: Record<Sentiment, string> = {
  bullish: "#10b981",
  bearish: "#ef4444",
  neutral: "#94a3b8",
  uncertain: "#f59e0b",
};

/** Deterministic avatar gradient from a string seed */
export function avatarGradient(seed: string): string {
  const palettes = [
    "from-blue-400 to-indigo-500",
    "from-emerald-400 to-teal-500",
    "from-violet-400 to-purple-500",
    "from-amber-400 to-orange-500",
    "from-rose-400 to-red-500",
    "from-cyan-400 to-sky-500",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

export function initials(name: string): string {
  return name.slice(0, 2);
}
