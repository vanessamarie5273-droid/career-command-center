import { describe, expect, it, vi, beforeAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
// pipelineDashboard reads follow-ups through the app's shared client; point it at the test database.
vi.mock("@/lib/db", async () => ({ prisma: (await import("./setup-db")).testDb() }));

import { agenda, applicationSearch, feed, pipelineDashboard } from "@/lib/pipeline";
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

describe("Command Center lists", () => {
  const co = { name: "Acme", logoUrl: null };
  it("puts dated to-dos in overdue / today / this week and folds no-reply follow-ups into one nudge", () => {
    const now = new Date("2026-11-01T20:00:00Z"); // 1pm Arizona
    const r = agenda({
      followUps: [
        { id: "a", title: "AE", nextAction: "Reply to no-reply@us.greenhouse-mail.io with your availability", nextActionDue: new Date("2026-11-01T15:00:00Z"), appliedAt: null, company: co },
        { id: "b", title: "AE", nextAction: null, nextActionDue: null, appliedAt: new Date("2026-10-14T18:00:00Z"), company: co },
      ],
      dueTasks: [{ id: "t", title: "Send the POV", dueAt: new Date("2026-10-31T15:00:00Z"), application: { id: "a", title: "AE", company: co } }],
      upcoming: [{ id: "i", title: "AE", interviewAt: new Date("2026-11-05T20:00:00Z"), company: co }],
    }, now);
    expect(r.items.map((x) => [x.kind, x.bucket])).toEqual([["task", "overdue"], ["followup", "today"], ["interview", "soon"]]);
    expect(r.items[1].text).toBe("Reply to the recruiter with your availability");
    expect(r.nudges.map((n) => n.id)).toEqual(["b"]);
    expect(r.items.map((x) => x.done)).toEqual([{ kind: "task", id: "t" }, { kind: "followup", id: "a" }, null]);
  });

  it("shows a to-do once when a task and the next action say the same thing", () => {
    const now = new Date("2026-11-01T20:00:00Z");
    const due = new Date("2026-11-01T18:00:00Z");
    const title = "Follow up on your Vanta application with the recruiter";
    const r = agenda({
      followUps: [{ id: "v", title: "Senior AE", nextAction: title, nextActionDue: due, appliedAt: null, company: co }],
      dueTasks: [{ id: "t1", title, dueAt: due, application: { id: "v", title: "Senior AE", company: co } }, { id: "t2", title: `${title}.`, dueAt: due, application: { id: "v", title: "Senior AE", company: co } }],
      upcoming: [],
    }, now);
    expect(r.items.map((x) => x.id)).toEqual(["t-t1"]);
  });

  it("shows an email-driven stage move once, with its Undo, and tucks away emails that changed nothing", () => {
    const app = { id: "a", title: "AE", company: co };
    const e = (id: string, newStage: string | null, h: number) => ({ id, applicationId: "a", kind: newStage ? "interview" : "confirmation", fromName: null, fromEmail: "x@y.com", subject: "Hi", receivedAt: new Date(Date.UTC(2026, 10, 1, h)), prevStage: newStage ? "APPLIED" : null, newStage, undone: false });
    const moves = [
      { id: "m1", applicationId: "a", from: "APPLIED", to: "INTERVIEWING", at: new Date("2026-11-01T10:05:00Z"), application: app },
      { id: "m2", applicationId: "a", from: "INTERVIEWING", to: "FINAL_INTERVIEW", at: new Date("2026-11-01T12:00:00Z"), application: app },
    ];
    const r = feed([e("e1", "INTERVIEWING", 10), e("e2", null, 9)], moves, [app], { interview: "Interview request", confirmation: "Application received" });
    // One row for the application: its latest status, where it started, and everything folded in.
    expect(r.items.map((x) => [x.to, x.start, x.undoable, x.updates])).toEqual([["FINAL_INTERVIEW", "APPLIED", false, 3]]);
    expect(r.logged).toEqual([]);
  });

  it("shows one status per application: the latest change, with its Undo, and the stage it started from", () => {
    const wd = { id: "wd", title: "Account Executive, Platform", company: { name: "Workday", logoUrl: null } };
    const or = { id: "or", title: "Data Platform Sales Rep", company: { name: "Oracle", logoUrl: null } };
    const ev = (id: string, applicationId: string, kind: string, prevStage: string | null, newStage: string | null, at: string) => ({ id, applicationId, kind, fromName: null, fromEmail: "x@y.com", subject: id, receivedAt: new Date(at), prevStage, newStage, undone: false });
    const emails = [
      ev("wd2", "wd", "interview", "RECRUITER_CONTACT", "INTERVIEWING", "2026-11-03T23:10:00Z"),
      ev("or1", "or", "confirmation", "READY_TO_APPLY", "APPLIED", "2026-11-03T23:05:00Z"),
      ev("wd1", "wd", "interview", "APPLIED", "RECRUITER_CONTACT", "2026-11-03T23:00:00Z"),
      ev("wd0", "wd", "reply", null, null, "2026-11-03T20:00:00Z"),
      ev("ot1", "ot", "reply", null, null, "2026-11-03T19:00:00Z"),
      ev("ot2", "ot", "reply", null, null, "2026-11-03T18:00:00Z"),
    ];
    const moves = [
      { id: "m1", applicationId: "wd", from: "RECRUITER_CONTACT", to: "INTERVIEWING", at: new Date("2026-11-03T23:11:00Z"), application: wd },
      { id: "m2", applicationId: "or", from: "READY_TO_APPLY", to: "APPLIED", at: new Date("2026-11-03T23:06:00Z"), application: or },
      { id: "m3", applicationId: "wd", from: "APPLIED", to: "RECRUITER_CONTACT", at: new Date("2026-11-03T23:01:00Z"), application: wd },
      { id: "m4", applicationId: "or", from: null, to: "READY_TO_APPLY", at: new Date("2026-11-03T22:00:00Z"), application: or },
    ];
    const r = feed(emails, moves, [wd, or, { id: "ot", title: "AE", company: co }], { interview: "Interview request", confirmation: "Application received", reply: "Recruiter reply" });
    expect(r.items.map((x) => [x.company?.name, x.to, x.start, x.emailId, x.undoable, x.updates])).toEqual([
      ["Workday", "INTERVIEWING", "APPLIED", "wd2", true, 3],
      ["Oracle", "APPLIED", null, "or1", true, 2],
    ]);
    // Emails on an application that didn't move show once, as the latest of them.
    expect(r.logged.map((x) => [x.id, x.more])).toEqual([["ot1", 1]]);

    // Undo on Workday puts it back to Recruiter Contact, and that earlier email's Undo comes back.
    const undone = emails.map((e) => (e.id === "wd2" ? { ...e, undone: true } : e));
    const back = [{ id: "m5", applicationId: "wd", from: "INTERVIEWING", to: "RECRUITER_CONTACT", at: new Date("2026-11-04T04:00:00Z"), application: wd }, ...moves];
    const u = feed(undone, back, [wd, or], { interview: "Interview request", confirmation: "Application received", reply: "Recruiter reply" });
    expect(u.items.map((x) => [x.company?.name, x.to, x.start, x.emailId, x.undoable])).toEqual([
      ["Oracle", "APPLIED", null, "or1", true],
      ["Workday", "RECRUITER_CONTACT", "APPLIED", "wd1", true],
    ]);
  });
});
