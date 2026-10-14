import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "./Logo";

export { Logo };

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && <div className="card-h"><h2 className="card-t">{title}</h2>{action}</div>}
      <div className={title ? "px-5 pb-5" : "p-5"}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, href, sub, accent }: { label: string; value: ReactNode; href?: string; sub?: ReactNode; accent?: boolean }) {
  const inner = (
    <div className={`card p-4 h-full transition ${href ? "hover:border-navy-500/40 hover:shadow-md" : ""} ${accent ? "border-gold-500/50 bg-gradient-to-br from-white to-gold-300/10" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1.5 text-[26px] leading-none font-semibold tabular-nums text-navy-950">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function TierBadge({ tier, overridden }: { tier: string | null | undefined; overridden?: boolean }) {
  if (!tier) return <span className="chip bg-slate-100 text-slate-500">Unscored</span>;
  const s = tier === "TIER1" ? "bg-gold-500 text-navy-950" : tier === "TIER2" ? "bg-navy-700 text-white" : "bg-slate-200 text-slate-700";
  return <span className={`chip ${s}`} title={overridden ? "Manually overridden" : undefined}>{tier.replace("TIER", "Tier ")}{overridden ? " ✎" : ""}</span>;
}

export function ScorePill({ score, confidence }: { score: number | null | undefined; confidence?: string | null }) {
  if (score == null) return <span className="muted">—</span>;
  const c = score >= 72 ? "text-emerald-700 bg-emerald-50 ring-emerald-600/20" : score >= 60 ? "text-navy-700 bg-navy-500/5 ring-navy-500/20" : "text-slate-600 bg-slate-50 ring-slate-400/20";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold tabular-nums ring-1 ${c}`} title={confidence ? `Confidence: ${confidence}` : undefined}>
      {score}{confidence && <span className={`h-1.5 w-1.5 rounded-full ${confidence === "High" ? "bg-emerald-500" : confidence === "Medium" ? "bg-amber-500" : "bg-slate-400"}`} />}
    </span>
  );
}

export function FactTag({ type }: { type: "CONFIRMED" | "ESTIMATE" | "AI_ASSESSMENT" | string | null | undefined }) {
  if (!type) return null;
  const m: Record<string, [string, string]> = {
    CONFIRMED: ["Confirmed", "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"],
    ESTIMATE: ["Estimate", "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"],
    AI_ASSESSMENT: ["AI assessment", "bg-violet-50 text-violet-700 ring-1 ring-violet-600/20"],
  };
  const [l, c] = m[type] ?? [type, "bg-slate-100 text-slate-600"];
  return <span className={`chip ${c}`}>{l}</span>;
}

export function ApplyLink({ url, label = "Open posting" }: { url: string; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary !py-1 !px-2.5 text-xs whitespace-nowrap">
      {label}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M7 17L17 7M9 7h8v8" /></svg>
    </a>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="h1">{title}</h1>{sub && <p className="muted text-sm mt-1">{sub}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function StatusDot({ status }: { status: string | null | undefined }) {
  const c = status === "ok" || status === "connected" ? "bg-emerald-500" : status === "error" || status === "failed" ? "bg-red-500" : status === "degraded" || status === "partial" ? "bg-amber-500" : "bg-slate-300";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} />;
}
