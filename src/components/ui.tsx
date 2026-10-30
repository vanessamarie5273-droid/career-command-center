import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "./Logo";
import { Icon, iconForTitle, type IconName } from "./icons";

export { Logo, Icon };
export type { IconName };

/** Accent colours for card icons, tiles and meters. Full class names so Tailwind keeps them. */
const TONES = {
  navy: { chip: "bg-navy-500/10 text-navy-600", bar: "bg-gradient-to-r from-[#3b5bdb] to-[#5c7cfa]", ring: "ring-navy-500/25", text: "text-navy-600" },
  gold: { chip: "bg-gold-500/15 text-gold-600", bar: "bg-gradient-to-r from-gold-600 to-gold-400", ring: "ring-gold-500/40", text: "text-gold-600" },
  emerald: { chip: "bg-emerald-500/10 text-emerald-600", bar: "bg-gradient-to-r from-emerald-600 to-emerald-400", ring: "ring-emerald-500/25", text: "text-emerald-600" },
  violet: { chip: "bg-violet-500/10 text-violet-600", bar: "bg-gradient-to-r from-violet-600 to-violet-400", ring: "ring-violet-500/25", text: "text-violet-600" },
  sky: { chip: "bg-sky-500/10 text-sky-600", bar: "bg-gradient-to-r from-sky-600 to-sky-400", ring: "ring-sky-500/25", text: "text-sky-600" },
  rose: { chip: "bg-rose-500/10 text-rose-600", bar: "bg-gradient-to-r from-rose-600 to-rose-400", ring: "ring-rose-500/25", text: "text-rose-600" },
  amber: { chip: "bg-amber-500/15 text-amber-600", bar: "bg-gradient-to-r from-amber-500 to-amber-300", ring: "ring-amber-500/30", text: "text-amber-600" },
  slate: { chip: "bg-slate-500/10 text-slate-500", bar: "bg-gradient-to-r from-slate-400 to-slate-300", ring: "ring-slate-400/25", text: "text-slate-500" },
} as const;
export type Tone = keyof typeof TONES;

export function IconChip({ icon, tone = "navy", size = 32 }: { icon: IconName; tone?: Tone; size?: number }) {
  return <span style={{ width: size, height: size }} className={`inline-flex shrink-0 items-center justify-center rounded-lg ${TONES[tone].chip}`}><Icon name={icon} size={Math.round(size * 0.53)} /></span>;
}

export function Card({ title, sub, action, icon, tone = "navy", children, className = "", flush }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; icon?: IconName; tone?: Tone; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-h">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? <IconChip icon={icon} tone={tone} size={30} /> : title ? <span className="h-4 w-1 shrink-0 rounded-full bg-gold-500" /> : null}
            <div className="min-w-0"><h2 className="card-t">{title}</h2>{sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}</div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={flush ? "" : title ? "px-5 pb-5" : "p-5"}>{children}</div>
    </section>
  );
}

/** A heading that groups the cards under it, so a page reads as a few sections instead of a wall of boxes. */
export function Section({ title, sub, action, children, className = "" }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-8 ${className}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-semibold tracking-tight text-navy-950">{title}</h2>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, href, sub, accent, icon, tone = "navy" }: { label: string; value: ReactNode; href?: string; sub?: ReactNode; accent?: boolean; icon?: IconName; tone?: Tone }) {
  const inner = (
    <div className={`card group relative h-full overflow-hidden p-4 transition ${href ? "hover:-translate-y-0.5 hover:shadow-lg" : ""} ${accent ? "!bg-gradient-to-br from-gold-300/30 via-white to-white ring-gold-500/40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12px] font-medium text-slate-500">{label}</div>
        {icon && <IconChip icon={icon} tone={accent ? "gold" : tone} size={28} />}
      </div>
      <div className="mt-2 text-[28px] leading-none font-semibold tabular-nums text-navy-950">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-slate-500">{sub}</div>}
      <span className={`absolute inset-x-0 bottom-0 h-0.5 ${TONES[accent ? "gold" : tone].bar} opacity-70`} />
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

/** Horizontal meter for a 0–max value. */
export function Meter({ value, max = 100, tone = "navy", className = "" }: { value: number | null | undefined; max?: number; tone?: Tone; className?: string }) {
  const pct = value == null || !max ? 0 : Math.max(2, Math.min(100, (value / max) * 100));
  return <div className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}><div className={`h-full rounded-full ${TONES[tone].bar}`} style={{ width: `${pct}%` }} /></div>;
}

/** Round score badge coloured by strength: gold 85+, green 75+, blue 65+, grey below. */
export function ScoreBadge({ score, size = 34 }: { score: number | null | undefined; size?: number }) {
  if (score == null) return <span className="muted text-sm">—</span>;
  const c = score >= 85 ? "bg-gradient-to-br from-gold-400 to-gold-600 text-navy-950 ring-gold-500/40" : score >= 75 ? "bg-emerald-50 text-emerald-700 ring-emerald-500/30" : score >= 65 ? "bg-navy-500/[0.07] text-navy-600 ring-navy-500/25" : "bg-slate-50 text-slate-500 ring-slate-300";
  return <span style={{ width: size, height: size }} className={`inline-flex shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ring-1 ${c}`}>{score}</span>;
}

/** Segmented toggle made of links, for server-rendered sort and view switches. */
export function Segmented({ options }: { options: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
      {options.map((o) => <Link key={o.href + o.label} href={o.href} scroll={false} className={`rounded-md px-2.5 py-1 transition ${o.active ? "bg-white text-navy-900 shadow-sm" : "text-slate-500 hover:text-navy-900"}`}>{o.label}</Link>)}
    </div>
  );
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

/** Banner at the top of each page. `children` holds an optional row of headline numbers (HeroStat). */
export function PageHeader({ title, sub, actions, icon, children }: { title: string; sub?: ReactNode; actions?: ReactNode; icon?: IconName; children?: ReactNode }) {
  return (
    <div className="hero mb-6">
      <svg className="pointer-events-none absolute -right-10 -top-16 h-72 w-72 text-gold-500/[0.12]" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="99" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="100" cy="100" r="41" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-96 items-center gap-4">
          <span className="hidden sm:inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-gold-400 ring-1 ring-white/15"><Icon name={icon ?? iconForTitle(title)} size={24} /></span>
          <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>{sub && <p className="mt-1 max-w-4xl text-sm text-white/65">{sub}</p>}</div>
        </div>
        {actions && <div className="hero-actions flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children && <div className="relative mt-5">{children}</div>}
    </div>
  );
}

/** One headline number inside a PageHeader. Links when `href` is set. */
export function HeroStat({ label, value, sub, href, icon, highlight }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; icon?: IconName; highlight?: boolean }) {
  const inner = (
    <div className={`h-full rounded-xl px-4 py-3 ring-1 transition ${highlight ? "bg-gold-500/15 ring-gold-400/40" : "bg-white/[0.06] ring-white/10"} ${href ? "hover:bg-white/[0.12]" : ""}`}>
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-white/60">{icon && <Icon name={icon} size={13} className="text-gold-400" />}{label}</div>
      <div className="mt-1 text-2xl font-semibold leading-tight tabular-nums text-white">{value}</div>
      {sub && <div className="text-[11.5px] text-white/50">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function StatusDot({ status }: { status: string | null | undefined }) {
  const c = status === "ok" || status === "connected" ? "bg-emerald-500" : status === "error" || status === "failed" ? "bg-red-500" : status === "degraded" || status === "partial" ? "bg-amber-500" : "bg-slate-300";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} />;
}
