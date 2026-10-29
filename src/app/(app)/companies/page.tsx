import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PageHeader, Logo, StatusDot } from "@/components/ui";
import { CATEGORIES } from "@/data/companies";
import { MATCHING } from "@/lib/queries";
import { companyAttractiveness } from "@/lib/scoring";
import { growthOutlook } from "@/lib/growth";
import SavedFilters from "@/components/SavedFilters";

export const metadata = { title: "Company Intelligence" };
type P = { q?: string; category?: string; ownership?: string; openings?: string; feed?: string; sort?: string; fav?: string };

export default async function Companies({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const where: Prisma.CompanyWhereInput = { AND: [
    p.q ? { OR: [{ name: { contains: p.q, mode: "insensitive" } }, { description: { contains: p.q, mode: "insensitive" } }, { keyProducts: { contains: p.q, mode: "insensitive" } }] } : {},
    p.category ? { category: p.category } : {},
    p.ownership === "public" ? { ownership: { startsWith: "Public" } } : p.ownership === "private" ? { NOT: { ownership: { startsWith: "Public" } } } : {},
    p.openings === "none" ? { jobs: { none: MATCHING } } : p.openings === "some" ? { jobs: { some: MATCHING } } : {},
    p.feed ? { atsStatus: p.feed } : {},
    p.fav === "1" ? { favorite: true } : {},
  ] };
  const companies = await prisma.company.findMany({ where, include: { jobs: { where: MATCHING, select: { score: true, overrideScore: true, tier: true, overrideTier: true } }, news: { where: { kind: "funding" }, select: { kind: true, headline: true, publishedAt: true, createdAt: true } }, _count: { select: { applications: true } } } });
  const rows = companies.map((c) => ({ ...c, attract: companyAttractiveness(c), growth: growthOutlook(c), matches: c.jobs.length, best: Math.max(0, ...c.jobs.map((j) => j.overrideScore ?? j.score ?? 0)), tier1: c.jobs.filter((j) => (j.overrideTier ?? j.tier) === "TIER1").length }));
  const sort = p.sort ?? "attract";
  rows.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "matches" ? b.matches - a.matches || b.best - a.best : sort === "best" ? b.best - a.best : sort === "growth" ? b.growth.score - a.growth.score : (b.userPriority ? 6 - b.userPriority : 0) - (a.userPriority ? 6 - a.userPriority : 0) || b.attract - a.attract);
  const sortLink = (k: string, l: string) => <Link href={`/companies?${new URLSearchParams({ ...p, sort: k } as Record<string, string>)}`} className={sort === k ? "text-navy-900 underline" : ""}>{l}</Link>;
  return (
    <>
      <PageHeader title="Company Intelligence" sub={`${rows.length} companies. Company attractiveness is ranked separately from whether a suitable role is open today.`} actions={<Link href="/companies/new" className="btn-primary">+ Add company</Link>} />
      <form className="card p-3 mb-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end" action="/companies">
        <div className="col-span-2"><label className="label">Search</label><input name="q" defaultValue={p.q} className="input" placeholder="Name, product, description" /></div>
        <div><label className="label">Industry</label><select name="category" defaultValue={p.category ?? ""} className="input"><option value="">All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label">Ownership</label><select name="ownership" defaultValue={p.ownership ?? ""} className="input"><option value="">All</option><option value="public">Public</option><option value="private">Private / subsidiary</option></select></div>
        <div><label className="label">Suitable openings</label><select name="openings" defaultValue={p.openings ?? ""} className="input"><option value="">Any</option><option value="some">Has open matches</option><option value="none">None right now (monitor)</option></select></div>
        <div className="flex items-center gap-3"><label className="text-sm flex items-center gap-1"><input type="checkbox" name="fav" value="1" defaultChecked={p.fav === "1"} />★</label><button className="btn-primary">Filter</button></div>
        <input type="hidden" name="sort" value={sort} />
      </form>
      <SavedFilters page="companies" />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>{sortLink("name", "Company")}</th><th>Industry</th><th>HQ</th><th>Ownership</th><th title="AI assessment">{sortLink("attract", "Attractiveness")}</th><th title="Potential for very fast growth: AI assessment plus hiring and funding signals">{sortLink("growth", "Growth")}</th><th>{sortLink("matches", "Open matches")}</th><th>{sortLink("best", "Best fit")}</th><th>Feed</th><th>Pipeline</th><th></th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}>
              <td className="min-w-[200px]"><Link href={`/companies/${c.id}`} className="inline-flex items-center gap-2 font-medium hover:underline"><Logo src={c.logoUrl} name={c.name} size={22} />{c.favorite && <span className="text-gold-500">★</span>}{c.name}</Link><div className="text-xs text-slate-500 ml-8">{c.maturity}</div></td>
              <td className="text-xs">{c.category}</td><td className="text-xs whitespace-nowrap">{c.headquarters}</td><td className="text-xs">{c.ownership}{c.ticker ? ` (${c.ticker})` : ""}</td>
              <td><span className="font-semibold tabular-nums">{c.attract}</span><span className="text-[10px] text-violet-600 ml-1">AI</span></td>
              <td title={c.growth.signals.map((s) => s.text).join("\n")}>{c.growth.assessed ? <><span className="font-semibold tabular-nums">{c.growth.score}</span><div className={`text-[10px] whitespace-nowrap ${c.growth.score >= 85 ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>{c.growth.label}</div></> : <span className="text-xs text-slate-400">—</span>}</td>
              <td className="tabular-nums">{c.matches ? <Link className="link" href={`/jobs?company=${c.id}`}>{c.matches}{c.tier1 ? ` (${c.tier1} T1)` : ""}</Link> : <span className="text-xs text-slate-400">No suitable role</span>}</td>
              <td className="tabular-nums">{c.best || "—"}</td>
              <td className="text-xs whitespace-nowrap" title={c.atsError ?? undefined}><StatusDot status={c.atsStatus} /> {c.atsProvider !== "NONE" ? c.atsProvider.toLowerCase() : c.atsStatus === "unsupported" ? "manual" : c.atsStatus ?? "pending"}</td>
              <td className="text-xs">{c._count.applications || "—"}</td>
              <td>{c.careersUrl && <a href={c.careersUrl} target="_blank" rel="noopener noreferrer" className="link text-xs whitespace-nowrap">Careers ↗</a>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
