import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Empty, StatusDot, HeroStat, Icon, Logo, ScoreBadge, type IconName } from "@/components/ui";
import { AlertActions, BriefingButton } from "@/components/AlertWidgets";
import { ago, dateTime } from "@/lib/format";
import type { BriefingContent } from "@/lib/briefing";

export const metadata = { title: "Alerts" };

const TZ = "America/Phoenix";
const KIND: Record<string, [IconName, string]> = {
  new_high_score_job: ["spark", "bg-gold-500/15 text-gold-600"],
  job_closed: ["x", "bg-slate-100 text-slate-500"],
  follow_up_due: ["clock", "bg-amber-500/15 text-amber-600"],
  interview: ["calendar", "bg-violet-500/10 text-violet-600"],
  integration_error: ["alert", "bg-rose-500/10 text-rose-600"],
  email_update: ["mail", "bg-sky-500/10 text-sky-600"],
};
// Filter chips: which alert kinds each one shows.
const TYPES: Record<string, { label: string; kinds: string[] }> = {
  matches: { label: "Matches", kinds: ["new_high_score_job"] },
  email: { label: "Email", kinds: ["email_update"] },
  todo: { label: "To Do", kinds: ["follow_up_due", "interview"] },
  closed: { label: "Closed", kinds: ["job_closed"] },
  errors: { label: "Errors", kinds: ["integration_error"] },
};
// "New 84-point match: <title> at <company>", as written by the job refresh.
const MATCH = /^New (\d+)-point match: (.+) at (.+)$/;

export default async function Alerts({ searchParams }: { searchParams: Promise<{ type?: string; kind?: string; q?: string; page?: string }> }) {
  const p = await searchParams;
  const type = p.type && TYPES[p.type] ? p.type : null;
  const page = Math.max(1, Number(p.page) || 1);
  const evWhere: Prisma.JobEventWhereInput = { AND: [p.kind ? { kind: p.kind } : {}, p.q ? { job: { OR: [{ title: { contains: p.q, mode: "insensitive" } }, { company: { name: { contains: p.q, mode: "insensitive" } } }] } } : {}] };
  const [alerts, byKind, unread, briefing, events, evCount, runs] = await Promise.all([
    prisma.alert.findMany({ where: type ? { kind: { in: TYPES[type].kinds } } : {}, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.alert.groupBy({ by: ["kind"], _count: true }),
    prisma.alert.count({ where: { read: false } }),
    prisma.briefing.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.jobEvent.findMany({ where: evWhere, include: { job: { include: { company: { select: { name: true } } } } }, orderBy: { at: "desc" }, skip: (page - 1) * 100, take: 100 }),
    prisma.jobEvent.count({ where: evWhere }),
    prisma.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 14 }),
  ]);
  const b = briefing?.content as BriefingContent | undefined;
  const last = runs[0];

  // Company logos for each alert, from the job or application it links to.
  const idsFrom = (prefix: string) => alerts.map((a) => a.link?.match(new RegExp(`^/${prefix}/([^/?#]+)`))?.[1]).filter((x): x is string => !!x);
  const tierIds = (b?.tier1 ?? []).map((j) => j.id);
  const [jobs, apps] = await Promise.all([
    prisma.job.findMany({ where: { id: { in: [...idsFrom("jobs"), ...tierIds] } }, select: { id: true, company: { select: { name: true, logoUrl: true } } } }),
    prisma.application.findMany({ where: { id: { in: idsFrom("applications") } }, select: { id: true, company: { select: { name: true, logoUrl: true } } } }),
  ]);
  const logoFor = (link: string | null) => {
    const j = link?.match(/^\/jobs\/([^/?#]+)/)?.[1], a = link?.match(/^\/applications\/([^/?#]+)/)?.[1];
    return (j && jobs.find((x) => x.id === j)?.company) || (a && apps.find((x) => x.id === a)?.company) || null;
  };
  const count = (kinds: string[]) => byKind.filter((k) => kinds.includes(k.kind)).reduce((n, k) => n + k._count, 0);
  const total = byKind.reduce((n, k) => n + k._count, 0);

  // Group alerts by day, newest first.
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const today = dayKey(new Date()), yesterday = dayKey(new Date(Date.now() - 86400_000));
  const days: { label: string; items: typeof alerts }[] = [];
  for (const a of alerts) {
    const k = dayKey(a.createdAt);
    const label = k === today ? "Today" : k === yesterday ? "Yesterday" : a.createdAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
    if (days.at(-1)?.label !== label) days.push({ label, items: [] });
    days.at(-1)!.items.push(a);
  }
  const runMax = Math.max(1, ...runs.map((r) => Math.max(r.created, r.closed)));

  return (
    <>
      <PageHeader title="Alerts" actions={<><AlertActions /><BriefingButton /></>}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <HeroStat label="Unread" value={unread} icon="bell" highlight={unread > 0} />
          <HeroStat label="New Matches Today" value={b ? b.newJobs.length : "—"} icon="spark" href="/jobs?sort=new" />
          <HeroStat label="Tier 1 open" value={b ? b.tier1.length : "—"} icon="flame" href="/jobs?tier=TIER1" />
          <HeroStat label="Job feeds" value={last ? <span className="inline-flex items-center gap-2"><StatusDot status={last.status} />{ago(last.startedAt)}</span> : "—"} icon="refresh" />
        </div>
      </PageHeader>

      <div className="mb-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-12">
        <Card title="Feed" icon="bell" className="xl:col-span-8">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Chip href="/alerts" on={!type} label="All" n={total} />
            {Object.entries(TYPES).map(([k, t]) => { const n = count(t.kinds); return n || type === k ? <Chip key={k} href={`/alerts?type=${k}`} on={type === k} label={t.label} n={n} /> : null; })}
          </div>
          {alerts.length === 0 ? <Empty>Nothing here yet.</Empty> : days.map((d) => (
            <div key={d.label}>
              <div className="sticky top-14 z-[1] -mx-1 mb-1 mt-3 bg-white/95 px-1 py-1 text-[13px] font-semibold text-navy-950 first:mt-0">{d.label}</div>
              <ul className="space-y-0.5">{d.items.map((a) => <AlertRow key={a.id} a={a} company={logoFor(a.link)} />)}</ul>
            </div>
          ))}
        </Card>

        <div className="flex flex-col gap-3 xl:col-span-4">
          {b && b.actions.length > 0 && (
            <Card title="Do Today" icon="flame" dark action={<Link className="link text-xs" href="/briefing">Full briefing →</Link>}>
              <ol className="space-y-2">{b.actions.map((x, i) => <li key={x} className="flex gap-2.5 text-[13.5px] leading-snug text-white/95"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#5D36FF]">{i + 1}</span><span>{x}</span></li>)}</ol>
            </Card>
          )}
          {b && b.tier1.length > 0 && (
            <Card title="Tier 1 Open" icon="trophy" tone="gold" action={<Link className="link text-xs" href="/jobs?tier=TIER1">All {b.tier1.length} →</Link>}>
              <ul className="space-y-0.5">{b.tier1.slice(0, 6).map((j) => {
                const c = jobs.find((x) => x.id === j.id)?.company;
                return (
                  <li key={j.id}><Link href={`/jobs/${j.id}`} className="row-link">
                    <Logo src={c?.logoUrl} name={j.company} size={30} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium text-navy-950">{j.title}</span><span className="block truncate text-xs text-slate-500">{j.company}</span></span>
                    <ScoreBadge score={j.score} size={32} />
                  </Link></li>
                );
              })}</ul>
            </Card>
          )}
          <Card title="Job Feeds" icon="refresh" tone="emerald">
            {runs.length === 0 ? <Empty>No refresh yet.</Empty> : (
              <div className="flex h-28 items-end gap-1.5">
                {[...runs].reverse().map((r) => (
                  <div key={r.id} className="flex flex-1 flex-col items-center gap-1" title={`${dateTime(r.startedAt)} · ${r.status} · ${r.created} new · ${r.closed} closed · ${r.errors} errors`}>
                    <div className="flex h-20 w-full items-end justify-center gap-0.5">
                      <div className="w-1/2 max-w-3 rounded-t bg-gradient-to-t from-[#5D36FF] to-[#9D85FF]" style={{ height: `${Math.max(4, (r.created / runMax) * 100)}%` }} />
                      <div className="w-1/2 max-w-3 rounded-t bg-gradient-to-t from-slate-400 to-slate-300" style={{ height: `${Math.max(4, (r.closed / runMax) * 100)}%` }} />
                    </div>
                    <StatusDot status={r.status} />
                  </div>
                ))}
              </div>
            )}
            {runs.length > 0 && <div className="mt-2 flex gap-3 text-[11.5px] text-slate-500"><span className="inline-flex items-center gap-1"><span className="h-2 w-2.5 rounded-sm bg-[#5D36FF]" />New</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2.5 rounded-sm bg-slate-400" />Closed</span></div>}
          </Card>
        </div>
      </div>

      <details className="card group" open={Boolean(p.q || p.kind || page > 1)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5"><span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-slate-500/10 text-slate-500"><Icon name="history" size={16} /></span><span className="text-[16.5px] font-semibold text-navy-950">Job History</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-slate-500">{evCount.toLocaleString()}</span></span>
          <svg className="text-slate-400 transition group-open:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
        </summary>
        <div className="px-4 pb-4">
          <form className="mb-3 flex flex-wrap gap-2" action="/alerts">
            <input name="q" defaultValue={p.q} placeholder="Job or company" className="input max-w-xs" />
            <select name="kind" defaultValue={p.kind ?? ""} className="input w-40" aria-label="Event"><option value="">All events</option>{["discovered", "verified", "updated", "closed", "reopened", "rescored", "override"].map((k) => <option key={k}>{k}</option>)}</select>
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

function Chip({ href, on, label, n }: { href: string; on: boolean; label: string; n: number }) {
  return <Link href={href} scroll={false} className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition ${on ? "bg-navy-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}<span className={`ml-1.5 tabular-nums ${on ? "text-gold-300" : "text-slate-400"}`}>{n}</span></Link>;
}

/** One alert: company logo (or the alert's icon), who and what in one line, the email or detail underneath, and a score or time on the right. */
function AlertRow({ a, company }: { a: { id: string; kind: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: Date }; company: { name: string; logoUrl: string | null } | null }) {
  const [icon, tone] = KIND[a.kind] ?? ["bell", "bg-slate-100 text-slate-500"];
  const m = a.title.match(MATCH);
  const split = a.title.match(/^([^:]{2,60}):\s+(.+)$/);
  const who = m ? m[3] : split ? split[1] : null;
  const what = m ? m[2] : split ? split[2] : a.title;
  const inner = (
    <>
      <span className="relative shrink-0">
        {company ? <Logo src={company.logoUrl} name={company.name} size={32} /> : <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}><Icon name={icon} size={16} /></span>}
        {company && <span className={`absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white ${tone}`}><Icon name={icon} size={10} stroke={2.4} /></span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-navy-950">{who && <b className="font-semibold">{who} </b>}<span className={who ? "text-slate-700" : "font-medium"}>{what}</span></span>
        {a.body && !m && <span className="block truncate text-xs text-slate-500" title={a.body}>{a.body.split("\n")[0]}</span>}
      </span>
      {m ? <ScoreBadge score={Number(m[1])} size={32} /> : <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">{a.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}</span>}
      {!a.read && <span className="h-2 w-2 shrink-0 rounded-full bg-gold-500" aria-label="Unread" />}
    </>
  );
  return <li className={a.read ? "opacity-70" : ""}>{a.link ? <Link href={a.link} className="row-link">{inner}</Link> : <div className="row-link">{inner}</div>}</li>;
}
