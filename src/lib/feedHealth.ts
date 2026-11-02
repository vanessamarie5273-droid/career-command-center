// Feed Check: where every open role went, so a short Discover feed explains itself.
// Each open role is counted once, under the first reason that keeps it out of the feed.
import type { Prisma, PrismaClient } from "@prisma/client";
import { DUPLICATE, IN_DISCOVER, NOT_A_FIT, NOT_APPLIED } from "./queries";
import { MAX_AGE_DAYS } from "./scoring";
import { postedWithin } from "./jobFilters";

const OPEN: Prisma.JobWhereInput = { status: "OPEN" };
const LIVE: Prisma.JobWhereInput = { status: "OPEN", dismissed: false };
const SCREENED: Prisma.JobWhereInput = { ...LIVE, ...IN_DISCOVER, category: "EXCLUDED" };
const AGED: Prisma.JobWhereInput = { excludedReason: { contains: "-day limit" } };
const PLACE: Prisma.JobWhereInput = { OR: ["East Coast", "Eastern time", "West Coast", "Outside the United States"].map((s) => ({ excludedReason: { contains: s } })) };

export type FeedHealth = {
  inFeed: number;
  heldByCap: number;
  aged: number;
  location: number;
  otherScreened: number;
  saved: number;
  applied: number;
  notAFit: number;
  duplicates: number;
  /** Roles in the feed the employer posted in the last 7 days / 24 hours: the same roles the tile's link lists. */
  postedThisWeek: number;
  postedToday: number;
  companies: number;
  feedsOk: number;
  feedsFailed: number;
  noFeed: number;
  /** Refreshes in the last 24 hours that a restart cut off before they finished. */
  cutOff: number;
  lastRun: { status: string; finishedAt: Date | null; startedAt: Date; errors: number; companies: number } | null;
};

/** feed: the where clause of the plain feed, 3-per-company limit included, so "posted this week" counts exactly what its link shows. */
export async function feedHealth(db: PrismaClient, inFeed: number, heldByCap: number, feed: Prisma.JobWhereInput, now = new Date()): Promise<FeedHealth> {
  const [aged, location, screened, saved, applied, notAFit, duplicates, postedThisWeek, postedToday, byStatus, lastRun, cutOff] = await Promise.all([
    db.job.count({ where: { AND: [SCREENED, AGED] } }),
    db.job.count({ where: { AND: [SCREENED, PLACE, { NOT: AGED }] } }),
    db.job.count({ where: SCREENED }),
    db.job.count({ where: { AND: [LIVE, NOT_APPLIED, { applications: { some: {} } }] } }),
    db.job.count({ where: { AND: [LIVE, { applications: { some: { applied: true } } }] } }),
    db.job.count({ where: { AND: [OPEN, NOT_A_FIT] } }),
    db.job.count({ where: { AND: [OPEN, DUPLICATE] } }),
    db.job.count({ where: { AND: [feed, postedWithin(7, now)] } }),
    db.job.count({ where: { AND: [feed, postedWithin(1, now)] } }),
    db.company.groupBy({ by: ["atsStatus"], _count: true }),
    db.ingestionRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" }, select: { status: true, finishedAt: true, startedAt: true, errors: true, companies: true } }),
    db.ingestionRun.count({ where: { status: "interrupted", startedAt: { gte: new Date(now.getTime() - 86400_000) } } }),
  ]);
  const n = (s: string) => byStatus.find((b) => b.atsStatus === s)?._count ?? 0;
  return {
    inFeed, heldByCap, aged, location, otherScreened: screened - aged - location, saved, applied, notAFit, duplicates, postedThisWeek, postedToday,
    companies: byStatus.reduce((a, b) => a + b._count, 0), feedsOk: n("ok"), feedsFailed: n("error"), noFeed: n("not_found") + n("unsupported"), lastRun, cutOff,
  };
}

/** One plain sentence: is the short feed a broken refresh, or a quiet market plus her own filters? */
export function feedVerdict(h: FeedHealth, now = new Date()): { ok: boolean; text: string } {
  const run = h.lastRun;
  if (!run?.finishedAt) return { ok: false, text: "The job feeds have never finished a refresh. Press Refresh Job Feeds." };
  const hours = (now.getTime() - run.finishedAt.getTime()) / 3600_000;
  if (hours > 26) return { ok: false, text: `The job feeds last refreshed ${Math.round(hours / 24)} days ago. The scheduled refresh is not running, so new roles are not coming in.` };
  if (h.cutOff >= 2) return { ok: false, text: `${h.cutOff} refreshes in the last day were cut off before they finished, so some job boards were not read.` };
  if (run.status === "failed" || (run.companies > 0 && run.errors / run.companies >= 0.25)) return { ok: false, text: `${run.errors} of ${run.companies} company job boards failed on the last refresh, so roles from them are missing.` };
  const reasons = [
    [h.aged, `posted more than ${MAX_AGE_DAYS} days ago`], [h.location, "outside your location rules"], [h.heldByCap, "held back by the 3-per-company limit"],
    [h.saved, "saved to Ready to Apply"], [h.applied, "already applied"], [h.notAFit + h.duplicates, "marked Not a Fit or Duplicate"],
  ] as const;
  const top = [...reasons].sort((a, b) => b[0] - a[0])[0];
  const lead = `The feeds are working: the last refresh read ${run.companies - run.errors} of ${run.companies} job boards, and ${h.postedThisWeek} role${h.postedThisWeek === 1 ? "" : "s"} in your feed ${h.postedThisWeek === 1 ? "was" : "were"} posted in the last 7 days.`;
  return { ok: true, text: top[0] > 0 ? `${lead} The biggest group out of your feed: ${top[0]} ${top[1]}.` : lead };
}
