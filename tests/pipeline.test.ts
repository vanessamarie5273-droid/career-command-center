import { describe, expect, it, vi, beforeAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
// pipelineDashboard reads follow-ups through the app's shared client; point it at the test database.
vi.mock("@/lib/db", async () => ({ prisma: (await import("./setup-db")).testDb() }));

import { applicationSearch, pipelineDashboard } from "@/lib/pipeline";
import { prisma } from "@/lib/db";
import { makeCompany } from "./setup-db";

describe("Command Center dashboard", () => {
  let db: PrismaClient;
  beforeAll(() => { db = prisma; });

  it("searches by company, position, or the day she applied in Arizona time", async () => {
    const c = await makeCompany(db, { name: "Searchco Analytics" });
    const late = await db.application.create({ data: { companyId: c.id, title: "Strategic Account Executive", applied: true, appliedAt: new Date("2026-10-21T05:30:00Z") } }); // Oct 20, 10:30pm Arizona
    const other = await db.application.create({ data: { companyId: c.id, title: "Sales Director", applied: true, appliedAt: new Date("2026-10-21T15:00:00Z") } });
    const ids = async (by: string, q: string) => (await db.application.findMany({ where: { AND: [applicationSearch(by, q)!, { companyId: c.id }] }, select: { id: true } })).map((a) => a.id).sort();
    expect(await ids("company", "searchco")).toEqual([late.id, other.id].sort());
    expect(await ids("position", "strategic account")).toEqual([late.id]);
    expect(await ids("date", "2026-10-20")).toEqual([late.id]);
    expect(await ids("date", "2026-10-21")).toEqual([other.id]);
    expect(applicationSearch("date", "Oct 20")).toBeNull();
    expect(applicationSearch("company", "  ")).toBeNull();
  });

  it("counts only applications, and flags ones that have gone quiet", async () => {
    const now = new Date("2026-10-28T18:00:00Z");
    const c = await makeCompany(db, { name: "Quietco" });
    const stale = await db.application.create({ data: { companyId: c.id, title: "AE", stage: "APPLIED", applied: true, appliedAt: new Date("2026-09-01T18:00:00Z") } });
    await db.$executeRaw`UPDATE "Application" SET "updatedAt" = ${new Date("2026-10-01T18:00:00Z")} WHERE id = ${stale.id}`;
    const moved = await db.application.create({ data: { companyId: c.id, title: "RVP", stage: "INTERVIEWING", applied: true, appliedAt: new Date("2026-10-01T18:00:00Z"), interviewAt: new Date("2026-10-30T18:00:00Z") } });
    const d = await pipelineDashboard(db, now);
    expect(d.quiet.map((a) => a.id)).toContain(stale.id);
    expect(d.quiet.map((a) => a.id)).not.toContain(moved.id);
    expect(d.upcoming.map((a) => a.id)).toContain(moved.id);
    expect(d.tiles.active).toBeGreaterThanOrEqual(1);
    expect(d.tiles.responseRate).toBeGreaterThan(0);
  });
});
