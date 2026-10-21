import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/** One feed: stretch and relocation roles sit alongside the rest and carry a label instead of a separate list. */
export const FEED_CATEGORIES = ["MAIN", "STRETCH", "RELOCATION"];
/** Roles with an application marked applied leave the feed and live under My Applications. */
export const NOT_APPLIED: Prisma.JobWhereInput = { applications: { none: { applied: true } } };
export const MATCHING: Prisma.JobWhereInput = { status: "OPEN", dismissed: false, category: { in: FEED_CATEGORIES }, ...NOT_APPLIED };
/** Roles the user removed from feeds, split by why. A null reason predates the split and means "Not a fit". */
export const NOT_A_FIT: Prisma.JobWhereInput = { dismissed: true, OR: [{ dismissReason: null }, { dismissReason: { not: "duplicate" } }] };
export const DUPLICATE: Prisma.JobWhereInput = { dismissed: true, dismissReason: "duplicate" };
export const tierWhere = (t: "TIER1" | "TIER2" | "TIER3"): Prisma.JobWhereInput => ({ OR: [{ overrideTier: t }, { overrideTier: null, tier: t }] });
export const ACTIVE_PROCESS = ["RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW"] as const;
export const CLOSED_STAGES = ["ACCEPTED", "REJECTED", "WITHDRAWN"] as const;

export function startOfTodayPhoenix(now = new Date()) {
  // Arizona does not observe DST: UTC-7 year-round.
  const az = new Date(now.getTime() - 7 * 3600_000);
  return new Date(Date.UTC(az.getUTCFullYear(), az.getUTCMonth(), az.getUTCDate()) + 7 * 3600_000);
}

export function followUpWhere(now = new Date()): Prisma.ApplicationWhereInput {
  return {
    stage: { notIn: [...CLOSED_STAGES, "ON_HOLD"] },
    OR: [
      { nextActionDue: { lte: now } },
      { nextActionDue: null, applied: true, stage: "APPLIED", appliedAt: { lte: new Date(now.getTime() - 7 * 86400_000) } },
    ],
  };
}

/** capIds: the roles inside the 3-per-company limit; counts of matching roles use them so tiles match the feed. */
export async function dashboardMetrics(now = new Date(), capIds?: string[]) {
  const FEED: Prisma.JobWhereInput = capIds ? { AND: [MATCHING, { id: { in: capIds } }] } : MATCHING;
  const today = startOfTodayPhoenix(now);
  const [companies, matching, newToday, tier1, applied, interviewsScheduled, activeProcesses, offers, resumes, followUps, companiesWithMatches, recentlyClosed, tasksToday, relocation, stretch] = await Promise.all([
    prisma.company.count(),
    prisma.job.count({ where: FEED }),
    prisma.job.count({ where: { AND: [FEED, { firstSeenAt: { gte: today } }] } }),
    prisma.job.count({ where: { AND: [FEED, tierWhere("TIER1")] } }),
    prisma.application.count({ where: { applied: true } }),
    prisma.application.count({ where: { interviewAt: { gte: now } } }),
    prisma.application.count({ where: { stage: { in: [...ACTIVE_PROCESS] } } }),
    prisma.application.count({ where: { OR: [{ stage: { in: ["OFFER", "ACCEPTED"] } }, { stageHistory: { some: { to: "OFFER" } } }] } }),
    prisma.document.findMany({ where: { kind: "resume" }, distinct: ["sha256"], select: { id: true } }).then((r) => r.length),
    prisma.application.count({ where: followUpWhere(now) }),
    prisma.company.count({ where: { jobs: { some: MATCHING } } }),
    prisma.job.count({ where: { status: "CLOSED", closedAt: { gte: new Date(now.getTime() - 7 * 86400_000) } } }),
    prisma.task.count({ where: { done: false, dueAt: { lte: new Date(today.getTime() + 86400_000) } } }),
    prisma.job.count({ where: { status: "OPEN", dismissed: false, category: "RELOCATION" } }),
    prisma.job.count({ where: { status: "OPEN", dismissed: false, category: "STRETCH" } }),
  ]);
  const [notAFit, duplicates] = await Promise.all([prisma.job.count({ where: NOT_A_FIT }), prisma.job.count({ where: DUPLICATE })]);
  const tier1Unapplied = await prisma.job.count({ where: { AND: [FEED, tierWhere("TIER1")] } });
  return {
    companies, matching, newToday, tier1, applied, interviewsScheduled, activeProcesses, offers, resumes, followUps,
    companiesWithoutSuitable: companies - companiesWithMatches, recentlyClosed, relocation, stretch, notAFit, duplicates,
    priorityActions: tasksToday + followUps + Math.min(tier1Unapplied, 5),
  };
}

export async function chartData(now = new Date()) {
  const apps = await prisma.application.groupBy({ by: ["stage"], _count: true });
  const jobs = await prisma.job.findMany({ where: MATCHING, select: { companyId: true, oteMax: true, oteMin: true, salaryMax: true, salaryMin: true, tier: true, overrideTier: true, company: { select: { category: true } } } });
  const companies = await prisma.company.groupBy({ by: ["category"], _count: true });
  const weeks: { week: string; applied: number; moves: number }[] = [];
  const start = new Date(now.getTime() - 11 * 7 * 86400_000);
  const appliedRows = await prisma.application.findMany({ where: { appliedAt: { gte: start } }, select: { appliedAt: true } });
  const moves = await prisma.stageChange.findMany({ where: { at: { gte: start } }, select: { at: true } });
  for (let i = 0; i < 12; i++) {
    const ws = new Date(start.getTime() + i * 7 * 86400_000), we = new Date(ws.getTime() + 7 * 86400_000);
    weeks.push({ week: ws.toLocaleDateString("en-US", { month: "short", day: "numeric" }), applied: appliedRows.filter((a) => a.appliedAt! >= ws && a.appliedAt! < we).length, moves: moves.filter((m) => m.at >= ws && m.at < we).length });
  }
  const matchByCat = new Map<string, number>();
  for (const j of jobs) matchByCat.set(j.company.category, (matchByCat.get(j.company.category) ?? 0) + 1);
  const buckets = [[0, 150000, "<$150K"], [150000, 200000, "$150–200K"], [200000, 250000, "$200–250K"], [250000, 300000, "$250–300K"], [300000, 400000, "$300–400K"], [400000, 1e9, "$400K+"]] as const;
  const comp = buckets.map(([lo, hi, label]) => ({
    label,
    ote: jobs.filter((j) => { const v = j.oteMax ?? j.oteMin; return v != null && v >= lo && v < hi; }).length,
    base: jobs.filter((j) => { const v = j.oteMax ?? j.oteMin ? null : j.salaryMax ?? j.salaryMin; return v != null && v >= lo && v < hi; }).length,
  }));
  const tiers = { TIER1: 0, TIER2: 0, TIER3: 0 } as Record<string, number>;
  for (const j of jobs) tiers[(j.overrideTier ?? j.tier) || "TIER3"]++;
  return {
    stages: apps.map((a) => ({ stage: a.stage, count: a._count })),
    industries: companies.map((c) => ({ category: c.category, companies: c._count, matches: matchByCat.get(c.category) ?? 0 })).sort((a, b) => b.matches - a.matches || b.companies - a.companies),
    comp, weeks,
    pipeline: [{ name: "Tier 1", value: tiers.TIER1 }, { name: "Tier 2", value: tiers.TIER2 }, { name: "Tier 3", value: tiers.TIER3 }],
    compKnown: jobs.filter((j) => j.oteMax ?? j.oteMin ?? j.salaryMax ?? j.salaryMin).length,
    compTotal: jobs.length,
  };
}
