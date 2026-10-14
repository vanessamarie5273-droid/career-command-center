import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Empty, StatusDot } from "@/components/ui";
import { AlertActions, BriefingButton } from "@/components/AlertWidgets";
import { dateTime } from "@/lib/format";
import type { BriefingContent } from "@/lib/briefing";

export const metadata = { title: "Alerts & Activity" };

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
  return (
    <>
      <PageHeader title="Alerts & Activity" actions={<><AlertActions /><BriefingButton /></>} />
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Alerts" className="lg:col-span-1">
          {alerts.length === 0 ? <Empty>No alerts yet. New high-scoring roles, closed jobs and feed errors appear here.</Empty> : (
            <ul className="space-y-2 text-sm">{alerts.map((a) => <li key={a.id} className={a.read ? "opacity-60" : ""}><div className="flex items-start gap-2">{!a.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-gold-500 shrink-0" />}<div>{a.link ? <Link className="font-medium hover:underline" href={a.link}>{a.title}</Link> : <span className="font-medium">{a.title}</span>}<div className="text-xs text-slate-500 whitespace-pre-wrap">{a.body}</div><div className="text-[11px] text-slate-400">{dateTime(a.createdAt)}</div></div></div></li>)}</ul>
          )}
        </Card>
        <Card title={`Morning briefing${briefing ? ` · ${dateTime(briefing.createdAt)}` : ""}`} className="lg:col-span-2" action={briefing && <span className="text-xs text-slate-500">email: {briefing.emailStatus}</span>}>
          {!b ? <Empty>No briefing generated yet. It runs automatically each morning after the job refresh, or generate one now.</Empty> : (
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="md:col-span-2"><div className="label">Based on refresh</div>{b.lastRun?.at ? `${dateTime(b.lastRun.at)} · ${b.lastRun.status} · ${b.lastRun.created} new · ${b.lastRun.closed} closed · ${b.lastRun.errors} feed errors` : "No refresh has completed"}</div>
              <div className="md:col-span-2"><div className="label">Recommended actions</div>{b.actions.length ? <ol className="list-decimal ml-5">{b.actions.map((x) => <li key={x}>{x}</li>)}</ol> : "None"}</div>
              <List title="New matching jobs (24h)" items={b.newJobs.map((j) => [`/jobs/${j.id}`, `${j.title} · ${j.company} · ${j.score ?? "—"}`])} />
              <List title="Tier 1 opportunities" items={b.tier1.map((j) => [`/jobs/${j.id}`, `${j.title} · ${j.company} · ${j.score}${j.applied ? " · applied" : ""}`])} />
              <List title="Upcoming interviews" items={b.upcomingInterviews.map((i) => [`/applications/${i.id}`, `${i.company}: ${i.title} · ${dateTime(i.at)}`])} />
              <List title="Follow-ups due" items={b.followUps.map((f) => [`/applications/${f.id}`, `${f.company}: ${f.action ?? f.title}`])} />
              <List title="Company developments" items={b.companyNews.map((n) => [n.url ?? "#", `${n.company}: ${n.headline}`])} />
              <List title="Jobs that closed" items={b.closedJobs.map((j) => [`/jobs/${j.id}`, `${j.title} · ${j.company}`])} />
            </div>
          )}
        </Card>
      </div>
      <Card title="Job feed refresh runs" className="mb-4">
        <table className="tbl"><thead><tr><th>Started</th><th>Trigger</th><th>Status</th><th>Companies</th><th>Postings read</th><th>Relevant</th><th>New</th><th>Updated</th><th>Closed</th><th>Errors</th></tr></thead>
          <tbody>{runs.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{dateTime(r.startedAt)}</td><td className="text-xs">{r.trigger}</td><td><StatusDot status={r.status} /> {r.status}</td><td>{r.companies}</td><td>{r.fetched}</td><td>{r.relevant}</td><td>{r.created}</td><td>{r.updated}</td><td>{r.closed}</td><td>{r.errors}</td></tr>)}</tbody>
        </table>
      </Card>
      <Card title={`Job history log (${evCount.toLocaleString()} events)`}>
        <form className="mb-3 flex flex-wrap gap-2" action="/alerts">
          <input name="q" defaultValue={p.q} placeholder="Search job or company" className="input max-w-xs" />
          <select name="kind" defaultValue={p.kind ?? ""} className="input w-40"><option value="">All events</option>{["discovered", "verified", "updated", "closed", "reopened", "rescored", "override"].map((k) => <option key={k}>{k}</option>)}</select>
          <button className="btn-primary">Filter</button>
        </form>
        <table className="tbl"><thead><tr><th>When</th><th>Event</th><th>Job</th><th>Detail</th></tr></thead>
          <tbody>{events.map((e) => <tr key={e.id}><td className="whitespace-nowrap text-xs">{dateTime(e.at)}</td><td className="capitalize">{e.kind}</td><td><Link className="link" href={`/jobs/${e.jobId}`}>{e.job.title}</Link> <span className="text-xs text-slate-500">{e.job.company.name}</span></td><td className="text-xs text-slate-500">{e.detail}</td></tr>)}</tbody>
        </table>
        <div className="mt-2 flex gap-2">{page > 1 && <Link className="btn-ghost" href={`/alerts?${new URLSearchParams({ ...p, page: String(page - 1) } as Record<string, string>)}`}>← Newer</Link>}{page * 100 < evCount && <Link className="btn-ghost" href={`/alerts?${new URLSearchParams({ ...p, page: String(page + 1) } as Record<string, string>)}`}>Older →</Link>}</div>
      </Card>
    </>
  );
}

function List({ title, items }: { title: string; items: [string, string][] }) {
  return <div><div className="label">{title}</div>{items.length ? <ul className="space-y-0.5">{items.slice(0, 10).map(([h, t]) => <li key={h + t}>{h.startsWith("http") ? <a className="link" href={h} target="_blank" rel="noopener noreferrer">{t}</a> : <Link className="link" href={h}>{t}</Link>}</li>)}</ul> : <span className="text-slate-400">None</span>}</div>;
}
