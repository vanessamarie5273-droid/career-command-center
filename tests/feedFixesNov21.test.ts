// Nov 21: Workday had answered 429 to every call since Nov 16, the app tried all 18 boards again every hour, and each
// refresh posted "19 job feeds failed to refresh". Cedar's Ashby board moved, and several companies had boards the
// lookup could not guess (HubSpot, Wiz, Rippling, Flock Safety...).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getJson, isPaused, resetRateLimits, setPause } from "@/lib/ingest/http";
import { loadPauses, pauseHours, savePauses } from "@/lib/ingest/rateLimits";
import { ingestCompany, runIngestion, WORKDAY_PER_RUN } from "@/lib/ingest/run";
import { candidates } from "@/lib/ingest/providers";
import { fetchRippling } from "@/lib/ingest/rippling";
import { fetchWorkday, MAX_RESULTS } from "@/lib/ingest/workday";
import { boardHintFromUrl } from "@/lib/companies";
import { makeCompany, testDb } from "./setup-db";

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...headers } });
const limited = () => json({}, 429, { "Retry-After": "0.01" });
const WD = "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs";
const GH_JOBS = { jobs: [{ id: 1, title: "Enterprise Account Executive", location: { name: "Phoenix, AZ" }, absolute_url: "https://boards.greenhouse.io/x/jobs/1", updated_at: "2026-11-20T00:00:00Z", content: "<p>Sell.</p>" }] };

let db: PrismaClient;
beforeAll(() => { db = testDb(); });
afterAll(() => db.$disconnect());
const clean = async () => {
  resetRateLimits();
  await db.$executeRawUnsafe(`TRUNCATE "Company", "Alert", "IntegrationStatus", "IngestionRun" CASCADE`);
};

describe("a rate limit that outlasts a refresh", () => {
  beforeEach(clean);

  it("waits 2 hours, then twice as long each time, up to a day", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(pauseHours)).toEqual([2, 4, 8, 16, 24, 24, 24]);
  });

  it("is saved after the refresh, loaded by the next one, and cleared once the site answers again", async () => {
    const t0 = Date.now();
    await expect(getJson(async () => limited(), WD, { method: "POST" })).rejects.toThrow();
    const first = await savePauses(db, await loadPauses(db).then(() => ({})), t0);
    expect(first.started.map((s) => s.group)).toEqual(["myworkdayjobs.com"]);
    expect(first.paused["myworkdayjobs.com"].until).toBe(t0 + 2 * 3600_000);

    // The next refresh is a new process: nothing in memory, the pause comes from the database.
    resetRateLimits();
    const before = await loadPauses(db);
    expect(isPaused("myworkdayjobs.com")).toBe(true);
    let calls = 0;
    await expect(getJson(async () => { calls++; return json({}); }, WD, { method: "POST" })).rejects.toThrow(/limiting/);
    expect(calls).toBe(0);

    // After the pause ends Workday still limits: the pause doubles, and no second "paused" alert is due.
    resetRateLimits();
    setPause("myworkdayjobs.com", { ...before["myworkdayjobs.com"], until: 0 });
    await expect(getJson(async () => limited(), WD, { method: "POST" })).rejects.toThrow();
    const second = await savePauses(db, before, t0);
    expect(second.started).toEqual([]);
    expect(second.paused["myworkdayjobs.com"]).toMatchObject({ strikes: 2, until: t0 + 4 * 3600_000, since: before["myworkdayjobs.com"].since });

    // Workday answers: the pause is gone and the recovery is reported once.
    resetRateLimits();
    const third = await loadPauses(db);
    setPause("myworkdayjobs.com", { ...third["myworkdayjobs.com"], until: 0 });
    await getJson(async () => json({ total: 0, jobPostings: [] }), WD, { method: "POST" });
    expect((await savePauses(db, third)).recovered).toEqual(["myworkdayjobs.com"]);
    expect(await db.integrationStatus.findUnique({ where: { id: "ratelimit:myworkdayjobs.com" } })).toBeNull();
  });
});

describe("the hourly refresh while Workday is limiting the app", () => {
  beforeEach(clean);

  it("does not call Workday during a pause, shows its boards as paused, and posts no failure alert", async () => {
    const until = Date.now() + 3600_000;
    await db.integrationStatus.create({ data: { id: "ratelimit:myworkdayjobs.com", name: "Workday rate limit", status: "paused", detail: JSON.stringify({ until, since: Date.parse("2026-11-16T15:00:00Z"), strikes: 3 }) } });
    const sf = await makeCompany(db, { name: "Salesforce", atsProvider: "WORKDAY", atsToken: "salesforce|wd12|External_Career_Site", atsStatus: "error", lastIngestedAt: new Date("2026-11-15T18:00:00Z") });
    await makeCompany(db, { name: "Cisco", atsProvider: "WORKDAY", atsToken: "cisco|wd5|Cisco_Careers", atsStatus: "error" });
    await makeCompany(db, { name: "Anthropic", atsProvider: "GREENHOUSE", atsToken: "anthropic" });
    const urls: string[] = [];
    const r = await runIngestion(db, { trigger: "hourly", fetchImpl: async (url) => { urls.push(url); return json(GH_JOBS); } });
    expect(urls.some((u) => u.includes("myworkdayjobs.com"))).toBe(false);
    expect(urls.some((u) => u.includes("greenhouse"))).toBe(true);
    expect(r.errors).toBe(0);
    const after = await db.company.findUniqueOrThrow({ where: { id: sf.id } });
    expect(after.atsStatus).toBe("paused");
    expect(after.atsError).toMatch(/^Paused: Workday is limiting requests from the app \(since Nov 16, 2026\)\. Keeping the 0 saved openings from Nov 15, 2026/);
    expect(await db.alert.count({ where: { kind: "integration_error" } })).toBe(0);
    const wd = await db.integrationStatus.findUniqueOrThrow({ where: { id: "workday" } });
    expect(wd.status).toBe("paused");
    expect(wd.detail).toMatch(/^2 companies, 2 paused: Workday has been limiting the app's requests since Nov 16, 2026\. Saved openings are kept; next try after /);
  });

  it("posts one notice when the pause starts, and none on the refreshes after", async () => {
    for (const n of ["A", "B", "C"]) await makeCompany(db, { name: `Workday ${n}`, atsProvider: "WORKDAY", atsToken: `${n.toLowerCase()}|wd5|External`, atsStatus: "ok" });
    const f = async (url: string) => (url.includes("myworkdayjobs.com") ? limited() : json(GH_JOBS));
    await runIngestion(db, { trigger: "hourly", fetchImpl: f });
    let alerts = await db.alert.findMany({ where: { kind: "integration_error" } });
    expect(alerts.map((a) => a.title)).toEqual(["Workday is limiting the app, so 3 Workday job boards are paused"]);
    expect(alerts[0].body).toMatch(/^Their saved openings stay in Discover Jobs\. The app tries again after .* Nothing for you to do\.$/);
    expect((await db.company.findMany({ where: { atsProvider: "WORKDAY" } })).every((c) => c.atsStatus === "paused")).toBe(true);
    // Same problem on the next two refreshes (the pause ends early here to force a retry): still one notice.
    for (let i = 0; i < 2; i++) {
      const row = await db.integrationStatus.findUniqueOrThrow({ where: { id: "ratelimit:myworkdayjobs.com" } });
      await db.integrationStatus.update({ where: { id: row.id }, data: { detail: JSON.stringify({ ...JSON.parse(row.detail!), until: 0 }) } });
      await runIngestion(db, { trigger: "hourly", fetchImpl: f });
    }
    alerts = await db.alert.findMany({ where: { kind: "integration_error" } });
    expect(alerts).toHaveLength(1);
    expect(JSON.parse((await db.integrationStatus.findUniqueOrThrow({ where: { id: "ratelimit:myworkdayjobs.com" } })).detail!).strikes).toBe(3);
  });

  it("reads only a few Workday boards per scheduled refresh, longest-unread first", async () => {
    for (let i = 0; i < WORKDAY_PER_RUN + 3; i++) await makeCompany(db, { name: `Board ${i}`, atsProvider: "WORKDAY", atsToken: `t${i}|wd5|External`, atsStatus: "ok", lastIngestedAt: new Date(Date.now() - (30 - i) * 3600_000) });
    const tenants = new Set<string>();
    await runIngestion(db, { trigger: "hourly", fetchImpl: async (url) => { tenants.add(new URL(url).host.split(".")[0]); return json({ total: 0, jobPostings: [] }); } });
    expect([...tenants].sort()).toEqual(["t0", "t1", "t2", "t3"]);
  });
});

describe("failure alerts: one per problem, not one per hour", () => {
  beforeEach(clean);

  it("alerts when a feed starts failing, stays quiet while it keeps failing, and alerts again after it recovered and failed again", async () => {
    await makeCompany(db, { name: "Broken Co", atsProvider: "GREENHOUSE", atsToken: "broken" });
    await makeCompany(db, { name: "Fine Co", atsProvider: "GREENHOUSE", atsToken: "fine" });
    const failing = async (url: string) => (url.includes("/broken/") ? new Response("boom", { status: 500 }) : json(GH_JOBS));
    const titles = async () => (await db.alert.findMany({ where: { kind: "integration_error" }, orderBy: { createdAt: "asc" } })).map((a) => a.title);
    await runIngestion(db, { trigger: "hourly", fetchImpl: failing });
    await runIngestion(db, { trigger: "hourly", fetchImpl: failing });
    await runIngestion(db, { trigger: "hourly", fetchImpl: failing });
    expect(await titles()).toEqual(["1 job feed stopped refreshing"]);
    await runIngestion(db, { trigger: "hourly", fetchImpl: async () => json(GH_JOBS) });
    expect(await titles()).toHaveLength(1);
    await runIngestion(db, { trigger: "hourly", fetchImpl: failing });
    expect(await titles()).toEqual(["1 job feed stopped refreshing", "1 job feed stopped refreshing"]);
  }, 60_000);
});

describe("a company's job board that moved (Cedar's Ashby board, 404 from Nov 20)", () => {
  beforeEach(clean);

  it("looks for the current board instead of failing every hour, and finds it", async () => {
    const c = await makeCompany(db, { name: "Cedar", slug: "cedar", atsProvider: "ASHBY", atsToken: "cedar", atsStatus: "ok" });
    const ashby = { jobs: [{ id: "a1", title: "Enterprise Account Executive", location: "Remote - US", isRemote: true, jobUrl: "https://jobs.ashbyhq.com/Cedar/a1", descriptionHtml: "<p>Sell.</p>", publishedAt: "2026-11-19T00:00:00Z" }] };
    const f = async (url: string) => (url.includes("job-board/Cedar?") ? json(ashby) : new Response("not found", { status: 404 }));
    const first = await ingestCompany(db, c, f, new Date());
    expect(first.status).toBe("pending");
    let after = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(after).toMatchObject({ atsProvider: "NONE", atsToken: null, atsStatus: "pending", atsCheckedAt: null });
    expect(after.atsError).toMatch(/^The Ashby board "cedar" no longer exists \(404\)/);
    const second = await ingestCompany(db, after, f, new Date());
    expect(second.status).toBe("ok");
    after = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(after).toMatchObject({ atsProvider: "ASHBY", atsToken: "Cedar", atsStatus: "ok" });
  });

  it("tries Ashby boards under the company's name as written", () => {
    const ashby = (name: string, slug: string) => candidates(slug, name, []).filter((c) => c.provider === "ASHBY").map((c) => c.token);
    expect(ashby("Cedar", "cedar")).toContain("Cedar");
    expect(ashby("Flock Safety", "flock-safety")).toEqual(expect.arrayContaining(["Flock Safety", "FlockSafety"]));
  });
});

describe("Rippling's job board", () => {
  it("reads the board's JSON list", async () => {
    const f = async (url: string) => {
      expect(url).toBe("https://api.rippling.com/platform/api/ats/v1/board/rippling/jobs");
      return json([
        { uuid: "ef0b", name: " Account Executive, Broker Channel (Arizona) ", department: { id: "Sales", label: "Sales" }, url: "https://ats.rippling.com/rippling/jobs/ef0b", workLocation: { label: "AZ", id: "AZ" } },
        { uuid: "x2", name: "Mid-Market Account Executive", department: null, workLocation: { label: "Remote (United States)" } },
      ]);
    };
    const r = await fetchRippling("rippling", f);
    expect(r.total).toBe(2);
    expect(r.postings[0]).toMatchObject({ provider: "RIPPLING", externalId: "rippling:ef0b", title: "Account Executive, Broker Channel (Arizona)", location: "AZ", department: "Sales", applyUrl: "https://ats.rippling.com/rippling/jobs/ef0b" });
    expect(r.postings[1]).toMatchObject({ isRemote: true, applyUrl: "https://ats.rippling.com/rippling/jobs/x2" });
  });

  it("is recognized from a careers link", () => {
    expect(boardHintFromUrl("https://ats.rippling.com/rippling/jobs")).toBe("rippling:rippling");
    expect(boardHintFromUrl("https://ats.rippling.com/acme-co/jobs/123")).toBe("rippling:acme-co");
  });
});

describe("Workday reads fewer pages per search", () => {
  it(`stops each search after ${MAX_RESULTS} results`, async () => {
    const offsets: number[] = [];
    const f = async (_url: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      if (b.searchText === "account executive") offsets.push(b.offset);
      return json({ total: 900, jobPostings: b.searchText ? Array.from({ length: 20 }, (_, i) => ({ title: "Software Engineer", externalPath: `/job/x_${b.offset + i}` })) : [] });
    };
    await fetchWorkday("acme|wd5|External", f);
    expect(offsets).toEqual([0, 20, 40, 60, 80]);
  });
});
