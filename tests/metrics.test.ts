import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", async () => ({ prisma: (await import("./setup-db")).testDb() }));

import { prisma as db } from "@/lib/db";
import { coreMetrics, metricWhere, METRICS, ofTotal } from "@/lib/metrics";
import { makeCompany } from "./setup-db";

// Nov 28 redesign: one definition per headline number, so "Active" can't mean 9 on one screen and 27 on another.
describe("shared metric definitions", () => {
  it("separates submitted, active applications, interview processes and upcoming interviews", async () => {
    const now = new Date("2026-11-28T18:00:00Z");
    const c = await makeCompany(db, { name: "Metricco" });
    const mk = (stage: string, extra: Record<string, unknown> = {}) => db.application.create({ data: { companyId: c.id, title: `Role ${stage}`, stage: stage as never, applied: stage !== "READY_TO_APPLY", appliedAt: new Date("2026-11-01T18:00:00Z"), ...extra } });
    await mk("APPLIED");
    await mk("RECRUITER_CONTACT");
    const iv = await mk("INTERVIEWING", { interviewAt: new Date("2026-11-30T18:00:00Z") });
    await mk("INTERVIEWING", { interviewAt: new Date("2026-12-20T18:00:00Z") }); // more than 7 days out
    await mk("REJECTED", { interviewAt: new Date("2026-11-29T18:00:00Z") }); // closed: its old interview no longer counts
    const only = (w: object) => ({ AND: [w, { companyId: c.id }] });
    const n = async (w: object) => db.application.count({ where: only(w) });
    expect(await n(metricWhere.submitted())).toBe(5);
    expect(await n(metricWhere.active())).toBe(4);
    expect(await n(metricWhere.interviewProcesses())).toBe(3);
    expect(await n(metricWhere.awaiting())).toBe(1);
    const soon = await db.application.findMany({ where: only(metricWhere.interviewsSoon(now)), select: { id: true } });
    expect(soon.map((a) => a.id)).toEqual([iv.id]);
    const m = await coreMetrics(db, now);
    expect(m.responseRate).toBe(Math.round((m.responded / m.submitted) * 100));
  });

  it("labels each number once and says when a list is cut short", () => {
    const labels = Object.values(METRICS).map((x) => x.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(METRICS.active.label).toBe("Active Applications");
    expect(METRICS.interviewProcesses.label).toBe("Active Interview Processes");
    expect(ofTotal(8, 13)).toBe("8 of 13");
    expect(ofTotal(5, 5)).toBe("5");
  });
});
