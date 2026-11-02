import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ingestCompany } from "@/lib/ingest/run";
import { capApplies, jobWhere } from "@/lib/jobFilters";
import { greenhouseBoard, mockFetch } from "./fixtures/boards";
import { testDb, makeCompany } from "./setup-db";

describe("Business and sales development leadership roles", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("stores Leader, Director and Manager titles under the right role type", async () => {
    const c = await makeCompany(db, { atsToken: "bdleaders" });
    await ingestCompany(db, c, mockFetch({ "boards-api.greenhouse.io": greenhouseBoard([
      { id: 701, title: "Business Development Leader", location: "Remote - US" },
      { id: 702, title: "Sales Development Leader", location: "Remote - US" },
      { id: 703, title: "Director, Business Development", location: "Remote - US" },
      { id: 704, title: "Sales Development Manager", location: "Remote - US" },
    ]) }), new Date());
    const scoped = (w: object) => ({ AND: [w, { companyId: c.id }] });
    expect(await db.job.count({ where: scoped(jobWhere({ family: "BD_LEADER" })) })).toBe(2);
    expect(await db.job.count({ where: scoped(jobWhere({ family: "SDR_LEADER" })) })).toBe(2);
    // Word order does not matter in search, and "Leader" finds "Lead" titles too.
    expect((await db.job.findMany({ where: scoped(jobWhere({ q: "Business Development Director" })) })).map((j) => j.title)).toEqual(["Director, Business Development"]);
    expect(await db.job.count({ where: scoped(jobWhere({ q: "sales development leader" })) })).toBe(1);
  });

  it("shows every match when searching or filtering by role type, not just 3 per company", () => {
    expect(capApplies({})).toBe(true);
    expect(capApplies({ q: "Business Development" })).toBe(false);
    expect(capApplies({ family: "SDR_LEADER" })).toBe(false);
    expect(capApplies({ q: "  " })).toBe(true);
  });
});
