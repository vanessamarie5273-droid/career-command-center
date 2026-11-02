import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { alertEmail, instantAlertJobs, sendInstantAlerts } from "@/lib/instantAlerts";
import { testDb, makeCompany } from "./setup-db";

describe("instant alerts", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = testDb();
    delete process.env.RESEND_API_KEY;
    if (!(await db.user.count())) await db.user.create({ data: { email: "v@example.com", passwordHash: "x" } });
  });
  afterAll(() => db.$disconnect());

  async function job(title: string, score: number, over: Record<string, unknown> = {}) {
    const c = await makeCompany(db, { name: `Alertco ${Math.random().toString(36).slice(2, 6)}` });
    return db.job.create({ data: { companyId: c.id, fingerprint: `alert-${Math.random()}`, title, applyUrl: "https://example.com/j", score, tier: "TIER1", category: "MAIN", ...over } });
  }

  it("picks new roles at or above her threshold, once", async () => {
    const now = new Date();
    const strong = await job("Enterprise AE", 91);
    const weak = await job("SDR", 55);
    const old = await job("Strategic AE", 92, { firstSeenAt: new Date(now.getTime() - 3 * 86400_000) });
    const seen = await job("Named AE", 93, { alertedAt: now });
    const ids = (await instantAlertJobs(db, 80, now)).map((j) => j.id);
    expect(ids).toContain(strong.id);
    for (const j of [weak, old, seen]) expect(ids).not.toContain(j.id);

    await db.user.updateMany({ data: { instantAlerts: true, alertMinScore: 80 } });
    const r = await sendInstantAlerts(db, { now });
    expect(r.detail).toMatch(/not configured/i); // nothing set up to send email in tests
    expect((await db.job.findUniqueOrThrow({ where: { id: strong.id } })).alertedAt).not.toBeNull();
    expect((await instantAlertJobs(db, 80, now)).map((j) => j.id)).not.toContain(strong.id);
  });

  it("does nothing when she has turned instant alerts off", async () => {
    await job("Enterprise AE West", 95);
    await db.user.updateMany({ data: { instantAlerts: false } });
    expect(await sendInstantAlerts(db)).toEqual({ sent: 0, detail: "instant alerts are off" });
    await db.user.updateMany({ data: { instantAlerts: true } });
  });

  it("writes one email naming the role, score and links", async () => {
    const j = await job("Enterprise AE", 88, { scoreReasons: [{ criterion: "qualifications", delta: "+", text: "Matches your ERP experience" }] });
    const full = await db.job.findUniqueOrThrow({ where: { id: j.id }, include: { company: true } });
    const { subject, html } = alertEmail([full], "https://app.example.com");
    expect(subject).toBe(`New 88-point match: Enterprise AE at ${full.company.name}`);
    expect(html).toContain(`https://app.example.com/jobs/${j.id}`);
    expect(html).toContain("Matches your ERP experience");
  });
});
