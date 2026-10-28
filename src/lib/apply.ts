// Assisted apply: she submits on the employer's form herself; the app records it and books the next two moves.
import type { PrismaClient } from "@prisma/client";
import { ensureApplication, moveStage } from "./applications";

const DAY = 86400_000;
/** The same week she applies she reaches the hiring manager; five days on she follows up if nothing has moved. */
export function followUps(company: string, now = new Date()) {
  return [
    { title: `Send the ${company} hiring manager your point of view (Application Kit)`, dueAt: new Date(now.getTime() + 2 * DAY) },
    { title: `Follow up on your ${company} application with the recruiter`, dueAt: new Date(now.getTime() + 5 * DAY) },
  ];
}

/** Marks the job applied with the kit's resume and letter, and adds the follow-up tasks once. */
export async function markApplied(db: PrismaClient, jobId: string, kitId: string | null, userId: string | null, now = new Date()) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId }, include: { company: true } });
  const { app, created } = await ensureApplication(db, jobId, userId, "APPLIED");
  if (app.stage !== "APPLIED" && !app.applied) {
    const r = await moveStage(db, app.id, "APPLIED", userId);
    if (!r.ok) throw new Error(r.error);
  }
  const kit = kitId ? await db.kit.findUnique({ where: { id: kitId } }) : null;
  const tasks = followUps(job.company.name, now);
  const updated = await db.application.update({
    where: { id: app.id },
    data: {
      applied: true, appliedAt: created || !app.appliedAt ? now : app.appliedAt,
      resumeId: app.resumeId ?? kit?.resumeDocId ?? undefined, coverLetterId: app.coverLetterId ?? kit?.letterDocId ?? undefined,
      nextAction: app.nextAction ?? tasks[1].title, nextActionDue: app.nextActionDue ?? tasks[1].dueAt,
    },
  });
  const existing = await db.task.count({ where: { applicationId: app.id, source: "system", title: { in: tasks.map((t) => t.title) } } });
  if (!existing) await db.task.createMany({ data: tasks.map((t) => ({ ...t, applicationId: app.id, source: "system" })) });
  return updated;
}
