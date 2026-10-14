import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import AutoField from "@/components/AutoField";
import { TouchForm } from "@/components/CrmWidgets";
import { OutreachDraft, ReplyToggle } from "@/components/ContactWidgets";
import { date } from "@/lib/format";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.contact.findUnique({ where: { id }, include: { company: { include: { applications: true, jobs: { where: { status: "OPEN", category: "MAIN" }, orderBy: { score: "desc" }, take: 1 } } }, touches: { orderBy: { sentAt: "desc" }, include: { application: true } } } });
  if (!c) notFound();
  const companies = await prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const ep = `/api/contacts/${c.id}`;
  return (
    <>
      <PageHeader title={`${c.firstName} ${c.lastName ?? ""}`} sub={`${c.title ?? ""}${c.company ? ` · ${c.company.name}` : c.companyName ? ` · ${c.companyName}` : ""} · source: ${c.source.replace("_", " ")}`} actions={c.linkedinUrl ? <a className="btn-ghost" href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">Open LinkedIn profile ↗</a> : undefined} />
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Details">
          <div className="space-y-2">
            <AutoField endpoint={ep} field="title" label="Title" value={c.title} />
            <AutoField endpoint={ep} field="companyId" type="select" label="Company" value={c.companyId ?? ""} options={[["", "— not a target company —"], ...companies.map((x) => [x.id, x.name] as [string, string])]} />
            <AutoField endpoint={ep} field="email" label="Email" value={c.email} />
            <AutoField endpoint={ep} field="linkedinUrl" type="url" label="LinkedIn URL" value={c.linkedinUrl} />
            <AutoField endpoint={ep} field="degree" type="select" label="Connection" value={c.degree ?? ""} options={[["", "Unknown"], ["1st", "1st degree"], ["2nd", "2nd degree"], ["none", "Not connected"]]} />
            <AutoField endpoint={ep} field="role" type="select" label="Relevance" value={c.role ?? ""} options={[["", "—"], ["recruiter", "Recruiter"], ["hiring_manager", "Hiring manager"], ["executive", "Executive"], ["referral", "Potential referral"], ["peer", "Peer"]]} />
            <AutoField endpoint={ep} field="notes" type="textarea" label="Notes" value={c.notes} />
          </div>
        </Card>
        <div className="lg:col-span-2 space-y-4">
          <Card title="Draft personalized outreach"><OutreachDraft contactId={c.id} name={c.firstName} company={c.company?.name ?? c.companyName ?? ""} title={c.title ?? ""} role={c.company?.jobs[0]?.title} /></Card>
          <Card title="Outreach history">
            <ul className="space-y-2 text-sm mb-3">{c.touches.map((t) => <li key={t.id} className="border-l-2 border-slate-200 pl-3"><div className="text-xs text-slate-500">{t.channel} · {date(t.sentAt)}{t.followUpAt ? ` · follow up ${date(t.followUpAt)}` : ""}{t.application ? <> · <Link className="link" href={`/applications/${t.application.id}`}>{t.application.title}</Link></> : null}</div>{t.message && <div className="whitespace-pre-wrap">{t.message}</div>}<ReplyToggle id={t.id} replied={t.replied} /></li>)}</ul>
            <TouchForm contacts={[{ id: c.id, name: `${c.firstName} ${c.lastName ?? ""}` }]} applicationId={c.company?.applications[0]?.id} />
          </Card>
        </div>
      </div>
    </>
  );
}
