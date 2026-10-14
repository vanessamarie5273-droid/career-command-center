import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, FactTag, Logo, Empty, StatusDot } from "@/components/ui";
import AutoField from "@/components/AutoField";
import JobsTable from "@/components/JobsTable";
import RefreshButton from "@/components/RefreshButton";
import NewApplication from "@/components/NewApplication";
import { NoteForm } from "@/components/CrmWidgets";
import { AddLeader, AddNews, VerifyProfile } from "@/components/CompanyWidgets";
import { MATCHING } from "@/lib/queries";
import { companyAttractiveness, effectiveScore, effectiveTier } from "@/lib/scoring";
import { positioning } from "@/lib/positioning";
import { date, dateTime, STAGE_LABEL } from "@/lib/format";
import { CATEGORIES } from "@/data/companies";

const li = (company: string, role: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${role} ${company}`)}`;

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.company.findUnique({
    where: { id },
    include: {
      jobs: { where: MATCHING, include: { applications: { select: { id: true, stage: true, applied: true } }, sources: { select: { provider: true } } }, orderBy: { score: "desc" } },
      leaders: true, news: { orderBy: { publishedAt: "desc" } }, contacts: true,
      applications: { include: { touches: true }, orderBy: { updatedAt: "desc" } }, activities: { orderBy: { at: "desc" } },
      _count: { select: { jobs: true } },
    },
  });
  if (!c) notFound();
  const other = await prisma.job.count({ where: { companyId: c.id, status: "OPEN", OR: [{ category: { in: ["RELOCATION", "EXCLUDED"] } }, { dismissed: true }] } });
  const ep = `/api/companies/${c.id}`;
  const attract = companyAttractiveness(c);
  const rows = c.jobs.map((j) => ({ id: j.id, title: j.title, company: { id: c.id, name: c.name, logoUrl: c.logoUrl, category: c.category }, location: j.location, arrangement: j.workArrangement, postedAt: j.postedAt?.toISOString() ?? null, firstSeenAt: j.firstSeenAt.toISOString(), lastVerifiedAt: j.lastVerifiedAt.toISOString(), applyUrl: j.applyUrl, score: effectiveScore(j), aiScore: j.score, tier: effectiveTier(j), overridden: !!(j.overrideTier || j.overrideScore), confidence: j.confidence, salaryMin: j.salaryMin, salaryMax: j.salaryMax, oteMin: j.oteMin, oteMax: j.oteMax, category: j.category, status: j.status, favorite: j.favorite, family: j.roleFamily, sources: [...new Set(j.sources.map((s) => s.provider))], application: j.applications[0] ?? null, excludedReason: j.excludedReason }));
  const pos = positioning(c.category, c.maturity);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <Logo src={c.logoUrl} name={c.name} size={56} />
        <div className="flex-1 min-w-[260px]">
          <h1 className="h1">{c.name}</h1>
          <div className="text-sm text-slate-500">{c.category} · {c.headquarters} · {c.ownership}{c.ticker ? ` (${c.ticker})` : ""} · {c.maturity}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {c.website && <a className="link" href={c.website} target="_blank" rel="noopener noreferrer">Website ↗</a>}
            {c.careersUrl && <a className="link" href={c.careersUrl} target="_blank" rel="noopener noreferrer">Careers ↗</a>}
            <a className="link" href={c.linkedinUrl ?? `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(c.name)}`} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AutoField endpoint={ep} field="favorite" type="checkbox" label="★ Favorite" value={c.favorite} />
          <RefreshButton companyId={c.id} label="Refresh this company's jobs" />
          <span className="text-xs text-slate-500 flex items-center gap-1.5"><StatusDot status={c.atsStatus} />Feed: {c.atsProvider !== "NONE" ? `${c.atsProvider.toLowerCase()} (${c.atsToken})` : c.atsStatus ?? "pending discovery"} · checked {dateTime(c.atsCheckedAt)}</span>
          {c.atsError && <span className="text-xs text-red-600 max-w-xs text-right">{c.atsError}</span>}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Available opportunities" action={<span className="text-xs text-slate-500">{c.jobs.length} verified suitable · {c.totalOpenings ?? "?"} total openings at company{other ? ` · ${other} relocation/excluded` : ""}</span>}>
            {rows.length ? <JobsTable rows={rows} compact /> : <Empty>No verified suitable opening right now. {c.totalOpenings ? `The company has ${c.totalOpenings} openings in other functions; it is hiring, but not for a role that fits you.` : ""} It stays on your monitor list and you will be alerted when one appears.</Empty>}
          </Card>
          <Card title="Company overview" action={<span className="flex items-center gap-2"><FactTag type={c.profileFactType} /><span className="text-xs text-slate-500">{c.profileVerifiedAt ? `verified ${date(c.profileVerifiedAt)}` : "not yet verified"}</span></span>}>
            <div className="grid sm:grid-cols-2 gap-3">
              <AutoField endpoint={ep} field="description" type="textarea" label="Business & positioning" value={c.description} className="sm:col-span-2" />
              <AutoField endpoint={ep} field="keyProducts" type="textarea" label="Key products" value={c.keyProducts} rows={2} />
              <AutoField endpoint={ep} field="buyerPersonas" type="textarea" label="Target buyer personas" value={c.buyerPersonas} rows={2} />
              <AutoField endpoint={ep} field="customers" type="textarea" label="Major customers" value={c.customers} rows={2} placeholder="Add only customers named publicly by the company" />
              <AutoField endpoint={ep} field="footprint" type="textarea" label="Geographic footprint" value={c.footprint} rows={2} />
              <AutoField endpoint={ep} field="category" type="select" label="Industry" value={c.category} options={CATEGORIES.map((x) => [x, x])} />
              <AutoField endpoint={ep} field="maturity" label="Maturity" value={c.maturity} />
            </div>
            <p className="mt-3 text-xs text-slate-500">Source: {c.profileSource}</p>
            <VerifyProfile id={c.id} />
          </Card>
          <Card title="Financial profile" action={c.financialVerifiedAt ? <span className="text-xs text-slate-500">verified {date(c.financialVerifiedAt)}</span> : <span className="chip bg-slate-100 text-slate-500">No verified figures</span>}>
            <p className="text-xs text-slate-500 mb-3">Enter only figures you have confirmed, with the source link. Nothing here is estimated or generated.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <AutoField endpoint={ep} field="revenue" label="Revenue" value={c.revenue} placeholder="e.g. $X ARR (FY2026)" />
              <AutoField endpoint={ep} field="revenueGrowth" label="Revenue growth" value={c.revenueGrowth} />
              <AutoField endpoint={ep} field="fundingSummary" label="Funding history" value={c.fundingSummary} />
              <AutoField endpoint={ep} field="valuation" label="Valuation" value={c.valuation} />
              <AutoField endpoint={ep} field="investors" label="Investors" value={c.investors} />
              <AutoField endpoint={ep} field="liquidityNotes" label="Potential liquidity events" value={c.liquidityNotes} />
              <AutoField endpoint={ep} field="financialSourceUrl" type="url" label="Source URL" value={c.financialSourceUrl} className="sm:col-span-2" />
            </div>
          </Card>
          <Card title="Recent developments & hiring signals">
            <ul className="space-y-2 text-sm mb-3">{c.news.map((n) => <li key={n.id}><span className="chip bg-slate-100 text-slate-600 mr-1">{n.kind}</span>{n.url ? <a className="link" href={n.url} target="_blank" rel="noopener noreferrer">{n.headline} ↗</a> : n.headline} <span className="text-xs text-slate-400">{date(n.publishedAt)}</span></li>)}</ul>
            {c.news.length === 0 && <p className="text-sm text-slate-500 mb-3">No developments recorded yet. Add announcements with their source link; they feed the morning briefing.</p>}
            <AddNews companyId={c.id} />
          </Card>
          <Card title="My activity">
            <div className="flex items-center justify-between mb-2"><div className="label !mb-0">Applications</div><NewApplication companyId={c.id} /></div>
            {c.applications.length ? <ul className="text-sm space-y-1 mb-4">{c.applications.map((a) => <li key={a.id}><Link className="link" href={`/applications/${a.id}`}>{a.title}</Link> · {STAGE_LABEL[a.stage]}{a.applied ? ` · applied ${date(a.appliedAt)}` : ""}{a.nextAction ? ` · next: ${a.nextAction}` : ""} · {a.touches.length} outreach</li>)}</ul> : <p className="text-sm text-slate-500 mb-4">No applications yet.</p>}
            <NoteForm companyId={c.id} />
            <ul className="mt-3 space-y-2 text-sm">{c.activities.map((n) => <li key={n.id} className="border-l-2 border-gold-500/60 pl-3"><div className="text-xs text-slate-500">{n.kind} · {dateTime(n.at)}</div><div className="whitespace-pre-wrap">{n.body}</div></li>)}</ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Career intelligence" action={<FactTag type="AI_ASSESSMENT" />}>
            <div className="grid grid-cols-2 gap-2 mb-3 text-center">
              <div className="rounded-lg bg-navy-950 p-3 text-white col-span-2"><div className="text-[11px] uppercase tracking-wider text-gold-300">Attractiveness</div><div className="text-3xl font-semibold tabular-nums">{attract}</div><div className="text-[11px] text-white/50">as a place to work, independent of open roles</div></div>
              <AutoField endpoint={ep} field="marketPositionScore" type="number" label="Market position" value={c.marketPositionScore} />
              <AutoField endpoint={ep} field="equityUpsideScore" type="number" label="Equity upside" value={c.equityUpsideScore} />
              <AutoField endpoint={ep} field="compCompetitiveness" type="number" label="Comp competitiveness" value={c.compCompetitiveness} />
              <AutoField endpoint={ep} field="userPriority" type="select" label="My priority" value={c.userPriority?.toString() ?? ""} options={[["", "—"], ["1", "1 · Top"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]} />
            </div>
            <div className="label">How to position yourself</div>
            <ul className="list-disc ml-4 text-sm space-y-1 mb-3">{pos.map((p) => <li key={p}>{p}</li>)}</ul>
            <AutoField endpoint={ep} field="assessmentRationale" type="textarea" label="Why this company is attractive" value={c.assessmentRationale} />
            <AutoField endpoint={ep} field="myContribution" type="textarea" label="My potential contribution" value={c.myContribution} className="mt-2" />
            <AutoField endpoint={ep} field="risks" type="textarea" label="Risks (equity, culture, stability)" value={c.risks} className="mt-2" />
            <AutoField endpoint={ep} field="cultureNotes" type="textarea" label="Culture & employment considerations" value={c.cultureNotes} className="mt-2" />
            <AutoField endpoint={ep} field="engagementStrategy" type="textarea" label="My engagement strategy" value={c.engagementStrategy} className="mt-2" />
            <p className="mt-2 text-[11px] text-slate-500">Scores are AI assessments from public positioning; edit them as you learn more. Changes rescore this company&apos;s jobs.</p>
          </Card>
          <Card title="Leadership & network">
            <ul className="space-y-2 text-sm mb-3">{c.leaders.map((l) => <li key={l.id}><div className="flex items-center gap-1.5"><b>{l.name}</b><FactTag type={l.factType} /></div><div className="text-xs text-slate-500">{l.title}{l.verifiedAt ? ` · verified ${date(l.verifiedAt)}` : ""}</div>{l.linkedinUrl && <a className="link text-xs" href={l.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>}</li>)}</ul>
            <AddLeader companyId={c.id} />
            <div className="label mt-4">Find on LinkedIn (opens LinkedIn search)</div>
            <div className="flex flex-wrap gap-1.5 text-xs">{["Chief Revenue Officer", "VP Sales", "Regional Vice President", "Director of Sales Development", "Head of Public Sector", "Sales Recruiter", "Talent Acquisition"].map((r) => <a key={r} className="chip bg-slate-100 text-navy-700 hover:bg-slate-200" href={li(c.name, r)} target="_blank" rel="noopener noreferrer">{r} ↗</a>)}</div>
            <div className="label mt-4">Your contacts here</div>
            {c.contacts.length ? <ul className="text-sm space-y-1">{c.contacts.map((p) => <li key={p.id}>{p.firstName} {p.lastName} <span className="text-xs text-slate-500">{p.title}{p.degree ? ` · ${p.degree}` : ""}</span>{p.linkedinUrl && <> · <a className="link text-xs" href={p.linkedinUrl} target="_blank" rel="noopener noreferrer">profile ↗</a></>}</li>)}</ul> : <p className="text-xs text-slate-500">None yet. Import your LinkedIn connections export in Network & Contacts to match people to this company.</p>}
          </Card>
          <Card title="Job feed configuration">
            <div className="space-y-2">
              <AutoField endpoint={ep} field="atsProvider" type="select" label="Provider" value={c.atsProvider} options={[["NONE", "Auto-discover / none"], ["GREENHOUSE", "Greenhouse"], ["LEVER", "Lever"], ["ASHBY", "Ashby"], ["SMARTRECRUITERS", "SmartRecruiters"], ["WORKDAY", "Workday"]]} />
              <AutoField endpoint={ep} field="atsToken" label="Board token (Workday: tenant|wdN|Site)" value={c.atsToken} />
              <AutoField endpoint={ep} field="careersUrl" type="url" label="Careers URL" value={c.careersUrl} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
