// Recommend at most PER_COMPANY roles per employer. Applying to many roles at one company reads poorly to recruiters,
// so roles already applied to use up slots, and the same title in several cities counts once.
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeTitle } from "./dedupe";

export const PER_COMPANY = 3;
const MATCHING: Prisma.JobWhereInput = { status: "OPEN", dismissed: false, category: { in: ["MAIN", "STRETCH"] } };

type Row = { id: string; companyId: string; title: string; score: number | null; overrideScore: number | null; firstSeenAt: Date };

/** Pure selection, exported for tests. Returns the job ids that stay in feeds and how many roles were held back. */
export function selectWithinCap(rows: Row[], appliedByCompany: Map<string, number>, appliedJobIds: Set<string>, cap = PER_COMPANY) {
  const byCompany = new Map<string, Map<string, { best: number; seen: number; ids: string[] }>>();
  for (const r of rows) {
    if (appliedJobIds.has(r.id)) continue;
    const titles = byCompany.get(r.companyId) ?? new Map();
    byCompany.set(r.companyId, titles);
    const key = normalizeTitle(r.title);
    const g = titles.get(key) ?? { best: -1, seen: 0, ids: [] };
    g.ids.push(r.id);
    g.best = Math.max(g.best, r.overrideScore ?? r.score ?? 0);
    g.seen = Math.max(g.seen, r.firstSeenAt.getTime());
    titles.set(key, g);
  }
  const keep = new Set<string>(rows.filter((r) => appliedJobIds.has(r.id)).map((r) => r.id));
  let hidden = 0;
  for (const [companyId, titles] of byCompany) {
    const slots = Math.max(0, cap - (appliedByCompany.get(companyId) ?? 0));
    const ranked = [...titles.values()].sort((a, b) => b.best - a.best || b.seen - a.seen);
    ranked.slice(0, slots).forEach((g) => g.ids.forEach((id) => keep.add(id)));
    hidden += Math.max(0, ranked.length - slots);
  }
  return { ids: [...keep], hidden };
}

export async function companyCap(db: PrismaClient) {
  const [rows, apps] = await Promise.all([
    db.job.findMany({ where: MATCHING, select: { id: true, companyId: true, title: true, score: true, overrideScore: true, firstSeenAt: true } }),
    db.application.findMany({ where: { applied: true, stage: { not: "WITHDRAWN" } }, select: { companyId: true, jobId: true } }),
  ]);
  const appliedByCompany = new Map<string, number>();
  for (const a of apps) appliedByCompany.set(a.companyId, (appliedByCompany.get(a.companyId) ?? 0) + 1);
  return selectWithinCap(rows, appliedByCompany, new Set(apps.map((a) => a.jobId).filter((x): x is string => !!x)));
}

export const withinCap = (ids: string[]): Prisma.JobWhereInput => ({ id: { in: ids } });
