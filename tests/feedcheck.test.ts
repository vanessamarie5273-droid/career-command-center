import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ingestCompany } from "@/lib/ingest/run";
import { feedHealth, feedVerdict, type FeedHealth } from "@/lib/feedHealth";
import { greenhouseBoard, mockFetch } from "./fixtures/boards";
import { testDb, makeCompany } from "./setup-db";

const base: FeedHealth = { inFeed: 1, heldByCap: 2, aged: 40, location: 12, otherScreened: 0, saved: 5, applied: 9, notAFit: 3, duplicates: 0, foundThisWeek: 6, foundToday: 1, companies: 149, feedsOk: 60, feedsFailed: 2, noFeed: 87, lastRun: { status: "partial", finishedAt: new Date(), startedAt: new Date(), errors: 2, companies: 149 } };

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
    const h = await feedHealth(db, 0, 0);
    const inThisCo = await db.job.findMany({ where: { companyId: c.id }, select: { category: true, excludedReason: true } });
    expect(inThisCo.every((j) => j.category === "EXCLUDED")).toBe(true);
    expect(h.aged).toBeGreaterThanOrEqual(1);
    expect(h.location).toBeGreaterThanOrEqual(1);
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
