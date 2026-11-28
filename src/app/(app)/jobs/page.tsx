import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, StatusDot } from "@/components/ui";
import AutoRefresh from "@/components/AutoRefresh";
import { activeRun, nextScheduledRefresh } from "@/lib/ingest/run";
import { ago, titleCase } from "@/lib/format";
import JobsTable from "@/components/JobsTable";
import DiscoverViews from "@/components/DiscoverViews";
import JobDrawer from "@/components/JobDrawer";
import { capApplies, jobOrder, jobWhere, RANKINGS, type JobParams } from "@/lib/jobFilters";
import { companyCap, PER_COMPANY, withinCap } from "@/lib/companyCap";
import { FAMILY_LABEL } from "@/lib/roles";
import { CATEGORIES } from "@/data/companies";
import { JOB_ROW_INCLUDE, toRow } from "@/lib/jobRows";
import { feedHealth, feedVerdict, type FeedHealth } from "@/lib/feedHealth";

export const metadata = { title: "Discover" };
const PER = 50;

// The views shown as tabs; the other rankings sit in the More views menu. "Best now" and "Best fit" rank the same
// way (by score), so only Best fit is listed; old ?view=best links still work.
const TAB_VIEWS = ["quals", "cash", "growth", "remote"];
const MENU_VIEWS = ["leadership", "ai", "equity"];
const MORE_KEYS = ["tier", "company", "industry", "minComp", "posted", "fav"];

type Run = { status: string; finishedAt: Date | null; created: number; closed: number; errors: number } | null;
type Active = { startedAt: Date; trigger: string; done: number; total: number | null } | null;

export default async function JobsPage({ searchParams }: { searchParams: Promise<JobParams> }) {
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1);
  const cap = capApplies(p) ? await companyCap(prisma) : null;
  const where = cap ? { AND: [jobWhere(p), withinCap(cap.ids)] } : jobWhere(p);
  const [total, jobs, companies, lastRun] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({ where, orderBy: jobOrder(p), skip: (page - 1) * PER, take: PER, include: JOB_ROW_INCLUDE }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ingestionRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" } }),
  ]);
  const active = await activeRun(prisma);
  const qs = (o: Partial<JobParams>) => { const u = new URLSearchParams(Object.entries({ ...p, ...o }).filter(([, v]) => v) as [string, string][]); return `/jobs?${u}`; };
  const rows = jobs.map(toRow);
  // Feed Health on the plain feed: where the other open roles went. It opens by itself when the feed is short or broken.
  const health = cap && !p.view && !p.q?.trim() && !p.family ? await feedHealth(prisma, total, cap.hidden, where) : null;
  const restorable = ["EXCLUDED", "DISMISSED", "DUPLICATE"].includes(p.category ?? "");
  const current = p.status === "CLOSED" ? "closed" : p.category ? p.category.toLowerCase() : p.view && RANKINGS[p.view] ? (p.view === "best" ? "quals" : p.view) : "feed";
  const filters = activeFilters(p, companies);
  const keep = Object.entries({ view: p.view, category: p.category, status: p.status }).filter(([, v]) => v) as [string, string][];
  const clearAll = `/jobs${keep.length ? `?${new URLSearchParams(keep)}` : ""}`;
  const loc = locOf(p);

  return (
    <>
      <PageHeader title="Discover" sub={`${total.toLocaleString()} ${p.status === "CLOSED" ? "closed" : "open"} roles`} actions={<>{!health && <FeedStatus run={lastRun} active={active} />}<Link href="/jobs/new" className="btn-ghost">+ Add a company or job</Link></>}>
        <DiscoverViews current={current}
          tabs={[{ key: "feed", label: "Your Feed", href: "/jobs", hint: "Newest postings first, up to 3 per company" }, ...TAB_VIEWS.map((k) => ({ key: k, label: titleCase(RANKINGS[k].short), href: `/jobs?view=${k}`, hint: RANKINGS[k].label }))]}
          more={MENU_VIEWS.map((k) => ({ key: k, label: RANKINGS[k].label, href: `/jobs?view=${k}` }))}
          screened={[
            { key: "excluded", label: "Excluded by your rules", href: "/jobs?category=EXCLUDED" },
            { key: "dismissed", label: "Not a Fit", href: "/jobs?category=DISMISSED" },
            { key: "duplicate", label: "Duplicates", href: "/jobs?category=DUPLICATE" },
            { key: "closed", label: "Closed postings", href: "/jobs?status=CLOSED&category=ALL" },
          ]} />
      </PageHeader>

      <form action="/jobs" className="card mb-3 p-3">
        {p.view && <input type="hidden" name="view" value={p.view} />}
        {p.category && <input type="hidden" name="category" value={p.category} />}
        {p.status && <input type="hidden" name="status" value={p.status} />}
        <div className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={p.q} placeholder="Search title, company, location or keyword" aria-label="Search title, company, location or keyword" className="input min-w-[200px] flex-[2_1_260px]" />
          <select name="family" aria-label="Role type" defaultValue={p.family ?? ""} className="input flex-[1_1_170px]"><option value="">All role types</option>{Object.entries(FAMILY_LABEL).filter(([k]) => !["NOT_RELEVANT", "SDR_IC", "PARTNER_ALLIANCES"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select name="loc" aria-label="Where" defaultValue={loc} className="input flex-[1_1_170px]"><option value="">Anywhere in your rules</option><option value="phx">Phoenix area or remote</option><option value="remote">Remote only</option></select>
          {!p.view && <select name="sort" aria-label="Sort" defaultValue={p.sort ?? ""} className="input flex-[1_1_150px]"><option value="">Newest posted</option><option value="score">Match score</option><option value="comp">Pay</option><option value="new">Newest found</option><option value="company">Company</option><option value="location">Location</option></select>}
          <button className="btn-primary">Apply</button>
        </div>
        <details className="mt-2" open={filters.some((f) => MORE_KEYS.includes(f.key))}>
          <summary className="link inline-flex cursor-pointer list-none items-center gap-1 text-[13px] [&::-webkit-details-marker]:hidden">More filters <span aria-hidden>▾</span></summary>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <select name="tier" aria-label="Tier" defaultValue={p.tier ?? ""} className="input"><option value="">All tiers</option><option value="TIER1">Tier 1</option><option value="TIER2">Tier 2</option><option value="TIER3">Tier 3</option></select>
            <select name="company" aria-label="Company" defaultValue={p.company ?? ""} className="input"><option value="">All companies</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select name="industry" aria-label="Industry" defaultValue={p.industry ?? ""} className="input"><option value="">All industries</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <select name="minComp" aria-label="Minimum published pay" defaultValue={p.minComp ?? ""} className="input"><option value="">Any pay</option>{[150000, 200000, 250000, 300000, 350000].map((n) => <option key={n} value={n}>${n / 1000}K+</option>)}</select>
            <select name="posted" aria-label="Date posted" defaultValue={p.posted ?? ""} className="input"><option value="">Posted any time</option><option value="1">Last 24 hours</option><option value="3">Last 3 days</option><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="none">No date given</option></select>
            <label className="flex h-9 items-center gap-2 rounded-ctl border border-brand-200 bg-brand-50 px-3 text-[14px]"><input type="checkbox" name="fav" value="1" defaultChecked={p.fav === "1"} />Favorites only</label>
          </div>
        </details>
        {filters.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-ink-line pt-2 text-[13px]">
            <span className="text-ink-3">Filtered by</span>
            {filters.map((f) => <Link key={f.key} href={qs({ [f.key]: "", ...(f.key === "loc" ? { near: "", remote: "" } : {}), page: "", job: "" })} className="chip tone-progress gap-1 hover:bg-brand-200" aria-label={`Remove filter: ${f.label}`}>{f.label}<span aria-hidden>×</span></Link>)}
            <Link href={clearAll} className="link ml-1">Clear all</Link>
          </div>
        )}
      </form>

      {health && <FeedCheck h={health} short={total < 10} showAll={qs({ all: "1", page: "", job: "" })} run={lastRun} active={active} />}
      {(cap && cap.hidden > 0) || p.all === "1" ? (
        <p className="mb-2 text-[13px] text-ink-3">{p.all === "1" ? <>Showing every role. <Link className="link" href={qs({ all: "", page: "", job: "" })}>Back to {PER_COMPANY} per company</Link></> : <>Showing up to {PER_COMPANY} per company. <Link className="link" href={qs({ all: "1", page: "", job: "" })}>Show {cap!.hidden} more</Link></>}</p>
      ) : null}
      <JobsTable rows={rows} restorable={restorable} />
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-ink-3">Page {page} of {Math.max(1, Math.ceil(total / PER))}</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="btn-ghost" href={qs({ page: String(page - 1), job: "" })}>← Previous</Link>}
          {page * PER < total && <Link className="btn-ghost" href={qs({ page: String(page + 1), job: "" })}>Next →</Link>}
        </div>
      </div>
      {p.job && <JobDrawer id={p.job} closeHref={qs({ job: "" })} />}
    </>
  );
}

/** The "Where" choice, read from the new single control or the older Remote / Phoenix-area checkboxes in saved links. */
const locOf = (p: JobParams) => p.loc ?? (p.near === "phx" ? "phx" : p.remote === "1" ? "remote" : "");

/** Every filter in force, with a short label, so a filter tucked under "More filters" is never invisible. */
function activeFilters(p: JobParams, companies: { id: string; name: string }[]) {
  const out: { key: keyof JobParams; label: string }[] = [];
  if (p.q?.trim()) out.push({ key: "q", label: `“${p.q.trim()}”` });
  if (p.family) out.push({ key: "family", label: FAMILY_LABEL[p.family as keyof typeof FAMILY_LABEL] ?? p.family });
  const loc = locOf(p);
  if (loc) out.push({ key: "loc", label: loc === "phx" ? "Phoenix area or remote" : "Remote only" });
  if (p.tier) out.push({ key: "tier", label: p.tier.replace("TIER", "Tier ") });
  if (p.company) out.push({ key: "company", label: companies.find((c) => c.id === p.company)?.name ?? "One company" });
  if (p.industry) out.push({ key: "industry", label: p.industry });
  if (p.minComp) out.push({ key: "minComp", label: `$${Number(p.minComp) / 1000}K+ pay` });
  if (p.posted) out.push({ key: "posted", label: p.posted === "none" ? "No posted date" : `Posted in the last ${p.posted === "1" ? "24 hours" : `${p.posted} days`}` });
  if (p.fav === "1") out.push({ key: "fav", label: "Favorites" });
  if (p.minScore) out.push({ key: "minScore", label: `Score ${p.minScore}+` });
  return out;
}

/** When the feeds last ran, or that a refresh is running now: one line, used in the banner and the Feed Health summary. */
function feedText(run: Run, active: Active) {
  const next = nextScheduledRefresh().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" });
  return active ? `${active.trigger === "cron" ? "Morning" : active.trigger === "hourly" ? "Hourly" : "Automatic"} refresh running${active.total ? `: ${active.done} of ${active.total} boards` : ""}` : `${!run ? "Never refreshed" : `Refreshed ${ago(run.finishedAt!)}`} · next ${next}`;
}
const runTitle = (run: Run) => (run?.finishedAt ? `Last finished refresh ${ago(run.finishedAt)}: ${run.status}, ${run.created} new, ${run.closed} closed, ${run.errors} feed errors` : undefined);
const ACTIVE_TITLE = "Runs on its own outside the app. Pages, kits and saving keep working while it runs.";

/** Feed status as one small pill in the banner, for views that don't show the Feed Health panel. */
function FeedStatus({ run, active }: { run: Run; active: Active }) {
  return <span title={active ? ACTIVE_TITLE : runTitle(run)} className="inline-flex items-center gap-2 rounded-ctl bg-white/15 px-3 py-1.5 text-[13px] font-semibold text-white ring-1 ring-white/25"><StatusDot status={active ? "degraded" : run?.status} />{feedText(run, active)}{active && <AutoRefresh />}</span>;
}

/** Feed Health: when the feeds last ran, a one-line verdict, and (opened) where every open role went, counted once each. */
function FeedCheck({ h, short, showAll, run, active }: { h: FeedHealth; short: boolean; showAll: string; run: Run; active: Active }) {
  const v = feedVerdict(h);
  const items: [string, number, string][] = [
    ["In your feed", h.inFeed, "/jobs"],
    ["Posted this week", h.postedThisWeek, "/jobs?posted=7"],
    ["No posted date given", h.undated, "/jobs?posted=none"],
    ["Posted over 30 days ago", h.aged, "/jobs?category=EXCLUDED"],
    ["Outside your location rules", h.location, "/jobs?category=EXCLUDED"],
    ["Other screen-outs", h.otherScreened, "/jobs?category=EXCLUDED"],
    ["Over 3 per company", h.heldByCap, showAll],
    ["Saved to Ready to Apply", h.saved, "/apply"],
    ["Applied", h.applied, "/applications?view=table&applied=1"],
    ["Not a Fit", h.notAFit, "/jobs?category=DISMISSED"],
    ["Marked Duplicate", h.duplicates, "/jobs?category=DUPLICATE"],
    ["Copies merged this week", h.merged, "/alerts?kind=merged"],
  ];
  return (
    <details open={short || !v.ok} className={`card mb-3 ${v.ok ? "" : "ring-2 ring-rose-300"}`}>
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px] text-ink-3 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink"><StatusDot status={active ? "degraded" : v.ok ? "ok" : "error"} />Feed Health</span>
        <span title={active ? ACTIVE_TITLE : runTitle(run)}>{feedText(run, active)}{active && <AutoRefresh />}</span>
        <span className="min-w-0 flex-1 basis-[280px]">{v.text}</span>
        <span className="link">Details ▾</span>
      </summary>
      <div className="border-t border-ink-line px-4 pb-4 pt-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {items.map(([label, n, href]) => (
            <Link key={label} href={href} className="rounded-ctl bg-brand-50 px-3 py-2 hover:bg-brand-100">
              <div className="text-[20px] font-semibold leading-tight tabular-nums text-ink">{n.toLocaleString()}</div>
              <div className="text-[13px] text-ink-3">{label}</div>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-ink-3">
          Job boards: {h.feedsOk} reading fine, <Link className="link" href="/settings">{h.feedsFailed} failing</Link>, {h.noFeed} with no public job feed, out of {h.companies} companies. <Link className="link" href="/jobs?posted=1">{h.postedToday} posted in the last 24 hours</Link>.
        </p>
      </div>
    </details>
  );
}
