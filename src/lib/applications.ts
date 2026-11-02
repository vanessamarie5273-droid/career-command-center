import type { Prisma, PrismaClient, Stage } from "@prisma/client";

export const STAGE_ORDER: Stage[] = ["RESEARCHING", "PRIORITIZED", "RESUME_PREP", "READY_TO_APPLY", "APPLIED", "RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ACCEPTED", "REJECTED", "WITHDRAWN", "ON_HOLD"];
const TERMINAL: Stage[] = ["ACCEPTED", "REJECTED", "WITHDRAWN"];
const POST_APPLY: Stage[] = ["APPLIED", "RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ACCEPTED"];

/** Most recent first, oldest last: by the date she applied, or the date she saved it if she has not applied yet. */
export function newestFirst<T extends { appliedAt: Date | null; createdAt: Date }>(apps: T[]) {
  return [...apps].sort((a, b) => (b.appliedAt ?? b.createdAt).getTime() - (a.appliedAt ?? a.createdAt).getTime());
}

export type TransitionResult = { ok: true; patch: Prisma.ApplicationUpdateInput } | { ok: false; error: string };

/**
 * Stage-transition rules. Any stage may move to any other (people skip steps in real searches),
 * with these guarantees:
 *  - Moving to Applied or beyond marks the application applied and stamps the application date once.
 *  - Accepted is only reachable from Offer.
 *  - Leaving a terminal stage (Accepted/Rejected/Withdrawn) is allowed (reopening) but recorded.
 */
export function transition(from: Stage, to: Stage, app: { applied: boolean; appliedAt: Date | null }, now = new Date()): TransitionResult {
  if (!STAGE_ORDER.includes(to)) return { ok: false, error: `Unknown stage ${to}` };
  if (from === to) return { ok: true, patch: {} };
  if (to === "ACCEPTED" && from !== "OFFER") return { ok: false, error: "An application can only be accepted from the Offer stage" };
  const patch: Prisma.ApplicationUpdateInput = { stage: to };
  if (POST_APPLY.includes(to) && !app.applied) patch.applied = true;
  if (POST_APPLY.includes(to) && !app.appliedAt) patch.appliedAt = now;
  if (TERMINAL.includes(to) && to !== "ACCEPTED") patch.outcome = to === "REJECTED" ? "Rejected" : "Withdrawn";
  if (to === "ACCEPTED") patch.outcome = "Accepted";
  if (TERMINAL.includes(from) && !TERMINAL.includes(to)) patch.outcome = null;
  return { ok: true, patch };
}

export async function moveStage(db: PrismaClient, id: string, to: Stage, userId: string | null) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  const t = transition(app.stage, to, app);
  if (!t.ok) return t;
  if (app.stage === to) return { ok: true as const, app };
  const updated = await db.application.update({ where: { id }, data: { ...t.patch, stageHistory: { create: { from: app.stage, to } } } });
  await db.auditLog.create({ data: { userId, entity: "Application", entityId: id, action: "update", changes: { stage: { from: app.stage, to } } } });
  return { ok: true as const, app: updated };
}

/** Create (or return) the application for a job. Company is never duplicated; one application per job. */
export async function ensureApplication(db: PrismaClient, jobId: string, userId: string | null, stage: Stage = "READY_TO_APPLY") {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  const existing = await db.application.findUnique({ where: { companyId_jobId: { companyId: job.companyId, jobId } } });
  if (existing) return { app: existing, created: false };
  const app = await db.application.create({
    data: {
      companyId: job.companyId, jobId, title: job.title, stage, ...(POST_APPLY.includes(stage) ? { applied: true, appliedAt: new Date() } : {}), jdSnapshot: job.descriptionText, jdSnapshotAt: new Date(),
      baseSalary: job.salaryMax ?? undefined, ote: job.oteMax ?? undefined, compSource: job.compFactType ? "Published in job posting" : undefined, compFactType: job.compFactType ?? undefined,
      stageHistory: { create: { to: stage } },
    },
  });
  await db.auditLog.create({ data: { userId, entity: "Application", entityId: app.id, action: "create", changes: { jobId, stage } } });
  return { app, created: true };
}
