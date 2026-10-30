import Link from "next/link";
import type { ReactNode } from "react";
import { Logo, Meter, ScoreBadge } from "./ui";

/** Numbered, clickable row: logo, name with detail underneath, optional right-side extra, score badge. */
export function RankRow({ rank, href, logo, name, title, detail, extra, score }: { rank?: number; href: string; logo?: string | null; name: string; title: ReactNode; detail?: ReactNode; extra?: ReactNode; score?: number | null }) {
  return (
    <li>
      <Link href={href} className="row-link">
        {rank != null && <span className={`w-5 shrink-0 text-right text-xs font-semibold tabular-nums ${rank <= 3 ? "text-gold-600" : "text-slate-300"}`}>{rank}</span>}
        <Logo src={logo} name={name} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-navy-950">{title}</span>
          {detail && <span className="block truncate text-xs text-slate-500">{detail}</span>}
        </span>
        {extra}
        {score !== undefined && <ScoreBadge score={score} />}
      </Link>
    </li>
  );
}

/** Pay chip for list rows. */
export function PayChip({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <span className="hidden sm:inline-flex chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 tabular-nums">{text}</span>;
}

/** Score with a meter, for company lists. */
export function MeterScore({ value, label, tone = "navy" as const }: { value: number | null | undefined; label?: string; tone?: "navy" | "gold" | "emerald" | "violet" }) {
  return (
    <span className="hidden w-28 shrink-0 sm:block">
      {label && <span className="flex justify-between text-[10.5px] text-slate-400"><span>{label}</span><span className="font-semibold tabular-nums text-slate-600">{value ?? "—"}</span></span>}
      <Meter value={value} tone={tone} className="mt-1" />
    </span>
  );
}
