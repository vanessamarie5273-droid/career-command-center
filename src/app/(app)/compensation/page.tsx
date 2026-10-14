import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, Card, FactTag, Empty, Logo } from "@/components/ui";
import { MATCHING } from "@/lib/queries";
import { money, range, STAGE_LABEL } from "@/lib/format";
import { effectiveScore } from "@/lib/scoring";
import Scenarios from "@/components/Scenarios";

export const metadata = { title: "Compensation Intelligence" };

export default async function Compensation({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort } = await searchParams;
  const [jobs, apps, companies, total] = await Promise.all([
    prisma.job.findMany({ where: { AND: [MATCHING, { OR: [{ oteMax: { not: null } }, { salaryMax: { not: null } }] }] }, include: { company: true }, orderBy: sort === "base" ? [{ salaryMax: { sort: "desc", nulls: "last" } }] : [{ oteMax: { sort: "desc", nulls: "last" } }, { salaryMax: { sort: "desc", nulls: "last" } }], take: 100 }),
    prisma.application.findMany({ where: { OR: [{ baseSalary: { not: null } }, { ote: { not: null } }, { equityGrant: { not: null } }] }, include: { company: true } }),
    prisma.company.findMany({ select: { id: true, name: true, logoUrl: true, ownership: true, maturity: true, equityUpsideScore: true, compCompetitiveness: true, valuation: true, financialVerifiedAt: true, _count: { select: { jobs: { where: MATCHING } } } }, orderBy: sort === "equity" ? { equityUpsideScore: "desc" } : { compCompetitiveness: "desc" }, take: 25 }),
    prisma.job.count({ where: MATCHING }),
  ]);
  return (
    <>
      <PageHeader title="Compensation Intelligence" sub={`${jobs.length} of ${total} open matching roles publish pay. Published figures come from the employer; your recorded figures carry their own source label. Equity values are never assumed.`} />
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Scenario comparison (your recorded offers & figures)"><Scenarios apps={apps.map((a) => ({ id: a.id, label: `${a.company.name}: ${a.title}`, base: a.baseSalary, ote: a.ote, variable: a.variableComp, signing: a.signingBonus, equityValue: a.equityValueEst, equityType: a.equityType, isPublic: (a.company.ownership ?? "").startsWith("Public"), source: a.compSource }))} /></Card>
        <Card title="Companies by compensation & equity potential" action={<span className="flex gap-2 text-xs"><Link className={sort !== "equity" ? "font-semibold" : "link"} href="/compensation">Cash</Link><Link className={sort === "equity" ? "font-semibold" : "link"} href="/compensation?sort=equity">Equity</Link></span>}>
          <table className="tbl"><thead><tr><th>Company</th><th>Comp</th><th>Equity</th><th>Ownership</th><th>Open roles</th></tr></thead>
            <tbody>{companies.map((c) => <tr key={c.id}><td><Link className="inline-flex items-center gap-2 hover:underline" href={`/companies/${c.id}`}><Logo src={c.logoUrl} name={c.name} size={18} />{c.name}</Link></td><td className="tabular-nums">{c.compCompetitiveness ?? "—"}</td><td className="tabular-nums">{c.equityUpsideScore ?? "—"}</td><td className="text-xs">{c.ownership}{c.valuation && c.financialVerifiedAt ? ` · ${c.valuation}` : ""}</td><td>{c._count.jobs}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500"><FactTag type="AI_ASSESSMENT" /> Scores reflect public reputation and company stage. Private-company equity is illiquid until an exit and can be worth nothing.</p>
        </Card>
      </div>
      <Card title="Open roles with published pay" action={<span className="flex gap-2 text-xs"><Link className={sort !== "base" ? "font-semibold" : "link"} href="/compensation">By OTE</Link><Link className={sort === "base" ? "font-semibold" : "link"} href="/compensation?sort=base">By base/range</Link></span>}>
        {jobs.length === 0 ? <Empty>No matching open role publishes pay yet.</Empty> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Role</th><th>Company</th><th>OTE</th><th>Base / range</th><th>Equity</th><th>Score</th><th>Source text</th><th></th></tr></thead>
            <tbody>{jobs.map((j) => <tr key={j.id}><td><Link className="font-medium hover:underline" href={`/jobs/${j.id}`}>{j.title}</Link><div className="text-xs text-slate-500">{j.location}</div></td><td className="text-sm">{j.company.name}</td><td className="font-semibold whitespace-nowrap">{range(j.oteMin, j.oteMax) ?? "—"}</td><td className="whitespace-nowrap">{range(j.salaryMin, j.salaryMax) ?? "—"}</td><td className="text-xs">{j.equityMentioned ? "Mentioned" : "—"}</td><td>{effectiveScore(j)}</td><td className="text-xs text-slate-500 max-w-xs">{j.compText?.slice(0, 160)}</td><td><a className="link text-xs" href={j.applyUrl} target="_blank" rel="noopener noreferrer">Posting ↗</a></td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
      <Card title="Figures you have recorded" className="mt-4">
        {apps.length === 0 ? <Empty>Record recruiter-provided or offer figures on an application to compare them here.</Empty> : (
          <table className="tbl"><thead><tr><th>Application</th><th>Stage</th><th>Base</th><th>OTE</th><th>Variable</th><th>Signing</th><th>Equity</th><th>Vesting</th><th>Quota</th><th>Source</th></tr></thead>
            <tbody>{apps.map((a) => <tr key={a.id}><td><Link className="link" href={`/applications/${a.id}`}>{a.company.name}: {a.title}</Link></td><td className="text-xs">{STAGE_LABEL[a.stage]}</td><td>{money(a.baseSalary)}</td><td>{money(a.ote)}</td><td>{money(a.variableComp)}</td><td>{money(a.signingBonus)}</td><td className="text-xs">{a.equityGrant ?? "—"}{a.equityType ? ` (${a.equityType})` : ""}</td><td className="text-xs">{a.vesting ?? "—"}</td><td>{money(a.quota)}</td><td className="text-xs">{a.compSource ?? "—"} <FactTag type={a.compFactType} /></td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}
