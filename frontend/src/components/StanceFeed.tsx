"use client";

import Link from "next/link";
import type { StanceChange } from "@/lib/api";
import { cn, SENTIMENT_META } from "@/lib/ui";
import { EmptyState } from "@/components/Primitives";

const KIND_META: Record<
  StanceChange["kind"],
  { label: string; chip: string }
> = {
  flip: { label: "翻转", chip: "bg-amber-50 text-amber-700 ring-amber-200" },
  new: { label: "新增", chip: "bg-blue-50 text-blue-700 ring-blue-200" },
  reaffirm: { label: "持续确认", chip: "bg-slate-100 text-slate-600 ring-slate-200" },
};

/**
 * 边际变化 / 立场演变 feed.
 * Each row: ticker (→/stocks) + company, KOL handle, kind badge,
 * and the view transition (priorView → currentView).
 */
export default function StanceFeed({
  changes,
  max,
}: {
  changes: StanceChange[];
  max?: number;
}) {
  if (!changes || changes.length === 0) return <EmptyState />;

  const rows = max ? changes.slice(0, max) : changes;

  return (
    <div className="divide-y divide-slate-100">
      {rows.map((c, i) => {
        const kind = KIND_META[c.kind];
        const cur = SENTIMENT_META[c.currentView];
        const prior = c.priorView ? SENTIMENT_META[c.priorView] : null;
        return (
          <div
            key={`${c.ticker}-${c.handle}-${i}`}
            className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/stocks/${c.ticker}`}
                  className="text-[14px] font-semibold text-blue-700 hover:underline"
                >
                  {c.ticker}
                </Link>
                <span className="truncate text-[12px] text-slate-500">
                  {c.company}
                </span>
                <span
                  className={cn(
                    "ml-auto inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                    kind.chip
                  )}
                >
                  {kind.label}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
                <span className="text-slate-500">@{c.handle.replace(/^@/, "")}</span>
                <span className="text-slate-300">·</span>
                {/* view transition */}
                {c.kind !== "new" && prior ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={prior.text}>{prior.label}</span>
                    <span className="text-slate-300">→</span>
                    <span className={cn("font-medium", cur.text)}>{cur.label}</span>
                  </span>
                ) : (
                  <span className={cn("font-medium", cur.text)}>{cur.label}</span>
                )}
                <span className="text-slate-300">·</span>
                <span>{c.latestDate || "—"}</span>
                <span className="text-slate-300">·</span>
                <span>{c.mentions} 次提及</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
