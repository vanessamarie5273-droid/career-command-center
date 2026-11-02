import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { bestApplyLink, postedDate, runGoogleJobs, JOB_SITE_CATEGORY } from "@/lib/ingest/googleJobs";
import { ingestCompany } from "@/lib/ingest/run";
import { greenhouseBoard, mockFetch } from "./fixtures/boards";
import { testDb, makeCompany } from "./setup-db";

const NOW = new Date("2026-11-02T13:00:00Z");
const result = (over: Record<string, unknown>) => ({
  job_id: Math.random().toString(36).slice(2), title: "Enterprise Account Executive", location: "Phoenix, AZ", via: "LinkedIn",
  description: "Own enterprise accounts selling cloud software to CFOs.", detected_extensions: { posted_at: "3 days ago" },
  apply_options: [{ title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/4100000001" }], ...over,
});

describe("Google Jobs helpers", () => {
  it("prefers the employer's own apply link", () => {
    expect(bestApplyLink([{ title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/1" }, { title: "Acme Careers", link: "https://careers.acme.com/jobs/123" }])).toBe("https://careers.acme.com/jobs/123");
    expect(bestApplyLink([{ title: "Indeed", link: "https://www.indeed.com/viewjob?jk=1" }])).toBe("https://www.indeed.com/viewjob?jk=1");
  });
  it("reads Google's relative posting dates", () => {
    expect(postedDate("3 days ago", NOW)?.toISOString()).toBe("2026-10-30T13:00:00.000Z");
    expect(postedDate("30+ days ago", NOW)?.getTime()).toBe(NOW.getTime() - 30 * 86400e3);
    expect(postedDate(undefined, NOW)).toBeNull();
  });
});

describe("Google Jobs search", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("adds sales roles, matches known employers, adds new ones and skips staffing agencies", async () => {
    const known = await makeCompany(db, { name: "Knownco Software, Inc.", slug: "knownco-gj", atsToken: "knownco-gj" });
    const fx = mockFetch({ "serpapi.com": { jobs_results: [
      result({ company_name: "Knownco Software", title: "Strategic Account Executive" }),
      result({ company_name: "Brandnew Analytics", title: "Director, Business Development", apply_options: [{ title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/4100000002" }, { title: "Brandnew Analytics", link: "https://brandnew.example.com/careers/jobs/77" }] }),
      result({ company_name: "Robert Half", title: "Enterprise Account Executive" }),
      result({ company_name: "Brandnew Analytics", title: "Software Engineer" }),
    ] } });
    const r = await runGoogleJobs(db, { fetchImpl: fx, now: NOW, apiKey: "test-key" });
    expect(r).toMatchObject({ status: "ok", searches: 6, relevant: 2, companiesAdded: 1 });
    expect(r.skippedStaffing).toBeGreaterThan(0);
    expect(await db.job.count({ where: { companyId: known.id } })).toBe(1);
    const added = await db.company.findFirstOrThrow({ where: { name: "Brandnew Analytics" }, include: { jobs: true } });
    expect(added).toMatchObject({ category: JOB_SITE_CATEGORY, addedBy: "job-site" });
    expect(added.jobs.map((j) => j.applyUrl)).toEqual(["https://brandnew.example.com/careers/jobs/77"]);
    expect(await db.company.count({ where: { name: "Robert Half" } })).toBe(0);

    // Searches once a day: a second refresh the same day makes no calls.
    let calls = 0;
    expect((await runGoogleJobs(db, { fetchImpl: async (u, i) => { calls++; return fx(u, i); }, now: new Date(NOW.getTime() + 3600e3), apiKey: "test-key" })).status).toBe("skipped");
    expect(calls).toBe(0);
  });

  it("keeps the employer's posting when Google lists the same role", async () => {
    const c = await makeCompany(db, { name: "Ownboard Inc", slug: "ownboard-gj", atsToken: "ownboard-gj" });
    await ingestCompany(db, c, mockFetch({ "boards-api.greenhouse.io": greenhouseBoard([{ id: 901, title: "Enterprise Account Executive", location: "Phoenix, AZ" }]) }), NOW);
    const before = await db.job.findFirstOrThrow({ where: { companyId: c.id } });
    await runGoogleJobs(db, { fetchImpl: mockFetch({ "serpapi.com": { jobs_results: [result({ company_name: "Ownboard", title: "Enterprise Account Executive", location: "Phoenix, AZ" })] } }), now: NOW, apiKey: "test-key", force: true });
    const after = await db.job.findFirstOrThrow({ where: { companyId: c.id }, include: { sources: true } });
    expect(after.applyUrl).toBe(before.applyUrl);
    expect(after.sources.map((s) => s.provider).sort()).toEqual(["GOOGLE_JOBS", "GREENHOUSE"]);
  });

  it("does nothing without a key, and hides the key in errors", async () => {
    expect((await runGoogleJobs(db, { apiKey: "", now: NOW })).status).toBe("not_configured");
    const r = await runGoogleJobs(db, { fetchImpl: async () => new Response("denied", { status: 401 }), apiKey: "secret-123", now: NOW, force: true });
    expect(r.status).toBe("error");
    expect(r.error).not.toContain("secret-123");
  });
});
