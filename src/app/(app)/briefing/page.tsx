import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { PageHeader, HeroStat, Card, Section, Logo, ScoreBadge, Icon, Empty, type IconName } from "@/components/ui";
import { BriefingButton } from "@/components/AlertWidgets";
import { PipelineDonut, ReplyBars } from "@/components/BriefingCharts";
import { originFrom, rememberAppUrl } from "@/lib/appUrl";
import { ago, titleCase } from "@/lib/format";
import type { BriefingContent, Opportunity } from "@/lib/briefing";

export const metadata = { title: "Briefing" };
export const dynamic = "force-dynamic";

const az = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-US", { ...o, timeZone: "America/Phoenix" });
const md = (iso: string) => az(iso, { month: "short", day: "numeric" });
const ACTION: Record<string, string> = { Apply: "bg-gradient-to-r from-[#5D36FF] to-[#A100C2]", "Seek a referral": "bg-[#A100C2]", "Research further": "bg-amber-500", Pass: "bg-rose-600" };
const PRI_ICON: Record<string, IconName> = { interview: "calendar", reply: "mail", followup: "send", apply: "briefcase", referral: "people" };

// Links in the stored briefing carry the address the cron knew; inside the app use paths so they always work.
const local = (href: string) => href.replace(/^https?:\/\/[^/]+/, "") || "/";

export default async function Briefing() {
  const h = await headers();
  await rememberAppUrl(prisma, originFrom(h.get("x-forwarded-host") || h.get("host"), h.get("x-forwarded-proto")));
  const row = await prisma.briefing.findFirst({ orderBy: { createdAt: "desc" } });
  const b = row?.content as BriefingContent | undefined;
  const v = b?.v2;
  if (!b || !v) return (<><PageHeader title="Briefing" actions={<BriefingButton />} /><Empty>Generate today&apos;s briefing to see it here.</Empty></>);
  const s = v.stats;
  return (
    <>
      <PageHeader title={`Briefing · ${az(b.generatedAt, { weekday: "long", month: "short", day: "numeric" })}`} actions={<BriefingButton />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <HeroStat label="Active" value={s.active} icon="board" href="/applications" />
          <HeroStat label="Waiting" value={s.waiting} icon="clock" />
          <HeroStat label="Interviews · 7d" value={s.interviews} icon="calendar" highlight={s.interviews > 0} />
          <HeroStat label="Reply rate" value={s.responseRate == null ? "—" : `${s.responseRate}%`} icon="trend" />
          <HeroStat label={`New ${v.minScore}+`} value={s.strongNew} icon="spark" highlight={s.strongNew > 0} href="/jobs?sort=new" />
          <HeroStat label="Verified" value={<span className="text-xl">{b.lastRun?.at ? ago(b.lastRun.at) : "—"}</span>} icon="refresh" />
        </div>
      </PageHeader>

      <div className="grid gap-3 xl:grid-cols-12">
        <Card title="Today's top three" icon="flame" dark className="xl:col-span-6">
          {v.priorities.length ? (
            <ol className="grid gap-2">
              {v.priorities.map((p, i) => (
                <li key={p.title}><Link href={local(p.href)} className="flex gap-3 rounded-xl bg-white/10 p-3 ring-1 ring-white/20 transition hover:bg-white/[0.18]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-[#5D36FF]">{i + 1}</span>
                  <span className="min-w-0"><span className="flex items-center gap-1.5 text-[15px] font-semibold text-white"><Icon name={PRI_ICON[p.kind]} size={15} className="text-[#f6d0f2]" />{p.title}</span><span className="block text-[14px] text-white/75">{p.reason}</span></span>
                </Link></li>
              ))}
            </ol>
          ) : <p className="text-sm text-white/75">Nothing pressing.</p>}
        </Card>
        <Card title="Pipeline" icon="pie" className="xl:col-span-3">
          {s.pipeline.length ? <PipelineDonut data={s.pipeline} /> : <p className="text-sm text-slate-500">No active applications.</p>}
        </Card>
        <Card title="Replies by role" icon="chart" tone="gold" className="xl:col-span-3" action={<Count n={`${v.working.responded}/${v.working.sent}`} />}>
          {v.working.byFamily.length ? <ReplyBars data={v.working.byFamily} /> : <p className="text-sm text-slate-500">No applications yet.</p>}
        </Card>
      </div>

      {v.urgent.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {v.urgent.map((u) => <Link key={u.text} href={local(u.href)} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-semibold ring-1 ${u.tone === "bad" ? "bg-rose-50 text-rose-700 ring-rose-200" : u.tone === "good" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-sky-200"}`}><span className="h-2 w-2 rounded-full bg-current" />{u.text}</Link>)}
        </div>
      )}

      <Section className="mt-4" title={v.noStrongMatches ? `No new ${v.minScore}+ matches today${v.opportunities.length ? " · best still open" : ""}` : "Best new opportunities"} action={<Count n={v.opportunities.length} />}>
        {v.opportunities.length ? <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{v.opportunities.map((o) => <OppCard key={o.id} o={o} />)}</div> : <Empty>No open role scores {v.minScore}+ right now.</Empty>}
      </Section>

      <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <More icon="arrows" title="Application progress" count={v.progress.moved.length + v.progress.needsAction.length}>
          {[...v.progress.moved, ...v.progress.needsAction].map((p, i) => <ProgressRow key={i} p={p} />)}
          {!v.progress.moved.length && !v.progress.needsAction.length && <None />}
        </More>
        <More icon="clock" title="Waiting on a reply" count={v.progress.waiting.length}>
          {v.progress.waiting.map((p, i) => <ProgressRow key={i} p={p} />)}
          {!v.progress.waiting.length && <None />}
        </More>
        <More icon="send" title="Follow-ups due" count={v.followUps.length}>
          {v.followUps.map((f) => (
            <div key={f.href} className="border-b border-slate-100 py-2.5 last:border-0">
              <Link href={local(f.href)} className="text-[15px] font-semibold text-navy-950 hover:underline">{f.company} · {f.title}</Link>
              <div className="text-[13px] text-slate-500">{f.last ? `Last contact: ${f.last.who} by ${f.last.channel} on ${md(f.last.when)}. ${f.last.about}` : "No contact since you applied."}{f.due ? ` Due ${md(f.due)}.` : ""}</div>
              <p className="mt-1.5 rounded-lg bg-[#f1edff] p-2.5 text-[14px] text-slate-800 ring-1 ring-[#d9d0ff]"><b className="text-[#5D36FF]">Suggested message: </b>{f.suggestion}</p>
            </div>
          ))}
          {!v.followUps.length && <None />}
        </More>
        <More icon="people" title="People to contact" count={v.people.length}>
          {v.people.map((p, i) => (
            <div key={i} className="border-b border-slate-100 py-2.5 last:border-0">
              <a href={p.href.startsWith("http") ? p.href : local(p.href)} target={p.href.includes("linkedin") ? "_blank" : undefined} rel="noopener noreferrer" className="text-[15px] font-semibold text-navy-950 hover:underline">{p.name}</a>
              <span className="text-[13px] text-slate-500"> · {[p.title, p.company].filter(Boolean).join(", ")} · {p.context}</span>
              <div className="text-[14px] text-slate-700">{p.reason}</div>
            </div>
          ))}
          {!v.people.length && <None />}
        </More>
        <More icon="calendar" title="Upcoming interviews" count={v.interviews.length}>
          {v.interviews.map((iv) => (
            <div key={iv.href} className="border-b border-slate-100 py-2.5 text-[14px] last:border-0">
              <Link href={local(iv.href)} className="text-[15px] font-semibold text-navy-950 hover:underline">{iv.company} · {az(iv.at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Link>
              <div className="text-[13px] text-slate-500">{iv.title} · {iv.participants.join(", ")}</div>
              <Mini label="Priorities" items={iv.priorities} /><Mini label="Lead With" items={iv.accomplishments} /><Mini label="Outstanding Preparation" items={iv.prep} tone="text-amber-700" />
            </div>
          ))}
          {!v.interviews.length && <None />}
        </More>
        <More icon="history" title="Changes to tracked jobs" count={v.changes.length}>
          {v.changes.map((c, i) => (
            <div key={i} className="flex items-start gap-2 border-b border-slate-100 py-2.5 text-[14px] last:border-0">
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold capitalize ${c.kind === "closed" ? "bg-rose-50 text-rose-700" : c.kind === "pay" ? "bg-emerald-50 text-emerald-700" : c.kind === "reposted" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>{({ pay: "Compensation", requirements: "Requirements", closed: "Removed", reposted: "Reposted", other: "Updated" } as Record<string, string>)[c.kind] ?? c.kind}</span>
              <span className="min-w-0"><Link href={local(c.href)} className="text-[15px] font-semibold text-navy-950 hover:underline">{c.company} · {c.title}</Link><span className="block text-slate-600">{c.detail} · {md(c.at)}</span></span>
            </div>
          ))}
          {!v.changes.length && <None />}
        </More>
        <More icon="news" title="Company developments" count={v.news.length}>
          {v.news.map((n, i) => (
            <div key={i} className="border-b border-slate-100 py-2.5 text-[14px] last:border-0">
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-navy-950 hover:underline">{n.company}: {n.headline}</a>
              <div className="text-[13px] text-slate-500">{titleCase(n.kind)} · {md(n.at)} · {n.why}</div>
            </div>
          ))}
          {!v.news.length && <None />}
        </More>
        <More icon="trend" title="What's working" count={v.working.patterns.length || undefined}>
          {v.working.patterns.map((p) => <p key={p} className="py-1 text-[14px] font-medium text-[#4424e6]">{p}</p>)}
          {v.working.note && <p className="py-1 text-[14px] text-slate-500">{v.working.note}</p>}
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Table title="Resume" rows={v.working.byResume} /><Table title="Channel" rows={v.working.byChannel} />
          </div>
        </More>
      </div>
    </>
  );
}

function Count({ n }: { n: ReactNode }) {
  return <span className="rounded-full bg-gradient-to-r from-[#5D36FF] to-[#A100C2] px-2 py-0.5 text-[13px] font-semibold tabular-nums text-white">{n}</span>;
}

function OppCard({ o }: { o: Opportunity }) {
  const f = o.fit;
  return (
    <article className="card relative flex flex-col overflow-hidden p-4 pt-5">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5D36FF] to-[#A100C2]" />
      <div className="flex items-start gap-3">
        <Logo src={o.logo} name={o.company} size={38} />
        <div className="min-w-0 flex-1">
          <Link href={local(o.href)} className="block text-[15px] font-semibold leading-snug text-navy-950 hover:underline">{o.title}</Link>
          <div className="text-[14px] font-medium text-slate-600">{o.company}</div>
        </div>
        <ScoreBadge score={o.score} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13.5px] text-slate-600">
        <span className="inline-flex items-center gap-1 font-semibold text-[#5D36FF]"><Icon name="dollar" size={13} />{o.pay ?? "Not published"}</span>
        <span className="inline-flex items-center gap-1"><Icon name="globe" size={13} />{o.location ?? "—"}{o.remote ? " · remote" : ""}</span>
        {o.postedAt && <span className="inline-flex items-center gap-1"><Icon name="calendar" size={13} />Posted {md(o.postedAt)}</span>}
        <span className="inline-flex items-center gap-1"><Icon name="check" size={13} />Verified {ago(o.verifiedAt)}</span>
      </div>
      <dl className="mt-3 space-y-1.5 text-[14px]">
        <Line label="Fits" tone="text-[#5D36FF]"><ul className="space-y-0.5">{f.why.map((w) => <li key={w}>{w}</li>)}</ul></Line>
        <Line label="Blocker" tone="text-rose-700">{f.blocker}</Line>
        <Line label="Lead with" tone="text-[#A100C2]">{f.position}</Line>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1">
        {o.checks.blockers.map((b) => <Chip key={b.text} tone={b.hard ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200"}>{b.text}</Chip>)}
        {o.checks.preferred.slice(0, 3).map((t) => <Chip key={t} tone="bg-slate-50 text-slate-600 ring-slate-200">Preferred: {t}</Chip>)}
        {o.checks.met.slice(0, 4).map((t) => <Chip key={t} tone="bg-[#f1edff] text-[#4424e6] ring-[#d9d0ff]">{t}</Chip>)}
      </div>
      <div className="mt-auto flex items-start gap-2 pt-3">
        <span className={`rounded-full px-2.5 py-1 text-[13px] font-bold text-white ${ACTION[f.action]}`}>{f.action}</span>
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-slate-600">{f.reason}</span>
        <a href={o.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-gold !px-3 !py-1.5 text-[13px]">Apply ↗</a>
      </div>
    </article>
  );
}

function Line({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  return <div className="flex gap-2"><dt className={`w-[4.5rem] shrink-0 text-[12px] font-semibold leading-5 ${tone}`}>{titleCase(label)}</dt><dd className="text-slate-700">{children}</dd></div>;
}
function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[12.5px] font-medium ring-1 ${tone}`}>{children}</span>;
}
function More({ icon, title, count, children }: { icon: IconName; title: string; count?: number; children: ReactNode }) {
  return (
    <details className="card group overflow-hidden [&_summary::-webkit-details-marker]:hidden">
      <summary className="banner flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-[15px] font-semibold text-white shadow-none">
        <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25"><Icon name={icon} size={14} /></span>{titleCase(title)}
        {count != null && <span className="rounded-full bg-white px-2 py-0.5 text-[13px] font-semibold tabular-nums text-[#5D36FF]">{count}</span>}
        <span className="ml-auto text-lg leading-none text-white/80 transition group-open:rotate-90">›</span>
      </summary>
      <div className="max-h-[28rem] overflow-y-auto px-4 py-2">{children}</div>
    </details>
  );
}
function ProgressRow({ p }: { p: { title: string; company: string; logo: string | null; stage: string; days: number; status: string; confirmed: boolean; basis: string; href: string } }) {
  return (
    <Link href={local(p.href)} className="flex items-center gap-2.5 border-b border-slate-100 py-2.5 last:border-0 hover:bg-slate-50">
      <Logo src={p.logo} name={p.company} size={28} />
      <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-navy-950">{p.company} · {p.title}</span><span className="block text-[13px] leading-snug text-slate-600">{p.status}. {p.basis}</span></span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold ${p.confirmed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{p.confirmed ? "Confirmed" : "Unconfirmed"}</span>
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-[#5D36FF]">{p.days}d</span>
    </Link>
  );
}
function Mini({ label, items, tone = "text-slate-700" }: { label: string; items: string[]; tone?: string }) {
  return items.length ? <div className="mt-1"><b className="text-[12px] font-semibold text-[#A100C2]">{label}</b><ul className={`ml-4 list-disc ${tone}`}>{items.map((x) => <li key={x}>{x}</li>)}</ul></div> : null;
}
function Table({ title, rows }: { title: string; rows: { label: string; sent: number; responded: number }[] }) {
  return (
    <table className="w-full text-[13.5px]"><thead><tr className="text-left text-[12px] font-semibold text-[#5D36FF]"><th className="py-1">{title}</th><th className="text-right">Sent</th><th className="text-right">Replied</th></tr></thead>
      <tbody>{rows.slice(0, 5).map((r) => <tr key={r.label} className="border-t border-slate-100"><td className="max-w-[12rem] truncate py-1">{r.label}</td><td className="text-right tabular-nums">{r.sent}</td><td className="text-right font-semibold tabular-nums">{r.responded}</td></tr>)}</tbody></table>
  );
}
function None() { return <p className="py-1 text-sm text-slate-500">None.</p>; }
