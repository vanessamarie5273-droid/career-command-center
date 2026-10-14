import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Empty } from "@/components/ui";
import { ContactImport, NewContact } from "@/components/ContactWidgets";
import { date } from "@/lib/format";

export const metadata = { title: "Network & Contacts" };

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; targets?: string }> }) {
  const p = await searchParams;
  const where = { AND: [p.q ? { OR: [{ firstName: { contains: p.q, mode: "insensitive" as const } }, { lastName: { contains: p.q, mode: "insensitive" as const } }, { companyName: { contains: p.q, mode: "insensitive" as const } }, { title: { contains: p.q, mode: "insensitive" as const } }] } : {}, p.targets === "1" ? { companyId: { not: null } } : {}] };
  const [contacts, total, atTargets, companies, dueTouches] = await Promise.all([
    prisma.contact.findMany({ where, include: { company: true, touches: { orderBy: { sentAt: "desc" }, take: 1 } }, orderBy: [{ companyId: { sort: "asc", nulls: "last" } }, { lastName: "asc" }], take: 300 }),
    prisma.contact.count(), prisma.contact.count({ where: { companyId: { not: null } } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.outreachTouch.findMany({ where: { replied: false, followUpAt: { lte: new Date(Date.now() + 86400000) } }, include: { contact: true }, orderBy: { followUpAt: "asc" }, take: 20 }),
  ]);
  return (
    <>
      <PageHeader title="Network & Contacts" sub={`${total} contacts · ${atTargets} at target companies.`} />
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Import LinkedIn connections"><ContactImport /></Card>
        <Card title="Add a contact"><NewContact companies={companies} /></Card>
        <Card title="Outreach follow-ups due">{dueTouches.length ? <ul className="text-sm space-y-1">{dueTouches.map((t) => <li key={t.id}><Link className="link" href={`/contacts/${t.contactId}`}>{t.contact.firstName} {t.contact.lastName}</Link> · {t.channel} · due {date(t.followUpAt)}</li>)}</ul> : <p className="text-sm text-slate-500">No outreach follow-ups due.</p>}</Card>
      </div>
      <Card title="LinkedIn: what this app can and cannot do">
        <ul className="text-xs text-slate-600 list-disc ml-4 space-y-1">
          <li>LinkedIn&apos;s public APIs do not let personal apps read your connections, 2nd-degree network, InMail or job listings. This app never scrapes LinkedIn.</li>
          <li>Closest compliant alternative: import your own Connections.csv (LinkedIn → Settings → Data privacy → Get a copy of your data → Connections). Contacts are matched to target companies automatically and marked 1st-degree.</li>
          <li>2nd-degree relationships: record them manually (degree = 2nd) when LinkedIn shows a mutual connection.</li>
          <li>Every company and person has one-click LinkedIn links that open LinkedIn in your own signed-in browser.</li>
        </ul>
      </Card>
      <form className="my-3 flex gap-2" action="/contacts"><input name="q" defaultValue={p.q} className="input max-w-sm" placeholder="Search name, company, title" /><label className="text-sm flex items-center gap-1"><input type="checkbox" name="targets" value="1" defaultChecked={p.targets === "1"} />At target companies</label><button className="btn-primary">Search</button></form>
      {contacts.length === 0 ? <Empty>No contacts yet.</Empty> : (
        <div className="card overflow-x-auto"><table className="tbl">
          <thead><tr><th>Name</th><th>Title</th><th>Company</th><th>Degree</th><th>Role</th><th>Last outreach</th><th></th></tr></thead>
          <tbody>{contacts.map((c) => (
            <tr key={c.id}>
              <td><Link className="font-medium hover:underline" href={`/contacts/${c.id}`}>{c.firstName} {c.lastName}</Link></td>
              <td className="text-xs">{c.title}</td>
              <td className="text-xs">{c.company ? <Link className="link" href={`/companies/${c.company.id}`}>{c.company.name}</Link> : c.companyName}</td>
              <td className="text-xs">{c.degree ?? "—"}</td><td className="text-xs">{c.role ?? "—"}</td>
              <td className="text-xs">{c.touches[0] ? `${c.touches[0].channel} ${date(c.touches[0].sentAt)}${c.touches[0].replied ? " · replied" : ""}` : "—"}</td>
              <td>{c.linkedinUrl && <a className="link text-xs" href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
