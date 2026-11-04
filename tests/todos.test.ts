import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

// pipelineDashboard reads through the app's shared client; point it at the test database.
vi.mock("@/lib/db", async () => ({ prisma: (await import("./setup-db")).testDb() }));

import { prisma } from "@/lib/db";
import { moveStage } from "@/lib/applications";
import { clearStaleTodos, completeNextAction, completeTask } from "@/lib/todos";
import { agenda, pipelineDashboard } from "@/lib/pipeline";
import { markApplied } from "@/lib/apply";
import { makeCompany } from "./setup-db";

describe("Command Center to-dos", () => {
  let db: PrismaClient;
  beforeAll(() => { db = prisma; });
  afterAll(() => db.$disconnect());

  it("a status change clears the old status's next action and the app's own reminders, and keeps hers", async () => {
    const c = await makeCompany(db, { name: "Samsara Test" });
    const app = await db.application.create({ data: { companyId: c.id, title: "Enterprise AE", stage: "INTERVIEWING", applied: true, appliedAt: new Date(), nextAction: "Prepare for Interview", nextActionDue: new Date() } });
    const system = await db.task.create({ data: { applicationId: app.id, title: "Follow up on your Samsara Test application with the recruiter", dueAt: new Date(), source: "system" } });
    const mine = await db.task.create({ data: { applicationId: app.id, title: "Ask Dana for a referral", dueAt: new Date(), source: "manual" } });
    const contact = await db.contact.create({ data: { firstName: "Pat", companyId: c.id } });
    const network = await db.task.create({ data: { applicationId: app.id, contactId: contact.id, title: "Follow up with Pat", dueAt: new Date(), source: "system" } });

    expect((await moveStage(db, app.id, "FINAL_INTERVIEW", null)).ok).toBe(true);
    const after = await db.application.findUniqueOrThrow({ where: { id: app.id }, include: { activities: true } });
    expect([after.nextAction, after.nextActionDue]).toEqual([null, null]);
    expect((await db.task.findUniqueOrThrow({ where: { id: system.id } })).done).toBe(true);
    expect((await db.task.findUniqueOrThrow({ where: { id: mine.id } })).done).toBe(false);
    expect((await db.task.findUniqueOrThrow({ where: { id: network.id } })).done).toBe(false);
    expect(after.activities.map((x) => x.body).join()).toMatch(/Moved to Final Interview, so these to-dos were cleared: Prepare for Interview; Follow up on your Samsara Test/);
  });

  it("checking off a task closes its copies and the next action that says the same", async () => {
    const c = await makeCompany(db, { name: "Vanta Test" });
    const title = "Follow up on your Vanta Test application with the recruiter";
    const app = await db.application.create({ data: { companyId: c.id, title: "Senior AE", stage: "APPLIED", applied: true, appliedAt: new Date(), nextAction: title, nextActionDue: new Date() } });
    const [t1, t2] = [await db.task.create({ data: { applicationId: app.id, title, dueAt: new Date(), source: "system" } }), await db.task.create({ data: { applicationId: app.id, title: `${title}.`, dueAt: new Date(), source: "system" } })];
    await completeTask(db, t1.id);
    expect((await db.task.findUniqueOrThrow({ where: { id: t2.id } })).done).toBe(true);
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).nextAction).toBeNull();
  });

  it("checking off a next action clears it, closes a matching task, and logs it", async () => {
    const c = await makeCompany(db, { name: "Workday Test" });
    const app = await db.application.create({ data: { companyId: c.id, title: "AE, SLED", stage: "APPLIED", applied: true, appliedAt: new Date(), nextAction: "Follow up", nextActionDue: new Date() } });
    const t = await db.task.create({ data: { applicationId: app.id, title: "follow up", dueAt: new Date() } });
    await completeNextAction(db, app.id);
    const after = await db.application.findUniqueOrThrow({ where: { id: app.id }, include: { activities: true } });
    expect([after.nextAction, after.nextActionDue]).toEqual([null, null]);
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).done).toBe(true);
    expect(after.activities.map((x) => x.body)).toContain("Done: Follow up");
  });

  it("applying shows one current action at a time on the dashboard, each checking off to the next", async () => {
    const now = new Date();
    const c = await makeCompany(db, { name: "Onceco" });
    const job = await db.job.create({ data: { companyId: c.id, fingerprint: `fp-${c.id}`, title: "Senior AE", applyUrl: "https://job-boards.greenhouse.io/onceco/jobs/1" } });
    const app = await markApplied(db, job.id, null, null, new Date(now.getTime() - 5 * 86400_000));
    const mine = (d: Awaited<ReturnType<typeof pipelineDashboard>>) => agenda(d, now).items.filter((x) => x.appId === app.id);
    // One row for the application: the overdue point-of-view task, with the recruiter follow-up waiting behind it.
    const first = mine(await pipelineDashboard(db, now));
    expect(first.map((x) => [x.text, x.more])).toEqual([[expect.stringMatching(/point of view/), 1]]);
    expect(first[0].href).toBe(`/applications/${app.id}#todos`);
    await completeTask(db, first[0].done!.id);
    const next = mine(await pipelineDashboard(db, now));
    expect(next.map((x) => [x.text, x.more])).toEqual([[expect.stringMatching(/recruiter/), 0]]);
    expect(next[0].done?.kind).toBe("task");
    await completeTask(db, next[0].done!.id);
    expect(mine(await pipelineDashboard(db, now))).toHaveLength(0);
  });

  it("sweeps up to-dos left from a status change made before moves cleared them, and keeps newer ones", async () => {
    const now = new Date();
    const h = (n: number) => new Date(now.getTime() - n * 3600_000);
    const c = await makeCompany(db, { name: "Sweepco" });
    // Moved to Interviewing 5 hours ago by an email, with the old "Follow up" (due this morning) and a reminder left behind.
    const old = await db.application.create({ data: { companyId: c.id, title: "AE, SLED", stage: "INTERVIEWING", applied: true, appliedAt: h(300), nextAction: "Follow up", nextActionDue: h(8), stageHistory: { create: [{ to: "APPLIED", at: h(300) }, { from: "APPLIED", to: "INTERVIEWING", at: h(5) }] } } });
    const reminder = await db.task.create({ data: { applicationId: old.id, title: "Send the Sweepco hiring manager your point of view", dueAt: h(2), source: "system", createdAt: h(200) } });
    const mine = await db.task.create({ data: { applicationId: old.id, title: "Ask Dana for a referral", dueAt: h(2), source: "manual", createdAt: h(200) } });
    // Moved, then she typed a new next action: kept.
    const edited = await db.application.create({ data: { companyId: c.id, title: "RVP", stage: "INTERVIEWING", nextAction: "Prepare for Interview", nextActionDue: h(10), stageHistory: { create: [{ from: "APPLIED", to: "INTERVIEWING", at: h(30) }] } } });
    await db.auditLog.create({ data: { entity: "Application", entityId: edited.id, action: "update", changes: { nextAction: { from: null, to: "Prepare for Interview" } }, at: h(20) } });
    // The interview email's reply action, booked moments after the move: kept.
    const fresh = await db.application.create({ data: { companyId: c.id, title: "Director", stage: "INTERVIEWING", nextAction: "Reply to Sam with your availability", nextActionDue: h(1), stageHistory: { create: [{ from: "APPLIED", to: "INTERVIEWING", at: h(1) }] } } });

    const r = await clearStaleTodos(db, now);
    expect(r.actions).toBeGreaterThanOrEqual(1);
    const o = await db.application.findUniqueOrThrow({ where: { id: old.id }, include: { activities: true } });
    expect([o.nextAction, o.nextActionDue]).toEqual([null, null]);
    expect(o.activities.map((x) => x.body).join()).toMatch(/already moved on.*Follow up; Send the Sweepco/);
    expect((await db.task.findUniqueOrThrow({ where: { id: reminder.id } })).done).toBe(true);
    expect((await db.task.findUniqueOrThrow({ where: { id: mine.id } })).done).toBe(false);
    expect((await db.application.findUniqueOrThrow({ where: { id: edited.id } })).nextAction).toBe("Prepare for Interview");
    expect((await db.application.findUniqueOrThrow({ where: { id: fresh.id } })).nextAction).toBe("Reply to Sam with your availability");
    expect(await clearStaleTodos(db, now)).toEqual({ actions: 0, tasks: 0 });
  });

  it("tasks on closed applications leave the dashboard", async () => {
    const now = new Date();
    const c = await makeCompany(db, { name: "Closedco" });
    const app = await db.application.create({ data: { companyId: c.id, title: "AE", stage: "REJECTED" } });
    await db.task.create({ data: { applicationId: app.id, title: "Send thank-you note", dueAt: now } });
    expect((await pipelineDashboard(db, now)).dueTasks.some((t) => t.applicationId === app.id)).toBe(false);
  });
});
