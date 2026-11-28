// Pieces of the daily briefing, shared by the Command Center (today) and the Briefing history page (redesign, Nov 28).
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo, ScoreBadge, Icon, type IconName } from "@/components/ui";
import { ago, titleCase } from "@/lib/format";
import type { Opportunity } from "@/lib/briefing";

export const az = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-US", { ...o, timeZone: "America/Phoenix" });
export const md = (iso: string) => az(iso, { month: "short", day: "numeric" });
export const ACTION: Record<string, string> = { Apply: "bg-gradient-to-r from-[#5D36FF] to-[#A100C2]", "Seek a referral": "bg-[#A100C2]", "Research further": "bg-amber-500", Pass: "bg-rose-600" };
export const PRI_ICON: Record<string, IconName> = { interview: "calendar", reply: "mail", followup: "send", apply: "briefcase", referral: "people" };

// Links in the stored briefing carry the address the cron knew; inside the app use paths so they always work.
export const local = (href: string) => href.replace(/^https?:\/\/[^/]+/, "") || "/";

export function Count({ n }: { n: ReactNode }) {
  return <span className="rounded-full bg-gradient-to-r from-[#5D36FF] to-[#A100C2] px-2 py-0.5 text-[13px] font-semibold tabular-nums text-white">{n}</span>;
}

export function OppCard({ o }: { o: Opportunity }) {
  const f = o.fit;
  return (
    <article className="card relative flex flex-col overflow-hidden p-4 pt-5">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5D36FF] to-[#A100C2]" />
      <div className="flex items-start gap-3">
        <Logo src={o.logo} name={o.company} size={38} />
        <div className="min-w-0 flex-1">
          <Link href={local(o.href)} className="block text-[15px] font-semibold leading-snug text-ink hover:underline">{o.title}</Link>
          <div className="text-[14px] font-medium text-ink-2">{o.company}</div>
        </div>
        <ScoreBadge score={o.score} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13.5px] text-ink-2">
        <span className="inline-flex items-center gap-1 font-semibold text-brand-700"><Icon name="dollar" size={13} />{o.pay ?? "Not published"}</span>
        <span className="inline-flex items-center gap-1"><Icon name="globe" size={13} />{o.location ?? "—"}{o.remote ? " · remote" : ""}</span>
        {o.postedAt && <span className="inline-flex items-center gap-1"><Icon name="calendar" size={13} />Posted {md(o.postedAt)}</span>}
        <span className="inline-flex items-center gap-1"><Icon name="check" size={13} />Verified {ago(o.verifiedAt)}</span>
      </div>
      <dl className="mt-3 space-y-1.5 text-[14px]">
        <Line label="Fits" tone="text-brand-700"><ul className="space-y-0.5">{f.why.map((w) => <li key={w}>{w}</li>)}</ul></Line>
        <Line label="Blocker" tone="text-rose-700">{f.blocker}</Line>
        <Line label="Lead with" tone="text-accent-600">{f.position}</Line>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1">
        {o.checks.blockers.map((b) => <Chip key={b.text} tone={b.hard ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200"}>{b.text}</Chip>)}
        {o.checks.preferred.slice(0, 3).map((t) => <Chip key={t} tone="bg-slate-50 text-ink-2 ring-slate-200">Preferred: {t}</Chip>)}
        {o.checks.met.slice(0, 4).map((t) => <Chip key={t} tone="bg-[#f1edff] text-[#4424e6] ring-[#d9d0ff]">{t}</Chip>)}
      </div>
      <div className="mt-auto flex items-start gap-2 pt-3">
        <span className={`rounded-full px-2.5 py-1 text-[13px] font-bold text-white ${ACTION[f.action]}`}>{f.action}</span>
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">{f.reason}</span>
        <a href={o.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-gold !px-3 !py-1.5 text-[13px]">Apply ↗</a>
      </div>
    </article>
  );
}

export function Line({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  return <div className="flex gap-2"><dt className={`w-[4.5rem] shrink-0 text-[12px] font-semibold leading-5 ${tone}`}>{titleCase(label)}</dt><dd className="text-ink-2">{children}</dd></div>;
}
export function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[12.5px] font-medium ring-1 ${tone}`}>{children}</span>;
}
export function More({ icon, title, count, children }: { icon: IconName; title: string; count?: number | string; children: ReactNode }) {
  return (
    <details className="card group overflow-hidden [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-[15px] font-semibold text-ink hover:bg-brand-50">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700"><Icon name={icon} size={15} /></span>{titleCase(title)}
        {count != null && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[13px] font-semibold tabular-nums text-brand-800">{count}</span>}
        <span className="ml-auto text-lg leading-none text-ink-3 transition group-open:rotate-90">›</span>
      </summary>
      <div className="max-h-[28rem] overflow-y-auto px-4 py-2">{children}</div>
    </details>
  );
}
export function ProgressRow({ p }: { p: { title: string; company: string; logo: string | null; stage: string; days: number; status: string; confirmed: boolean; basis: string; href: string } }) {
  return (
    <Link href={local(p.href)} className="flex items-center gap-2.5 border-b border-ink-line py-2.5 last:border-0 hover:bg-brand-50">
      <Logo src={p.logo} name={p.company} size={28} />
      <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-ink">{p.company} · {p.title}</span><span className="block text-[13px] leading-snug text-ink-2">{p.status}. {p.basis}</span></span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold ${p.confirmed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-ink-3"}`}>{p.confirmed ? "Confirmed" : "Unconfirmed"}</span>
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-brand-700">{p.days}d</span>
    </Link>
  );
}
export function Mini({ label, items, tone = "text-ink-2" }: { label: string; items: string[]; tone?: string }) {
  return items.length ? <div className="mt-1"><b className="text-[12px] font-semibold text-accent-600">{label}</b><ul className={`ml-4 list-disc ${tone}`}>{items.map((x) => <li key={x}>{x}</li>)}</ul></div> : null;
}
export function Table({ title, rows }: { title: string; rows: { label: string; sent: number; responded: number }[] }) {
  return (
    <table className="w-full text-[13.5px]"><thead><tr className="text-left text-[12px] font-semibold text-brand-700"><th className="py-1">{title}</th><th className="text-right">Sent</th><th className="text-right">Replied</th></tr></thead>
      <tbody>{rows.slice(0, 5).map((r) => <tr key={r.label} className="border-t border-ink-line"><td className="max-w-[12rem] truncate py-1">{r.label}</td><td className="text-right tabular-nums">{r.sent}</td><td className="text-right font-semibold tabular-nums">{r.responded}</td></tr>)}</tbody></table>
  );
}
export function None() { return <p className="py-1 text-sm text-ink-3">None.</p>; }

type V2 = NonNullable<import("@/lib/briefing").BriefingContent["v2"]>;

export function FollowUpList({ items }: { items: V2["followUps"] }) {
  if (!items.length) return <None />;
  return <>{items.map((f) => (
    <div key={f.href} className="border-b border-ink-line py-2.5 last:border-0">
      <Link href={local(f.href)} className="text-[15px] font-semibold text-ink hover:underline">{f.company} · {f.title}</Link>
      <div className="text-[13px] text-ink-3">{f.last ? `Last contact: ${f.last.who} by ${f.last.channel} on ${md(f.last.when)}. ${f.last.about}` : "No contact since you applied."}{f.due ? ` Due ${md(f.due)}.` : ""}</div>
      <p className="mt-1.5 rounded-ctl bg-brand-50 p-2.5 text-[14px] text-ink-2 ring-1 ring-brand-200"><b className="text-brand-700">Suggested message: </b>{f.suggestion}</p>
    </div>
  ))}</>;
}

export function PeopleList({ items }: { items: V2["people"] }) {
  if (!items.length) return <None />;
  return <>{items.map((p, i) => (
    <div key={i} className="border-b border-ink-line py-2.5 last:border-0">
      <a href={p.href.startsWith("http") ? p.href : local(p.href)} target={p.href.includes("linkedin") ? "_blank" : undefined} rel="noopener noreferrer" className="text-[15px] font-semibold text-ink hover:underline">{p.name}</a>
      <span className="text-[13px] text-ink-3"> · {[p.title, p.company].filter(Boolean).join(", ")} · {p.context}</span>
      <div className="text-[14px] text-ink-2">{p.reason}</div>
    </div>
  ))}</>;
}

export function InterviewList({ items }: { items: V2["interviews"] }) {
  if (!items.length) return <None />;
  return <>{items.map((iv) => (
    <div key={iv.href} className="border-b border-ink-line py-2.5 text-[14px] last:border-0">
      <Link href={local(iv.href)} className="text-[15px] font-semibold text-ink hover:underline">{iv.company} · {az(iv.at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Link>
      <div className="text-[13px] text-ink-3">{iv.title}{iv.participants.length ? ` · ${iv.participants.join(", ")}` : ""}</div>
      <Mini label="Priorities" items={iv.priorities} /><Mini label="Lead With" items={iv.accomplishments} /><Mini label="Outstanding Preparation" items={iv.prep} tone="text-amber-800" />
    </div>
  ))}</>;
}

const CHANGE_LABEL: Record<string, string> = { pay: "Compensation", requirements: "Requirements", closed: "Removed", reposted: "Reposted", other: "Updated" };
const CHANGE_TONE: Record<string, string> = { closed: "tone-bad", pay: "tone-good", reposted: "tone-progress" };
export function ChangeList({ items }: { items: V2["changes"] }) {
  if (!items.length) return <None />;
  return <>{items.map((c, i) => (
    <div key={i} className="flex items-start gap-2 border-b border-ink-line py-2.5 text-[14px] last:border-0">
      <span className={`chip mt-0.5 shrink-0 ${CHANGE_TONE[c.kind] ?? "tone-due"}`}>{CHANGE_LABEL[c.kind] ?? c.kind}</span>
      <span className="min-w-0"><Link href={local(c.href)} className="text-[15px] font-semibold text-ink hover:underline">{c.company} · {c.title}</Link><span className="block text-ink-2">{c.detail} · {md(c.at)}</span></span>
    </div>
  ))}</>;
}

export function NewsList({ items }: { items: V2["news"] }) {
  if (!items.length) return <None />;
  return <>{items.map((n, i) => (
    <div key={i} className="border-b border-ink-line py-2.5 text-[14px] last:border-0">
      <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-ink hover:underline">{n.company}: {n.headline}</a>
      <div className="text-[13px] text-ink-3">{titleCase(n.kind)} · {md(n.at)} · {n.why}</div>
    </div>
  ))}</>;
}

export function WorkingPanel({ w }: { w: V2["working"] }) {
  return <>
    {w.patterns.map((p) => <p key={p} className="py-1 text-[14px] font-medium text-brand-800">{p}</p>)}
    {w.note && <p className="py-1 text-[14px] text-ink-3">{w.note}</p>}
    <div className="mt-2 grid gap-3 sm:grid-cols-2"><Table title="Resume" rows={w.byResume} /><Table title="Channel" rows={w.byChannel} /></div>
  </>;
}

/** One opportunity as a compact row: the essentials on one line, the fit assessment behind a disclosure. */
export function OppRow({ o }: { o: Opportunity }) {
  const f = o.fit;
  return (
    <details className="group border-b border-ink-line last:border-0 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3">
        <Logo src={o.logo} name={o.company} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{o.title}</span>
          <span className="block truncate text-[13px] text-ink-3">{[o.company, o.pay ?? "Pay not published", o.location ? `${o.location}${o.remote && !/remote/i.test(o.location) ? " · remote" : ""}` : null, o.postedAt ? `Posted ${md(o.postedAt)}` : null, o.connections ? `${o.connections} connection${o.connections === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</span>
        </span>
        <span className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold text-white sm:inline ${ACTION[f.action]}`}>{f.action}</span>
        <ScoreBadge score={o.score} />
        <svg className="shrink-0 text-ink-3 transition group-open:rotate-180" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="mb-3 ml-[46px] rounded-ctl bg-brand-50 p-3">
        <dl className="space-y-1.5 text-[14px]">
          <Line label="Fits" tone="text-brand-700"><ul className="space-y-0.5">{f.why.map((w) => <li key={w}>{w}</li>)}</ul></Line>
          <Line label="Blocker" tone="text-rose-700">{f.blocker}</Line>
          <Line label="Lead with" tone="text-accent-600">{f.position}</Line>
          <Line label="Next step" tone="text-ink-2">{f.reason}</Line>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={local(o.href)} className="btn-ghost btn-sm">Review role</Link>
          <a href={o.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-gold btn-sm">Open posting ↗</a>
        </div>
      </div>
    </details>
  );
}
