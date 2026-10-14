import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import AutoField from "@/components/AutoField";
import NewVersion from "@/components/NewVersion";
import { date, STAGE_LABEL } from "@/lib/format";
import type { AtsCheck } from "@/lib/resume";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await prisma.document.findUnique({ where: { id }, select: { id: true, name: true, kind: true, version: true, industry: true, roleType: true, text: true, atsReport: true, createdAt: true, parentId: true, submittedAs: { include: { company: true } }, coverFor: { include: { company: true } } } });
  if (!d) notFound();
  const versions = await prisma.document.findMany({ where: { OR: [{ name: d.name, kind: d.kind }, { parentId: d.id }, ...(d.parentId ? [{ id: d.parentId }] : [])] }, select: { id: true, name: true, version: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const ats = d.atsReport as { score: number; checks: AtsCheck[]; words: number } | null;
  const ep = `/api/documents/${d.id}`;
  const used = [...d.submittedAs, ...d.coverFor];
  return (
    <>
      <PageHeader title={d.name} sub={`${d.kind.replace("_", " ")} · ${d.version ?? ""} · added ${date(d.createdAt)}`} actions={<><a className="btn-ghost" href={`/api/documents/${d.id}/download`}>Download original</a><a className="btn-ghost" href={`/api/documents/${d.id}/export?format=docx`}>Word</a><a className="btn-ghost" href={`/api/documents/${d.id}/export?format=pdf`}>PDF</a></>} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Extracted text"><pre className="max-h-[520px] overflow-auto whitespace-pre-wrap font-sans text-xs text-slate-700">{d.text || "No text could be extracted."}</pre></Card>
          <Card title="Create a tailored version"><NewVersion parentId={d.id} name={d.name} text={d.text ?? ""} /></Card>
        </div>
        <div className="space-y-4">
          <Card title="Classification">
            <div className="space-y-2">
              <AutoField endpoint={ep} field="name" label="Name" value={d.name} />
              <AutoField endpoint={ep} field="version" label="Version" value={d.version} />
              <AutoField endpoint={ep} field="industry" label="Industry" value={d.industry} />
              <AutoField endpoint={ep} field="roleType" label="Role type" value={d.roleType} />
            </div>
          </Card>
          {ats && <Card title={`ATS readability · ${ats.score}%`}><ul className="space-y-1.5 text-xs">{ats.checks.map((c) => <li key={c.label}><span className={c.pass ? "text-emerald-600" : "text-red-600"}>{c.pass ? "✓" : "✕"}</span> <b>{c.label}</b>{c.detail && <div className="ml-4 text-slate-500">{c.detail}</div>}</li>)}</ul></Card>}
          <Card title="Submitted to">{used.length ? <ul className="text-sm space-y-1">{used.map((a) => <li key={a.id}><Link className="link" href={`/applications/${a.id}`}>{a.company.name}: {a.title}</Link> <span className="text-xs text-slate-500">{STAGE_LABEL[a.stage]}</span></li>)}</ul> : <p className="text-sm text-slate-500">Not yet used on an application.</p>}</Card>
          <Card title="Versions"><ul className="text-sm space-y-1">{versions.map((v) => <li key={v.id}>{v.id === d.id ? <b>{v.name} {v.version}</b> : <Link className="link" href={`/documents/${v.id}`}>{v.name} {v.version}</Link>} <span className="text-xs text-slate-400">{date(v.createdAt)}</span></li>)}</ul></Card>
        </div>
      </div>
    </>
  );
}
