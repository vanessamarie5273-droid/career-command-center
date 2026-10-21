// Shapes a job for the feed table, shared by Discover Jobs and the Command Center feed.
import type { Prisma } from "@prisma/client";
import { effectiveScore, effectiveTier } from "./scoring";

export const JOB_ROW_INCLUDE = { company: { select: { id: true, name: true, logoUrl: true, category: true } }, applications: { select: { id: true, stage: true, applied: true } }, sources: { select: { provider: true } } } satisfies Prisma.JobInclude;
type J = Prisma.JobGetPayload<{ include: typeof JOB_ROW_INCLUDE }>;

export const toRow = (j: J) => ({
    id: j.id, title: j.title, company: j.company, location: j.location, arrangement: j.workArrangement, postedAt: j.postedAt?.toISOString() ?? null, firstSeenAt: j.firstSeenAt.toISOString(),
    lastVerifiedAt: j.lastVerifiedAt.toISOString(), applyUrl: j.applyUrl, score: effectiveScore(j), aiScore: j.score, tier: effectiveTier(j), overridden: !!(j.overrideTier || j.overrideScore), confidence: j.confidence,
    salaryMin: j.salaryMin, salaryMax: j.salaryMax, oteMin: j.oteMin, oteMax: j.oteMax, category: j.category, status: j.status, favorite: j.favorite,
    family: j.roleFamily, sources: [...new Set(j.sources.map((s) => s.provider))], application: j.applications[0] ?? null, excludedReason: j.excludedReason,
});
