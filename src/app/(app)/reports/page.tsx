import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Empty, Logo, ScoreBadge } from "@/components/ui";
import { CompBars, Donut, IndustryBars } from "@/components/Charts";
import Tabs from "@/components/Tabs";
import { RankRow, PayChip } from "@/components/RankRows";
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
  const bestCompanies = companies.map((c) => ({ ...c, a: companyAttractiveness(c) })).sort((a, b) => b.a - a.a).slice(0, 12);
  const apps = await prisma.application.findMany({ select: { stage: true, applied: true, stageHistory: { select: { to: true } } } });
  const reached = (s: string[]) => apps.filter((a) => s.includes(a.stage) || a.stageHistory.some((h) => s.includes(h.to))).length;
  const applied = apps.filter((a) => a.applied).length;
  const funnel = [
    { label: "Applied", value: applied, href: table("applied=1") },
    { label: "Recruiter or manager", value: reached(["RECRUITER_CONTACT", "HIRING_MANAGER"]), href: table("active=1") },
    { label: "Interviewing", value: reached(["INTERVIEWING", "FINAL_INTERVIEW"]), href: table("stage=INTERVIEWING") },
    { label: "Offer", value: reached(["OFFER", "ACCEPTED"]), href: table("stage=OFFER") },
  ];
  const tiers = [
    { name: "Tier 1", value: charts.pipeline[0].value, color: "#c4a254", href: "/jobs?tier=TIER1" },
    { name: "Tier 2", value: charts.pipeline[1].value, color: "#3b5bdb", href: "/jobs?tier=TIER2" },
    { name: "Tier 3", value: charts.pipeline[2].value, color: "#94a3b8", href: "/jobs?tier=TIER3" },
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
            action: <Link className="link text-xs whitespace-nowrap" href={`/jobs?view=${k}`}>All →</Link>,
            content: jobs.length === 0 ? <Empty>No open roles here yet.</Empty> : (
              <ol className="space-y-0.5">{jobs.map((j, i) => <RankRow key={j.id} rank={i + 1} href={`/jobs/${j.id}`} logo={j.company.logoUrl} name={j.company.name} title={j.title} detail={[j.company.name, j.location].filter(Boolean).join(" · ")} extra={<PayChip text={range(j.oteMin, j.oteMax) ?? range(j.salaryMin, j.salaryMax)} />} score={effectiveScore(j)} />)}</ol>
            ),
          }))} />
        </Card>
        <Card title="Best companies" icon="building" tone="violet" className="xl:col-span-5" action={<Link className="link text-xs" href="/companies">All →</Link>}>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {bestCompanies.map((c, i) => (
              <li key={c.id}>
                <Link href={`/companies/${c.id}`} className="flex h-full items-center gap-3 rounded-xl bg-slate-50/70 p-2.5 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
                  <span className={`w-4 text-center text-xs font-bold tabular-nums ${i < 3 ? "text-gold-600" : "text-slate-300"}`}>{i + 1}</span>
                  <Logo src={c.logoUrl} name={c.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-navy-950">{c.name}</span>
                    <span className={`mt-0.5 inline-flex rounded-full px-1.5 text-[11px] font-medium tabular-nums ${c.jobs.length ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{c.jobs.length} open</span>
                  </span>
                  <ScoreBadge score={c.a} size={34} />
                </Link>
              </li>
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
    <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / top) * 100);
        return (
          <li key={s.label} className="relative">
            <Link href={s.href} className={`block h-full rounded-xl px-4 py-3 ring-1 transition hover:bg-white/[0.12] ${i === steps.length - 1 && s.value ? "bg-gold-500/15 ring-gold-400/40" : "bg-white/[0.06] ring-white/10"}`}>
              <span className="block text-[12.5px] font-medium text-white/70">{s.label}</span>
              <span className="mt-0.5 flex items-baseline gap-2"><span className="text-[30px] font-semibold leading-tight tabular-nums text-white">{s.value}</span>{i > 0 && <span className="text-sm font-semibold tabular-nums text-gold-300">{pct}%</span>}</span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${s.value ? Math.max(4, pct) : 0}%` }} /></span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
