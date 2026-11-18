import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getJson, rateGroup, resetRateLimits } from "@/lib/ingest/http";
import { RateLimited } from "@/lib/ingest/types";
import { ingestCompany } from "@/lib/ingest/run";
import { aggregatorReason, removeAggregatorCompanies } from "@/lib/aggregators";
import { runGoogleJobs } from "@/lib/ingest/googleJobs";
import { mockFetch } from "./fixtures/boards";
import { makeCompany, testDb } from "./setup-db";

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...headers } });
const limited = () => json({}, 429, { "Retry-After": "0.01" });

describe("Workday 429s on Nov 18 (all 18 boards in three minutes)", () => {
  beforeEach(() => resetRateLimits());

  it("treats every company's Workday site as one rate limit", () => {
    expect(rateGroup("https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/X/jobs")).toBe("myworkdayjobs.com");
    expect(rateGroup("https://dell.wd1.myworkdayjobs.com/en-US/External")).toBe("myworkdayjobs.com");
    expect(rateGroup("https://boards-api.greenhouse.io/v1/boards/x/jobs")).toBe("boards-api.greenhouse.io");
  });

  it("stops calling Workday for the rest of the run once it keeps answering 429", async () => {
    let calls = 0;
    const f = async () => { calls++; return limited(); };
    await expect(getJson(f, "https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/A/jobs", { method: "POST" })).rejects.toBeInstanceOf(RateLimited);
    const after = calls;
    await expect(getJson(f, "https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/B/jobs", { method: "POST" })).rejects.toBeInstanceOf(RateLimited);
    expect(calls).toBe(after);
  });
});

describe("Workday boards on the hourly refresh", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());
  beforeEach(() => resetRateLimits());

  const board = (posts: { title: string; path: string }[]) => async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (body.searchText === "") return json({ total: 300, jobPostings: [] });
      if (body.searchText !== "account executive" || body.offset > 0) return json({ total: 0, jobPostings: [] });
      return json({ total: posts.length, jobPostings: posts.map((p) => ({ title: p.title, externalPath: p.path, locationsText: "2 Locations" })) });
    }
    details.push(url);
    return json({ jobPostingInfo: { jobReqId: url.split("_").pop(), location: "Phoenix, AZ", jobDescription: "<p>Own enterprise accounts.</p>", externalUrl: `https://acme.wd5.myworkdayjobs.com/External${url.slice(url.indexOf("/job/"))}` } });
  };
  let details: string[] = [];

  it("fetches descriptions only for roles it has not saved before", async () => {
    details = [];
    const c = await makeCompany(db, { name: "Acme Workday", atsProvider: "WORKDAY", atsToken: "acme|wd5|External" });
    const one = [{ title: "Enterprise Account Executive", path: "/job/Phoenix-AZ/Enterprise-Account-Executive_R1" }];
    expect((await ingestCompany(db, c, board(one), new Date())).created).toBe(1);
    expect(details).toHaveLength(1);
    details = [];
    const two = [...one, { title: "Strategic Account Executive", path: "/job/Phoenix-AZ/Strategic-Account-Executive_R2" }];
    const o = await ingestCompany(db, c, board(two), new Date());
    expect(o.created).toBe(1);
    expect(details).toEqual(["https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/job/Phoenix-AZ/Strategic-Account-Executive_R2"]);
    const jobs = await db.job.findMany({ where: { companyId: c.id, status: "OPEN" } });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.location === "Phoenix, AZ" && j.descriptionText)).toBe(true);
  });

  it("reads a working Workday board at most every 3 hours on the schedule, and any time from its page", async () => {
    const c = await makeCompany(db, { name: "Recent Workday", atsProvider: "WORKDAY", atsToken: "acme|wd5|External", atsStatus: "ok", lastIngestedAt: new Date(Date.now() - 3600_000) });
    let called = false;
    const f = async () => { called = true; return json({ total: 0, jobPostings: [] }); };
    expect((await ingestCompany(db, c, f, new Date(), { scheduled: true })).status).toBe("skipped");
    expect(called).toBe(false);
    expect((await ingestCompany(db, c, f, new Date())).status).toBe("ok");
    expect(called).toBe(true);
  });

  it("a working board that Workday slows down stays live with a note, not an error", async () => {
    const c = await makeCompany(db, { name: "Slowed Workday", atsProvider: "WORKDAY", atsToken: "acme|wd5|External", atsStatus: "ok", lastIngestedAt: new Date("2026-11-18T12:00:00Z") });
    const o = await ingestCompany(db, c, async () => limited(), new Date());
    expect(o.status).toBe("limited");
    const after = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.atsStatus).toBe("ok");
    expect(after.atsError).toMatch(/^Workday asked the app to slow down \(HTTP 429\)\. Keeping the 0 saved openings from 2026-11-18/);
  });
});

describe("job boards listed as employers (Jobgether, Ladders, ClearanceJobs)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it.each(["Jobgether", "Ladders", "ClearanceJobs", "Clearance Jobs", "Remote Quest Jobs", "Strategy & Operations Lead @ Sierra", "Rithum LinkedIn Board", "GetJobSmart", "TrulyHired"])("%s is not an employer", (n) => {
    expect(aggregatorReason(n)).toBeDefined();
  });
  it.each(["Sierra", "Salesforce", "Engine", "Indie", "Jet Support", "Ladder Health Labs"])("%s is an employer", (n) => {
    expect(aggregatorReason(n)).toBeUndefined();
  });

  it("Google Jobs skips them instead of adding a company", async () => {
    await db.integrationStatus.deleteMany({ where: { id: "google_jobs" } });
    const f = mockFetch({ "serpapi.com": { jobs_results: [
      { job_id: "jg1", title: "Enterprise Account Executive", company_name: "Jobgether", location: "Phoenix, AZ", apply_options: [{ title: "Jobgether", link: "https://jobgether.com/offer/1" }] },
      { job_id: "sl1", title: "Enterprise Account Executive", company_name: "Strategy & Operations Lead @ Sierra", location: "Phoenix, AZ", apply_options: [{ title: "x", link: "https://example.com/1" }] },
    ] } });
    const r = await runGoogleJobs(db, { fetchImpl: f, apiKey: "test", force: true });
    expect(r.companiesAdded).toBe(0);
    expect(r.skippedStaffing).toBeGreaterThan(0);
  });

  it("removes stored ones with their reposted jobs, keeps one she applied through and every real company", async () => {
    const jg = await makeCompany(db, { name: "Jobgether", addedBy: "job-site", atsProvider: "LEVER", atsToken: "jobgether" });
    await db.job.create({ data: { companyId: jg.id, fingerprint: `jg-${jg.id}`, title: "Account Executive", applyUrl: "https://jobs.lever.co/jobgether/1" } });
    const lad = await makeCompany(db, { name: "Ladders", addedBy: "job-site" });
    await db.application.create({ data: { companyId: lad.id, title: "Sales Director" } });
    const real = await makeCompany(db, { name: "Sierra", addedBy: "job-site" });
    const r = await removeAggregatorCompanies(db);
    expect(r.removed).toContain("Jobgether");
    expect(r.kept).toContain("Ladders");
    expect(await db.company.findUnique({ where: { id: jg.id } })).toBeNull();
    expect(await db.job.count({ where: { companyId: jg.id } })).toBe(0);
    expect(await db.company.findUnique({ where: { id: real.id } })).not.toBeNull();
  });
});

describe("a company removed while a refresh is running (Nov 18 hourly crash)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("skips a company that was merged or removed after the refresh listed it", async () => {
    const c = await makeCompany(db, { name: "Gone Before Its Turn" });
    await db.company.delete({ where: { id: c.id } });
    const o = await ingestCompany(db, c, mockFetch({}), new Date());
    expect(o.status).toBe("skipped");
  });

  it("does not crash when the company disappears halfway through its own read", async () => {
    const c = await makeCompany(db, { name: "Gone Mid Read", atsProvider: "GREENHOUSE", atsToken: "gonemid" });
    const f = async () => { await db.company.delete({ where: { id: c.id } }); return new Response("boom", { status: 500 }); };
    const o = await ingestCompany(db, c, f, new Date());
    expect(o.status).toBe("skipped");
  });

  it("finishes the whole refresh when one company is removed mid-run", async () => {
    const { runIngestion } = await import("@/lib/ingest/run");
    await db.ingestionRun.updateMany({ where: { status: "running" }, data: { status: "interrupted" } });
    const a = await makeCompany(db, { name: "Stays", atsProvider: "GREENHOUSE", atsToken: "stays" });
    const b = await makeCompany(db, { name: "Removed Mid Run", atsProvider: "GREENHOUSE", atsToken: "removedmid" });
    const f = async (url: string) => {
      if (url.includes("/removedmid/")) { await db.company.deleteMany({ where: { id: b.id } }); return new Response("boom", { status: 500 }); }
      return json({ jobs: [], meta: { total: 0 } });
    };
    const r = await runIngestion(db, { trigger: "test", companyIds: [a.id, b.id], fetchImpl: f });
    expect(r.outcomes.map((o) => o.status).sort()).toEqual(["ok", "skipped"]);
  });
});
