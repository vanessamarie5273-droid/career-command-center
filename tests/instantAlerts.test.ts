import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { alertEmail, groupRoles, instantAlertJobs, sendInstantAlerts } from "@/lib/instantAlerts";
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
    return db.job.create({ data: { companyId: c.id, fingerprint: `alert-${Math.random()}`, title, applyUrl: "https://example.com/j", score, tier: "TIER1", category: "MAIN", postedAt: new Date(), location: "Remote - US", isRemote: true, ...over } });
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
    const j = await job("Enterprise AE", 88, { location: "Remote - US", isRemote: true, oteMax: 396000 });
    const full = await db.job.findUniqueOrThrow({ where: { id: j.id }, include: { company: true } });
    const { subject, html } = alertEmail([full], "https://app.example.com");
    expect(subject).toBe(`New 88-point match: Enterprise AE at ${full.company.name}`);
    expect(html).toContain(`href="https://app.example.com/jobs/${j.id}"`);
    expect(html).toContain("$396K OTE");
    expect(html).toContain("Remote (U.S.)");
    expect(html).toContain("Why you:");
    expect(html).not.toMatch(/Matches your experience in/);
  });

  it("never puts a value that is not a web address into a link", async () => {
    const j = await job("Enterprise AE", 88, { location: "Phoenix, Arizona, United States", isRemote: false });
    const full = await db.job.findUniqueOrThrow({ where: { id: j.id }, include: { company: true } });
    const { html } = alertEmail([full], "Q8~8Q~notAUrl.value");
    expect(html).not.toContain("Q8~");
    expect(html).toContain('href="https://example.com/j"');
    expect(html).toContain("Phoenix, AZ");
  });

  it("alerts only on Phoenix-area or remote roles", async () => {
    const now = new Date();
    const phx = await job("Regional Director Phoenix", 90, { location: "Scottsdale, AZ" });
    const remote = await job("Remote Director", 90, { location: "United States", isRemote: true });
    const seattle = await job("Seattle Director", 90, { location: "Seattle, Washington, United States" });
    const sfRemote = await job("SF Remote Director", 90, { location: "San Francisco, California, United States", isRemote: true });
    const reloc = await job("Reloc Director", 90, { location: "Remote - US", isRemote: true, category: "RELOCATION" });
    const ids = (await instantAlertJobs(db, 80, now)).map((j) => j.id);
    expect(ids).toEqual(expect.arrayContaining([phx.id, remote.id]));
    for (const j of [seattle, sfRemote, reloc]) expect(ids).not.toContain(j.id);
  });

  it("lists a role posted in several cities once", async () => {
    const c = await makeCompany(db, { name: "Brexish" });
    const make = (location: string, score: number) => db.job.create({ data: { companyId: c.id, fingerprint: `dup-${Math.random()}`, title: "Senior Director, Client Sales", applyUrl: "https://example.com/b", score, tier: "TIER1", category: "MAIN", postedAt: new Date(), isRemote: true, location }, include: { company: true } });
    const a = await make("Remote - US", 80), b = await make("Phoenix, AZ", 82);
    const roles = groupRoles([a, b]);
    expect(roles).toHaveLength(1);
    expect(roles[0].jobs[0].id).toBe(b.id);
    const { subject, html } = alertEmail(roles, "https://app.example.com");
    expect(subject).toBe("New 82-point match: Senior Director, Client Sales at Brexish");
    expect(html.match(/Senior Director, Client Sales<\/a>/g)).toHaveLength(1);
    expect(html).toContain("One role listed in 2 locations");
  });
});
