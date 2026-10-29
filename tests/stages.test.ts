import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { transition, moveStage, ensureApplication } from "@/lib/applications";
import { testDb, makeCompany } from "./setup-db";

describe("stage transition rules", () => {
  const fresh = { applied: false, appliedAt: null };
  it("moving to Applied marks applied and stamps the date once", () => {
    const t = transition("READY_TO_APPLY", "APPLIED", fresh, new Date("2026-10-01"));
    expect(t.ok && t.patch).toMatchObject({ stage: "APPLIED", applied: true, appliedAt: new Date("2026-10-01") });
    const again = transition("APPLIED", "INTERVIEWING", { applied: true, appliedAt: new Date("2026-10-01") });
    expect(again.ok && "appliedAt" in again.patch).toBe(false);
  });
  it("skipping straight to Interviewing still records the application", () => {
    const t = transition("RESEARCHING", "INTERVIEWING", fresh);
    expect(t.ok && t.patch.applied).toBe(true);
  });
  it("Accepted is only reachable from Offer", () => {
    expect(transition("INTERVIEWING", "ACCEPTED", fresh).ok).toBe(false);
    expect(transition("OFFER", "ACCEPTED", { applied: true, appliedAt: new Date() }).ok).toBe(true);
  });
  it("Rejected and Withdrawn set the outcome; reopening clears it", () => {
    const r = transition("INTERVIEWING", "REJECTED", { applied: true, appliedAt: new Date() });
    expect(r.ok && r.patch.outcome).toBe("Rejected");
    const re = transition("REJECTED", "INTERVIEWING", { applied: true, appliedAt: new Date() });
    expect(re.ok && re.patch.outcome).toBeNull();
  });
  it("early stages never mark an application as applied", () => {
    for (const s of ["PRIORITIZED", "RESUME_PREP", "READY_TO_APPLY", "ON_HOLD"] as const) {
      const t = transition("RESEARCHING", s, fresh);
      expect(t.ok && t.patch.applied).toBeUndefined();
    }
  });
});

describe("application persistence", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("one application per job, many per company, stage history recorded", async () => {
    const c = await makeCompany(db);
    const mk = (n: number) => db.job.create({ data: { companyId: c.id, fingerprint: `fp-${c.id}-${n}`, title: `Role ${n}`, applyUrl: `https://job-boards.greenhouse.io/testco/jobs/${n}` } });
    const [j1, j2] = [await mk(1), await mk(2)];
    const a1 = await ensureApplication(db, j1.id, null);
    const a1again = await ensureApplication(db, j1.id, null);
    expect(a1again.created).toBe(false);
    expect(a1again.app.id).toBe(a1.app.id);
    await ensureApplication(db, j2.id, null);
    expect(await db.application.count({ where: { companyId: c.id } })).toBe(2);
    expect(await db.company.count({ where: { name: "TestCo", id: c.id } })).toBe(1);

    const r = await moveStage(db, a1.app.id, "APPLIED", null);
    expect(r.ok).toBe(true);
    const saved = await db.application.findUniqueOrThrow({ where: { id: a1.app.id }, include: { stageHistory: true } });
    expect(saved.applied).toBe(true);
    expect(saved.appliedAt).not.toBeNull();
    expect(saved.stageHistory.map((h) => h.to)).toEqual(expect.arrayContaining(["READY_TO_APPLY", "APPLIED"]));
    expect(await db.auditLog.count({ where: { entityId: a1.app.id } })).toBeGreaterThanOrEqual(2);
  });

  it("notes and edits survive a fresh client (persistence)", async () => {
    const c = await makeCompany(db);
    const app = await db.application.create({ data: { companyId: c.id, title: "Networking: Strategic AE" } });
    await db.application.update({ where: { id: app.id }, data: { personalNotes: "Met the RVP at a conference", nextAction: "Send follow-up" } });
    const other = testDb();
    const read = await other.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(read.personalNotes).toBe("Met the RVP at a conference");
    expect(read.nextAction).toBe("Send follow-up");
    await other.$disconnect();
  });
});
