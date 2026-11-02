import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Job, PrismaClient } from "@prisma/client";
import { buildBriefing, briefingHtml } from "@/lib/briefing";
import { executive, fitChecks, ruleFit } from "@/lib/briefingFit";
import { jobChanges } from "@/lib/ingest/run";
import { testDb, makeCompany } from "./setup-db";

const DAY = 86400_000;
const base = { title: "Enterprise AE", location: "Remote", salaryMin: null, salaryMax: null, oteMin: null, oteMax: null, requiredQuals: "5+ years SaaS", preferredQuals: null, travelNotes: null, requiresClearance: false };
const asJob = (over: Partial<Job>) => ({ id: "j", companyId: "c", title: "Enterprise Account Executive", descriptionText: "", location: "Remote, US", isRemote: true, workArrangement: "Remote", requiresClearance: false, travelNotes: null, relocationNotes: null, yearsRequired: null, requiredQuals: null, preferredQuals: null, scoreReasons: [{ delta: "+", text: "Matches your experience in: public sector" }, { delta: "+", text: "Published OTE up to $350K" }], score: 90, overrideScore: null, ...over }) as unknown as Job;

describe("job change tracking", () => {
  it("names pay, requirement, title and clearance changes in plain words", () => {
    expect(jobChanges(base, { ...base, oteMin: 300000, oteMax: 350000 })).toEqual(["Pay now published: $300K–$350K OTE"]);
    expect(jobChanges(base, { ...base, requiredQuals: "8+ years SaaS and SLED" })).toEqual(["Required qualifications revised"]);
    expect(jobChanges(base, { ...base, title: "Strategic AE", requiresClearance: true })).toEqual(["Title changed: Enterprise AE → Strategic AE", "Now requires a security clearance"]);
    expect(jobChanges(base, { ...base, requiredQuals: "5+  years   SaaS" })).toEqual([]);
  });
});

describe("fit assessment rules", () => {
  it("restates terse scoring reasons in executive language", () => {
    expect(executive("Matches your experience in: cloud ai, complex sales, sled")).toBe("Aligns with your cloud AI, complex sales and SLED track record");
    expect(executive("Published OTE up to $350K")).toBe("Published compensation of up to $350K OTE");
    const travel = asJob({ travelNotes: "Travel up to 40% within territory" });
    expect(fitChecks(travel, "").blockers[0].text).toBe("Travel up to 40% within territory");
  });

  it("treats a clearance as a pass and a residency limit as something to check", () => {
    const cleared = asJob({ requiresClearance: true });
    expect(ruleFit(cleared, fitChecks(cleared, ""), { connections: 0, minScore: 80 }).action).toBe("Pass");
    const midwest = asJob({ descriptionText: "This role is open to candidates residing in the Upper Mid West." });
    const c = fitChecks(midwest, "");
    expect(c.blockers[0]).toMatchObject({ kind: "location", hard: true });
    expect(ruleFit(midwest, c, { connections: 3, minScore: 80 }).action).toBe("Research further");
  });

  it("does not flag Arizona-friendly postings, and prefers a referral when she knows someone", () => {
    const az = asJob({ descriptionText: "Open to candidates residing in Arizona, Nevada or Utah." });
    const c = fitChecks(az, "");
    expect(c.blockers.filter((b) => b.kind === "location")).toEqual([]);
    const fit = ruleFit(az, c, { connections: 2, minScore: 80 });
    expect(fit).toMatchObject({ action: "Seek a referral", source: "rules" });
    expect(fit.why).toHaveLength(2);
    expect(ruleFit(az, c, { connections: 0, minScore: 80 }).action).toBe("Apply");
  });

  it("flags an onsite role outside Phoenix", () => {
    const nyc = asJob({ isRemote: false, location: "New York, NY", workArrangement: "Onsite" });
    expect(fitChecks(nyc, "").blockers[0].text).toBe("Onsite in New York, NY, not Phoenix");
  });
});

describe("daily briefing", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = testDb();
    delete process.env.ANTHROPIC_API_KEY; delete process.env.CRON_SECRET; delete process.env.RESEND_API_KEY;
    if (!(await db.user.count())) await db.user.create({ data: { email: "v@example.com", passwordHash: "x" } });
    await db.user.updateMany({ data: { alertMinScore: 80 } });
  });
  afterAll(() => db.$disconnect());

  it("builds priorities, opportunities with a fit assessment, progress and tracked changes", async () => {
    const now = new Date();
    const tag = Math.random().toString(36).slice(2, 7);
    const co = await makeCompany(db, { name: `Briefco ${tag}` });
    const strong = await db.job.create({ data: { companyId: co.id, fingerprint: `b-${tag}-1`, title: `Public Sector AE ${tag}`, applyUrl: "https://boards.greenhouse.io/briefco/jobs/123", score: 95, tier: "TIER1", category: "MAIN", oteMax: 350000, location: "Remote - AZ", isRemote: true, scoreReasons: [{ delta: "+", text: "Matches your experience in: public sector" }, { delta: "+", text: "Published OTE up to $350K" }] } });
    const hidden = await db.job.create({ data: { companyId: co.id, fingerprint: `b-${tag}-2`, title: `Hidden AE ${tag}`, applyUrl: "https://x.test/j/2", score: 97, tier: "TIER1", category: "MAIN", dismissed: true, dismissReason: "not_fit" } });

    const co2 = await makeCompany(db, { name: `Waitco ${tag}` });
    const tracked = await db.job.create({ data: { companyId: co2.id, fingerprint: `b-${tag}-3`, title: `Strategic AE ${tag}`, applyUrl: "https://x.test/j/3", score: 85, category: "MAIN" } });
    const waiting = await db.application.create({ data: { companyId: co2.id, jobId: tracked.id, title: `Strategic AE ${tag}`, stage: "APPLIED", applied: true, appliedAt: new Date(now.getTime() - 20 * DAY) } });
    await db.jobEvent.create({ data: { jobId: tracked.id, kind: "updated", detail: "Pay now published: $280K OTE", at: now } });

    const co3 = await makeCompany(db, { name: `Movedco ${tag}` });
    const moved = await db.application.create({ data: { companyId: co3.id, title: `Account Director ${tag}`, stage: "RECRUITER_CONTACT", applied: true, appliedAt: new Date(now.getTime() - 5 * DAY), nextAction: "Reply to Dana Lee", nextActionDue: now } });
    await db.stageChange.create({ data: { applicationId: moved.id, from: "APPLIED", to: "RECRUITER_CONTACT", at: now } });
    await db.emailEvent.create({ data: { providerId: `b-${tag}`, threadId: "t", applicationId: moved.id, companyId: co3.id, fromName: "Dana Lee", fromEmail: "dana@movedco.com", subject: "Quick chat?", receivedAt: now, kind: "reply", action: "Moved to Recruiter Contact", prevStage: "APPLIED", newStage: "RECRUITER_CONTACT" } });

    const b = await buildBriefing(db, now);
    const v = b.v2!;
    const opp = v.opportunities.find((o) => o.id === strong.id);
    expect(opp).toBeTruthy();
    expect(opp!.fit.source).toBe("rules");
    expect(opp!.fit.why.length).toBe(2);
    expect(opp!.pay).toBe("$350K OTE");
    expect(v.opportunities.some((o) => o.id === hidden.id)).toBe(false);
    expect(v.priorities.length).toBeLessThanOrEqual(3);
    expect(v.priorities[0].title).toMatch(/Reply to Dana Lee/);

    const w = v.progress.waiting.find((p) => p.href.endsWith(waiting.id))!;
    expect(w).toMatchObject({ days: 20, confirmed: false });
    expect(w.basis).toMatch(/^Unconfirmed/);
    const m = v.progress.moved.find((p) => p.href.endsWith(moved.id))!;
    expect(m).toMatchObject({ confirmed: true, status: "Applied → Recruiter Contact" });
    expect(m.basis).toMatch(/Dana Lee/);
    expect(v.changes.find((c) => c.title === tracked.title)).toMatchObject({ kind: "pay", detail: "Pay now published: $280K OTE" });

    const cached = await db.job.findUniqueOrThrow({ where: { id: strong.id } });
    expect(cached.fitBrief).toBeTruthy();

    const html = briefingHtml(b, "https://app.test");
    expect(html).toContain(strong.title);
    expect(html).toContain("Why It Fits");
    expect(html).toContain("https://app.test/briefing");
  });
});
