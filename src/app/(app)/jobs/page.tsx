import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, StatusDot } from "@/components/ui";
import RefreshButton from "@/components/RefreshButton";
import { ago, titleCase } from "@/lib/format";
import JobsTable from "@/components/JobsTable";
import SavedFilters from "@/components/SavedFilters";
import { capApplies, jobOrder, jobWhere, RANKINGS, type JobParams } from "@/lib/jobFilters";
import { companyCap, PER_COMPANY, withinCap } from "@/lib/companyCap";
import { FAMILY_LABEL } from "@/lib/roles";
import { CATEGORIES } from "@/data/companies";
import { JOB_ROW_INCLUDE, toRow } from "@/lib/jobRows";

export const metadata = { title: "Discover Jobs" };
const PER = 50;

export default async function JobsPage({ searchParams }: { searchParams: Promise<JobParams> }) {
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1);
  const cap = capApplies(p) ? await companyCap(prisma) : null;
  const where = cap ? { AND: [jobWhere(p), withinCap(cap.ids)] } : jobWhere(p);
  const [total, jobs, companies, lastRun] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({ where, orderBy: jobOrder(p), skip: (page - 1) * PER, take: PER, include: JOB_ROW_INCLUDE }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ingestionRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);
  const qs = (o: Partial<JobParams>) => { const u = new URLSearchParams(Object.entries({ ...p, ...o }).filter(([, v]) => v) as [string, string][]); return `/jobs?${u}`; };
  const rows = jobs.map(toRow);
  const ON = "bg-white text-[#5D36FF] font-semibold shadow-sm", OFF = "bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25";

  return (
    <>
      <PageHeader title="Discover Jobs" sub={`${total.toLocaleString()} ${p.status === "CLOSED" ? "closed" : "open"} roles`} actions={<><FeedStatus run={lastRun} /><RefreshButton /><Link href="/jobs/new" className="btn-ghost">Add a job by URL</Link></>}>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <Link href="/jobs" className={`chip px-3 py-1 text-[13px] ${!p.view && !p.category ? ON : OFF}`}>Your Feed</Link>
        {Object.entries(RANKINGS).map(([k, r]) => <Link key={k} href={`/jobs?view=${k}`} title={r.label} className={`chip px-3 py-1 text-[13px] ${p.view === k ? ON : OFF}`}>{titleCase(r.short)}</Link>)}
        <Link href="/jobs?category=EXCLUDED" className={`chip px-3 py-1 text-[13px] ${p.category === "EXCLUDED" ? ON : OFF}`}>Excluded</Link>
        <Link href="/jobs?category=DISMISSED" className={`chip px-3 py-1 text-[13px] ${p.category === "DISMISSED" ? ON : OFF}`}>Not a Fit</Link>
        <Link href="/jobs?category=DUPLICATE" className={`chip px-3 py-1 text-[13px] ${p.category === "DUPLICATE" ? ON : OFF}`}>Duplicates</Link>
        <Link href="/jobs?status=CLOSED&category=ALL" className={`chip px-3 py-1 text-[13px] ${p.status === "CLOSED" ? ON : OFF}`}>Closed</Link>
      </div>
      <form className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-2 items-center" action="/jobs">
        {p.view && <input type="hidden" name="view" value={p.view} />}
        {p.category && <input type="hidden" name="category" value={p.category} />}
        {p.status && <input type="hidden" name="status" value={p.status} />}
        <div className="col-span-2"><input name="q" defaultValue={p.q} placeholder="Search" aria-label="Search title, company, location or keyword" className="input" /></div>
        <div><select name="tier" aria-label="Tier" defaultValue={p.tier ?? ""} className="input"><option value="">All tiers</option><option value="TIER1">Tier 1</option><option value="TIER2">Tier 2</option><option value="TIER3">Tier 3</option></select></div>
        <div><select name="company" aria-label="Company" defaultValue={p.company ?? ""} className="input"><option value="">All companies</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><select name="industry" aria-label="Industry" defaultValue={p.industry ?? ""} className="input"><option value="">All industries</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><select name="family" aria-label="Role type" defaultValue={p.family ?? ""} className="input"><option value="">All role types</option>{Object.entries(FAMILY_LABEL).filter(([k]) => !["NOT_RELEVANT", "SDR_IC"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><select name="minComp" aria-label="Minimum published pay" defaultValue={p.minComp ?? ""} className="input"><option value="">Any pay</option>{[150000, 200000, 250000, 300000, 350000].map((n) => <option key={n} value={n}>${n / 1000}K+</option>)}</select></div>
        <div><select name="sort" aria-label="Sort" defaultValue={p.sort ?? ""} className="input"><option value="">Most recent</option><option value="score">Match score</option><option value="comp">Compensation</option><option value="new">Newest found</option><option value="company">Company</option><option value="location">Location</option></select></div>
        <div className="flex gap-3 items-center text-sm text-white"><label className="flex items-center gap-1"><input type="checkbox" name="remote" value="1" defaultChecked={p.remote === "1"} />Remote</label><label className="flex items-center gap-1"><input type="checkbox" name="fav" value="1" defaultChecked={p.fav === "1"} />★</label><button className="btn-primary">Apply</button></div>
      </form>
      </PageHeader>
      {cap && cap.hidden > 0 && <p className="mb-2 text-[13px] text-slate-500">{PER_COMPANY} per company · <Link className="link" href={qs({ all: "1", page: "" })}>Show {cap.hidden} more</Link></p>}
      {p.all === "1" && <p className="mb-2 text-[13px] text-slate-500"><Link className="link" href={qs({ all: "", page: "" })}>Back to {PER_COMPANY} per company</Link></p>}
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

/** Feed health as one small pill in the banner: a status dot and how long ago the feeds were read. */
function FeedStatus({ run }: { run: { status: string; finishedAt: Date | null; created: number; closed: number; errors: number } | null }) {
  const text = !run ? "Never refreshed" : run.finishedAt ? ago(run.finishedAt) : "Refreshing…";
  const title = run?.finishedAt ? `Last refresh ${ago(run.finishedAt)}: ${run.status}, ${run.created} new, ${run.closed} closed, ${run.errors} feed errors` : undefined;
  return <span title={title} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-[#5D36FF] shadow-sm"><StatusDot status={run?.status} />{text}</span>;
}
