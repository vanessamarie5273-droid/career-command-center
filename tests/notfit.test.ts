import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ingestCompany } from "@/lib/ingest/run";
import { jobWhere } from "@/lib/jobFilters";
import { MATCHING, NOT_A_FIT, DUPLICATE } from "@/lib/queries";
import { greenhouseBoard, mockFetch } from "./fixtures/boards";
import { testDb, makeCompany } from "./setup-db";

describe("Not a fit and Duplicate", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("removes a role from feeds, lists it under Not a fit, and survives later refreshes", async () => {
    const c = await makeCompany(db, { atsToken: "notfit" });
    const f = mockFetch({ "boards-api.greenhouse.io": greenhouseBoard([{ id: 301, title: "Enterprise Account Executive", location: "Remote - US" }]) });
    await ingestCompany(db, c, f, new Date());
    const job = await db.job.findFirstOrThrow({ where: { companyId: c.id } });
    const scoped = (w: object) => ({ AND: [w, { companyId: c.id }] });
    expect(await db.job.count({ where: scoped(MATCHING) })).toBe(1);

    await db.job.update({ where: { id: job.id }, data: { dismissed: true, dismissedAt: new Date() } });
    expect(await db.job.count({ where: scoped(MATCHING) })).toBe(0);
    expect(await db.job.count({ where: scoped(jobWhere({})) })).toBe(0);
    expect(await db.job.count({ where: scoped(jobWhere({ category: "DISMISSED" })) })).toBe(1);

    // The next daily refresh sees the same posting again and must not bring it back.
    await ingestCompany(db, c, f, new Date());
    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.dismissed).toBe(true);
    expect(after.status).toBe("OPEN");
    expect(await db.job.count({ where: scoped(MATCHING) })).toBe(0);
  });

  it("tracks Duplicate separately from Not a fit and keeps the other copy in the feed", async () => {
    const c = await makeCompany(db, { atsToken: "dupes" });
    const f = mockFetch({ "boards-api.greenhouse.io": greenhouseBoard([
      { id: 401, title: "Enterprise Account Executive", location: "Phoenix, AZ" },
      { id: 402, title: "Enterprise Account Executive", location: "Denver, CO" },
    ]) });
    await ingestCompany(db, c, f, new Date());
    const [a, b] = await db.job.findMany({ where: { companyId: c.id }, orderBy: { location: "asc" } });
    const scoped = (w: object) => ({ AND: [w, { companyId: c.id }] });
    await db.job.update({ where: { id: b.id }, data: { dismissed: true, dismissedAt: new Date(), dismissReason: "duplicate" } });

    expect(await db.job.count({ where: scoped(MATCHING) })).toBe(1);
    expect(await db.job.count({ where: scoped(DUPLICATE) })).toBe(1);
    expect(await db.job.count({ where: scoped(NOT_A_FIT) })).toBe(0);
    expect(await db.job.count({ where: scoped(jobWhere({ category: "DUPLICATE" })) })).toBe(1);
    expect(await db.job.count({ where: scoped(jobWhere({ category: "DISMISSED" })) })).toBe(0);
    expect((await db.job.findFirstOrThrow({ where: scoped(MATCHING) })).id).toBe(a.id);

    await ingestCompany(db, c, f, new Date());
    expect((await db.job.findUniqueOrThrow({ where: { id: b.id } })).dismissReason).toBe("duplicate");
  });

  it("counts marks made before the Duplicate option existed as Not a fit", async () => {
    const c = await makeCompany(db, { atsToken: "legacy" });
    await ingestCompany(db, c, mockFetch({ "boards-api.greenhouse.io": greenhouseBoard([{ id: 501, title: "Account Director", location: "Remote - US" }]) }), new Date());
    await db.job.updateMany({ where: { companyId: c.id }, data: { dismissed: true } });
    expect(await db.job.count({ where: { AND: [NOT_A_FIT, { companyId: c.id }] } })).toBe(1);
  });
});
