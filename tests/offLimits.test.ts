import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { offLimitsReason, removeOffLimitsCompanies } from "@/lib/offLimits";
import { SEED_COMPANIES } from "@/data/companies";
import { testDb, makeCompany } from "./setup-db";

describe("food and restaurant companies are off limits", () => {
  it.each(["Toast", "Toast, Inc.", "DoorDash", "Grubhub", "Instacart", "Olo Inc", "Sysco Corporation", "Domino's Pizza", "Chipotle Mexican Grill", "Starbucks Coffee Company", "Kraft Heinz Foods"])("%s", (name) => {
    expect(offLimitsReason({ name })).toBeDefined();
  });
  it("catches a researched company whose profile is about restaurants", () => {
    expect(offLimitsReason({ name: "Acme Systems", description: "Point of sale and payments for restaurant groups." })).toBeDefined();
  });
  it.each(["Salesforce", "Palantir", "Uber", "ServiceNow", "Oracle", "Snowflake", "Samsara"])("keeps %s", (name) => {
    expect(offLimitsReason({ name })).toBeUndefined();
  });
  it("no seeded company is a food or restaurant company", () => {
    expect(SEED_COMPANIES.filter((c) => offLimitsReason(c)).map((c) => c.name)).toEqual([]);
  });
});

describe("removing stored off-limits companies", () => {
  let db: PrismaClient;
  beforeAll(() => { db = testDb(); });
  afterAll(async () => { await db.$disconnect(); });
  it("deletes Toast and DoorDash with their jobs, keeps one she applied to and every other company", async () => {
    const toast = await makeCompany(db, { name: "Toast" });
    await db.job.create({ data: { companyId: toast.id, fingerprint: `t-${toast.id}`, title: "Enterprise Account Executive", applyUrl: "https://example.com/t" } });
    const dd = await makeCompany(db, { name: "DoorDash", addedBy: "job-site" });
    const applied = await makeCompany(db, { name: "Grubhub" });
    await db.application.create({ data: { companyId: applied.id, title: "Strategic AE" } });
    const keep = await makeCompany(db, { name: "Palantir" });

    const r = await removeOffLimitsCompanies(db);
    expect(r.removed.sort()).toEqual(expect.arrayContaining(["DoorDash", "Toast"]));
    expect(r.kept).toContain("Grubhub");
    expect(await db.company.findUnique({ where: { id: toast.id } })).toBeNull();
    expect(await db.company.findUnique({ where: { id: dd.id } })).toBeNull();
    expect(await db.job.count({ where: { companyId: toast.id } })).toBe(0);
    expect(await db.company.findUnique({ where: { id: applied.id } })).not.toBeNull();
    expect(await db.company.findUnique({ where: { id: keep.id } })).not.toBeNull();
  });
});
