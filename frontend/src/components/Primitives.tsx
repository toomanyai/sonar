"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn, avatarGradient, initials } from "@/lib/ui";

/* Card -------------------------------------------------------------- */
export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-slate-400">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}

/* Section title (page-level) --------------------------------------- */
export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-1">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
    </div>
  );
}

/* CategoryChip ------------------------------------------------------ */
export function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <span>{label}</span>
      {count != null && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px]",
            active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* Small pill tag ---------------------------------------------------- */
export function Tag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset",
        className ?? "bg-slate-100 text-slate-600 ring-slate-200"
      )}
    >
      {children}
    </span>
  );
}

/* Search box -------------------------------------------------------- */
export function SearchBox({
  placeholder = "搜索…",
  value,
  onChange,
  className,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

/* Faux dropdown filter (presentational) ----------------------------- */
export function Dropdown({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(label);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
      >
        {sel}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => {
                setSel(o);
                setOpen(false);
              }}
              className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-[13px] text-slate-600 hover:bg-slate-50"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Avatar ------------------------------------------------------------ */
export function Avatar({
  name,
  size = 40,
}: {
  name: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white",
        avatarGradient(name)
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}

/* Progress bar ------------------------------------------------------ */
export function Progress({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn("h-full rounded-full bg-blue-500", className)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* Empty / loading state -------------------------------------------- */
export function EmptyState({ message = "暂无数据" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="h-10 w-10 rounded-full bg-slate-100" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
    </div>
  );
}
