import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import JobsTable from "@/components/JobsTable";
import SavedFilters from "@/components/SavedFilters";
import { jobOrder, jobWhere, RANKINGS, type JobParams } from "@/lib/jobFilters";
import { FAMILY_LABEL } from "@/lib/roles";
import { CATEGORIES } from "@/data/companies";
import { effectiveScore, effectiveTier } from "@/lib/scoring";

export const metadata = { title: "Discover Jobs" };
const PER = 50;

export default async function JobsPage({ searchParams }: { searchParams: Promise<JobParams> }) {
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1);
  const where = jobWhere(p);
  const [total, jobs, companies] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({ where, orderBy: jobOrder(p), skip: (page - 1) * PER, take: PER, include: { company: { select: { id: true, name: true, logoUrl: true, category: true } }, applications: { select: { id: true, stage: true, applied: true } }, sources: { select: { provider: true } } } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const qs = (o: Partial<JobParams>) => { const u = new URLSearchParams(Object.entries({ ...p, ...o }).filter(([, v]) => v) as [string, string][]); return `/jobs?${u}`; };
  const rows = jobs.map((j) => ({
    id: j.id, title: j.title, company: j.company, location: j.location, arrangement: j.workArrangement, postedAt: j.postedAt?.toISOString() ?? null, firstSeenAt: j.firstSeenAt.toISOString(),
    lastVerifiedAt: j.lastVerifiedAt.toISOString(), applyUrl: j.applyUrl, score: effectiveScore(j), aiScore: j.score, tier: effectiveTier(j), overridden: !!(j.overrideTier || j.overrideScore), confidence: j.confidence,
    salaryMin: j.salaryMin, salaryMax: j.salaryMax, oteMin: j.oteMin, oteMax: j.oteMax, category: j.category, status: j.status, favorite: j.favorite,
    family: j.roleFamily, sources: [...new Set(j.sources.map((s) => s.provider))], application: j.applications[0] ?? null, excludedReason: j.excludedReason,
  }));

  return (
    <>
      <PageHeader title="Discover Jobs" sub={`${total.toLocaleString()} ${p.status === "CLOSED" ? "closed" : "verified open"} roles from first-party employer job boards. Every link opens the employer's own posting.`} actions={<Link href="/jobs/new" className="btn-ghost">Add a job by URL</Link>} />
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Link href="/jobs" className={`chip px-3 py-1 ${!p.view && !p.category ? "bg-navy-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>Main rankings</Link>
        {Object.entries(RANKINGS).map(([k, r]) => <Link key={k} href={`/jobs?view=${k}`} className={`chip px-3 py-1 ${p.view === k ? "bg-navy-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>{r.label}</Link>)}
        <Link href="/jobs?category=STRETCH" className={`chip px-3 py-1 ${p.category === "STRETCH" ? "bg-navy-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>Stretch roles</Link>
        <Link href="/jobs?category=RELOCATION" className={`chip px-3 py-1 ${p.category === "RELOCATION" ? "bg-navy-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>Relocation opportunities</Link>
        <Link href="/jobs?category=EXCLUDED" className={`chip px-3 py-1 ${p.category === "EXCLUDED" ? "bg-navy-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>Excluded</Link>
        <Link href="/jobs?category=DISMISSED" className={`chip px-3 py-1 ${p.category === "DISMISSED" ? "bg-navy-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>Not a fit</Link>
        <Link href="/jobs?category=DUPLICATE" className={`chip px-3 py-1 ${p.category === "DUPLICATE" ? "bg-navy-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>Duplicates</Link>
        <Link href="/jobs?status=CLOSED&category=ALL" className={`chip px-3 py-1 ${p.status === "CLOSED" ? "bg-navy-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-600"}`}>Closed (history)</Link>
      </div>
      <form className="card p-3 mb-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-2 items-end" action="/jobs">
        {p.view && <input type="hidden" name="view" value={p.view} />}
        {p.category && <input type="hidden" name="category" value={p.category} />}
        {p.status && <input type="hidden" name="status" value={p.status} />}
        <div className="col-span-2"><label className="label">Search</label><input name="q" defaultValue={p.q} placeholder="Title, company, location, keyword" className="input" /></div>
        <div><label className="label">Tier</label><select name="tier" defaultValue={p.tier ?? ""} className="input"><option value="">All</option><option value="TIER1">Tier 1</option><option value="TIER2">Tier 2</option><option value="TIER3">Tier 3</option></select></div>
        <div><label className="label">Company</label><select name="company" defaultValue={p.company ?? ""} className="input"><option value="">All</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="label">Industry</label><select name="industry" defaultValue={p.industry ?? ""} className="input"><option value="">All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label">Role type</label><select name="family" defaultValue={p.family ?? ""} className="input"><option value="">All</option>{Object.entries(FAMILY_LABEL).filter(([k]) => !["NOT_RELEVANT", "SDR_IC"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Min pay (published)</label><select name="minComp" defaultValue={p.minComp ?? ""} className="input"><option value="">Any</option>{[150000, 200000, 250000, 300000, 350000].map((n) => <option key={n} value={n}>${n / 1000}K+</option>)}</select></div>
        <div><label className="label">Sort</label><select name="sort" defaultValue={p.sort ?? ""} className="input"><option value="">Match score</option><option value="comp">Compensation</option><option value="new">Newest found</option><option value="posted">Posted date</option><option value="company">Company</option><option value="location">Location</option></select></div>
        <div className="flex gap-3 items-center text-sm"><label className="flex items-center gap-1"><input type="checkbox" name="remote" value="1" defaultChecked={p.remote === "1"} />Remote</label><label className="flex items-center gap-1"><input type="checkbox" name="fav" value="1" defaultChecked={p.fav === "1"} />★</label><button className="btn-primary">Apply</button></div>
      </form>
      <SavedFilters page="jobs" />
      <JobsTable rows={rows} />
      <div className="flex items-center justify-between mt-3 text-sm">
        <span className="muted">Page {page} of {Math.max(1, Math.ceil(total / PER))}</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="btn-ghost" href={qs({ page: String(page - 1) })}>← Previous</Link>}
          {page * PER < total && <Link className="btn-ghost" href={qs({ page: String(page + 1) })}>Next →</Link>}
        </div>
      </div>
    </>
  );
}
