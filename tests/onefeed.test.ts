import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ingestCompany } from "@/lib/ingest/run";
import { ensureApplication } from "@/lib/applications";
import { jobWhere } from "@/lib/jobFilters";
import { MATCHING } from "@/lib/queries";
import { greenhouseBoard, mockFetch } from "./fixtures/boards";
import { testDb, makeCompany } from "./setup-db";

describe("One feed", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("keeps relocation roles in the main feed, labelled by category", async () => {
    const c = await makeCompany(db, { atsToken: "onefeed" });
    await ingestCompany(db, c, mockFetch({ "boards-api.greenhouse.io": greenhouseBoard([
      { id: 501, title: "Enterprise Account Executive", location: "Remote - US" },
      { id: 502, title: "Strategic Account Executive", location: "Seattle, WA" },
    ]) }), new Date());
    const jobs = await db.job.findMany({ where: { AND: [jobWhere({}), { companyId: c.id }] } });
    expect(jobs.map((j) => j.category).sort()).toEqual(["MAIN", "RELOCATION"]);
  });

  it("moves a role marked applied out of the feed and into Applied", async () => {
    const c = await makeCompany(db, { atsToken: "applied" });
    await ingestCompany(db, c, mockFetch({ "boards-api.greenhouse.io": greenhouseBoard([{ id: 601, title: "Enterprise Account Executive", location: "Remote - US" }]) }), new Date());
    const job = await db.job.findFirstOrThrow({ where: { companyId: c.id } });
    const scoped = (w: object) => ({ AND: [w, { companyId: c.id }] });
    expect(await db.job.count({ where: scoped(jobWhere({})) })).toBe(1);

    const { app } = await ensureApplication(db, job.id, null, "APPLIED");
    expect(app.stage).toBe("APPLIED");
    expect(app.applied).toBe(true);
    expect(app.appliedAt).not.toBeNull();
    expect(await db.job.count({ where: scoped(jobWhere({})) })).toBe(0);
    expect(await db.job.count({ where: scoped(MATCHING) })).toBe(0);
  });
});
