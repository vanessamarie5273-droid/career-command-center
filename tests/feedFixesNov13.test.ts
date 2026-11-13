import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { candidates } from "@/lib/ingest/providers";
import { getJson, resetRateLimits } from "@/lib/ingest/http";
import { RateLimited } from "@/lib/ingest/types";
import { fetchWorkday } from "@/lib/ingest/workday";
import { ingestCompany } from "@/lib/ingest/run";
import { companyKey, mergeDuplicateCompanies } from "@/lib/companyMerge";
import { findCompanyByName } from "@/lib/companies";
import { SEED_COMPANIES } from "@/data/companies";
import { ashbyBoard, mockFetch } from "./fixtures/boards";
import { makeCompany, testDb } from "./setup-db";

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...headers } });
const limited = () => json({ error: "Too many requests" }, 429, { "Retry-After": "0.01" });

describe("Workable rate limits (Nov 13: 4 live boards failing, ~56 companies wrongly 'no public board')", () => {
  beforeEach(() => resetRateLimits());

  it("does not guess Workable accounts from a company's name", () => {
    const c = candidates("arctic-wolf", "Arctic Wolf", []);
    expect(c.some((x) => x.provider === "WORKABLE")).toBe(false);
    expect(c.some((x) => x.provider === "GREENHOUSE" && x.token === "arcticwolf")).toBe(true);
  });

  it("still reads a Workable board named by a hint or by the careers link", () => {
    expect(candidates("nuvei", "Nuvei", ["workable:nuvei"])[0]).toEqual({ provider: "WORKABLE", token: "nuvei" });
    expect(candidates("acme", "Acme", [], ["https://apply.workable.com/acme-inc/"])[0]).toEqual({ provider: "WORKABLE", token: "acme-inc" });
    expect(candidates("acme", "Acme", [], ["https://acme.workable.com"])[0]).toEqual({ provider: "WORKABLE", token: "acme" });
  });

  it("gives a host that keeps answering 429 a rest instead of calling it again in the same run", async () => {
    let calls = 0;
    const f = async () => { calls++; return limited(); };
    await expect(getJson(f, "https://apply.workable.com/api/v1/widget/accounts/nuvei?details=true")).rejects.toBeInstanceOf(RateLimited);
    expect(calls).toBe(3);
    await expect(getJson(f, "https://apply.workable.com/api/v1/widget/accounts/opperate?details=true")).rejects.toBeInstanceOf(RateLimited);
    expect(calls).toBe(3);
  });
});

describe("board lookups and reads that a rate limit cuts short", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());
  beforeEach(() => resetRateLimits());

  it("a lookup that hit a 429 or 422 is pending, not 'no public board', and is not retried every hour", async () => {
    const c = await makeCompany(db, { name: "Dell Technologies", atsProvider: "NONE", atsToken: null, atsHints: ["workday:dell|wd1|External"] });
    const f = async (url: string, init?: RequestInit) => (url.includes("myworkdayjobs.com") ? new Response(init?.method === "POST" ? "{\"errorCode\":\"HTTP_422\"}" : "<html></html>", { status: init?.method === "POST" ? 422 : 200 }) : new Response("not found", { status: 404 }));
    const o = await ingestCompany(db, c, f, new Date());
    expect(o.status).toBe("pending");
    const after = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.atsStatus).toBe("pending");
    expect(after.atsError).toMatch(/Lookup not finished.*HTTP 422.*HTTP_422/);
    let called = false;
    expect((await ingestCompany(db, after, async () => { called = true; return new Response("", { status: 404 }); }, new Date())).status).toBe("pending");
    expect(called).toBe(false);
  });

  it("a company with no board anywhere is still 'no public board'", async () => {
    const c = await makeCompany(db, { name: "Nowhere Inc", atsProvider: "NONE", atsToken: null });
    expect((await ingestCompany(db, c, mockFetch({}), new Date())).status).toBe("not_found");
    expect((await db.company.findUniqueOrThrow({ where: { id: c.id } })).atsError).toMatch(/No public Greenhouse, Lever, Ashby or SmartRecruiters board/);
  });

  it("a known board that is rate-limited keeps its openings and says so plainly", async () => {
    const c = await makeCompany(db, { name: "Nuvei", atsProvider: "WORKABLE", atsToken: "nuvei", lastIngestedAt: new Date("2026-11-12T15:00:00Z") });
    await db.job.create({ data: { companyId: c.id, fingerprint: `nv-${c.id}`, title: "Enterprise Account Executive", applyUrl: "https://apply.workable.com/nuvei/j/1", sources: { create: { provider: "WORKABLE", externalId: "nuvei:1", url: "https://apply.workable.com/nuvei/j/1" } } } });
    const o = await ingestCompany(db, c, async () => limited(), new Date());
    expect(o.status).toBe("error");
    const after = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.atsError).toBe("Workable is limiting requests from the app's server (HTTP 429). Keeping the 1 saved opening from 2026-11-12; trying again next refresh.");
    expect(await db.job.count({ where: { companyId: c.id, status: "OPEN" } })).toBe(1);
  });
});

describe("Workday sites that answered 422 (Dell, Qualcomm, Optum)", () => {
  it("opens the careers site and retries the search with its session", async () => {
    const posts: RequestInit[] = [];
    const f = async (url: string, init?: RequestInit) => {
      if (init?.method !== "POST") {
        expect(url).toBe("https://dell.wd1.myworkdayjobs.com/en-US/External");
        const h = new Headers();
        h.append("Set-Cookie", "PLAY_SESSION=abc; Path=/; Secure");
        h.append("Set-Cookie", "CALYPSO_CSRF_TOKEN=tok123; Path=/");
        return new Response("<html></html>", { status: 200, headers: h });
      }
      posts.push(init);
      const hdr = init.headers as Record<string, string>;
      if (!hdr.Cookie) return new Response("{\"errorCode\":\"HTTP_422\"}", { status: 422 });
      const body = JSON.parse(String(init.body));
      if (body.searchText === "" ) return json({ total: 900, jobPostings: [] });
      return json({ total: 0, jobPostings: [] });
    };
    const r = await fetchWorkday("dell|wd1|External", f);
    expect(r.total).toBe(900);
    const retried = posts[1].headers as Record<string, string>;
    expect(retried.Cookie).toBe("PLAY_SESSION=abc; CALYPSO_CSRF_TOKEN=tok123");
    expect(retried["X-CALYPSO-CSRF-TOKEN"]).toBe("tok123");
    expect(retried.Referer).toBe("https://dell.wd1.myworkdayjobs.com/en-US/External");
  });
});

describe("Mistral AI's board moved to Ashby", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("the seed points Mistral at jobs.ashbyhq.com/mistral.ai", () => {
    expect(SEED_COMPANIES.find((c) => c.slug === "mistral-ai")?.hints).toEqual(["ashby:mistral.ai"]);
  });

  it("roles left over from the old board close once the new board is read", async () => {
    const c = await makeCompany(db, { name: "Mistral AI", atsProvider: "ASHBY", atsToken: "mistral.ai" });
    const old = await db.job.create({ data: { companyId: c.id, fingerprint: `ms-${c.id}`, title: "Account Executive, Enterprise (Old)", applyUrl: "https://jobs.lever.co/mistral/1", sources: { create: { provider: "LEVER", externalId: "mistral:1", url: "https://jobs.lever.co/mistral/1" } } } });
    const o = await ingestCompany(db, c, mockFetch({ "api.ashbyhq.com": ashbyBoard([{ id: "a1", title: "Enterprise Account Executive", location: "Remote - US", remote: true }]) }), new Date());
    expect(o.status).toBe("ok");
    expect((await db.job.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("CLOSED");
    expect(await db.job.count({ where: { companyId: c.id, status: "OPEN" } })).toBe(1);
  });
});

describe("duplicate companies", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it.each([
    ["Eleven Labs", "ElevenLabs"], ["Gong.io", "Gong"], ["Cisco Systems, Inc", "Cisco"], ["Elastic NV", "Elastic"],
    ["Hewlett Packard Enterprise Company", "Hewlett Packard Enterprise"], ["J.B. Hunt Transport, Inc.", "J.B. Hunt"],
    ["TeamViewer Germany GmbH", "TeamViewer"], ["TeamViewer SE", "TeamViewer"], ["Jet Support Services, Inc.", "Jet Support"],
    ["DoorDash USA", "DoorDash Inc"], ["Williams Scotsman Inc", "WillScot"],
  ])("%s is %s", (a, b) => expect(companyKey(a)).toBe(companyKey(b)));

  it.each([["Cohere", "Cohere Health"], ["Encompass Health", "Encompass Health Rehabilitation Hospital of West Valley"], ["Box", "Podium"]])("%s is not %s", (a, b) => expect(companyKey(a)).not.toBe(companyKey(b)));

  it("no two seeded companies share a name key", () => {
    const keys = SEED_COMPANIES.map((c) => companyKey(c.name));
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it("folds Gong.io into the seeded Gong, keeps every job and application, and reads Gong's real board", async () => {
    await db.company.deleteMany({ where: { name: { in: ["Gong", "Gong.io"] } } });
    const gong = await makeCompany(db, { name: "Gong", addedBy: "seed:research", atsProvider: "SMARTRECRUITERS", atsToken: "gong", atsStatus: "ok", totalOpenings: 7 });
    const gongio = await makeCompany(db, { name: "Gong.io", addedBy: "job-site", atsProvider: "GREENHOUSE", atsToken: "gongio", atsStatus: "ok", totalOpenings: 88, website: "https://www.gong.io" });
    const job = await db.job.create({ data: { companyId: gongio.id, fingerprint: `g-${gongio.id}`, title: "Enterprise Account Executive", applyUrl: "https://job-boards.greenhouse.io/gongio/jobs/1" } });
    await db.application.create({ data: { companyId: gongio.id, jobId: job.id, title: "Enterprise Account Executive" } });
    await db.contact.create({ data: { companyId: gongio.id, firstName: "Pat", lastName: "Recruiter" } });

    const merged = await mergeDuplicateCompanies(db);
    expect(merged).toContainEqual({ kept: "Gong", removed: ["Gong.io"] });
    expect(await db.company.findUnique({ where: { id: gongio.id } })).toBeNull();
    const kept = await db.company.findUniqueOrThrow({ where: { id: gong.id }, include: { jobs: true, applications: true, contacts: true } });
    expect([kept.atsProvider, kept.atsToken, kept.totalOpenings]).toEqual(["GREENHOUSE", "gongio", 88]);
    expect(kept.jobs.map((j) => j.id)).toEqual([job.id]);
    expect(kept.applications).toHaveLength(1);
    expect(kept.contacts).toHaveLength(1);
    expect(kept.website).toBe("https://www.gong.io");
  });

  it("a new spelling of a company already on the list finds that company", async () => {
    const c = await makeCompany(db, { name: "TeamViewer" });
    expect((await findCompanyByName(db, "TeamViewer Germany GmbH"))?.id).toBe(c.id);
  });

  it("Google Jobs results under another spelling land on the existing company", async () => {
    const { runGoogleJobs } = await import("@/lib/ingest/googleJobs");
    await db.company.deleteMany({ where: { name: { contains: "Cisco" } } });
    const cisco = await makeCompany(db, { name: "Cisco" });
    await db.integrationStatus.deleteMany({ where: { id: "google_jobs" } });
    const f = mockFetch({ "serpapi.com": { jobs_results: [{ job_id: "cs1", title: "Enterprise Account Executive", company_name: "Cisco Systems, Inc", location: "Phoenix, AZ", apply_options: [{ title: "Cisco", link: "https://jobs.cisco.com/1" }] }] } });
    await runGoogleJobs(db, { fetchImpl: f, apiKey: "test", force: true });
    expect(await db.company.count({ where: { name: { contains: "Cisco" } } })).toBe(1);
    expect(await db.job.count({ where: { companyId: cisco.id } })).toBeGreaterThan(0);
  });
});


describe("the deploy seed repairs stored feeds", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("moves Mistral to its Ashby board and looks again for boards a 429 hid", async () => {
    await db.company.deleteMany({ where: { OR: [{ slug: { in: ["mistral-ai", "atlassian"] } }, { name: { in: ["Mistral AI", "Atlassian"] } }] } });
    const ms = await makeCompany(db, { slug: "mistral-ai", name: "Mistral AI", atsProvider: "LEVER", atsToken: "mistral", atsHints: ["lever:mistral"], atsStatus: "error", careersUrl: "https://jobs.lever.co/mistral" });
    const at = await makeCompany(db, { slug: "atlassian", name: "Atlassian", atsProvider: "NONE", atsToken: null, atsStatus: "not_found", atsCheckedAt: new Date(), atsError: "WORKABLE:atlassian HTTP 429 https://apply.workable.com/api/v1/widget/accounts/atlassian?details=true" });
    const { seed } = await import("../scripts/seed");
    await seed(db);
    const m = await db.company.findUniqueOrThrow({ where: { id: ms.id } });
    expect([m.atsProvider, m.atsToken, m.atsStatus, m.careersUrl]).toEqual(["NONE", null, "pending", "https://jobs.ashbyhq.com/mistral.ai"]);
    expect(m.atsHints).toEqual(["ashby:mistral.ai"]);
    const a = await db.company.findUniqueOrThrow({ where: { id: at.id } });
    expect([a.atsStatus, a.atsCheckedAt]).toEqual(["pending", null]);
  });
});
