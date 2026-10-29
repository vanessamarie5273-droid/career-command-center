import { prisma } from "@/lib/db";
import { PageHeader, Card, Empty, HeroStat, Section } from "@/components/ui";
import { StageBars, IndustryBars, CompBars, WeeklyLine, PipelineBars } from "@/components/Charts";
import Tabs from "@/components/Tabs";
import { RankRow, PayChip, MeterScore } from "@/components/RankRows";
import Link from "next/link";
import { chartData, MATCHING } from "@/lib/queries";
import { companyCap, withinCap } from "@/lib/companyCap";
import { RANKINGS } from "@/lib/jobFilters";
import { companyAttractiveness, effectiveScore } from "@/lib/scoring";
import { STAGES, range } from "@/lib/format";

export const metadata = { title: "Reports & Analytics" };

const SHORT: Record<string, string> = { best: "Best now", cash: "Top cash", equity: "Equity upside", quals: "Best fit", remote: "Remote", leadership: "Leadership", ai: "Emerging AI" };
const table = (q: string) => `/applications?view=table&${q}`;

export default async function Reports() {
  const charts = await chartData();
  const cap = await companyCap(prisma);
  const lists = await Promise.all(Object.entries(RANKINGS).map(async ([k, r]) => [k, r.label, await prisma.job.findMany({ where: { AND: [MATCHING, withinCap(cap.ids), r.where] }, orderBy: r.orderBy, take: 8, include: { company: true } })] as const));
  const companies = await prisma.company.findMany({ include: { jobs: { where: MATCHING, select: { id: true } } } });
  const bestCompanies = companies.map((c) => ({ ...c, a: companyAttractiveness(c) })).sort((a, b) => b.a - a.a).slice(0, 8);
  const apps = await prisma.application.findMany({ select: { stage: true, applied: true, stageHistory: { select: { to: true } } } });
  const reached = (s: string[]) => apps.filter((a) => s.includes(a.stage) || a.stageHistory.some((h) => s.includes(h.to))).length;
  const applied = apps.filter((a) => a.applied).length;
  const funnel = [
    ["Applied", applied, table("applied=1"), "send"],
    ["Recruiter / HM engaged", reached(["RECRUITER_CONTACT", "HIRING_MANAGER"]), table("active=1"), "people"],
    ["Interviewing", reached(["INTERVIEWING", "FINAL_INTERVIEW"]), table("stage=INTERVIEWING"), "calendar"],
    ["Offer", reached(["OFFER", "ACCEPTED"]), table("stage=OFFER"), "trophy"],
  ] as const;
  return (
    <>
      <PageHeader title="Reports & Analytics" sub="Your funnel, where to focus next, and the market behind it. Company and job rankings stay separate: a great company with no suitable opening is never shown as an application to make now." actions={<a className="btn-ghost" href="/api/export?format=csv&what=jobs">Export jobs CSV</a>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {funnel.map(([l, v, href, icon], i) => <HeroStat key={l} label={l} value={v} href={href} icon={icon} highlight={i === 3 && v > 0} sub={i > 0 && applied ? `${Math.round((v / applied) * 100)}% of applied` : "applications sent"} />)}
        </div>
      </PageHeader>

      <Section title="Where to focus" sub="The strongest openings by what matters to you, next to the companies worth winning.">
        <div className="grid gap-4 lg:grid-cols-12">
          <Card title="Top open roles" icon="flame" tone="gold" className="lg:col-span-7">
            <Tabs tabs={lists.map(([k, label, jobs]) => ({
              key: k, label: SHORT[k] ?? label, count: jobs.length,
              action: <Link className="link text-xs whitespace-nowrap" href={`/jobs?view=${k}`}>See all →</Link>,
              content: (
                <>
                  <p className="mb-2 text-xs text-slate-500">{label}</p>
                  {jobs.length === 0 ? <Empty>No verified open roles in this ranking yet.</Empty> : (
                    <ol className="space-y-0.5">{jobs.map((j, i) => <RankRow key={j.id} rank={i + 1} href={`/jobs/${j.id}`} logo={j.company.logoUrl} name={j.company.name} title={j.title} detail={[j.company.name, j.location].filter(Boolean).join(" · ")} extra={<PayChip text={range(j.oteMin, j.oteMax) ?? range(j.salaryMin, j.salaryMax)} />} score={effectiveScore(j)} />)}</ol>
                  )}
                </>
              ),
            }))} />
          </Card>
          <Card title="Best overall companies" sub="Attractiveness, AI assessment" icon="building" tone="violet" className="lg:col-span-5" action={<Link className="link text-xs" href="/companies">All →</Link>}>
            <ol className="space-y-0.5">{bestCompanies.map((c, i) => <RankRow key={c.id} rank={i + 1} href={`/companies/${c.id}`} logo={c.logoUrl} name={c.name} title={c.name} detail={c.jobs.length ? `${c.jobs.length} open role${c.jobs.length === 1 ? "" : "s"}` : "Monitoring, no open role"} extra={<MeterScore value={c.a} tone="violet" />} score={c.a} />)}</ol>
          </Card>
        </div>
      </Section>

      <Section title="Pipeline & activity" sub="Click a stage bar to open those applications.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Applications by stage" icon="board"><StageBars data={STAGES.map(([k, l]) => ({ label: l, count: charts.stages.find((s) => s.stage === k)?.count ?? 0, href: table(`stage=${k}`) })).filter((s) => s.count)} /></Card>
          <Card title="Weekly activity" sub="Applications sent and stage moves" icon="trend" tone="emerald"><WeeklyLine data={charts.weeks} /></Card>
        </div>
      </Section>

      <Section title="Market view" sub="What the open market looks like across the companies you monitor.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Open roles by tier" icon="layers" tone="gold"><PipelineBars data={charts.pipeline} /></Card>
          <Card title="Published compensation ranges" icon="dollar" tone="emerald"><CompBars data={charts.comp} /></Card>
          <Card title="Industry distribution" icon="pie" tone="sky" className="lg:col-span-2"><IndustryBars data={charts.industries} /></Card>
        </div>
      </Section>
    </>
  );
}
