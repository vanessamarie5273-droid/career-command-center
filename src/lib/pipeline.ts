// The Command Center dashboard: her applications only (jobs live in Discover Jobs), plus application search.
import type { Prisma, PrismaClient } from "@prisma/client";
import { ACTIVE_PROCESS, CLOSED_STAGES, followUpWhere } from "./queries";

export { SEARCH_BY, type SearchBy } from "./searchBy";

const PAST_APPLIED = ["RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ACCEPTED"] as const;
const OPEN: Prisma.ApplicationWhereInput = { stage: { notIn: [...CLOSED_STAGES, "ON_HOLD"] } };
export const QUIET_DAYS = 14;

/** Where clause for one search; null when there is nothing valid to search for. Dates are days in Arizona time, like the rest of the app. */
export function applicationSearch(by: string | undefined, q: string | undefined): Prisma.ApplicationWhereInput | null {
  const text = q?.trim();
  if (!text) return null;
  if (by === "date") {
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + 7 * 3600_000); // Arizona is UTC-7 year-round
    return { appliedAt: { gte: start, lt: new Date(start.getTime() + 86400_000) } };
  }
  if (by === "position") return { title: { contains: text, mode: "insensitive" } };
  return { company: { name: { contains: text, mode: "insensitive" } } };
}

export async function pipelineDashboard(db: PrismaClient, now = new Date()) {
  const quietSince = new Date(now.getTime() - QUIET_DAYS * 86400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const [stages, applied, movedOn, active, interviews, offers, followUps, kits, dueTasks, upcoming, quiet, moves] = await Promise.all([
    db.application.groupBy({ by: ["stage"], _count: true }),
    db.application.count({ where: { applied: true } }),
    db.application.count({ where: { applied: true, OR: [{ stage: { in: [...PAST_APPLIED] } }, { stageHistory: { some: { to: { in: [...PAST_APPLIED] } } } }] } }),
    db.application.count({ where: { stage: { in: [...ACTIVE_PROCESS] } } }),
    db.application.count({ where: { interviewAt: { gte: now } } }),
    db.application.count({ where: { OR: [{ stage: { in: ["OFFER", "ACCEPTED"] } }, { stageHistory: { some: { to: "OFFER" } } }] } }),
    db.application.findMany({ where: followUpWhere(now), include: { company: { select: { name: true } } }, orderBy: { nextActionDue: "asc" }, take: 8 }),
    db.kit.findMany({ where: { job: { applications: { none: { applied: true } } } }, distinct: ["jobId"], select: { jobId: true } }),
    db.task.findMany({ where: { done: false, dueAt: { lte: new Date(now.getTime() + 86400_000) } }, include: { application: { include: { company: { select: { name: true } } } } }, orderBy: { dueAt: "asc" }, take: 8 }),
    db.application.findMany({ where: { interviewAt: { gte: now } }, include: { company: { select: { name: true } } }, orderBy: { interviewAt: "asc" }, take: 6 }),
    db.application.findMany({ where: { AND: [OPEN, { applied: true }, { updatedAt: { lt: quietSince } }] }, include: { company: { select: { name: true } } }, orderBy: { updatedAt: "asc" }, take: 6 }),
    db.stageChange.findMany({ where: { at: { gte: weekAgo } }, include: { application: { include: { company: { select: { name: true } } } } }, orderBy: { at: "desc" }, take: 8 }),
  ]);
  const weeks: { week: string; applied: number; moves: number }[] = [];
  const start = new Date(now.getTime() - 11 * 7 * 86400_000);
  const [appliedRows, moveRows] = await Promise.all([
    db.application.findMany({ where: { appliedAt: { gte: start } }, select: { appliedAt: true } }),
    db.stageChange.findMany({ where: { at: { gte: start } }, select: { at: true } }),
  ]);
  for (let i = 0; i < 12; i++) {
    const ws = new Date(start.getTime() + i * 7 * 86400_000), we = new Date(ws.getTime() + 7 * 86400_000);
    weeks.push({ week: ws.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Phoenix" }), applied: appliedRows.filter((a) => a.appliedAt! >= ws && a.appliedAt! < we).length, moves: moveRows.filter((m) => m.at >= ws && m.at < we).length });
  }
  return {
    stages: stages.map((s) => ({ stage: s.stage, count: s._count })),
    tiles: { active, applied, responseRate: applied ? Math.round((movedOn / applied) * 100) : null, interviews, offers, followUps: await db.application.count({ where: followUpWhere(now) }), readyToApply: kits.length },
    followUps, dueTasks, upcoming, quiet, moves, weeks,
  };
}
