import Link from "next/link";
import { prisma } from "@/lib/db";
import { applicationSearch, pipelineDashboard, QUIET_DAYS, SEARCH_BY, type SearchBy } from "@/lib/pipeline";
import { Card, Stat, PageHeader, Empty } from "@/components/ui";
import { StageBars, WeeklyLine } from "@/components/Charts";
import ApplicationSearch from "@/components/ApplicationSearch";
import ApplicationsTable from "@/components/ApplicationsTable";
import { STAGES, STAGE_LABEL, ago, date, dateTime } from "@/lib/format";

export const metadata = { title: "Command Center" };
const table = (q: string) => `/applications?view=table${q ? `&${q}` : ""}`;

export default async function CommandCenter({ searchParams }: { searchParams: Promise<{ by?: string; q?: string }> }) {
  const p = await searchParams;
  const by: SearchBy = p.by && p.by in SEARCH_BY ? (p.by as SearchBy) : "company";
  const q = p.q?.trim() ?? "";
  const search = applicationSearch(by, q);
  const [d, found] = await Promise.all([
    pipelineDashboard(prisma),
    search ? prisma.application.findMany({ where: search, include: { company: true, job: true, resume: { select: { name: true } } }, orderBy: [{ appliedAt: "desc" }, { updatedAt: "desc" }], take: 50 }) : null,
  ]);
  const t = d.tiles;
  // Stages in pipeline order, leaving out the ones with nothing in them.
  const stageData = STAGES.map(([k, l]) => ({ label: l, count: d.stages.find((s) => s.stage === k)?.count ?? 0, href: table(`stage=${k}`) })).filter((s) => s.count);
  const looked = by === "date" ? date(`${q}T12:00:00-07:00`) : `“${q}”`;

  return (
    <>
      <PageHeader title="Command Center" sub="Your applications at a glance. Click any number, bar or name to open the applications behind it and move them along." actions={<Link href="/applications" className="btn-ghost">All applications →</Link>} />

      <Card title="Find an application" className="mb-4">
        <ApplicationSearch by={by} q={q} />
        {found && (
          <div className="mt-4">
            <div className="mb-2 text-xs text-slate-500">{found.length === 50 ? "First 50" : found.length} application{found.length === 1 ? "" : "s"} for {SEARCH_BY[by].toLowerCase()} {looked}. Change the stage, next action or due date right here, or open one for everything else.</div>
            {found.length ? <ApplicationsTable apps={found} /> : <Empty>No application matches. {by === "date" ? "Only applications marked applied have a date applied." : "Try part of the name."}</Empty>}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
        <Stat label="Active processes" value={t.active} href={table("active=1")} sub="recruiter to final round" accent />
        <Stat label="Applied" value={t.applied} href={table("applied=1")} />
        <Stat label="Moved past applied" value={t.responseRate == null ? "—" : `${t.responseRate}%`} href={table("applied=1")} sub="of applications sent" />
        <Stat label="Interviews scheduled" value={t.interviews} href={table("interviews=1")} />
        <Stat label="Offers" value={t.offers} href={table("stage=OFFER")} />
        <Stat label="Follow-ups due" value={t.followUps} href={table("followup=1")} />
        <Stat label="Ready to apply" value={t.readyToApply} href="/apply" sub="saved, not yet sent" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Pipeline by stage" className="lg:col-span-2" action={<span className="text-xs text-slate-500">Click a bar to see those applications</span>}><StageBars data={stageData} /></Card>
        <Card title="Follow-ups & tasks due">
          {d.followUps.length + d.dueTasks.length === 0 ? <Empty>Nothing due. Follow-ups appear when a next-action date arrives or an application sits 7 days without one.</Empty> : (
            <ul className="space-y-2.5 text-sm">
              {d.followUps.map((a) => <li key={a.id}><Link href={`/applications/${a.id}`} className="font-medium hover:underline">{a.company.name}: {a.title}</Link><div className="text-xs text-slate-500">{a.nextAction || "Follow up on application"} · {a.nextActionDue ? `due ${date(a.nextActionDue)}` : `applied ${date(a.appliedAt)}`}</div></li>)}
              {d.dueTasks.map((x) => <li key={x.id}>{x.application ? <Link href={`/applications/${x.application.id}`} className="font-medium hover:underline">{x.title}</Link> : <span className="font-medium">{x.title}</span>}<div className="text-xs text-slate-500">{x.application ? `${x.application.company.name} · ` : ""}due {date(x.dueAt)}</div></li>)}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Weekly activity" className="lg:col-span-2" action={<span className="text-xs text-slate-500">Applications sent and stage moves, last 12 weeks</span>}><WeeklyLine data={d.weeks} /></Card>
        <Card title="Upcoming interviews">
          {d.upcoming.length === 0 ? <Empty>No interviews on the calendar. Add the date on an application and it shows here.</Empty> : (
            <ul className="space-y-2.5 text-sm">{d.upcoming.map((a) => <li key={a.id}><Link href={`/applications/${a.id}#interview`} className="font-medium hover:underline">{a.company.name}: {a.title}</Link><div className="text-xs text-slate-500">{dateTime(a.interviewAt)} · {STAGE_LABEL[a.stage]}</div></li>)}</ul>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Going quiet" action={<span className="text-xs text-slate-500">Applied, still open, no update in {QUIET_DAYS} days</span>}>
          {d.quiet.length === 0 ? <Empty>Every open application has moved in the last {QUIET_DAYS} days.</Empty> : (
            <ul className="space-y-2.5 text-sm">{d.quiet.map((a) => <li key={a.id}><Link href={`/applications/${a.id}`} className="font-medium hover:underline">{a.company.name}: {a.title}</Link><div className="text-xs text-slate-500">{STAGE_LABEL[a.stage]} · last update {ago(a.updatedAt)}{a.appliedAt ? ` · applied ${date(a.appliedAt)}` : ""}</div></li>)}</ul>
          )}
        </Card>
        <Card title="Recent moves" action={<span className="text-xs text-slate-500">Last 7 days</span>}>
          {d.moves.length === 0 ? <Empty>No stage changes this week.</Empty> : (
            <ul className="space-y-2.5 text-sm">{d.moves.map((m) => <li key={m.id}><Link href={`/applications/${m.applicationId}`} className="font-medium hover:underline">{m.application.company.name}: {m.application.title}</Link><div className="text-xs text-slate-500">{m.from ? `${STAGE_LABEL[m.from]} → ` : ""}{STAGE_LABEL[m.to]} · {ago(m.at)}</div></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
