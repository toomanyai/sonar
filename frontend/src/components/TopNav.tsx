"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { cn } from "@/lib/ui";

const TABS = [
  { href: "/", label: "总览" },
  { href: "/tweets", label: "推文" },
  { href: "/stocks", label: "股票" },
  { href: "/mentions", label: "提及表现" },
  { href: "/performance", label: "战绩" },
  { href: "/supply-chain", label: "供应链" },
  { href: "/multi-source", label: "多源" },
  { href: "/industries", label: "行业" },
  { href: "/ai", label: "分析" },
  { href: "/watchlist", label: "关注我" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white shadow-sm">
            声
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold text-slate-900">
              声纳 Sonar
            </span>
            <span className="text-[11px] text-slate-400">KOL 声音里的投研信号</span>
          </span>
        </Link>

        {/* Tabs */}
        <nav className="hidden items-center gap-1 md:flex">
          {TABS.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Action */}
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            title="设置"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              pathname.startsWith("/settings")
                ? "bg-blue-50 text-blue-700"
                : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            )}
          >
            <Settings className="h-[18px] w-[18px]" />
          </Link>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700">
            <Bell className="h-4 w-4" />
            开启通知
          </button>
        </div>
      </div>
    </header>
  );
}
