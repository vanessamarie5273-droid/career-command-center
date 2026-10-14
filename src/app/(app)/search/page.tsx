import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Empty } from "@/components/ui";

export const metadata = { title: "Search" };
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  if (!q) return <PageHeader title="Search" sub="Type in the search bar above." />;
  const m = { contains: q, mode: "insensitive" as const };
  const [companies, jobs, apps, contacts, docs] = await Promise.all([
    prisma.company.findMany({ where: { OR: [{ name: m }, { description: m }, { keyProducts: m }] }, take: 20 }),
    prisma.job.findMany({ where: { status: "OPEN", OR: [{ title: m }, { location: m }, { company: { name: m } }] }, include: { company: true }, orderBy: { score: "desc" }, take: 30 }),
    prisma.application.findMany({ where: { OR: [{ title: m }, { company: { name: m } }, { personalNotes: m }, { interviewNotes: m }] }, include: { company: true }, take: 20 }),
    prisma.contact.findMany({ where: { OR: [{ firstName: m }, { lastName: m }, { companyName: m }, { title: m }] }, take: 20 }),
    prisma.document.findMany({ where: { OR: [{ name: m }, { text: m }] }, select: { id: true, name: true, kind: true }, take: 20 }),
  ]);
  const none = !companies.length && !jobs.length && !apps.length && !contacts.length && !docs.length;
  return (
    <>
      <PageHeader title={`Search: “${q}”`} />
      {none ? <Empty>Nothing matched.</Empty> : (
        <div className="grid lg:grid-cols-2 gap-4">
          {companies.length > 0 && <Card title={`Companies (${companies.length})`}><ul className="text-sm space-y-1">{companies.map((c) => <li key={c.id}><Link className="link" href={`/companies/${c.id}`}>{c.name}</Link> <span className="text-xs text-slate-500">{c.category}</span></li>)}</ul></Card>}
          {jobs.length > 0 && <Card title={`Open jobs (${jobs.length})`}><ul className="text-sm space-y-1">{jobs.map((j) => <li key={j.id}><Link className="link" href={`/jobs/${j.id}`}>{j.title}</Link> <span className="text-xs text-slate-500">{j.company.name} · {j.score}</span></li>)}</ul></Card>}
          {apps.length > 0 && <Card title={`Applications (${apps.length})`}><ul className="text-sm space-y-1">{apps.map((a) => <li key={a.id}><Link className="link" href={`/applications/${a.id}`}>{a.company.name}: {a.title}</Link></li>)}</ul></Card>}
          {contacts.length > 0 && <Card title={`Contacts (${contacts.length})`}><ul className="text-sm space-y-1">{contacts.map((c) => <li key={c.id}><Link className="link" href={`/contacts/${c.id}`}>{c.firstName} {c.lastName}</Link> <span className="text-xs text-slate-500">{c.title} {c.companyName}</span></li>)}</ul></Card>}
          {docs.length > 0 && <Card title={`Documents (${docs.length})`}><ul className="text-sm space-y-1">{docs.map((d) => <li key={d.id}><Link className="link" href={`/documents/${d.id}`}>{d.name}</Link> <span className="text-xs text-slate-500">{d.kind}</span></li>)}</ul></Card>}
        </div>
      )}
    </>
  );
}
