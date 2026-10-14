import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PageHeader, Empty, Logo } from "@/components/ui";
import Kanban from "@/components/Kanban";
import AutoField from "@/components/AutoField";
import { STAGES, STAGE_LABEL, date } from "@/lib/format";
import { followUpWhere } from "@/lib/queries";
import { effectiveScore } from "@/lib/scoring";
import NewApplication from "@/components/NewApplication";

export const metadata = { title: "My Applications" };

export default async function Applications({ searchParams }: { searchParams: Promise<{ view?: string; stage?: string; applied?: string; followup?: string; interviews?: string; q?: string }> }) {
  const p = await searchParams;
  const where: Prisma.ApplicationWhereInput = { AND: [
    p.stage ? { stage: p.stage as never } : {},
    p.applied ? { applied: true } : {},
    p.followup ? followUpWhere() : {},
    p.interviews ? { interviewAt: { gte: new Date() } } : {},
    p.q ? { OR: [{ title: { contains: p.q, mode: "insensitive" } }, { company: { name: { contains: p.q, mode: "insensitive" } } }] } : {},
  ] };
  const [apps, companies] = await Promise.all([
    prisma.application.findMany({ where, include: { company: true, job: true, resume: { select: { name: true } } }, orderBy: [{ updatedAt: "desc" }] }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const view = p.view === "table" ? "table" : "board";
  const tab = (v: string) => `px-3 py-1.5 text-sm rounded-md ${view === v ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  return (
    <>
      <PageHeader title="My Applications" sub={`${apps.length} records${p.followup ? " awaiting follow-up" : p.applied ? " applied" : ""}. Drag cards between stages; every field saves automatically.`}
        actions={<><div className="card flex p-1"><Link className={tab("board")} href="/applications">Board</Link><Link className={tab("table")} href="/applications?view=table">Table</Link></div><NewApplication companies={companies} /></>} />
      {apps.length === 0 ? <Empty>No applications yet. Use “Add to my applications” on any job, or start a company-level pursuit above.</Empty> : view === "board" ? (
        <Kanban stages={STAGES.map(([k, l]) => [k, l])} cards={apps.map((a) => ({ id: a.id, title: a.title, stage: a.stage, company: a.company.name, logo: a.company.logoUrl, score: a.job ? effectiveScore(a.job) : null, nextAction: a.nextAction, due: a.nextActionDue?.toISOString() ?? null, applied: a.applied }))} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Role</th><th>Stage</th><th>Applied</th><th>Applied on</th><th>Resume</th><th>Next action</th><th>Due</th><th>Interview</th><th>Posting</th></tr></thead>
            <tbody>{apps.map((a) => {
              const ep = `/api/applications/${a.id}`;
              return (
                <tr key={a.id}>
                  <td className="min-w-[220px]"><Link href={`/applications/${a.id}`} className="font-medium hover:underline inline-flex items-center gap-2"><Logo src={a.company.logoUrl} name={a.company.name} size={18} />{a.title}</Link><div className="text-xs text-slate-500">{a.company.name}</div></td>
                  <td className="min-w-[170px]"><AutoField endpoint={ep} field="stage" type="select" value={a.stage} options={STAGES.map(([k, l]) => [k, l])} /></td>
                  <td><AutoField endpoint={ep} field="applied" type="checkbox" value={a.applied} /></td>
                  <td className="whitespace-nowrap text-xs">{date(a.appliedAt)}</td>
                  <td className="text-xs">{a.resume?.name ?? "—"}</td>
                  <td className="min-w-[200px]"><AutoField endpoint={ep} field="nextAction" value={a.nextAction} placeholder="e.g. Follow up with recruiter" /></td>
                  <td className="min-w-[140px]"><AutoField endpoint={ep} field="nextActionDue" type="date" value={a.nextActionDue?.toISOString()} /></td>
                  <td className="text-xs whitespace-nowrap">{a.interviewAt ? date(a.interviewAt) : "—"}</td>
                  <td>{a.job ? <a href={a.job.applyUrl} target="_blank" rel="noopener noreferrer" className="link text-xs">Open ↗</a> : <span className="text-xs text-slate-400">No posting</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Stages: {STAGES.map(([, l]) => l).join(" · ")}. {STAGE_LABEL.ACCEPTED} is only reachable from {STAGE_LABEL.OFFER}.</p>
    </>
  );
}
