import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, FactTag, Logo, ScorePill, TierBadge } from "@/components/ui";
import AutoField from "@/components/AutoField";
import { STAGES, STAGE_LABEL, date, dateTime } from "@/lib/format";
import { effectiveScore, effectiveTier } from "@/lib/scoring";
import { TaskList, NoteForm, TouchForm, AttachDocument, DeleteApplication } from "@/components/CrmWidgets";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.application.findUnique({
    where: { id },
    include: { company: { include: { contacts: true } }, job: true, tasks: { orderBy: [{ done: "asc" }, { dueAt: "asc" }] }, activities: { orderBy: { at: "desc" } }, touches: { include: { contact: true }, orderBy: { sentAt: "desc" } }, documents: { select: { id: true, name: true, kind: true, version: true } }, stageHistory: { orderBy: { at: "desc" } } },
  });
  if (!a) notFound();
  const [docs, audit] = await Promise.all([
    prisma.document.findMany({ select: { id: true, name: true, kind: true, version: true }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { entity: "Application", entityId: id }, orderBy: { at: "desc" }, take: 40 }),
  ]);
  const ep = `/api/applications/${a.id}`;
  const resumes: [string, string][] = [["", "— none —"], ...docs.filter((d) => d.kind === "resume").map((d) => [d.id, `${d.name}${d.version ? ` (${d.version})` : ""}`] as [string, string])];
  const covers: [string, string][] = [["", "— none —"], ...docs.filter((d) => d.kind === "cover_letter").map((d) => [d.id, d.name] as [string, string])];
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <Logo src={a.company.logoUrl} name={a.company.name} size={44} />
        <div className="flex-1 min-w-[240px]">
          <div className="text-sm text-slate-500"><Link className="link" href={`/companies/${a.company.id}`}>{a.company.name}</Link>{a.job && <> · <Link className="link" href={`/jobs/${a.job.id}`}>job record</Link> · <Link className="link" href={`/jobs/${a.job.id}#kit`}>Application Kit</Link></>}</div>
          <AutoField endpoint={ep} field="title" value={a.title} className="mt-1 max-w-xl [&_input]:text-xl [&_input]:font-semibold [&_input]:border-transparent [&_input]:px-0 [&_input:hover]:border-slate-300" />
          {a.job && <div className="mt-1 flex items-center gap-2"><TierBadge tier={effectiveTier(a.job)} /><ScorePill score={effectiveScore(a.job)} confidence={a.job.confidence} />{a.job.status === "CLOSED" && <span className="chip bg-red-50 text-red-700">Posting closed {date(a.job.closedAt)}</span>}</div>}
        </div>
        <div className="flex items-center gap-2">
          {a.job && <a href={a.job.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-gold">Open posting ↗</a>}
          <DeleteApplication id={a.id} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Status">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <AutoField endpoint={ep} field="stage" type="select" label="Stage" value={a.stage} options={STAGES.map(([k, l]) => [k, l])} />
              <AutoField endpoint={ep} field="applied" type="checkbox" label="Applied" value={a.applied} className="pb-2" />
              <AutoField endpoint={ep} field="appliedAt" type="date" label="Application date" value={a.appliedAt?.toISOString()} />
              <AutoField endpoint={ep} field="interviewAt" type="datetime" label="Next interview" value={a.interviewAt?.toISOString()} />
              <AutoField endpoint={ep} field="nextAction" label="Next action" value={a.nextAction} className="sm:col-span-2" />
              <AutoField endpoint={ep} field="nextActionDue" type="date" label="Due" value={a.nextActionDue?.toISOString()} />
              <AutoField endpoint={ep} field="priority" type="select" label="My priority" value={a.priority?.toString() ?? ""} options={[["", "—"], ["1", "1 · Highest"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5 · Lowest"]]} />
            </div>
          </Card>
          <Card title="Submitted materials">
            <div className="grid sm:grid-cols-2 gap-3">
              <AutoField endpoint={ep} field="resumeId" type="select" label="Resume version submitted" value={a.resumeId ?? ""} options={resumes} />
              <AutoField endpoint={ep} field="coverLetterId" type="select" label="Cover letter submitted" value={a.coverLetterId ?? ""} options={covers} />
              <AutoField endpoint={ep} field="introText" type="textarea" label="Introduction / note sent with application" value={a.introText} className="sm:col-span-2" />
            </div>
            <div className="mt-3"><div className="label">Other documents & attachments</div>
              <ul className="text-sm mb-2">{a.documents.map((d) => <li key={d.id}><a className="link" href={`/api/documents/${d.id}/download`}>{d.name}</a> <span className="text-xs text-slate-400">{d.kind}</span></li>)}</ul>
              <AttachDocument applicationId={a.id} />
            </div>
          </Card>
          <Card title="People & networking">
            <div className="grid sm:grid-cols-2 gap-3">
              <AutoField endpoint={ep} field="recruiterName" label="Recruiter" value={a.recruiterName} />
              <AutoField endpoint={ep} field="hiringManagerName" label="Hiring manager" value={a.hiringManagerName} />
              <AutoField endpoint={ep} field="linkedinActivity" type="textarea" label="LinkedIn networking activity" value={a.linkedinActivity} className="sm:col-span-2" />
            </div>
            <div className="mt-4"><div className="label">Outreach history</div>
              <ul className="space-y-1.5 text-sm mb-3">{a.touches.map((t) => <li key={t.id}><b>{t.contact.firstName} {t.contact.lastName}</b> · {t.channel} · {date(t.sentAt)}{t.replied ? " · replied" : ""}{t.followUpAt ? ` · follow up ${date(t.followUpAt)}` : ""}{t.message && <div className="text-xs text-slate-500 line-clamp-2">{t.message}</div>}</li>)}</ul>
              <TouchForm applicationId={a.id} contacts={a.company.contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName ?? ""}`.trim() }))} />
            </div>
          </Card>
          <Card title="Interview notes"><AutoField endpoint={ep} field="interviewNotes" type="textarea" rows={6} value={a.interviewNotes} placeholder="Who you met, questions asked, signals, next steps" /></Card>
          <Card title="Notes & activity">
            <NoteForm applicationId={a.id} />
            <ul className="mt-3 space-y-2 text-sm">{a.activities.map((n) => <li key={n.id} className="border-l-2 border-gold-500/60 pl-3"><div className="text-xs text-slate-500">{n.kind.replace(/_/g, " ")} · {dateTime(n.at)}</div><div className="whitespace-pre-wrap">{n.body}</div></li>)}</ul>
            <AutoField endpoint={ep} field="personalNotes" type="textarea" label="Personal notes (private)" value={a.personalNotes} className="mt-4" />
          </Card>
          {a.jdSnapshot && <Card title={`Job description snapshot (saved ${date(a.jdSnapshotAt)})`}><pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans text-xs text-slate-700">{a.jdSnapshot}</pre></Card>}
        </div>
        <div className="space-y-4">
          <Card title="Follow-up tasks"><TaskList applicationId={a.id} tasks={a.tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, done: t.done }))} /></Card>
          <Card title="Compensation" action={<FactTag type={a.compFactType} />}>
            <div className="grid grid-cols-2 gap-2">
              <AutoField endpoint={ep} field="baseSalary" type="number" label="Base salary" value={a.baseSalary} />
              <AutoField endpoint={ep} field="ote" type="number" label="OTE" value={a.ote} />
              <AutoField endpoint={ep} field="variableComp" type="number" label="Variable / commission" value={a.variableComp} />
              <AutoField endpoint={ep} field="signingBonus" type="number" label="Signing bonus" value={a.signingBonus} />
              <AutoField endpoint={ep} field="quota" type="number" label="Annual quota" value={a.quota} />
              <AutoField endpoint={ep} field="equityType" type="select" label="Equity type" value={a.equityType ?? ""} options={[["", "—"], ["RSU", "RSUs (public)"], ["Options", "Stock options (private)"], ["RSU-private", "RSUs (private)"], ["None", "None"]]} />
              <AutoField endpoint={ep} field="equityGrant" label="Equity grant" value={a.equityGrant} placeholder="e.g. 20,000 options" className="col-span-2" />
              <AutoField endpoint={ep} field="equityValueEst" type="number" label="Equity value estimate ($)" value={a.equityValueEst} />
              <AutoField endpoint={ep} field="vesting" label="Vesting" value={a.vesting} placeholder="4 yr, 1 yr cliff" />
              <AutoField endpoint={ep} field="commissionNotes" type="textarea" label="Commission structure" value={a.commissionNotes} className="col-span-2" rows={2} />
              <AutoField endpoint={ep} field="compSource" type="select" label="Source" value={a.compSource ?? ""} options={[["", "—"], ["Published in job posting", "Published in posting"], ["Recruiter", "Recruiter"], ["Offer letter", "Offer letter"], ["Third-party estimate", "Third-party estimate"], ["My estimate", "My estimate"]]} />
              <AutoField endpoint={ep} field="compFactType" type="select" label="Reliability" value={a.compFactType ?? ""} options={[["", "—"], ["CONFIRMED", "Confirmed"], ["ESTIMATE", "Estimate"]]} />
            </div>
          </Card>
          <Card title="Outcome">
            <AutoField endpoint={ep} field="outcome" label="Outcome" value={a.outcome} />
            <AutoField endpoint={ep} field="outcomeReason" type="textarea" label="Reason" value={a.outcomeReason} className="mt-2" />
          </Card>
          <Card title="History">
            <ul className="space-y-1 text-xs">
              {a.stageHistory.map((s) => <li key={s.id}>{s.from ? `${STAGE_LABEL[s.from]} → ` : "Created in "}<b>{STAGE_LABEL[s.to]}</b> · {dateTime(s.at)}</li>)}
            </ul>
            <details className="mt-3 text-xs"><summary className="cursor-pointer text-slate-500">Audit trail ({audit.length})</summary>
              <ul className="mt-2 space-y-1">{audit.map((x) => <li key={x.id}>{dateTime(x.at)} · {x.action} <span className="text-slate-500">{Object.keys((x.changes as object) ?? {}).join(", ")}</span></li>)}</ul>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
