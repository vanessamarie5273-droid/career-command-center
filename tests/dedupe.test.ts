import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { jobFingerprint, normalizeTitle } from "@/lib/dedupe";
import { upsertPosting } from "@/lib/ingest/run";
import { testDb, makeCompany } from "./setup-db";

describe("fingerprint", () => {
  it("treats abbreviations and punctuation as the same title", () => {
    expect(normalizeTitle("Sr. Enterprise AE - Remote")).toBe(normalizeTitle("Senior Enterprise Account Executive (Remote)"));
    expect(jobFingerprint("c1", "Sr. Enterprise AE", "Remote - US")).toBe(jobFingerprint("c1", "Senior Enterprise Account Executive", "Remote, United States"));
  });
  it("keeps different locations and companies distinct", () => {
    expect(jobFingerprint("c1", "Enterprise AE", "Phoenix, AZ")).not.toBe(jobFingerprint("c1", "Enterprise AE", "Austin, TX"));
    expect(jobFingerprint("c1", "Enterprise AE", "Phoenix, AZ")).not.toBe(jobFingerprint("c2", "Enterprise AE", "Phoenix, AZ"));
  });
});

describe("cross-source deduplication (database)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("merges the same opening from two providers into one job with two sources", async () => {
    const c = await makeCompany(db);
    const now = new Date();
    const base = { title: "Strategic Account Executive", location: "Remote - US", descriptionText: "Enterprise sales role", postedAt: now };
    expect(await upsertPosting(db, c, { ...base, provider: "GREENHOUSE", externalId: "testco:1", applyUrl: "https://job-boards.greenhouse.io/testco/jobs/1" }, now)).toBe("created");
    expect(await upsertPosting(db, c, { ...base, title: "Strategic AE", location: "Remote, United States", provider: "LEVER", externalId: "testco:abc", applyUrl: "https://jobs.lever.co/testco/0b9a7a2e-1111-2222-3333-444455556666" }, now)).not.toBe("created");
    const jobs = await db.job.findMany({ where: { companyId: c.id }, include: { sources: true } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].sources.map((s) => s.provider).sort()).toEqual(["GREENHOUSE", "LEVER"]);
  });

  it("re-seeing the same source verifies rather than duplicates", async () => {
    const c = await makeCompany(db);
    const now = new Date();
    const p = { provider: "ASHBY" as const, externalId: "testco:x", title: "Director of Sales Development", location: "Phoenix, AZ", applyUrl: "https://jobs.ashbyhq.com/testco/0b9a7a2e-1111-2222-3333-444455556666", descriptionText: "Lead SDR team" };
    await upsertPosting(db, c, p, now);
    expect(await upsertPosting(db, c, p, new Date())).toBe("verified");
    expect(await db.job.count({ where: { companyId: c.id } })).toBe(1);
  });
});
