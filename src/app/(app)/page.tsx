import Link from "next/link";
import { prisma } from "@/lib/db";
import { chartData, dashboardMetrics, MATCHING, tierWhere, followUpWhere } from "@/lib/queries";
import { Card, Stat, PageHeader, TierBadge, ScorePill, ApplyLink, Logo, Empty, StatusDot } from "@/components/ui";
import { StageBars, PipelineBars, IndustryBars, CompBars, WeeklyLine } from "@/components/Charts";
import { STAGES, ago, date, range } from "@/lib/format";
import { effectiveScore, effectiveTier } from "@/lib/scoring";
import RefreshButton from "@/components/RefreshButton";
import JobMarks from "@/components/JobMarks";
import { normalizeTitle } from "@/lib/dedupe";
import { companyCap, withinCap } from "@/lib/companyCap";

export const metadata = { title: "Command Center" };

export default async function CommandCenter() {
  const now = new Date();
  const cap = await companyCap(prisma);
  const [m, charts, lastRun] = await Promise.all([dashboardMetrics(now, cap.ids), chartData(now), prisma.ingestionRun.findFirst({ orderBy: { startedAt: "desc" } })]);
  const ranked = await prisma.job.findMany({
    where: { AND: [MATCHING, withinCap(cap.ids), { category: "MAIN" }, { applications: { none: { applied: true } } }, { OR: [tierWhere("TIER1"), tierWhere("TIER2")] }] },
    include: { company: true }, orderBy: [{ overrideScore: { sort: "desc", nulls: "last" } }, { score: "desc" }, { firstSeenAt: "desc" }], take: 60,
  });
  // One row per company + title: employers often post the same role once per city.
  const groups = new Map<string, { job: (typeof ranked)[number]; others: number }>();
  for (const j of ranked) {
    const key = `${j.companyId}|${normalizeTitle(j.title)}`;
    const g = groups.get(key);
    if (g) g.others++; else groups.set(key, { job: j, others: 0 });
  }
  const priorities = [...groups.values()].slice(0, 8);
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
        <Stat label="Priority actions today" value={m.priorityActions} accent />
        <Stat label="Not a fit" value={m.notAFit} href="/jobs?category=DISMISSED" sub="removed from feeds" />
        <Stat label="Duplicates" value={m.duplicates} href="/jobs?category=DUPLICATE" sub="removed from feeds" />
        <Stat label="Relocation / stretch" value={`${m.relocation} / ${m.stretch}`} href="/jobs?category=RELOCATION" sub="ranked separately" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Today's priorities" className="lg:col-span-2" action={<Link href="/jobs?tier=TIER1" className="link text-xs">All Tier 1 →</Link>}>
          {priorities.length === 0 ? (
            <Empty>No verified Tier 1 or Tier 2 openings without an application. {lastRun ? "Lower-ranked roles are in Discover Jobs." : "Run the first job-feed refresh to populate this list."}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {priorities.map(({ job: j, others }) => (
                <li key={j.id} className="flex items-center gap-3 py-2.5">
                  <JobMarks id={j.id} />
                  <Logo src={j.company.logoUrl} name={j.company.name} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/jobs/${j.id}`} className="font-medium text-navy-950 hover:underline">{j.title}</Link>
                    {others > 0 && <Link href={`/jobs?company=${j.companyId}&q=${encodeURIComponent(j.title)}`} className="chip ml-2 bg-slate-100 text-slate-600 hover:bg-slate-200" title="The same role is posted in other locations">+{others} more {others === 1 ? "location" : "locations"}</Link>}
                    <div className="text-xs text-slate-500 truncate">{j.company.name} · {j.location || "Location not stated"}{range(j.oteMin, j.oteMax) ? ` · OTE ${range(j.oteMin, j.oteMax)}` : range(j.salaryMin, j.salaryMax) ? ` · ${range(j.salaryMin, j.salaryMax)}` : ""} · found {ago(j.firstSeenAt)}</div>
                  </div>
                  <TierBadge tier={effectiveTier(j)} overridden={!!j.overrideTier} />
                  <ScorePill score={effectiveScore(j)} confidence={j.confidence} />
                  <ApplyLink url={j.applyUrl} label="Apply" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Follow-ups & tasks due">
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
