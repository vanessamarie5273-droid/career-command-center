import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui";
import Kanban from "@/components/Kanban";
import { STAGES, STAGE_LABEL } from "@/lib/format";
import { ACTIVE_PROCESS, followUpWhere } from "@/lib/queries";
import { effectiveScore } from "@/lib/scoring";
import { tidyAction } from "@/lib/pipeline";
import NewApplication from "@/components/NewApplication";
import ApplicationsTable from "@/components/ApplicationsTable";

export const metadata = { title: "My Applications" };

export default async function Applications({ searchParams }: { searchParams: Promise<{ view?: string; stage?: string; applied?: string; followup?: string; interviews?: string; active?: string; q?: string }> }) {
  const p = await searchParams;
  const where: Prisma.ApplicationWhereInput = { AND: [
    p.stage ? { stage: p.stage as never } : {},
    p.applied ? { applied: true } : {},
    p.active ? { stage: { in: [...ACTIVE_PROCESS] } } : {},
    p.followup ? followUpWhere() : {},
    p.interviews ? { interviewAt: { gte: new Date() } } : {},
    p.q ? { OR: [{ title: { contains: p.q, mode: "insensitive" } }, { company: { name: { contains: p.q, mode: "insensitive" } } }] } : {},
  ] };
  const [apps, companies] = await Promise.all([
    prisma.application.findMany({ where, include: { company: true, job: true, resume: { select: { name: true } } }, orderBy: [{ updatedAt: "desc" }] }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const view = p.view === "table" ? "table" : "board";
  const tab = (v: string) => `px-3 py-1.5 text-sm rounded-md ${view === v ? "bg-[#5D36FF] text-white font-semibold" : "text-[#5D36FF] font-medium hover:bg-[#f1edff]"}`;
  return (
    <>
      <PageHeader title="My Applications"
        actions={<><div className="flex rounded-lg bg-white p-1 shadow-sm"><Link className={tab("board")} href="/applications">Board</Link><Link className={tab("table")} href="/applications?view=table">Table</Link></div><NewApplication companies={companies} /></>} />
      {apps.length === 0 ? <Empty>No applications yet. Save a role in Discover Jobs, then click “I applied” once you submit it, or start a company-level pursuit above.</Empty> : view === "board" ? (
        <Kanban stages={STAGES.map(([k, l]) => [k, l])} cards={apps.map((a) => ({ id: a.id, title: a.title, stage: a.stage, company: a.company.name, logo: a.company.logoUrl, score: a.job ? effectiveScore(a.job) : null, nextAction: a.nextAction && tidyAction(a.nextAction), due: a.nextActionDue?.toISOString() ?? null, applied: a.applied }))} />
      ) : (
        <div className="card"><ApplicationsTable apps={apps} /></div>
      )}
      <p className="mt-3 text-[13px] text-slate-500">Stages: {STAGES.map(([, l]) => l).join(" · ")}. {STAGE_LABEL.ACCEPTED} is only reachable from {STAGE_LABEL.OFFER}.</p>
    </>
  );
}
