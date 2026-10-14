import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Logo, Empty } from "@/components/ui";
import { StageBars, IndustryBars, CompBars, WeeklyLine, PipelineBars } from "@/components/Charts";
import { chartData, MATCHING } from "@/lib/queries";
import { RANKINGS } from "@/lib/jobFilters";
import { companyAttractiveness, effectiveScore } from "@/lib/scoring";
import { STAGES, range } from "@/lib/format";

export const metadata = { title: "Reports & Analytics" };

export default async function Reports() {
  const charts = await chartData();
  const lists = await Promise.all(Object.entries(RANKINGS).map(async ([k, r]) => [k, r.label, await prisma.job.findMany({ where: { AND: [MATCHING, r.where] }, orderBy: r.orderBy, take: 8, include: { company: true } })] as const));
  const companies = await prisma.company.findMany({ include: { jobs: { where: MATCHING, select: { id: true } } } });
  const bestCompanies = companies.map((c) => ({ ...c, a: companyAttractiveness(c) })).sort((a, b) => b.a - a.a).slice(0, 12);
  const apps = await prisma.application.findMany({ select: { stage: true, applied: true, stageHistory: { select: { to: true } } } });
  const reached = (s: string[]) => apps.filter((a) => s.includes(a.stage) || a.stageHistory.some((h) => s.includes(h.to))).length;
  const applied = apps.filter((a) => a.applied).length;
  const funnel = [["Applied", applied], ["Recruiter / HM engaged", reached(["RECRUITER_CONTACT", "HIRING_MANAGER"])], ["Interviewing", reached(["INTERVIEWING", "FINAL_INTERVIEW"])], ["Offer", reached(["OFFER", "ACCEPTED"])]] as const;
  return (
    <>
      <PageHeader title="Reports & Analytics" sub="Company rankings and job rankings are kept separate: a great company with no suitable opening is never shown as an application to make now." actions={<a className="btn-ghost" href="/api/export?format=csv&what=jobs">Export jobs CSV</a>} />
      <div className="grid lg:grid-cols-4 gap-3 mb-4">{funnel.map(([l, v], i) => <div key={l} className="card p-4"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{l}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div><div className="text-xs text-slate-500">{i > 0 && applied ? `${Math.round((v / applied) * 100)}% of applied` : " "}</div></div>)}</div>
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Best overall companies (attractiveness, AI assessment)">
          <ol className="space-y-1.5 text-sm">{bestCompanies.map((c, i) => <li key={c.id} className="flex items-center gap-2"><span className="w-5 text-right text-slate-400 tabular-nums">{i + 1}</span><Logo src={c.logoUrl} name={c.name} size={18} /><Link className="hover:underline flex-1" href={`/companies/${c.id}`}>{c.name}</Link><span className="text-xs text-slate-500">{c.jobs.length ? `${c.jobs.length} open` : "monitor"}</span><span className="font-semibold tabular-nums">{c.a}</span></li>)}</ol>
        </Card>
        {lists.map(([k, label, jobs]) => (
          <Card key={k} title={label} action={<Link className="link text-xs" href={`/jobs?view=${k}`}>All →</Link>}>
            {jobs.length === 0 ? <Empty>No verified open roles in this ranking yet.</Empty> : <ol className="space-y-1.5 text-sm">{jobs.map((j, i) => <li key={j.id} className="flex items-center gap-2"><span className="w-5 text-right text-slate-400 tabular-nums">{i + 1}</span><Link className="hover:underline flex-1 truncate" href={`/jobs/${j.id}`}>{j.title} <span className="text-slate-500">· {j.company.name}</span></Link><span className="text-xs text-slate-500 whitespace-nowrap">{range(j.oteMin, j.oteMax) ?? range(j.salaryMin, j.salaryMax) ?? ""}</span><span className="font-semibold tabular-nums">{effectiveScore(j)}</span></li>)}</ol>}
          </Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Applications by stage"><StageBars data={STAGES.map(([k, l]) => ({ label: l, count: charts.stages.find((s) => s.stage === k)?.count ?? 0 }))} /></Card>
        <Card title="Opportunity pipeline by tier"><PipelineBars data={charts.pipeline} /></Card>
        <Card title="Published compensation ranges"><CompBars data={charts.comp} /></Card>
        <Card title="Weekly activity"><WeeklyLine data={charts.weeks} /></Card>
      </div>
      <Card title="Industry distribution"><IndustryBars data={charts.industries} /></Card>
    </>
  );
}
