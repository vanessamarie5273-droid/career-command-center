import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, Card, FactTag, Empty, Logo, HeroStat, Segmented, ScoreBadge, Meter } from "@/components/ui";
import { MATCHING } from "@/lib/queries";
import { money, range, STAGE_LABEL } from "@/lib/format";
import { effectiveScore } from "@/lib/scoring";
import Scenarios from "@/components/Scenarios";

export const metadata = { title: "Compensation Intelligence" };

const ownershipChip = (o: string | null) => (o ?? "").startsWith("Public") ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15" : (o ?? "").startsWith("Private") ? "bg-violet-50 text-violet-700 ring-1 ring-violet-600/15" : "bg-slate-100 text-slate-600";

/** A published pay range drawn on the page's shared scale, so ranges compare at a glance. */
function RangeBar({ min, max, floor, top, tone }: { min: number | null; max: number | null; floor: number; top: number; tone: "navy" | "gold" }) {
  const hi = max ?? min;
  if (hi == null) return null;
  const lo = min ?? hi;
  const span = Math.max(1, top - floor);
  const left = ((lo - floor) / span) * 100;
  const width = Math.max(1.5, ((hi - lo) / span) * 100);
  return <div className="relative h-1.5 w-full rounded-full bg-slate-100"><div className={`absolute h-full rounded-full ${tone === "navy" ? "bg-gradient-to-r from-[#3b5bdb] to-[#5c7cfa]" : "bg-gradient-to-r from-gold-600 to-gold-400"}`} style={{ left: `${left}%`, width: `${width}%` }} /></div>;
}

const SHOWN = 15;

export default async function Compensation({ searchParams }: { searchParams: Promise<{ sort?: string; all?: string }> }) {
  const { sort, all } = await searchParams;
  const [jobs, apps, companies, total] = await Promise.all([
    prisma.job.findMany({ where: { AND: [MATCHING, { OR: [{ oteMax: { not: null } }, { salaryMax: { not: null } }] }] }, include: { company: true }, orderBy: sort === "base" ? [{ salaryMax: { sort: "desc", nulls: "last" } }] : [{ oteMax: { sort: "desc", nulls: "last" } }, { salaryMax: { sort: "desc", nulls: "last" } }], take: 100 }),
    prisma.application.findMany({ where: { OR: [{ baseSalary: { not: null } }, { ote: { not: null } }, { equityGrant: { not: null } }] }, include: { company: true } }),
    prisma.company.findMany({ select: { id: true, name: true, logoUrl: true, ownership: true, maturity: true, equityUpsideScore: true, compCompetitiveness: true, valuation: true, financialVerifiedAt: true, _count: { select: { jobs: { where: MATCHING } } } }, orderBy: sort === "equity" ? { equityUpsideScore: "desc" } : { compCompetitiveness: "desc" }, take: 10 }),
    prisma.job.count({ where: MATCHING }),
  ]);
  const otes = jobs.map((j) => j.oteMax).filter((n): n is number => n != null).sort((a, b) => a - b);
  const median = otes.length ? otes[Math.floor(otes.length / 2)] : null;
  const top = Math.max(1, ...jobs.map((j) => Math.max(j.oteMax ?? 0, j.salaryMax ?? 0, j.oteMin ?? 0, j.salaryMin ?? 0)));
  // The scale starts just below the lowest published figure, so the ranges spread across the bar.
  const lows = jobs.flatMap((j) => [j.oteMin ?? j.oteMax, j.salaryMin ?? j.salaryMax]).filter((n): n is number => n != null);
  const floor = lows.length ? Math.floor((Math.min(...lows) * 0.9) / 10000) * 10000 : 0;
  const shown = all ? jobs : jobs.slice(0, SHOWN);
  const best = jobs.find((j) => j.oteMax === otes[otes.length - 1]);
  const sortLink = (s?: string, showAll = all) => { const q = new URLSearchParams({ ...(s ? { sort: s } : {}), ...(showAll ? { all: "1" } : {}) }).toString(); return `/compensation${q ? `?${q}` : ""}`; };
  return (
    <>
      <PageHeader title="Compensation Intelligence" sub="Published figures come from the employer; your recorded figures carry their own source label. Equity values are never assumed.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroStat label="Roles publishing pay" value={jobs.length} sub={`of ${total} open matching roles`} icon="briefcase" />
          <HeroStat label="Highest published OTE" value={otes.length ? money(otes[otes.length - 1]) : "—"} sub={best ? `${best.company.name}: ${best.title}` : "None published yet"} href={best ? `/jobs/${best.id}` : undefined} icon="trophy" highlight />
          <HeroStat label="Median top-of-range OTE" value={money(median)} sub={`across ${otes.length} roles that publish OTE`} icon="trend" />
          <HeroStat label="Figures you've recorded" value={apps.length} sub="offers, recruiter or estimates" icon="gift" />
        </div>
      </PageHeader>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Scenario comparison" sub="Your recorded offers and figures" icon="arrows" tone="gold"><Scenarios apps={apps.map((a) => ({ id: a.id, href: `/applications/${a.id}`, label: `${a.company.name}: ${a.title}`, base: a.baseSalary, ote: a.ote, variable: a.variableComp, signing: a.signingBonus, equityValue: a.equityValueEst, equityType: a.equityType, isPublic: (a.company.ownership ?? "").startsWith("Public"), source: a.compSource }))} /></Card>
        <Card title="Companies by pay & equity potential" sub={<Link className="link" href="/companies">All companies →</Link>} icon="building" tone="violet" action={<Segmented options={[{ href: sortLink(undefined), label: "Cash", active: sort !== "equity" }, { href: sortLink("equity"), label: "Equity", active: sort === "equity" }]} />}>
          <ul className="space-y-0.5">
            {companies.map((c) => (
              <li key={c.id}>
                <Link href={`/companies/${c.id}`} className="row-link">
                  <Logo src={c.logoUrl} name={c.name} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-navy-950">{c.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5"><span title={c.ownership ?? undefined} className={`chip block max-w-[12rem] truncate ${ownershipChip(c.ownership)}`}>{c.ownership ?? "Unknown"}</span>{c.valuation && c.financialVerifiedAt && <span className="text-[11px] text-slate-500">{c.valuation}</span>}</span>
                  </span>
                  <span className="hidden w-24 shrink-0 sm:block"><span className="flex justify-between text-[10.5px] text-slate-400"><span>Cash</span><span className="font-semibold tabular-nums text-slate-600">{c.compCompetitiveness ?? "—"}</span></span><Meter value={c.compCompetitiveness} tone="emerald" className="mt-1" /></span>
                  <span className="hidden w-24 shrink-0 sm:block"><span className="flex justify-between text-[10.5px] text-slate-400"><span>Equity</span><span className="font-semibold tabular-nums text-slate-600">{c.equityUpsideScore ?? "—"}</span></span><Meter value={c.equityUpsideScore} tone="violet" className="mt-1" /></span>
                  <span className={`chip w-16 justify-center ${c._count.jobs ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-500"}`}>{c._count.jobs} open</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500"><FactTag type="AI_ASSESSMENT" /> Scores reflect public reputation and company stage. Private-company equity is illiquid until an exit and can be worth nothing.</p>
        </Card>
      </div>

      <Card title="Open roles with published pay" sub={<span className="inline-flex items-center gap-3"><span className="inline-flex items-center gap-1"><span className="h-1.5 w-4 rounded-full bg-[#3b5bdb]" />OTE</span><span className="inline-flex items-center gap-1"><span className="h-1.5 w-4 rounded-full bg-gold-500" />Base / pay range</span><span>on one scale, {money(floor)} to {money(top)}</span></span>} icon="dollar" tone="emerald" action={<Segmented options={[{ href: sortLink(undefined), label: "By OTE", active: sort !== "base" }, { href: sortLink("base"), label: "By base", active: sort === "base" }]} />}>
        {jobs.length === 0 ? <Empty>No matching open role publishes pay yet.</Empty> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Role</th><th className="w-[38%]">Published pay</th><th>Equity</th><th>Score</th><th></th></tr></thead>
            <tbody>{shown.map((j) => (
              <tr key={j.id}>
                <td><Link href={`/jobs/${j.id}`} className="flex items-center gap-3 group"><Logo src={j.company.logoUrl} name={j.company.name} size={30} /><span className="min-w-0"><span className="block font-medium text-navy-950 group-hover:underline">{j.title}</span><span className="block text-xs text-slate-500">{j.company.name}{j.location ? ` · ${j.location}` : ""}</span></span></Link></td>
                <td title={j.compText ?? undefined}>
                  <div className="space-y-1.5">
                    {(j.oteMin ?? j.oteMax) != null && <div className="flex items-center gap-2"><span className="w-28 shrink-0 text-xs font-semibold tabular-nums text-navy-950">{range(j.oteMin, j.oteMax)}</span><RangeBar min={j.oteMin} max={j.oteMax} floor={floor} top={top} tone="navy" /></div>}
                    {(j.salaryMin ?? j.salaryMax) != null && <div className="flex items-center gap-2"><span className="w-28 shrink-0 text-xs tabular-nums text-slate-600">{range(j.salaryMin, j.salaryMax)}</span><RangeBar min={j.salaryMin} max={j.salaryMax} floor={floor} top={top} tone="gold" /></div>}
                  </div>
                </td>
                <td>{j.equityMentioned ? <span className="chip bg-violet-50 text-violet-700 ring-1 ring-violet-600/15">Mentioned</span> : <span className="text-slate-300">—</span>}</td>
                <td><ScoreBadge score={effectiveScore(j)} size={30} /></td>
                <td className="text-right"><a className="link text-xs whitespace-nowrap" href={j.applyUrl} target="_blank" rel="noopener noreferrer">Posting ↗</a></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {jobs.length > SHOWN && <div className="mt-3 text-center"><Link scroll={false} className="btn-ghost" href={sortLink(sort, all ? "" : "1")}>{all ? `Show top ${SHOWN} only` : `Show all ${jobs.length} roles`}</Link></div>}
      </Card>

      {apps.length > 0 && (
        <Card title="Figures you have recorded" icon="doc" className="mt-4">
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Application</th><th>Stage</th><th>Base</th><th>OTE</th><th>Variable</th><th>Signing</th><th>Equity</th><th>Vesting</th><th>Quota</th><th>Source</th></tr></thead>
            <tbody>{apps.map((a) => <tr key={a.id}><td><Link className="flex items-center gap-2 font-medium text-navy-950 hover:underline" href={`/applications/${a.id}`}><Logo src={a.company.logoUrl} name={a.company.name} size={24} />{a.company.name}: {a.title}</Link></td><td><span className="chip bg-navy-500/10 text-navy-700">{STAGE_LABEL[a.stage]}</span></td><td className="tabular-nums">{money(a.baseSalary)}</td><td className="font-semibold tabular-nums">{money(a.ote)}</td><td className="tabular-nums">{money(a.variableComp)}</td><td className="tabular-nums">{money(a.signingBonus)}</td><td className="text-xs">{a.equityGrant ?? "—"}{a.equityType ? ` (${a.equityType})` : ""}</td><td className="text-xs">{a.vesting ?? "—"}</td><td className="tabular-nums">{money(a.quota)}</td><td className="text-xs">{a.compSource ?? "—"} <FactTag type={a.compFactType} /></td></tr>)}</tbody>
          </table></div>
        </Card>
      )}
    </>
  );
}
