"use client";

import {
  BadgeCheck,
  MessageCircle,
  Repeat2,
  Heart,
  BarChart3,
  Sparkles,
} from "lucide-react";
import type { Tweet } from "@/lib/api";
import { cn, SENTIMENT_META, pctColor, fmtPct, fmtDateTime } from "@/lib/ui";
import { Avatar, Tag } from "./Primitives";

export default function TweetCard({
  tweet,
  active,
  onClick,
}: {
  tweet: Tweet;
  active?: boolean;
  onClick?: () => void;
}) {
  const sent = SENTIMENT_META[tweet.sentiment];
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border bg-white p-4 text-left transition-colors",
        active
          ? "border-blue-300 ring-2 ring-blue-100"
          : "border-slate-200 hover:border-slate-300"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar name={tweet.kol.name} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-slate-900">
              {tweet.kol.name}
            </span>
            {tweet.kol.verified && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
            )}
            <span className="truncate text-[12px] text-slate-400">
              {tweet.kol.handle}
            </span>
            {tweet.createdAt && (
              <span className="shrink-0 text-[12px] text-slate-400">
                · {fmtDateTime(tweet.createdAt)}
              </span>
            )}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset",
            sent.chip
          )}
        >
          {sent.label}
        </span>
      </div>

      {/* Body */}
      <p className="mt-2.5 text-[14px] leading-relaxed text-slate-700">
        {tweet.text}
      </p>

      {/* Related stocks */}
      {tweet.relatedStocks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tweet.relatedStocks.map((s) => (
            <span
              key={s.ticker}
              className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-[12px] ring-1 ring-inset ring-slate-200"
            >
              <span className="font-semibold text-slate-700">{s.ticker}</span>
              <span className={cn("font-medium", pctColor(s.changePct))}>
                {fmtPct(s.changePct)}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Topics */}
      {tweet.topics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tweet.topics.map((t) => (
            <Tag key={t} className="bg-blue-50 text-blue-600 ring-blue-100">
              #{t}
            </Tag>
          ))}
        </div>
      )}

      {/* AI summary */}
      {tweet.aiSummary && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[12px] font-medium text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              AI摘要
            </span>
            {tweet.confidence != null && (
              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                高置信 {tweet.confidence}%
              </span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-slate-600">
            {tweet.aiSummary}
          </p>
        </div>
      )}

      {/* Engagement */}
      <div className="mt-3 flex items-center gap-5 text-[12px] text-slate-400">
        <span className="flex items-center gap-1">
          <MessageCircle className="h-3.5 w-3.5" />
          {tweet.engagement.replies}
        </span>
        <span className="flex items-center gap-1">
          <Repeat2 className="h-3.5 w-3.5" />
          {tweet.engagement.retweets}
        </span>
        <span className="flex items-center gap-1">
          <Heart className="h-3.5 w-3.5" />
          {tweet.engagement.likes}
        </span>
        <span className="flex items-center gap-1">
          <BarChart3 className="h-3.5 w-3.5" />
          {tweet.engagement.views.toLocaleString()}
        </span>
      </div>
    </button>
  );
}
