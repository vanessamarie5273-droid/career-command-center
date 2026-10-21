import Link from "next/link";
import { prisma } from "@/lib/db";
import { chartData, dashboardMetrics, followUpWhere } from "@/lib/queries";
import { Card, Stat, PageHeader, Empty, StatusDot } from "@/components/ui";
import { StageBars, PipelineBars, IndustryBars, CompBars, WeeklyLine } from "@/components/Charts";
import { STAGES, ago, date } from "@/lib/format";
import RefreshButton from "@/components/RefreshButton";
import JobsTable from "@/components/JobsTable";
import { jobOrder, jobWhere } from "@/lib/jobFilters";
import { JOB_ROW_INCLUDE, toRow } from "@/lib/jobRows";
import { companyCap, withinCap } from "@/lib/companyCap";

export const metadata = { title: "Command Center" };
const FEED_ROWS = 50;

export default async function CommandCenter() {
  const now = new Date();
  const cap = await companyCap(prisma);
  const [m, charts, lastRun] = await Promise.all([dashboardMetrics(now, cap.ids), chartData(now), prisma.ingestionRun.findFirst({ orderBy: { startedAt: "desc" } })]);
  const feedWhere = { AND: [jobWhere({}), withinCap(cap.ids)] };
  const [feedTotal, feedJobs] = await Promise.all([
    prisma.job.count({ where: feedWhere }),
    prisma.job.findMany({ where: feedWhere, orderBy: jobOrder({}), take: FEED_ROWS, include: JOB_ROW_INCLUDE }),
  ]);
  const followUps = await prisma.application.findMany({ where: followUpWhere(now), include: { company: true }, orderBy: { nextActionDue: "asc" }, take: 6 });
  const tasks = await prisma.task.findMany({ where: { done: false, dueAt: { lte: new Date(now.getTime() + 86400_000) } }, include: { application: { include: { company: true } } }, orderBy: { dueAt: "asc" }, take: 6 });
  const stageData = STAGES.map(([k, l]) => ({ label: l, count: charts.stages.find((s) => s.stage === k)?.count ?? 0 }));

  return (
    <>
      <PageHeader
        title="Command Center"
        sub={<span className="inline-flex items-center gap-2"><StatusDot status={lastRun?.status} />Job feeds last refreshed {lastRun?.finishedAt ? `${ago(lastRun.finishedAt)} (${lastRun.status}, ${lastRun.created} new, ${lastRun.closed} closed, ${lastRun.errors} feed errors)` : lastRun ? "— refresh in progress" : "— never. Run the first refresh to load live openings."}</span>}
        actions={<><RefreshButton /><Link href="/assistant" className="btn-ghost">Ask the assistant</Link></>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-3 mb-6">
        <Stat label="Companies monitored" value={m.companies} href="/companies" />
        <Stat label="Active matching roles" value={m.matching} href="/jobs" />
        <Stat label="New today" value={m.newToday} href="/jobs?sort=new" />
        <Stat label="Tier 1 roles" value={m.tier1} href="/jobs?tier=TIER1" accent />
        <Stat label="Applied" value={m.applied} href="/applications?view=table&applied=1" />
        <Stat label="Interviews scheduled" value={m.interviewsScheduled} href="/applications?view=table&interviews=1" />
        <Stat label="Active processes" value={m.activeProcesses} href="/applications" />
        <Stat label="Offers" value={m.offers} href="/applications?view=table&stage=OFFER" />
        <Stat label="Resumes" value={m.resumes} href="/documents" sub="unique files" />
        <Stat label="Awaiting follow-up" value={m.followUps} href="/applications?view=table&followup=1" />
        <Stat label="No suitable opening" value={m.companiesWithoutSuitable} href="/companies?openings=none" sub="companies to monitor" />
        <Stat label="Closed (7 days)" value={m.recentlyClosed} href="/alerts?kind=closed" />
        <Stat label="Not a fit" value={m.notAFit} href="/jobs?category=DISMISSED" sub="removed from feeds" />
        <Stat label="Duplicates" value={m.duplicates} href="/jobs?category=DUPLICATE" sub="removed from feeds" />
      </div>

      <Card title="Your job feed" className="mb-4" action={<Link href="/jobs" className="link text-xs">{feedTotal > FEED_ROWS ? `All ${feedTotal} roles, with filters →` : "Filters and sorting →"}</Link>}>
        <p className="mb-2 text-xs text-slate-500">One list, ranked by match score, with tier, stretch and relocation shown on each role. Up to 3 roles per company. Check Applied, Not a fit or Duplicate and the role leaves the feed.</p>
        {feedJobs.length === 0 ? <Empty>{lastRun ? "No open matching roles right now." : "Run the first job-feed refresh to load live openings."}</Empty> : <JobsTable rows={feedJobs.map(toRow)} />}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Follow-ups & tasks due" className="lg:col-span-3">
          {followUps.length + tasks.length === 0 ? <Empty>Nothing due. Follow-ups appear when a next-action date arrives or an application sits 7 days without one.</Empty> : (
            <ul className="space-y-2.5 text-sm">
              {followUps.map((a) => (
                <li key={a.id}><Link href={`/applications/${a.id}`} className="font-medium hover:underline">{a.company.name}: {a.title}</Link><div className="text-xs text-slate-500">{a.nextAction || "Follow up on application"} · {a.nextActionDue ? `due ${date(a.nextActionDue)}` : `applied ${date(a.appliedAt)}`}</div></li>
              ))}
              {tasks.map((t) => (
                <li key={t.id}><span className="font-medium">{t.title}</span><div className="text-xs text-slate-500">{t.application ? `${t.application.company.name} · ` : ""}due {date(t.dueAt)}</div></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Applications by stage"><StageBars data={stageData} /></Card>
        <Card title="Opportunity pipeline (open matching roles by tier)"><PipelineBars data={charts.pipeline} /></Card>
        <Card title="Compensation ranges" action={<span className="text-xs text-slate-500">{charts.compKnown} of {charts.compTotal} roles publish pay</span>}><CompBars data={charts.comp} /></Card>
        <Card title="Weekly application activity"><WeeklyLine data={charts.weeks} /></Card>
      </div>
      <Card title="Industry distribution"><IndustryBars data={charts.industries} /></Card>
    </>
  );
}
