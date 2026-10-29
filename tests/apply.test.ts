import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { followUps, markApplied } from "@/lib/apply";
import { testDb, makeCompany } from "./setup-db";

describe("assisted apply", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  async function jobWithKit() {
    const c = await makeCompany(db, { name: "Applyco" });
    const job = await db.job.create({ data: { companyId: c.id, fingerprint: `apply-${Math.random()}`, title: "Strategic AE", applyUrl: "https://example.com/jobs/3" } });
    const doc = (kind: string) => db.document.create({ data: { kind, name: `${kind} ${Math.random()}`, fileName: "d.txt", mimeType: "text/plain", size: 1, sha256: "x", data: Buffer.from("x"), text: "x", isTailored: true } });
    const [resume, letter] = [await doc("resume"), await doc("cover_letter")];
    const kit = await db.kit.create({ data: { jobId: job.id, resumeDocId: resume.id, letterDocId: letter.id, parts: {}, checks: {}, model: "test" } });
    return { job, kit, resume, letter };
  }

  it("books the hiring manager outreach this week and the recruiter follow-up after five days", () => {
    const now = new Date("2026-10-27T16:00:00Z");
    const [hm, rec] = followUps("Applyco", now);
    expect(hm.title).toMatch(/hiring manager/);
    expect(hm.dueAt.toISOString()).toBe("2026-10-29T16:00:00.000Z");
    expect(rec.dueAt.toISOString()).toBe("2026-11-01T16:00:00.000Z");
  });

  it("records the application with the kit's resume and letter, and adds the tasks once", async () => {
    const { job, kit, resume, letter } = await jobWithKit();
    const now = new Date("2026-10-27T16:00:00Z");
    const app = await markApplied(db, job.id, kit.id, null, now);
    expect(app).toMatchObject({ stage: "APPLIED", applied: true, resumeId: resume.id, coverLetterId: letter.id });
    expect(app.appliedAt?.toISOString()).toBe(now.toISOString());
    expect(app.nextActionDue?.toISOString()).toBe("2026-11-01T16:00:00.000Z");
    await markApplied(db, job.id, kit.id, null, now);
    expect(await db.task.count({ where: { applicationId: app.id } })).toBe(2);
    expect(await db.application.count({ where: { jobId: job.id } })).toBe(1);
  });

  it("moves an application already in the pipeline to Applied without replacing what was set", async () => {
    const { job, kit } = await jobWithKit();
    const existing = await db.application.create({ data: { companyId: job.companyId, jobId: job.id, title: job.title, stage: "RESUME_PREP", nextAction: "Call Dana", stageHistory: { create: { to: "RESUME_PREP" } } } });
    const app = await markApplied(db, job.id, kit.id, null);
    expect(app.id).toBe(existing.id);
    expect(app.stage).toBe("APPLIED");
    expect(app.nextAction).toBe("Call Dana");
  });

  it("attaches the kit she applied with, even when another resume was set earlier", async () => {
    const { job, kit, resume, letter } = await jobWithKit();
    const old = await db.document.create({ data: { kind: "resume", name: "old", fileName: "d.txt", mimeType: "text/plain", size: 1, sha256: "x", data: Buffer.from("x"), text: "x" } });
    await db.application.create({ data: { companyId: job.companyId, jobId: job.id, title: job.title, stage: "PRIORITIZED", resumeId: old.id, stageHistory: { create: { to: "PRIORITIZED" } } } });
    const app = await markApplied(db, job.id, kit.id, null);
    expect(app).toMatchObject({ stage: "APPLIED", resumeId: resume.id, coverLetterId: letter.id });
  });
});
