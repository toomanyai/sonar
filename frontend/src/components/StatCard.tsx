import type { StatCardData } from "@/lib/api";
import { cn, TONE_BG } from "@/lib/ui";

const TONE_VALUE: Record<string, string> = {
  blue: "text-blue-700",
  red: "text-red-700",
  green: "text-emerald-700",
  amber: "text-amber-700",
  purple: "text-violet-700",
};

export default function StatCard({ data }: { data: StatCardData }) {
  return (
    <div
      className={cn(
        "rounded-xl p-4 ring-1 ring-inset",
        TONE_BG[data.tone] ?? TONE_BG.blue
      )}
    >
      <div className="text-[13px] font-medium opacity-80">{data.label}</div>
      <div
        className={cn(
          "mt-1 text-3xl font-bold tracking-tight",
          TONE_VALUE[data.tone] ?? TONE_VALUE.blue
        )}
      >
        {data.value}
      </div>
      {data.delta && (
        <div className="mt-1 text-[12px] opacity-70">{data.delta}</div>
      )}
    </div>
  );
}

export function StatCardRow({ stats }: { stats: StatCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <StatCard key={s.key} data={s} />
      ))}
    </div>
  );
}
