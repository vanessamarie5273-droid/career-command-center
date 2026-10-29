import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ensureApplication } from "@/lib/applications";
import { markApplied } from "@/lib/apply";
import { jobWhere } from "@/lib/jobFilters";
import { READY_TO_APPLY } from "@/lib/queries";
import { testDb, makeCompany } from "./setup-db";

describe("Discover Jobs → Ready to Apply → My Applications", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(() => db.$disconnect());

  it("moves a saved role out of Discover Jobs onto Ready to Apply, then off it once applied", async () => {
    const c = await makeCompany(db, { name: "Flowco" });
    const job = await db.job.create({ data: { companyId: c.id, fingerprint: `flow-${Math.random()}`, title: "Sales Development Director", applyUrl: "https://example.com/j", category: "MAIN" } });
    const inDiscover = async () => (await db.job.count({ where: { AND: [jobWhere({}), { id: job.id }] } })) === 1;
    const onReady = async () => (await db.application.count({ where: { AND: [READY_TO_APPLY, { jobId: job.id }] } })) === 1;

    expect(await inDiscover()).toBe(true);
    expect(await onReady()).toBe(false);

    await ensureApplication(db, job.id, null);
    expect(await inDiscover()).toBe(false);
    expect(await onReady()).toBe(true);

    await markApplied(db, job.id, null, null);
    expect(await inDiscover()).toBe(false);
    expect(await onReady()).toBe(false);
  });
});
