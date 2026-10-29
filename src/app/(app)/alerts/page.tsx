import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Empty, StatusDot, HeroStat, Icon, ScoreBadge, type IconName } from "@/components/ui";
import { AlertActions, BriefingButton } from "@/components/AlertWidgets";
import { ago, dateTime } from "@/lib/format";
import type { BriefingContent } from "@/lib/briefing";

export const metadata = { title: "Alerts & Activity" };

const KIND: Record<string, [IconName, string]> = {
  new_high_score_job: ["spark", "bg-gold-500/15 text-gold-600"],
  job_closed: ["x", "bg-slate-100 text-slate-500"],
  follow_up_due: ["clock", "bg-amber-500/15 text-amber-600"],
  interview: ["calendar", "bg-sky-500/10 text-sky-600"],
  integration_error: ["alert", "bg-rose-500/10 text-rose-600"],
};
// "New 84-point match: <title> at <company>", as written by the job refresh.
const MATCH = /^New (\d+)-point match: (.+) at (.+)$/;

export default async function Alerts({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; page?: string }> }) {
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1);
  const evWhere: Prisma.JobEventWhereInput = { AND: [p.kind ? { kind: p.kind } : {}, p.q ? { job: { OR: [{ title: { contains: p.q, mode: "insensitive" } }, { company: { name: { contains: p.q, mode: "insensitive" } } }] } } : {}] };
  const [alerts, briefing, events, evCount, runs] = await Promise.all([
    prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.briefing.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.jobEvent.findMany({ where: evWhere, include: { job: { include: { company: { select: { name: true } } } } }, orderBy: { at: "desc" }, skip: (page - 1) * 100, take: 100 }),
    prisma.jobEvent.count({ where: evWhere }),
    prisma.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
  ]);
  const b = briefing?.content as BriefingContent | undefined;
  const unread = alerts.filter((a) => !a.read).length;
  const last = runs[0];
  const runMax = Math.max(1, ...runs.map((r) => Math.max(r.created, r.closed)));
  const logOpen = Boolean(p.q || p.kind || page > 1);
  return (
    <>
      <PageHeader title="Alerts & Activity" sub="New matches, your morning briefing, and the health of the job feeds, newest first." actions={<><AlertActions /><BriefingButton /></>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroStat label="Unread alerts" value={unread} sub={`${alerts.length} most recent shown`} icon="bell" highlight={unread > 0} />
          <HeroStat label="New matches (24h)" value={b ? b.newJobs.length : "—"} sub="from the last briefing" icon="spark" href="/jobs?sort=new" />
          <HeroStat label="Tier 1 still open" value={b ? b.tier1.length : "—"} sub="not yet applied" icon="flame" href="/jobs?tier=TIER1" />
          <HeroStat label="Last feed refresh" value={last ? <span className="inline-flex items-center gap-2 text-xl"><StatusDot status={last.status} />{last.status}</span> : "—"} sub={last ? `${ago(last.startedAt)} · ${last.created} new · ${last.closed} closed` : "No refresh yet"} icon="refresh" />
        </div>
      </PageHeader>

      <div className="mb-4 grid gap-4 lg:grid-cols-12">
        <Card title="Morning briefing" sub={briefing ? `${dateTime(briefing.createdAt)} · email: ${briefing.emailStatus}` : undefined} icon="news" tone="gold" className="lg:col-span-7">
          {!b ? <Empty>No briefing generated yet. It runs automatically each morning after the job refresh, or generate one now.</Empty> : (
            <div className="space-y-4 text-sm">
              {b.actions.length > 0 && (
                <div className="rounded-xl bg-gradient-to-br from-gold-300/25 to-gold-300/5 p-4 ring-1 ring-gold-500/25">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-600"><Icon name="flame" size={14} />Do today</div>
                  <ol className="space-y-2">{b.actions.map((x, i) => <li key={x} className="flex gap-2.5"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-semibold text-gold-300">{i + 1}</span><span className="text-navy-950">{x}</span></li>)}</ol>
                </div>
              )}
              <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
                <JobList title="New matching jobs (24h)" icon="spark" tone="text-gold-600" items={b.newJobs.map((j) => ({ href: `/jobs/${j.id}`, title: j.title, detail: j.company, score: j.score }))} />
                <JobList title="Tier 1 opportunities" icon="flame" tone="text-rose-600" items={b.tier1.map((j) => ({ href: `/jobs/${j.id}`, title: j.title, detail: `${j.company}${j.applied ? " · applied" : ""}`, score: j.score }))} />
                <JobList title="Upcoming interviews" icon="calendar" tone="text-sky-600" items={b.upcomingInterviews.map((i) => ({ href: `/applications/${i.id}`, title: `${i.company}: ${i.title}`, detail: dateTime(i.at) }))} />
                <JobList title="Follow-ups due" icon="clock" tone="text-amber-600" items={b.followUps.map((f) => ({ href: `/applications/${f.id}`, title: `${f.company}: ${f.title}`, detail: f.action ?? undefined }))} />
                <JobList title="Company developments" icon="news" tone="text-violet-600" items={b.companyNews.map((n) => ({ href: n.url ?? "#", title: n.headline, detail: n.company }))} />
                <JobList title="Jobs that closed" icon="x" tone="text-slate-500" items={b.closedJobs.map((j) => ({ href: `/jobs/${j.id}`, title: j.title, detail: j.company }))} />
              </div>
              <p className="text-xs text-slate-400">Based on refresh: {b.lastRun?.at ? `${dateTime(b.lastRun.at)} · ${b.lastRun.status} · ${b.lastRun.created} new · ${b.lastRun.closed} closed · ${b.lastRun.errors} feed errors` : "no refresh has completed"}</p>
            </div>
          )}
        </Card>

        <Card title="Alerts" sub={unread ? `${unread} unread` : "All caught up"} icon="bell" tone="navy" className="lg:col-span-5">
          {alerts.length === 0 ? <Empty>No alerts yet. New high-scoring roles, closed jobs and feed errors appear here.</Empty> : (
            <ol className="relative max-h-[640px] overflow-y-auto pr-1">
              {alerts.map((a) => {
                const [icon, tone] = KIND[a.kind] ?? ["bell", "bg-slate-100 text-slate-500"];
                const m = a.title.match(MATCH);
                const body = (
                  <div className={`flex gap-3 rounded-xl px-2 py-2.5 transition ${a.link ? "hover:bg-navy-500/[0.04]" : ""} ${a.read ? "opacity-60" : ""}`}>
                    <span className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon name={icon} size={15} />{!a.read && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gold-500 ring-2 ring-white" />}</span>
                    <div className="min-w-0 flex-1">
                      {m ? <><div className="font-medium leading-snug text-navy-950">{m[2]}</div><div className="text-xs text-slate-600">{m[3]}</div></> : <div className="font-medium leading-snug text-navy-950">{a.title}</div>}
                      {a.body && <div className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500" title={a.body}>{a.body}</div>}
                      <div className="mt-0.5 text-[11px] text-slate-400">{dateTime(a.createdAt)}</div>
                    </div>
                    {m && <ScoreBadge score={Number(m[1])} size={32} />}
                  </div>
                );
                return <li key={a.id}>{a.link ? <Link href={a.link}>{body}</Link> : body}</li>;
              })}
            </ol>
          )}
        </Card>
      </div>

      <Card title="Job feed health" sub="Last 10 refreshes, newest on the right" icon="refresh" tone="emerald" className="mb-4">
        {runs.length === 0 ? <Empty>No refresh has run yet.</Empty> : (
          <>
            <div className="flex h-28 items-end gap-2">
              {[...runs].reverse().map((r) => (
                <div key={r.id} className="group flex flex-1 flex-col items-center gap-1" title={`${dateTime(r.startedAt)} · ${r.status} · ${r.created} new · ${r.closed} closed · ${r.errors} errors`}>
                  <div className="flex h-20 w-full items-end justify-center gap-0.5">
                    <div className="w-1/3 max-w-4 rounded-t bg-gradient-to-t from-[#3b5bdb] to-[#748ffc]" style={{ height: `${Math.max(4, (r.created / runMax) * 100)}%` }} />
                    <div className="w-1/3 max-w-4 rounded-t bg-gradient-to-t from-slate-400 to-slate-300" style={{ height: `${Math.max(4, (r.closed / runMax) * 100)}%` }} />
                  </div>
                  <StatusDot status={r.status} />
                  <span className="text-[10px] text-slate-400">{new Date(r.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Phoenix" })}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[#3b5bdb]" />New roles</span><span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-slate-400" />Closed</span><span className="inline-flex items-center gap-1"><StatusDot status="ok" />ok</span><span className="inline-flex items-center gap-1"><StatusDot status="partial" />partial</span><span className="inline-flex items-center gap-1"><StatusDot status="failed" />failed</span></div>
            <details className="mt-3 group">
              <summary className="cursor-pointer text-xs font-medium text-navy-600 hover:text-navy-900">Show run details</summary>
              <div className="mt-2 overflow-x-auto"><table className="tbl"><thead><tr><th>Started</th><th>Trigger</th><th>Status</th><th>Companies</th><th>Postings read</th><th>Relevant</th><th>New</th><th>Updated</th><th>Closed</th><th>Errors</th></tr></thead>
                <tbody>{runs.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{dateTime(r.startedAt)}</td><td className="text-xs">{r.trigger}</td><td><StatusDot status={r.status} /> {r.status}</td><td>{r.companies}</td><td>{r.fetched}</td><td>{r.relevant}</td><td>{r.created}</td><td>{r.updated}</td><td>{r.closed}</td><td>{r.errors}</td></tr>)}</tbody>
              </table></div>
            </details>
          </>
        )}
      </Card>

      <details className="card group" open={logOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <span className="flex items-center gap-2.5"><span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-slate-500/10 text-slate-500"><Icon name="history" size={16} /></span><span><span className="block text-[15px] font-semibold text-navy-950">Job history log</span><span className="block text-xs text-slate-500">{evCount.toLocaleString()} events: every role found, updated, rescored or closed</span></span></span>
          <span className="text-xs font-medium text-navy-600 group-open:hidden">Show log</span><span className="hidden text-xs font-medium text-navy-600 group-open:inline">Hide log</span>
        </summary>
        <div className="px-5 pb-5">
          <form className="mb-3 flex flex-wrap gap-2" action="/alerts">
            <input name="q" defaultValue={p.q} placeholder="Search job or company" className="input max-w-xs" />
            <select name="kind" defaultValue={p.kind ?? ""} className="input w-40"><option value="">All events</option>{["discovered", "verified", "updated", "closed", "reopened", "rescored", "override"].map((k) => <option key={k}>{k}</option>)}</select>
            <button className="btn-primary">Filter</button>
          </form>
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>When</th><th>Event</th><th>Job</th><th>Detail</th></tr></thead>
            <tbody>{events.map((e) => <tr key={e.id}><td className="whitespace-nowrap text-xs">{dateTime(e.at)}</td><td><span className={`chip capitalize ${e.kind === "closed" ? "bg-slate-100 text-slate-600" : e.kind === "discovered" ? "bg-emerald-50 text-emerald-700" : "bg-navy-500/10 text-navy-700"}`}>{e.kind}</span></td><td><Link className="link" href={`/jobs/${e.jobId}`}>{e.job.title}</Link> <span className="text-xs text-slate-500">{e.job.company.name}</span></td><td className="text-xs text-slate-500">{e.detail}</td></tr>)}</tbody>
          </table></div>
          <div className="mt-2 flex gap-2">{page > 1 && <Link className="btn-ghost" href={`/alerts?${new URLSearchParams({ ...p, page: String(page - 1) } as Record<string, string>)}`}>← Newer</Link>}{page * 100 < evCount && <Link className="btn-ghost" href={`/alerts?${new URLSearchParams({ ...p, page: String(page + 1) } as Record<string, string>)}`}>Older →</Link>}</div>
        </div>
      </details>
    </>
  );
}

function JobList({ title, icon, tone, items }: { title: string; icon: IconName; tone: string; items: { href: string; title: string; detail?: string; score?: number | null }[] }) {
  return (
    <div>
      <div className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${tone}`}><Icon name={icon} size={14} />{title}<span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[11px] font-medium tabular-nums text-slate-500">{items.length}</span></div>
      {items.length ? (
        <ul className="space-y-0.5">{items.slice(0, 6).map((it) => {
          const inner = <><span className="min-w-0 flex-1"><span className="block truncate font-medium text-navy-950">{it.title}</span>{it.detail && <span className="block truncate text-xs text-slate-500">{it.detail}</span>}</span>{it.score !== undefined && <ScoreBadge score={it.score} size={28} />}</>;
          return <li key={it.href + it.title}>{it.href.startsWith("http") ? <a className="row-link !py-1.5" href={it.href} target="_blank" rel="noopener noreferrer">{inner}</a> : <Link className="row-link !py-1.5" href={it.href}>{inner}</Link>}</li>;
        })}{items.length > 6 && <li className="px-0 pt-1 text-xs text-slate-400">+{items.length - 6} more</li>}</ul>
      ) : <span className="text-xs text-slate-400">None</span>}
    </div>
  );
}
