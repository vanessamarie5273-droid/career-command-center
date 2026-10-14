import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ingestCompany } from "@/lib/ingest/run";
import { jobWhere } from "@/lib/jobFilters";
import { MATCHING } from "@/lib/queries";
import { greenhouseBoard, mockFetch } from "./fixtures/boards";
import { testDb, makeCompany } from "./setup-db";

describe("Not a fit", () => {
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
});
