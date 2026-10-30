import Link from "next/link";
import { prisma } from "@/lib/db";
import { applicationSearch, pipelineDashboard, QUIET_DAYS, SEARCH_BY, type SearchBy } from "@/lib/pipeline";
import { Card, PageHeader, Empty, HeroStat, Logo } from "@/components/ui";
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
      <PageHeader title="Command Center" sub="Your applications at a glance. Click any number, bar or name to open the applications behind it and move them along." actions={<Link href="/applications" className="btn-ghost">All applications →</Link>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          <HeroStat label="Active processes" value={t.active} href={table("active=1")} sub="recruiter to final round" icon="flame" highlight />
          <HeroStat label="Applied" value={t.applied} href={table("applied=1")} icon="send" />
          <HeroStat label="Moved past applied" value={t.responseRate == null ? "—" : `${t.responseRate}%`} href={table("applied=1")} sub="of applications sent" icon="trend" />
          <HeroStat label="Interviews scheduled" value={t.interviews} href={table("interviews=1")} icon="calendar" />
          <HeroStat label="Offers" value={t.offers} href={table("stage=OFFER")} icon="trophy" />
          <HeroStat label="Follow-ups due" value={t.followUps} href={table("followup=1")} icon="clock" />
          <HeroStat label="Ready to apply" value={t.readyToApply} href="/apply" sub="saved, not yet sent" icon="check" />
        </div>
      </PageHeader>

      <Card title="Find an application" icon="search" className="mb-4">
        <ApplicationSearch by={by} q={q} />
        {found && (
          <div className="mt-4">
            <div className="mb-2 text-xs text-slate-500">{found.length === 50 ? "First 50" : found.length} application{found.length === 1 ? "" : "s"} for {SEARCH_BY[by].toLowerCase()} {looked}. Change the stage, next action or due date right here, or open one for everything else.</div>
            {found.length ? <ApplicationsTable apps={found} /> : <Empty>No application matches. {by === "date" ? "Only applications marked applied have a date applied." : "Try part of the name."}</Empty>}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4 mb-4 items-start">
        <Card title="Pipeline by stage" icon="board" className="lg:col-span-2" action={<span className="text-xs text-slate-500">Click a bar to see those applications</span>}><StageBars data={stageData} /></Card>
        <Card title="Follow-ups & tasks due" icon="clock" tone="amber">
          {d.followUps.length + d.dueTasks.length === 0 ? <Empty>Nothing due. Follow-ups appear when a next-action date arrives or an application sits 7 days without one.</Empty> : (
            <ul className="space-y-0.5">
              {d.followUps.map((a) => <Item key={a.id} href={`/applications/${a.id}`} company={a.company} title={`${a.company.name}: ${a.title}`} detail={`${a.nextAction || "Follow up on application"} · ${a.nextActionDue ? `due ${date(a.nextActionDue)}` : `applied ${date(a.appliedAt)}`}`} />)}
              {d.dueTasks.map((x) => <Item key={x.id} href={x.application ? `/applications/${x.application.id}` : undefined} company={x.application?.company} title={x.title} detail={`${x.application ? `${x.application.company.name} · ` : ""}due ${date(x.dueAt)}`} />)}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4 items-start">
        <Card title="Weekly activity" icon="trend" tone="emerald" className="lg:col-span-2" action={<span className="text-xs text-slate-500">Applications sent and stage moves, last 12 weeks</span>}><WeeklyLine data={d.weeks} /></Card>
        <Card title="Upcoming interviews" icon="calendar" tone="sky">
          {d.upcoming.length === 0 ? <Empty>No interviews on the calendar. Add the date on an application and it shows here.</Empty> : (
            <ul className="space-y-0.5">{d.upcoming.map((a) => <Item key={a.id} href={`/applications/${a.id}#interview`} company={a.company} title={`${a.company.name}: ${a.title}`} detail={`${dateTime(a.interviewAt)} · ${STAGE_LABEL[a.stage]}`} />)}</ul>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card title="Going quiet" icon="pause" tone="rose" action={<span className="text-xs text-slate-500">Applied, still open, no update in {QUIET_DAYS} days</span>}>
          {d.quiet.length === 0 ? <Empty>Every open application has moved in the last {QUIET_DAYS} days.</Empty> : (
            <ul className="space-y-0.5">{d.quiet.map((a) => <Item key={a.id} href={`/applications/${a.id}`} company={a.company} title={`${a.company.name}: ${a.title}`} detail={`${STAGE_LABEL[a.stage]} · last update ${ago(a.updatedAt)}${a.appliedAt ? ` · applied ${date(a.appliedAt)}` : ""}`} />)}</ul>
          )}
        </Card>
        <Card title="Recent moves" icon="arrows" tone="violet" action={<span className="text-xs text-slate-500">Last 7 days</span>}>
          {d.moves.length === 0 ? <Empty>No stage changes this week.</Empty> : (
            <ul className="space-y-0.5">{d.moves.map((m) => <Item key={m.id} href={`/applications/${m.applicationId}`} company={m.application.company} title={`${m.application.company.name}: ${m.application.title}`} detail={`${m.from ? `${STAGE_LABEL[m.from]} → ` : ""}${STAGE_LABEL[m.to]} · ${ago(m.at)}`} />)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}

/** One application in a dashboard list: company logo, name, and what is due or changed. */
function Item({ href, company, title, detail }: { href?: string; company?: { name: string; logoUrl: string | null }; title: string; detail: string }) {
  const inner = <>{company ? <Logo src={company.logoUrl} name={company.name} size={30} /> : <span className="h-[30px] w-[30px] shrink-0 rounded-md bg-slate-100" />}<span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium text-navy-950">{title}</span><span className="block truncate text-xs text-slate-500">{detail}</span></span></>;
  return <li>{href ? <Link href={href} className="row-link">{inner}</Link> : <div className="row-link">{inner}</div>}</li>;
}
