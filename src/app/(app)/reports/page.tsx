import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Empty, Logo, ScoreBadge } from "@/components/ui";
import { CompBars, Donut, IndustryBars } from "@/components/Charts";
import Tabs from "@/components/Tabs";
import { RankRow } from "@/components/RankRows";
import { chartData, MATCHING } from "@/lib/queries";
import { companyCap, withinCap } from "@/lib/companyCap";
import { RANKINGS } from "@/lib/jobFilters";
import { companyAttractiveness, effectiveScore } from "@/lib/scoring";
import { range } from "@/lib/format";

export const metadata = { title: "Reports" };
const table = (q: string) => `/applications?view=table&${q}`;

export default async function Reports() {
  const charts = await chartData();
  const cap = await companyCap(prisma);
  const lists = await Promise.all(Object.entries(RANKINGS).map(async ([k, r]) => [k, r.short, await prisma.job.findMany({ where: { AND: [MATCHING, withinCap(cap.ids), r.where] }, orderBy: r.orderBy, take: 8, include: { company: true } })] as const));
  const companies = await prisma.company.findMany({ include: { jobs: { where: MATCHING, select: { id: true } } } });
  const bestCompanies = companies.map((c) => ({ ...c, a: companyAttractiveness(c) })).sort((a, b) => b.a - a.a).slice(0, 8);
  const apps = await prisma.application.findMany({ select: { stage: true, applied: true, stageHistory: { select: { to: true } } } });
  const reached = (s: string[]) => apps.filter((a) => s.includes(a.stage) || a.stageHistory.some((h) => s.includes(h.to))).length;
  const applied = apps.filter((a) => a.applied).length;
  const funnel = [
    { label: "Applied", value: applied, href: table("applied=1") },
    { label: "Recruiter or Manager", value: reached(["RECRUITER_CONTACT", "HIRING_MANAGER"]), href: table("active=1") },
    { label: "Interviewing", value: reached(["INTERVIEWING", "FINAL_INTERVIEW"]), href: table("stage=INTERVIEWING") },
    { label: "Offer", value: reached(["OFFER", "ACCEPTED"]), href: table("stage=OFFER") },
  ];
  const tiers = [
    { name: "Tier 1", value: charts.pipeline[0].value, color: "#A100C2", href: "/jobs?tier=TIER1" },
    { name: "Tier 2", value: charts.pipeline[1].value, color: "#5D36FF", href: "/jobs?tier=TIER2" },
    { name: "Tier 3", value: charts.pipeline[2].value, color: "#9D85FF", href: "/jobs?tier=TIER3" },
  ];

  return (
    <>
      <PageHeader title="Reports" actions={<a className="btn-ghost" href="/api/export?format=csv&what=jobs">Export jobs</a>}>
        <Funnel steps={funnel} />
      </PageHeader>

      <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card title="Top open roles" icon="flame" tone="gold" className="xl:col-span-7">
          <Tabs tabs={lists.map(([k, label, jobs]) => ({
            key: k, label, count: jobs.length,
            action: <Link className="link text-[13px] whitespace-nowrap" href={`/jobs?view=${k}`}>All →</Link>,
            content: jobs.length === 0 ? <Empty>No open roles here yet.</Empty> : (
              <ol className="space-y-0.5">{jobs.map((j, i) => <RankRow key={j.id} rank={i + 1} href={`/jobs/${j.id}`} logo={j.company.logoUrl} name={j.company.name} title={j.title} detail={[j.company.name, range(j.oteMin, j.oteMax) ?? range(j.salaryMin, j.salaryMax)].filter(Boolean).join(" · ")} score={effectiveScore(j)} />)}</ol>
            ),
          }))} />
        </Card>
        <Card title="Best companies" icon="building" tone="violet" className="xl:col-span-5" action={<Link className="link text-[13px]" href="/companies">All →</Link>}>
          <ol className="space-y-0.5">
            {bestCompanies.map((c, i) => (
              <RankRow key={c.id} rank={i + 1} href={`/companies/${c.id}`} logo={c.logoUrl} name={c.name} title={c.name}
                detail={c.category}
                extra={<span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium tabular-nums sm:inline-flex ${c.jobs.length ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{c.jobs.length} open</span>}
                score={c.a} />
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-12">
        <Card title="Open roles by tier" icon="layers" tone="gold" className="xl:col-span-3"><Donut data={tiers} unit="open roles" /></Card>
        <Card title="Published pay" icon="dollar" tone="emerald" className="xl:col-span-4"><CompBars data={charts.comp} /></Card>
        <Card title="Industries" icon="pie" tone="sky" className="lg:col-span-2 xl:col-span-5"><IndustryBars data={charts.industries.slice(0, 9)} /></Card>
      </div>
    </>
  );
}

/** The application funnel as connected steps, each with its count and the share of applications that reached it. */
function Funnel({ steps }: { steps: { label: string; value: number; href: string }[] }) {
  const top = Math.max(1, steps[0].value);
  return (
    <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / top) * 100);
        return (
          <li key={s.label} className="relative">
            <Link href={s.href} className={`block h-full rounded-xl px-3.5 py-2.5 ring-1 backdrop-blur-sm transition hover:bg-white/20 ${i === steps.length - 1 && s.value ? "bg-white/25 ring-white/40" : "bg-white/[0.12] ring-white/20"}`}>
              <span className="block text-[13.5px] font-medium text-white/80">{s.label}</span>
              <span className="mt-0.5 flex items-baseline gap-2"><span className="text-[26px] font-semibold leading-tight tabular-nums">{s.value}</span>{i > 0 && <span className="text-sm font-semibold tabular-nums text-[#f6d0f2]">{pct}%</span>}</span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full bg-gradient-to-r from-white to-[#f6d0f2]" style={{ width: `${s.value ? Math.max(4, pct) : 0}%` }} /></span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
