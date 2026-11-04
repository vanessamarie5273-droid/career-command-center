// Checking off a to-do from anywhere: a task, or an application's next action. Both kinds can say the same thing
// (applying books "Follow up on your X application" as a task and as the next action), so finishing one finishes its twin.
import type { PrismaClient } from "@prisma/client";
import { tidyAction, todoKey } from "./pipeline";

/** Marks a task done, along with any open copy of it on the same application and a next action that says the same. */
export async function completeTask(db: PrismaClient, id: string, now = new Date()) {
  const t = await db.task.findUniqueOrThrow({ where: { id }, include: { application: { select: { id: true, nextAction: true } } } });
  const key = todoKey(t.title);
  const twins = t.applicationId
    ? (await db.task.findMany({ where: { applicationId: t.applicationId, done: false, id: { not: id } }, select: { id: true, title: true } })).filter((x) => todoKey(x.title) === key).map((x) => x.id)
    : [];
  await db.task.updateMany({ where: { id: { in: [id, ...twins] } }, data: { done: true, doneAt: now } });
  if (t.application?.nextAction && todoKey(t.application.nextAction) === key) await db.application.update({ where: { id: t.application.id }, data: { nextAction: null, nextActionDue: null } });
  return db.task.findUniqueOrThrow({ where: { id } });
}

/** Clears an application's next action and its due date, closes any task that says the same, and notes it in the activity log. */
export async function completeNextAction(db: PrismaClient, applicationId: string, now = new Date()) {
  const a = await db.application.findUniqueOrThrow({ where: { id: applicationId }, select: { nextAction: true, nextActionDue: true } });
  if (!a.nextAction && !a.nextActionDue) return { ok: true };
  const text = tidyAction(a.nextAction || "Follow up");
  const key = todoKey(text);
  const twins = (await db.task.findMany({ where: { applicationId, done: false }, select: { id: true, title: true } })).filter((x) => todoKey(x.title) === key).map((x) => x.id);
  await db.application.update({ where: { id: applicationId }, data: { nextAction: null, nextActionDue: null } });
  if (twins.length) await db.task.updateMany({ where: { id: { in: twins } }, data: { done: true, doneAt: now } });
  await db.activity.create({ data: { applicationId, kind: "note", body: `Done: ${text}`, at: now } });
  return { ok: true };
}
