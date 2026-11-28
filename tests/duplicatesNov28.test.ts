// "I am noticing a TON of duplicates in job postings", day over day (Nov 28). One req = one entry.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { jobFingerprint, placeSet, sameReq, titleKey, urlKey } from "@/lib/dedupe";
import { upsertPosting } from "@/lib/ingest/run";
import { mergeDuplicateJobs } from "@/lib/jobMerge";
import { fetchWorkday } from "@/lib/ingest/workday";
import { runGoogleJobs } from "@/lib/ingest/googleJobs";
import { makeCompany, testDb } from "./setup-db";

const v = (title: string, location: string | null, providers = ["GREENHOUSE"], urls: string[] = []) => ({ title, location, providers, urls });

describe("matching one opening across spellings", () => {
  it("reads the same place however a board writes it", () => {
    for (const l of ["Phoenix, AZ", "Phoenix, Arizona, United States", "US-AZ-Phoenix", "USA - Arizona - Phoenix", "Phoenix"]) expect(placeSet(l)).toEqual(["phoenix"]);
    for (const l of ["Remote - US", "Remote, United States", "United States (Remote)", "Anywhere", "Remote"]) expect(placeSet(l)).toEqual(["remote"]);
    expect(placeSet("2 Locations")).toEqual([]);
    expect(placeSet("United States")).toEqual([]);
    expect(placeSet("New York, NY")).toEqual(["new york"]);
    expect(placeSet("Phoenix, AZ; Denver, CO")).toEqual(["denver", "phoenix"]);
  });

  it("reads titles in any word order, without the city in them", () => {
    expect(titleKey("Director, Sales Development")).toBe(titleKey("Sales Development Director"));
    expect(titleKey("Director of Sales")).toBe(titleKey("Sales Director"));
    expect(titleKey("Enterprise Account Executive - Phoenix", "Phoenix, AZ")).toBe(titleKey("Enterprise AE", "Phoenix, AZ"));
  });

  it("keeps levels, territories and new-business roles apart", () => {
    expect(titleKey("Account Executive II")).not.toBe(titleKey("Account Executive I"));
    expect(titleKey("Enterprise Account Executive, West")).not.toBe(titleKey("Enterprise Account Executive, East"));
    expect(titleKey("New Business Account Executive")).not.toBe(titleKey("Account Executive"));
    expect(titleKey("Senior Enterprise AE")).not.toBe(titleKey("Enterprise AE"));
  });

  it("matches a Google Jobs result to the employer's posting even when Google names one city of several", () => {
    expect(sameReq(v("Enterprise AE", "Phoenix, AZ; Denver, CO"), v("Enterprise Account Executive", "Denver, CO", ["GOOGLE_JOBS"]))).toBe(true);
    expect(sameReq(v("Enterprise AE", "Remote - US"), v("Enterprise Account Executive", "Phoenix, AZ", ["GOOGLE_JOBS"]))).toBe(true);
    expect(sameReq(v("Enterprise AE", "Phoenix, AZ"), v("Enterprise AE", "Arizona", ["GOOGLE_JOBS"]))).toBe(true);
    expect(sameReq(v("Enterprise AE", "Austin, TX"), v("Enterprise AE", "Phoenix, AZ", ["GOOGLE_JOBS"]))).toBe(false);
  });

  it("matches by the posting link whatever the title says", () => {
    const url = "https://job-boards.greenhouse.io/acme/jobs/123";
    expect(urlKey(`${url}?gh_src=abc&utm_source=google`)).toBe(urlKey(url));
    expect(sameReq(v("Strategic AE", "Phoenix", ["GREENHOUSE"], [url]), v("Strategic Account Executive - Southwest", "Arizona", ["GOOGLE_JOBS"], [`${url}?utm_source=google_jobs`]))).toBe(true);
  });

  it("keeps the employer's own postings for different cities as separate reqs", () => {
    expect(sameReq(v("Enterprise AE", "Phoenix, AZ"), v("Enterprise AE", "Austin, TX"))).toBe(false);
    expect(sameReq(v("Enterprise AE", "Phoenix, AZ"), v("Enterprise AE", "Remote - US"))).toBe(false);
    // One board listing a role in two cities and another listing one of them is the same role.
    expect(sameReq(v("Enterprise AE", "Phoenix, AZ; Denver, CO", ["GREENHOUSE"]), v("Enterprise AE", "Phoenix, AZ", ["LEVER"]))).toBe(true);
    // ...but on one board they are two postings.
    expect(sameReq(v("Enterprise AE", "Phoenix, AZ; Denver, CO"), v("Enterprise AE", "Phoenix, AZ"))).toBe(false);
  });

  it("fingerprints every spelling of a place the same", () => {
    expect(jobFingerprint("c", "Enterprise AE", "Phoenix, AZ")).toBe(jobFingerprint("c", "Enterprise Account Executive", "Phoenix, Arizona, United States"));
    expect(jobFingerprint("c", "Enterprise AE", "Remote - US")).toBe(jobFingerprint("c", "Enterprise AE", "United States (Remote)"));
  });
});

describe("refreshes never add a second copy", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());
  beforeEach(async () => { await db.$executeRawUnsafe(`TRUNCATE "Company", "IntegrationStatus", "IngestionRun" CASCADE`); });
  const now = new Date("2026-11-27T15:00:00Z");

  it("folds Google Jobs results into the employer's posting, from any search, on any day", async () => {
    const c = await makeCompany(db, { name: "Acme Cloud" });
    await upsertPosting(db, c, { provider: "GREENHOUSE", externalId: "acme:1", title: "Enterprise Account Executive", location: "Phoenix, Arizona, United States", applyUrl: "https://job-boards.greenhouse.io/acme/jobs/1", descriptionText: "Sell.", postedAt: now }, now);
    // The Phoenix search and the remote search give the same posting two job_ids, and a new one each day.
    const day2 = new Date(now.getTime() + 86400_000);
    expect(await upsertPosting(db, c, { provider: "GOOGLE_JOBS", externalId: "gj-a", title: "Enterprise AE", location: "Phoenix, AZ", applyUrl: "https://www.linkedin.com/jobs/view/1", postedAt: now }, now)).toBe("verified");
    expect(await upsertPosting(db, c, { provider: "GOOGLE_JOBS", externalId: "gj-b", title: "Enterprise Account Executive", location: "United States", applyUrl: "https://www.indeed.com/viewjob?jk=1", postedAt: now }, day2)).toBe("verified");
    const jobs = await db.job.findMany({ where: { companyId: c.id }, include: { sources: true } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].applyUrl).toBe("https://job-boards.greenhouse.io/acme/jobs/1");
    expect(jobs[0].sources).toHaveLength(3);
  });

  it("puts the employer's posting on the Google Jobs copy found first, instead of adding a second job", async () => {
    const c = await makeCompany(db, { name: "Beta Data" });
    await upsertPosting(db, c, { provider: "GOOGLE_JOBS", externalId: "gj-1", title: "Sales Development Director", location: "Phoenix, AZ", applyUrl: "https://www.linkedin.com/jobs/view/9", postedAt: null }, now);
    expect(await upsertPosting(db, c, { provider: "LEVER", externalId: "beta:9", title: "Director, Sales Development", location: "Remote - US", applyUrl: "https://jobs.lever.co/beta/9", descriptionText: "Lead SDRs.", postedAt: now }, now)).toBe("updated");
    const jobs = await db.job.findMany({ where: { companyId: c.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].applyUrl).toBe("https://jobs.lever.co/beta/9");
  });

  it("still saves the employer's separate postings for different cities", async () => {
    const c = await makeCompany(db, { name: "Gamma AI" });
    await upsertPosting(db, c, { provider: "GREENHOUSE", externalId: "g:1", title: "Enterprise AE", location: "Phoenix, AZ", applyUrl: "https://x/1" }, now);
    expect(await upsertPosting(db, c, { provider: "GREENHOUSE", externalId: "g:2", title: "Enterprise AE", location: "Austin, TX", applyUrl: "https://x/2" }, now)).toBe("created");
    expect(await upsertPosting(db, c, { provider: "GREENHOUSE", externalId: "g:3", title: "Enterprise AE II", location: "Phoenix, AZ", applyUrl: "https://x/3" }, now)).toBe("created");
    expect(await db.job.count({ where: { companyId: c.id } })).toBe(3);
  });

  it("knows a Google result again the next day although Google gave it a new job_id", async () => {
    const c = await makeCompany(db, { name: "Delta Systems", atsProvider: "NONE", atsToken: null });
    const result = (job_id: string) => ({ job_id, title: "Strategic Account Executive", company_name: "Delta Systems", location: "Phoenix, AZ", detected_extensions: { posted_at: "2 days ago" }, apply_options: [{ title: "Delta Careers", link: "https://careers.delta.example/jobs/77?utm_source=google" }] });
    let day = 0;
    const f = async () => new Response(JSON.stringify({ jobs_results: [result(`id-${day}-a`), result(`id-${day}-b`)] }), { status: 200, headers: { "Content-Type": "application/json" } });
    await runGoogleJobs(db, { fetchImpl: f, now, force: true, apiKey: "k" });
    day = 1;
    await runGoogleJobs(db, { fetchImpl: f, now: new Date(now.getTime() + 86400_000), force: true, apiKey: "k" });
    const jobs = await db.job.findMany({ where: { companyId: c.id }, include: { sources: true } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].sources).toHaveLength(1);
  });

  it("keeps a Workday role's id when its details call fails, so it never comes back as a new copy", async () => {
    const WD = "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External";
    const f = async (url: string) => {
      if (url.endsWith("/jobs")) return new Response(JSON.stringify({ total: 1, jobPostings: [{ title: "Enterprise Account Executive", externalPath: "/job/Phoenix-AZ/Enterprise-AE_R123", locationsText: "2 Locations" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.startsWith(WD)) return new Response(JSON.stringify({ jobPostingInfo: { jobReqId: "R123", location: "Phoenix, AZ", additionalLocations: ["Remote - US"], jobDescription: "<p>Sell.</p>", externalUrl: "https://acme.wd5.myworkdayjobs.com/External/job/Phoenix-AZ/Enterprise-AE_R123" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response("{}", { status: 404 });
    };
    // Read earlier while details were rate limited: saved under its path, with no description.
    const known = new Map([["/job/Phoenix-AZ/Enterprise-AE_R123", { externalId: "acme:/job/Phoenix-AZ/Enterprise-AE_R123", location: "2 Locations", applyUrl: "https://acme.wd5.myworkdayjobs.com/External/job/Phoenix-AZ/Enterprise-AE_R123", postedAt: null, isRemote: false, described: false }]]);
    const r = await fetchWorkday("acme|wd5|External", f as typeof fetch, known);
    expect(r.postings).toHaveLength(1);
    expect(r.postings[0].externalId).toBe("acme:/job/Phoenix-AZ/Enterprise-AE_R123");
    expect(r.postings[0].descriptionHtml).toBe("<p>Sell.</p>");
  });
});

describe("copies saved before the fix are merged into one job", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());
  beforeEach(async () => { await db.$executeRawUnsafe(`TRUNCATE "Company", "IntegrationStatus", "IngestionRun" CASCADE`); });
  const now = new Date("2026-11-28T04:00:00Z");
  const job = (companyId: string, title: string, location: string, provider: string, n: number, over: Record<string, unknown> = {}) =>
    db.job.create({ data: { companyId, title, location, fingerprint: `old-${n}-${Math.random()}`, applyUrl: `https://x/${n}`, firstSeenAt: new Date(now.getTime() - n * 86400_000), sources: { create: { provider, externalId: `${provider}:${n}:${Math.random()}`, url: `https://x/${n}` } }, ...over } });

  it("keeps the employer's posting, her application and kit, and removes the copies", async () => {
    const c = await makeCompany(db, { name: "Echo Software" });
    const own = await job(c.id, "Enterprise Account Executive", "Phoenix, Arizona, United States", "GREENHOUSE", 1);
    const g1 = await job(c.id, "Enterprise AE", "Phoenix, AZ", "GOOGLE_JOBS", 5, { favorite: true, alertedAt: now });
    const g2 = await job(c.id, "Enterprise Account Executive", "United States", "GOOGLE_JOBS", 0);
    await db.application.create({ data: { companyId: c.id, jobId: g1.id, title: "Enterprise AE", stage: "READY_TO_APPLY" } });
    const distinct = await job(c.id, "Enterprise Account Executive", "Austin, TX", "GREENHOUSE", 2);
    const r = await mergeDuplicateJobs(db, now);
    expect(r.removed).toBe(2);
    const left = await db.job.findMany({ where: { companyId: c.id }, include: { sources: true, applications: true, events: true } });
    expect(left.map((j) => j.id).sort()).toEqual([own.id, distinct.id].sort());
    // The employer's posting survives and her saved application, the favorite and every source move onto it.
    const kept = left.find((j) => j.id === own.id)!;
    expect(kept.applyUrl).toBe("https://x/1");
    expect(kept.applications).toHaveLength(1);
    expect(kept.sources.map((s) => s.provider)).toContain("GREENHOUSE");
    expect(kept.sources.map((s) => s.provider)).toContain("GOOGLE_JOBS");
    // The "United States" result fits both cities; it folds into one of them and no source is lost.
    expect(left.reduce((a, j) => a + j.sources.length, 0)).toBe(4);
    expect(kept.favorite).toBe(true);
    expect(kept.alertedAt).not.toBeNull();
    expect(kept.firstSeenAt.getTime()).toBe(now.getTime() - 5 * 86400_000);
    expect(kept.events.some((e) => e.kind === "merged")).toBe(true);
    expect(await db.job.findUnique({ where: { id: g1.id } })).toBeNull();
    expect(await db.job.findUnique({ where: { id: g2.id } })).toBeNull();
    expect(await db.job.findUnique({ where: { id: distinct.id } })).not.toBeNull();
    // Fingerprints are brought up to date, so the next refresh finds the merged job.
    expect(kept.fingerprint).toBe(jobFingerprint(c.id, kept.title, kept.location));
  });

  it("carries her Not a Fit to the surviving copy and drops her Duplicate marks", async () => {
    const c = await makeCompany(db, { name: "Foxtrot" });
    await job(c.id, "Regional Sales Director", "Remote - US", "LEVER", 1);
    await job(c.id, "Director, Regional Sales", "Remote", "GOOGLE_JOBS", 2, { dismissed: true, dismissReason: "not_fit" });
    const c2 = await makeCompany(db, { name: "Golf" });
    await job(c2.id, "Head of Sales Development", "Phoenix, AZ", "ASHBY", 1);
    await job(c2.id, "Head of Sales Development", "Phoenix", "GOOGLE_JOBS", 2, { dismissed: true, dismissReason: "duplicate" });
    await mergeDuplicateJobs(db, now);
    const [f] = await db.job.findMany({ where: { companyId: c.id } });
    expect(f.dismissed).toBe(true);
    expect(f.dismissReason).toBe("not_fit");
    const g = await db.job.findMany({ where: { companyId: c2.id } });
    expect(g).toHaveLength(1);
    expect(g[0].dismissed).toBe(false);
  });

  it("leaves two copies apart when she applied to both", async () => {
    const c = await makeCompany(db, { name: "Hotel" });
    const a = await job(c.id, "Enterprise AE", "Phoenix, AZ", "GREENHOUSE", 1);
    const b = await job(c.id, "Enterprise AE", "Phoenix", "GOOGLE_JOBS", 2);
    const d = await job(c.id, "Enterprise Account Executive", "Arizona", "GOOGLE_JOBS", 3);
    await db.application.create({ data: { companyId: c.id, jobId: a.id, title: "Enterprise AE", stage: "APPLIED", applied: true } });
    await db.application.create({ data: { companyId: c.id, jobId: b.id, title: "Enterprise AE", stage: "APPLIED", applied: true } });
    await mergeDuplicateJobs(db, now);
    expect((await db.job.findMany({ where: { companyId: c.id } })).map((j) => j.id).sort()).toEqual([a.id, b.id].sort());
    expect(await db.job.findUnique({ where: { id: d.id } })).toBeNull();
    expect(await db.application.count({ where: { companyId: c.id } })).toBe(2);
  });
});
