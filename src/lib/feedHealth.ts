// Feed Check: where every open role went, so a short Discover feed explains itself.
// Each open role is counted once, under the first reason that keeps it out of the feed.
import type { Prisma, PrismaClient } from "@prisma/client";
import { DUPLICATE, FEED_CATEGORIES, IN_DISCOVER, NOT_A_FIT, NOT_APPLIED } from "./queries";
import { MAX_AGE_DAYS } from "./scoring";

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
  foundThisWeek: number;
  foundToday: number;
  companies: number;
  feedsOk: number;
  feedsFailed: number;
  noFeed: number;
  lastRun: { status: string; finishedAt: Date | null; startedAt: Date; errors: number; companies: number } | null;
};

export async function feedHealth(db: PrismaClient, inFeed: number, heldByCap: number, now = new Date()): Promise<FeedHealth> {
  const week = new Date(now.getTime() - 7 * 86400_000), day = new Date(now.getTime() - 86400_000);
  const [aged, location, screened, saved, applied, notAFit, duplicates, foundThisWeek, foundToday, byStatus, lastRun] = await Promise.all([
    db.job.count({ where: { AND: [SCREENED, AGED] } }),
    db.job.count({ where: { AND: [SCREENED, PLACE, { NOT: AGED }] } }),
    db.job.count({ where: SCREENED }),
    db.job.count({ where: { AND: [LIVE, NOT_APPLIED, { applications: { some: {} } }] } }),
    db.job.count({ where: { AND: [LIVE, { applications: { some: { applied: true } } }] } }),
    db.job.count({ where: { AND: [OPEN, NOT_A_FIT] } }),
    db.job.count({ where: { AND: [OPEN, DUPLICATE] } }),
    db.job.count({ where: { firstSeenAt: { gte: week }, category: { in: FEED_CATEGORIES } } }),
    db.job.count({ where: { firstSeenAt: { gte: day }, category: { in: FEED_CATEGORIES } } }),
    db.company.groupBy({ by: ["atsStatus"], _count: true }),
    db.ingestionRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" }, select: { status: true, finishedAt: true, startedAt: true, errors: true, companies: true } }),
  ]);
  const n = (s: string) => byStatus.find((b) => b.atsStatus === s)?._count ?? 0;
  return {
    inFeed, heldByCap, aged, location, otherScreened: screened - aged - location, saved, applied, notAFit, duplicates, foundThisWeek, foundToday,
    companies: byStatus.reduce((a, b) => a + b._count, 0), feedsOk: n("ok"), feedsFailed: n("error"), noFeed: n("not_found") + n("unsupported"), lastRun,
  };
}

/** One plain sentence: is the short feed a broken refresh, or a quiet market plus her own filters? */
export function feedVerdict(h: FeedHealth, now = new Date()): { ok: boolean; text: string } {
  const run = h.lastRun;
  if (!run?.finishedAt) return { ok: false, text: "The job feeds have never finished a refresh. Press Refresh Job Feeds." };
  const hours = (now.getTime() - run.finishedAt.getTime()) / 3600_000;
  if (hours > 26) return { ok: false, text: `The job feeds last refreshed ${Math.round(hours / 24)} days ago. The scheduled refresh is not running, so new roles are not coming in.` };
  if (run.status === "failed" || (run.companies > 0 && run.errors / run.companies >= 0.25)) return { ok: false, text: `${run.errors} of ${run.companies} company job boards failed on the last refresh, so roles from them are missing.` };
  const reasons = [
    [h.aged, `posted more than ${MAX_AGE_DAYS} days ago`], [h.location, "outside your location rules"], [h.heldByCap, "held back by the 3-per-company limit"],
    [h.saved, "saved to Ready to Apply"], [h.applied, "already applied"], [h.notAFit + h.duplicates, "marked Not a Fit or Duplicate"],
  ] as const;
  const top = [...reasons].sort((a, b) => b[0] - a[0])[0];
  const lead = `The feeds are working: the last refresh read ${run.companies - run.errors} of ${run.companies} job boards, and ${h.foundThisWeek} new matching role${h.foundThisWeek === 1 ? "" : "s"} came in this week.`;
  return { ok: true, text: top[0] > 0 ? `${lead} The biggest group out of your feed: ${top[0]} ${top[1]}.` : lead };
}
