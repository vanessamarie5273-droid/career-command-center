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

/**
 * Sweeps up to-dos left over from a status change: the next action and the app's own reminders that were set
 * before the application last moved stage. Covers moves made before status changes cleared them, and any path
 * that moves a stage without going through moveStage. A next action she edited after the move is kept.
 */
// A stage move and the to-dos it books (Mark Applied's follow-ups, an interview email's reply) land within moments;
// this margin keeps those, whatever the clocks of the app and the database say.
const SLACK = 5 * 60_000;

export async function clearStaleTodos(db: PrismaClient, now = new Date()) {
  const moves = await db.stageChange.groupBy({ by: ["applicationId"], where: { from: { not: null } }, _max: { at: true } });
  const lastMove = new Map(moves.map((m) => [m.applicationId, m._max.at!]));
  if (!lastMove.size) return { actions: 0, tasks: 0 };
  const ids = [...lastMove.keys()];
  const [apps, tasks, edits] = await Promise.all([
    db.application.findMany({ where: { id: { in: ids }, OR: [{ nextAction: { not: null } }, { nextActionDue: { not: null } }] }, select: { id: true, nextAction: true, nextActionDue: true, stage: true } }),
    db.task.findMany({ where: { applicationId: { in: ids }, done: false, source: { not: "manual" }, contactId: null }, select: { id: true, title: true, applicationId: true, createdAt: true } }),
    db.auditLog.findMany({ where: { entity: "Application", entityId: { in: ids }, action: "update" }, select: { entityId: true, at: true, changes: true } }),
  ]);
  const editedAt = new Map<string, Date>();
  for (const e of edits) {
    const c = (e.changes ?? {}) as Record<string, unknown>;
    if (!("nextAction" in c) && !("nextActionDue" in c)) continue;
    const prev = editedAt.get(e.entityId);
    if (!prev || e.at > prev) editedAt.set(e.entityId, e.at);
  }
  const cleared = new Map<string, string[]>();
  const note = (id: string, s: string) => cleared.set(id, [...(cleared.get(id) ?? []), s]);
  const staleApps = apps.filter((a) => {
    const moved = lastMove.get(a.id)!;
    const edited = editedAt.get(a.id);
    // Set for the old stage: due on or before the move (a new stage's action is dated after it) and not edited since.
    return (!a.nextActionDue || a.nextActionDue.getTime() < moved.getTime() - SLACK) && !(edited && edited > moved);
  });
  for (const a of staleApps) note(a.id, a.nextAction || "Follow up");
  const staleTasks = tasks.filter((t) => t.createdAt.getTime() < lastMove.get(t.applicationId!)!.getTime() - SLACK);
  for (const t of staleTasks) note(t.applicationId!, t.title);
  if (staleApps.length) await db.application.updateMany({ where: { id: { in: staleApps.map((a) => a.id) } }, data: { nextAction: null, nextActionDue: null } });
  if (staleTasks.length) await db.task.updateMany({ where: { id: { in: staleTasks.map((t) => t.id) } }, data: { done: true, doneAt: now } });
  if (cleared.size) await db.activity.createMany({ data: [...cleared].map(([applicationId, list]) => ({ applicationId, kind: "note", at: now, body: `Status had already moved on, so these to-dos were cleared: ${[...new Set(list)].join("; ")}` })) });
  return { actions: staleApps.length, tasks: staleTasks.length };
}
