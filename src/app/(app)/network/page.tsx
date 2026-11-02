import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, Empty, HeroStat, PageHeader, ScoreBadge } from "@/components/ui";
import { ContactImport } from "@/components/ContactWidgets";
import { ReachOut } from "@/components/NetworkWidgets";
import { appLabel, askFirst, isHiring, loadNetwork, PERSON_LABEL, type NetCompany, type NetPerson, type PersonType } from "@/lib/network";
import { date } from "@/lib/format";

export const metadata = { title: "My Network" };
export const dynamic = "force-dynamic";

type P = { view?: string; q?: string; who?: string; scope?: string; status?: string; company?: string; sort?: string; page?: string };
const PER = 50;
const TYPES = Object.keys(PERSON_LABEL) as PersonType[];
/** One row per employer: a tracked company gathers every spelling ("Workday", "Workday VNDLY"); others group by name. */
const groupKey = (x: NetPerson) => (x.companyId ? `co-${x.companyId}` : x.key);

export default async function NetworkPage({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  const { people, companies } = await loadNetwork(prisma);
  const co = (x: NetPerson) => (x.companyId ? companies.get(x.companyId) : undefined);
  const hiringPeople = people.filter((x) => isHiring(co(x)));
  const view = p.view === "all" || p.view === "companies" || p.view === "hiring" ? p.view : p.company || p.who || p.status || p.scope ? "all" : hiringPeople.length ? "hiring" : "all";
  const qs = (o: Partial<P>) => { const u = new URLSearchParams(Object.entries({ ...p, page: "", ...o }).filter(([, v]) => v) as [string, string][]); return `/network?${u}`; };

  // Filters shared by the people lists.
  const words = (p.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const keep = (x: NetPerson) =>
    (!words.length || words.every((w) => `${x.name} ${x.title ?? ""} ${x.companyName ?? ""}`.toLowerCase().includes(w))) &&
    (!p.who || x.type === p.who) &&
    (!p.company || groupKey(x) === p.company) &&
    (p.scope !== "targets" || !!x.companyId) &&
    (p.scope !== "hiring" || isHiring(co(x))) &&
    (p.status !== "new" || !x.lastTouch) && (p.status !== "contacted" || !!x.lastTouch) && (p.status !== "replied" || !!x.lastTouch?.replied);
  const order = p.sort === "recent" ? (a: NetPerson, b: NetPerson) => (b.connectedOn?.getTime() ?? 0) - (a.connectedOn?.getTime() ?? 0)
    : p.sort === "name" ? (a: NetPerson, b: NetPerson) => a.name.localeCompare(b.name)
    : p.sort === "company" ? (a: NetPerson, b: NetPerson) => (a.companyName ?? "~").localeCompare(b.companyName ?? "~") || a.name.localeCompare(b.name)
    : askFirst(companies);

  const reached = people.filter((x) => x.lastTouch);
  const companyLabel = p.company ? (p.company.startsWith("co-") ? companies.get(p.company.slice(3))?.name : people.find((x) => x.key === p.company)?.companyName) ?? p.company : null;
  const ON = "bg-white text-[#5D36FF] font-semibold shadow-sm", OFF = "bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25";

  return (
    <>
      <PageHeader title="My Network" icon="people" sub={`${people.length.toLocaleString()} connections`} actions={<Link href="/contacts" className="btn-ghost">Import LinkedIn Export</Link>}>
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          <HeroStat label="Connections" value={people.length.toLocaleString()} href="/network?view=all" icon="people" />
          <HeroStat label="At Target Accounts" value={people.filter((x) => x.companyId).length} href="/network?view=all&scope=targets" icon="building" />
          <HeroStat label="Inside Companies Hiring" value={hiringPeople.length} href="/network?view=hiring" icon="briefcase" highlight />
          <HeroStat label="Recruiters" value={people.filter((x) => x.type === "recruiter").length} href="/network?view=all&who=recruiter" icon="search" />
          <HeroStat label="Reached Out" value={reached.length} sub={`${reached.filter((x) => x.lastTouch?.replied).length} replied`} href="/network?view=all&status=contacted" icon="send" />
        </div>
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          <Link href={qs({ view: "hiring" })} className={`chip px-3 py-1 text-[13px] ${view === "hiring" ? ON : OFF}`}>Openings in My Network</Link>
          <Link href={qs({ view: "all" })} className={`chip px-3 py-1 text-[13px] ${view === "all" ? ON : OFF}`}>All Connections</Link>
          <Link href={qs({ view: "companies", company: "" })} className={`chip px-3 py-1 text-[13px] ${view === "companies" ? ON : OFF}`}>By Company</Link>
        </div>
        <form action="/network" className="grid grid-cols-2 items-center gap-2 md:grid-cols-4 xl:grid-cols-7">
          <input type="hidden" name="view" value={view} />
          {p.company && <input type="hidden" name="company" value={p.company} />}
          <div className="col-span-2"><input name="q" defaultValue={p.q} placeholder={view === "companies" ? "Search companies" : "Search name, title or company"} aria-label="Search" className="input" /></div>
          {view !== "companies" && <>
            <select name="who" aria-label="Who" defaultValue={p.who ?? ""} className="input"><option value="">Everyone</option>{TYPES.map((t) => <option key={t} value={t}>{PERSON_LABEL[t]}</option>)}</select>
            <select name="scope" aria-label="Companies" defaultValue={p.scope ?? ""} className="input"><option value="">All companies</option><option value="targets">Target accounts</option><option value="hiring">Hiring now</option></select>
            <select name="status" aria-label="Outreach" defaultValue={p.status ?? ""} className="input"><option value="">Any outreach</option><option value="new">Not contacted yet</option><option value="contacted">Reached out</option><option value="replied">Replied</option></select>
            <select name="sort" aria-label="Sort" defaultValue={p.sort ?? ""} className="input"><option value="">Best to ask first</option><option value="recent">Recently connected</option><option value="company">Company</option><option value="name">Name</option></select>
          </>}
          <div className="flex gap-2"><button className="btn-primary">Apply</button>{(p.q || p.who || p.scope || p.status || p.company || p.sort) && <Link href={`/network?view=${view}`} className="btn-ghost">Clear</Link>}</div>
        </form>
        {companyLabel && view !== "companies" && <div className="mt-2.5"><Link href={qs({ company: "" })} className="chip bg-white px-3 py-1 text-[13px] font-semibold text-[#5D36FF]">{companyLabel} ✕</Link></div>}
      </PageHeader>

      {people.length === 0 ? (
        <Card title="Import Your LinkedIn Connections" icon="people"><ContactImport /></Card>
      ) : view === "hiring" ? (
        <Hiring people={people.filter(keep)} companies={companies} order={order} qs={qs} />
      ) : view === "companies" ? (
        <ByCompany people={people} companies={companies} q={words} qs={qs} />
      ) : (
        <AllPeople people={people.filter(keep).sort(order)} companies={companies} page={Math.max(1, Number(p.page) || 1)} qs={qs} />
      )}
    </>
  );
}

function openingsFor(c: NetCompany | undefined) {
  if (!c) return [];
  const applied = c.apps.map((a) => ({ title: a.title, applied: a.applied }));
  return [...applied, ...c.roles.filter((r) => !applied.some((a) => a.title === r.title)).map((r) => ({ title: r.title, applied: false }))];
}

function PersonRow({ x, c, showCompany = true }: { x: NetPerson; c?: NetCompany; showCompany?: boolean }) {
  const initials = x.name.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#ece7ff] px-4 py-3 last:border-b-0">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ebe5ff] text-[14px] font-semibold text-[#5D36FF]">{initials}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/contacts/${x.id}`} className="text-[15px] font-semibold text-navy-950 hover:underline">{x.name}</Link>
          <span className={`chip text-[12px] ${x.type === "recruiter" ? "bg-[#5D36FF] text-white" : x.type === "leader" ? "bg-[#A100C2] text-white" : x.type === "exec" ? "bg-[#7458FF] text-white" : "bg-[#ebe5ff] text-[#4424e6]"}`}>{PERSON_LABEL[x.type]}</span>
          {x.lastTouch && <span className={`chip text-[12px] ${x.lastTouch.replied ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{x.lastTouch.replied ? "Replied" : `Reached out ${date(x.lastTouch.sentAt)}`}</span>}
        </div>
        <div className="text-[13.5px] text-slate-600">
          {x.title ?? "No title on LinkedIn"}
          {showCompany && x.companyName && <> · {c ? <Link href={`/companies/${c.id}`} className="font-medium text-[#4424e6] hover:underline">{x.companyName}</Link> : x.companyName}</>}
          {showCompany && c && isHiring(c) && <span className="ml-2 font-semibold text-[#A100C2]">{c.openRoles ? `${c.openRoles} open role${c.openRoles === 1 ? "" : "s"}` : appLabel(c.apps[0])}</span>}
          {x.connectedOn && <span className="text-slate-500"> · Connected {date(x.connectedOn)}</span>}
        </div>
      </div>
      {/* display:contents so an open Reach Out panel can wrap onto its own full-width line */}
      <div className="contents">
        {x.linkedinUrl && <a href={x.linkedinUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1.5 shrink-0">LinkedIn ↗</a>}
        <ReachOut key={x.id} contactId={x.id} first={x.first} company={x.companyName ?? c?.name ?? ""} type={x.type} linkedinUrl={x.linkedinUrl} email={x.email} openings={openingsFor(c)} />
      </div>
    </li>
  );
}

function Hiring({ people, companies, order, qs }: { people: NetPerson[]; companies: Map<string, NetCompany>; order: (a: NetPerson, b: NetPerson) => number; qs: (o: Partial<P>) => string }) {
  const groups = new Map<string, NetPerson[]>();
  for (const x of people) if (x.companyId && isHiring(companies.get(x.companyId))) (groups.get(x.companyId) ?? groups.set(x.companyId, []).get(x.companyId)!).push(x);
  const list = [...groups.entries()].map(([id, ps]) => ({ c: companies.get(id)!, ps: ps.sort(order) }))
    .sort((a, b) => b.c.apps.length - a.c.apps.length || (b.c.roles[0]?.score ?? 0) - (a.c.roles[0]?.score ?? 0) || b.ps.length - a.ps.length);
  if (!list.length) return <Empty>None of these connections work at a company with an open matching role right now. Try <Link className="link" href={qs({ view: "companies" })}>By Company</Link> to add employers where you know people as accounts.</Empty>;
  return (
    <div className="space-y-4">
      {list.map(({ c, ps }) => (
        <Card key={c.id} flush icon="building" title={<Link href={`/companies/${c.id}`} className="hover:underline">{c.name}</Link>}
          sub={<span className="text-[14px] text-slate-600">{ps.length} connection{ps.length === 1 ? "" : "s"}{c.openRoles ? ` · ${c.openRoles} open matching role${c.openRoles === 1 ? "" : "s"}` : ""}{c.apps.length ? ` · ${c.apps.length} in your pipeline` : ""}</span>}
          action={c.openRoles > 3 ? <Link href={`/jobs?company=${c.id}`} className="btn-ghost">All {c.openRoles} Roles</Link> : undefined}>
          {(c.apps.length > 0 || c.roles.length > 0) && (
            <div className="flex flex-wrap gap-2 border-b border-[#ece7ff] bg-[#faf8ff] px-4 py-3">
              {c.apps.map((a) => <Link key={a.id} href={`/applications/${a.id}`} className="inline-flex items-center gap-2 rounded-lg bg-[#A100C2] px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-[#8a00a8]">{a.title}<span className="rounded bg-white/20 px-1.5 text-[12px]">{appLabel(a)}</span></Link>)}
              {c.roles.filter((r) => !c.apps.some((a) => a.title === r.title)).map((r) => <Link key={r.id} href={`/jobs/${r.id}`} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[14px] font-medium text-navy-950 ring-1 ring-[#d9cfff] hover:ring-[#5D36FF]"><ScoreBadge score={r.score} size={24} />{r.title}</Link>)}
            </div>
          )}
          <ul>{ps.slice(0, 6).map((x) => <PersonRow key={x.id} x={x} c={c} showCompany={false} />)}</ul>
          {ps.length > 6 && <div className="border-t border-[#ece7ff] px-4 py-2.5"><Link className="link text-[14px] font-semibold" href={qs({ view: "all", company: groupKey(ps[0]) })}>Show all {ps.length} at {c.name}</Link></div>}
        </Card>
      ))}
    </div>
  );
}

function AllPeople({ people, companies, page, qs }: { people: NetPerson[]; companies: Map<string, NetCompany>; page: number; qs: (o: Partial<P>) => string }) {
  if (!people.length) return <Empty>No connections match these filters.</Empty>;
  const pages = Math.ceil(people.length / PER);
  return (
    <>
      <Card flush icon="people" title={`${people.length.toLocaleString()} Connection${people.length === 1 ? "" : "s"}`}>
        <ul>{people.slice((page - 1) * PER, page * PER).map((x) => <PersonRow key={x.id} x={x} c={x.companyId ? companies.get(x.companyId) : undefined} />)}</ul>
      </Card>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-slate-600">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-ghost" href={qs({ page: String(page - 1) })}>← Previous</Link>}
            {page < pages && <Link className="btn-ghost" href={qs({ page: String(page + 1) })}>Next →</Link>}
          </div>
        </div>
      )}
    </>
  );
}

function ByCompany({ people, companies, q, qs }: { people: NetPerson[]; companies: Map<string, NetCompany>; q: string[]; qs: (o: Partial<P>) => string }) {
  const groups = new Map<string, { name: string; ps: NetPerson[]; c?: NetCompany }>();
  for (const x of people) {
    const k = groupKey(x);
    if (!k) continue;
    const c = x.companyId ? companies.get(x.companyId) : undefined;
    const g = groups.get(k) ?? groups.set(k, { name: c?.name ?? x.companyName ?? "", ps: [], c }).get(k)!;
    g.ps.push(x);
  }
  const all = [...groups.entries()].filter(([, g]) => !q.length || q.every((w) => g.name.toLowerCase().includes(w)))
    .sort((a, b) => Number(isHiring(b[1].c)) - Number(isHiring(a[1].c)) || b[1].ps.length - a[1].ps.length);
  const list = all.slice(0, 150);
  if (!list.length) return <Empty>No companies match.</Empty>;
  const n = (ps: NetPerson[], t: PersonType) => ps.filter((x) => x.type === t).length;
  return (
    <Card flush icon="building" title={`${all.length.toLocaleString()} Companies in Your Network`} sub={all.length > list.length ? `Top ${list.length} shown. Search to find the rest.` : undefined}>
      <div className="overflow-x-auto">
        <table className="tbl text-[14px]">
          <thead><tr><th>Company</th><th>Connections</th><th>Recruiters</th><th>Sales Leaders</th><th>Open Roles</th><th>Account</th></tr></thead>
          <tbody>{list.map(([key, g]) => (
            <tr key={key}>
              <td><Link href={qs({ view: "all", company: key, q: "" })} className="text-[15px] font-semibold text-navy-950 hover:underline">{g.name}</Link></td>
              <td className="tabular-nums"><Link className="link font-semibold" href={qs({ view: "all", company: key, q: "" })}>{g.ps.length}</Link></td>
              <td className="tabular-nums">{n(g.ps, "recruiter") || "—"}</td>
              <td className="tabular-nums">{n(g.ps, "leader") || "—"}</td>
              <td className="tabular-nums">{g.c ? g.c.openRoles ? <Link className="link font-semibold" href={`/jobs?company=${g.c.id}`}>{g.c.openRoles}</Link> : "0" : "—"}</td>
              <td>{g.c ? <Link className="link" href={`/companies/${g.c.id}`}>Target account</Link> : <Link className="btn-ghost !py-1 text-[13px]" href={`/companies/new?name=${encodeURIComponent(g.name)}`}>Add as Account</Link>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}
