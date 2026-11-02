import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ingestCompany } from "@/lib/ingest/run";
import { feedHealth, feedVerdict, type FeedHealth } from "@/lib/feedHealth";
import { jobWhere } from "@/lib/jobFilters";
import { instantAlertJobs } from "@/lib/instantAlerts";
import { greenhouseBoard, mockFetch } from "./fixtures/boards";
import { testDb, makeCompany } from "./setup-db";

const base: FeedHealth = { inFeed: 1, heldByCap: 2, aged: 40, location: 12, otherScreened: 0, saved: 5, applied: 9, notAFit: 3, duplicates: 0, postedThisWeek: 6, postedToday: 1, undated: 0, companies: 149, feedsOk: 60, feedsFailed: 2, noFeed: 87, cutOff: 0, lastRun: { status: "partial", finishedAt: new Date(), startedAt: new Date(), errors: 2, companies: 149 } };

describe("Feed Check", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("names the biggest reason when the feeds are working", () => {
    const v = feedVerdict(base);
    expect(v.ok).toBe(true);
    expect(v.text).toContain("147 of 149 job boards");
    expect(v.text).toContain("40 posted more than 30 days ago");
  });

  it("flags a refresh that stopped running or mostly failed", () => {
    expect(feedVerdict({ ...base, lastRun: { ...base.lastRun!, finishedAt: new Date(Date.now() - 3 * 86400_000) } }).ok).toBe(false);
    expect(feedVerdict({ ...base, lastRun: { ...base.lastRun!, errors: 90 } }).text).toContain("90 of 149");
    expect(feedVerdict({ ...base, lastRun: null }).ok).toBe(false);
  });

  it("counts aged-out roles apart from location screen-outs", async () => {
    const c = await makeCompany(db, { atsToken: "feedcheck" });
    await ingestCompany(db, c, mockFetch({ "boards-api.greenhouse.io": greenhouseBoard([
      { id: 901, title: "Enterprise Account Executive", location: "Remote - US" },
      { id: 902, title: "Strategic Account Executive", location: "New York, NY" },
    ]) }), new Date());
    await db.job.updateMany({ where: { companyId: c.id, title: "Enterprise Account Executive" }, data: { category: "EXCLUDED", excludedReason: "Posted 45 days ago, over the 30-day limit" } });
    const h = await feedHealth(db, 0, 0, jobWhere({}));
    const inThisCo = await db.job.findMany({ where: { companyId: c.id }, select: { category: true, excludedReason: true } });
    expect(inThisCo.every((j) => j.category === "EXCLUDED")).toBe(true);
    expect(h.aged).toBeGreaterThanOrEqual(1);
    expect(h.location).toBeGreaterThanOrEqual(1);
  });

  it("counts a role as posted this week by the employer's date, not the day the app found it", async () => {
    const c = await makeCompany(db, { atsToken: "postedweek" });
    await ingestCompany(db, c, mockFetch({ "boards-api.greenhouse.io": greenhouseBoard([
      { id: 971, title: "Enterprise Account Executive", location: "Remote - US" },
      { id: 972, title: "Strategic Account Executive", location: "Remote - US" },
    ]) }), new Date());
    // Found today, but the employer posted it 11 days ago (like a 10/22 posting found on 11/2).
    const old = await db.job.findFirstOrThrow({ where: { companyId: c.id, title: "Strategic Account Executive" } });
    await db.job.update({ where: { id: old.id }, data: { postedAt: new Date(Date.now() - 11 * 86400_000) } });
    await db.job.updateMany({ where: { companyId: c.id, title: "Enterprise Account Executive" }, data: { postedAt: new Date(Date.now() - 86400_000) } });
    const scoped = (w: object) => ({ AND: [w, { companyId: c.id }] });
    expect(await db.job.count({ where: scoped(jobWhere({})) })).toBe(2);
    expect(await db.job.count({ where: scoped(jobWhere({ posted: "7" })) })).toBe(1);
    const h = await feedHealth(db, 2, 0, scoped(jobWhere({})));
    expect(h.postedThisWeek).toBe(1);
    // A role whose source gives no posted date (a Google Jobs result) is not "posted this week", however recently it was found.
    await db.job.update({ where: { id: old.id }, data: { postedAt: null } });
    expect(await db.job.count({ where: scoped(jobWhere({ posted: "7" })) })).toBe(1);
    expect((await feedHealth(db, 2, 0, scoped(jobWhere({})))).undated).toBe(1);
    expect((await db.job.findMany({ where: scoped(jobWhere({ posted: "none" })) })).map((j) => j.id)).toEqual([old.id]);
    // Instant alerts treat it as old news too.
    const alerts = (await instantAlertJobs(db, 0)).filter((j) => j.companyId === c.id).map((j) => j.title);
    expect(alerts).toEqual(["Enterprise Account Executive"]);
  });

  it("keeps the saved description when a later description call fails", async () => {
    const c = await makeCompany(db, { atsToken: "keepdesc" });
    const board = greenhouseBoard([{ id: 951, title: "Enterprise Account Executive", location: "Remote - US" }]);
    await ingestCompany(db, c, mockFetch({ "boards-api.greenhouse.io": board }), new Date());
    const before = await db.job.findFirstOrThrow({ where: { companyId: c.id } });
    expect(before.descriptionText).toContain("OTE range");
    // The list answers, the detail call errors.
    const flaky = async (url: string) => (/\/jobs\/\d+/.test(url) ? new Response("boom", { status: 500 }) : new Response(JSON.stringify(board), { status: 200 }));
    await ingestCompany(db, c, flaky, new Date());
    const after = await db.job.findFirstOrThrow({ where: { companyId: c.id } });
    expect(after.descriptionText).toContain("OTE range");
    expect(after.oteMax).toBe(before.oteMax);
  });
});

describe("Refresh runs", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("marks a run cut off by a restart as interrupted, and lets only one full refresh run at a time", async () => {
    const { activeRun, runIngestion } = await import("@/lib/ingest/run");
    await db.ingestionRun.updateMany({ where: { status: "running" }, data: { status: "ok", finishedAt: new Date() } });
    const stale = await db.ingestionRun.create({ data: { trigger: "manual", startedAt: new Date(Date.now() - 3 * 3600_000) } });
    expect(await activeRun(db)).toBeNull();
    expect((await db.ingestionRun.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("interrupted");

    const live = await db.ingestionRun.create({ data: { trigger: "hourly" } });
    const r = await runIngestion(db, { trigger: "manual", fetchImpl: async () => new Response("nope", { status: 404 }) });
    expect(r.status).toBe("skipped");
    expect(r.runId).toBe(live.id);
    await db.ingestionRun.update({ where: { id: live.id }, data: { status: "ok", finishedAt: new Date() } });
  });

  it("treats a run that stopped reporting progress, or a refresh started from the old button, as cut off", async () => {
    const { activeRun } = await import("@/lib/ingest/run");
    await db.ingestionRun.updateMany({ where: { status: "running" }, data: { status: "ok", finishedAt: new Date() } });
    const silent = await db.ingestionRun.create({ data: { trigger: "hourly", startedAt: new Date(Date.now() - 45 * 60_000), log: { heartbeat: new Date(Date.now() - 30 * 60_000).toISOString(), done: 40, total: 163 } } });
    const button = await db.ingestionRun.create({ data: { trigger: "manual", startedAt: new Date(Date.now() - 60_000) } });
    const busy = await db.ingestionRun.create({ data: { trigger: "hourly", startedAt: new Date(Date.now() - 50 * 60_000), log: { heartbeat: new Date().toISOString(), done: 90, total: 163 } } });
    const a = await activeRun(db);
    expect(a?.id).toBe(busy.id);
    expect(a?.done).toBe(90);
    for (const id of [silent.id, button.id]) expect((await db.ingestionRun.findUniqueOrThrow({ where: { id } })).status).toBe("interrupted");
    await db.ingestionRun.update({ where: { id: busy.id }, data: { status: "ok", finishedAt: new Date() } });
  });

  it("does not look up a company with no public board again for a few days", async () => {
    const { ingestCompany } = await import("@/lib/ingest/run");
    const c = await makeCompany(db, { atsProvider: "NONE", atsToken: null, atsStatus: "not_found", atsCheckedAt: new Date(Date.now() - 3600_000) });
    const urls: string[] = [];
    const out = await ingestCompany(db, c, async (u: string) => { urls.push(u); return new Response("nope", { status: 404 }); }, new Date());
    expect(out.status).toBe("not_found");
    expect(urls).toEqual([]);
  });
});

describe("Next scheduled refresh", () => {
  it("is the next hour from 6 AM to 9 PM Arizona time, else 6 AM", async () => {
    const { nextScheduledRefresh } = await import("@/lib/ingest/run");
    const az = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit", day: "numeric" });
    expect(az(nextScheduledRefresh(new Date("2026-11-02T18:52:00Z")))).toBe("2, 12:00 PM");
    expect(az(nextScheduledRefresh(new Date("2026-11-03T05:30:00Z")))).toBe("3, 6:00 AM");
    expect(az(nextScheduledRefresh(new Date("2026-11-03T10:30:00Z")))).toBe("3, 6:00 AM");
  });
});

describe("Location words field sales uses", () => {
  it("reads home-based, field-based and virtual as remote, and U.S. regions as U.S.", async () => {
    const { parseLocation } = await import("@/lib/normalize");
    for (const l of ["Home-based - US", "Field-based, US", "Virtual", "Remote - US"]) expect(parseLocation(l).isRemote).toBe(true);
    expect(parseLocation("Field Sales - Southwest Region").isUS).toBe(true);
    expect(parseLocation("Dallas, TX").isRemote).toBe(false);
  });
});
