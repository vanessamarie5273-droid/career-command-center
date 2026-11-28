// One req, one entry (her rule, Nov 4; "a TON of duplicates", Nov 28). findSameReq() stops a refresh from saving a second
// copy of an opening it already has; mergeDuplicateJobs() folds copies saved before that into one job, keeping every
// source link, application, kit, note and her own marks. It runs on deploy and after every refresh.
import type { Job, Prisma, PrismaClient } from "@prisma/client";
import { jobFingerprint, sameReq, titleKey, type ReqView } from "./dedupe";

/** Closed copies this recent still count: a role that comes back is the same role reposted, not a new one. */
const REOPEN_DAYS = 30;

const LOOKUP = { id: true, title: true, location: true, sources: { select: { provider: true, url: true } } } satisfies Prisma.JobSelect;
type Lookup = Prisma.JobGetPayload<{ select: typeof LOOKUP }>;
const googleOnly = (j: { sources: { provider: string }[] }) => j.sources.length > 0 && j.sources.every((s) => s.provider === "GOOGLE_JOBS");
const view = (j: Lookup): ReqView => ({ title: j.title, location: j.location, providers: j.sources.map((s) => s.provider), urls: j.sources.map((s) => s.url) });

/** The saved job at this company that is the same opening as this posting, if any. */
export async function findSameReq(db: PrismaClient, companyId: string, p: { provider: string; title: string; location?: string | null; applyUrl: string }, now = new Date()): Promise<Job | null> {
  const since = new Date(now.getTime() - REOPEN_DAYS * 86400_000);
  const rows = await db.job.findMany({ where: { companyId, OR: [{ status: "OPEN" }, { closedAt: { gte: since } }] }, select: LOOKUP, orderBy: { firstSeenAt: "asc" } });
  const me: ReqView = { title: p.title, location: p.location ?? null, providers: [p.provider], urls: p.applyUrl ? [p.applyUrl] : [] };
  const hits = rows.filter((r) => sameReq(view(r), me));
  // A Google Jobs result only adds a sighting, so any match will do. An employer posting that fits two saved jobs
  // (no city given, say) is not guessed at: it is saved as its own job.
  const hit = p.provider === "GOOGLE_JOBS" || hits.length === 1 ? hits.sort((a, b) => Number(googleOnly(a)) - Number(googleOnly(b)))[0] : undefined;
  return hit ? db.job.findUnique({ where: { id: hit.id } }) : null;
}

const ROW = {
  id: true, companyId: true, title: true, location: true, status: true, closedAt: true, manual: true, favorite: true, dismissed: true, dismissReason: true, dismissedAt: true,
  firstSeenAt: true, postedAt: true, alertedAt: true, fitBrief: true, fitBriefAt: true, overrideTier: true, overrideScore: true, overrideNote: true, notes: true, foundUrl: true, referrerId: true,
  sources: { select: { provider: true, url: true } }, _count: { select: { applications: true, kits: true } },
} satisfies Prisma.JobSelect;
type Row = Prisma.JobGetPayload<{ select: typeof ROW }>;

/** Which copy survives: the employer's own posting over a Google Jobs result (its link and description), then the one
 *  she applied to or built a kit for, then one she has not marked a duplicate, then an open one, then the oldest.
 *  Her application, kits and notes move onto the survivor. */
function rank(j: Row) {
  return [j.sources.some((s) => s.provider !== "GOOGLE_JOBS") ? 0 : 1, -j._count.applications, -j._count.kits, j.dismissReason === "duplicate" ? 1 : 0, j.status === "OPEN" ? 0 : 1, j.manual ? 0 : 1, j.firstSeenAt.getTime()];
}
const byRank = (a: Row, b: Row) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

/** Groups of stored jobs that are the same opening, best copy first. Pure, exported for tests. */
export function duplicateGroups<T extends Row>(rows: T[]): T[][] {
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    const k = `${r.companyId}|${titleKey(r.title, r.location)}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const out: T[][] = [];
  for (const g of byKey.values()) {
    if (g.length < 2) continue;
    // A copy joins a group only when it matches every job already in it, so "United States" can't chain a Phoenix
    // role and an Austin role together. Best copies go first, so the employer's postings form the groups.
    const sets: T[][] = [];
    for (const r of [...g].sort(byRank)) {
      const fits = sets.filter((s) => s.every((m) => sameReq(view(m), view(r))));
      // A Google Jobs result that fits more than one of the employer's postings is a copy of one of them: fold it
      // into the best. Anything else that fits more than one stays apart.
      if (fits.length === 1 || (fits.length > 1 && googleOnly(r))) fits[0].push(r);
      else sets.push([r]);
    }
    for (const s of sets) if (s.length > 1) out.push(s);
  }
  return out;
}

export type JobMergeResult = { groups: number; removed: number; kept: { id: string; title: string; copies: number }[]; refingerprinted: number };

export async function mergeDuplicateJobs(db: PrismaClient, now = new Date()): Promise<JobMergeResult> {
  const since = new Date(now.getTime() - REOPEN_DAYS * 86400_000);
  const rows = await db.job.findMany({ where: { OR: [{ status: "OPEN" }, { closedAt: { gte: since } }, { applications: { some: {} } }, { dismissed: true }] }, select: ROW });
  const res: JobMergeResult = { groups: 0, removed: 0, kept: [], refingerprinted: 0 };
  for (const [keep, ...rest] of duplicateGroups(rows)) {
    // A job holds one application. A second copy she also applied to stays apart rather than lose that record.
    let apps = keep._count.applications;
    const dupes = rest.filter((d) => { if (!d._count.applications) return true; if (apps) return false; apps += d._count.applications; return true; });
    if (!dupes.length) continue;
    const all = [keep, ...dupes];
    const ids = dupes.map((d) => d.id);
    const data: Prisma.JobUpdateInput = {};
    if (keep.status !== "OPEN" && dupes.some((d) => d.status === "OPEN")) Object.assign(data, { status: "OPEN", closedAt: null });
    const first = new Date(Math.min(...all.map((j) => j.firstSeenAt.getTime())));
    if (first < keep.firstSeenAt) data.firstSeenAt = first; // a copy found today is not a new role
    if (!keep.postedAt) { const p = dupes.map((d) => d.postedAt).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime())[0]; if (p) data.postedAt = p; }
    if (!keep.alertedAt) { const a = dupes.find((d) => d.alertedAt)?.alertedAt; if (a) data.alertedAt = a; } // never alert twice
    if (!keep.favorite && dupes.some((d) => d.favorite)) data.favorite = true;
    for (const f of ["overrideTier", "overrideScore", "overrideNote", "foundUrl", "fitBriefAt"] as const) if (keep[f] == null) { const v = dupes.find((d) => d[f] != null)?.[f]; if (v != null) (data as Record<string, unknown>)[f] = v; }
    if (keep.fitBrief == null) { const v = dupes.find((d) => d.fitBrief != null)?.fitBrief; if (v != null) data.fitBrief = v as Prisma.InputJsonValue; }
    if (!keep.referrerId) { const r = dupes.find((d) => d.referrerId)?.referrerId; if (r) data.referrer = { connect: { id: r } }; }
    const notes = all.map((j) => j.notes).filter((n): n is string => !!n);
    if (notes.length > (keep.notes ? 1 : 0)) data.notes = [...new Set(notes)].join("\n\n");
    // Her "Not a Fit" on any copy stands for the role. "Duplicate" marks only ever meant "this copy".
    const notFit = all.find((j) => j.dismissed && j.dismissReason !== "duplicate");
    if (notFit && !apps && !(keep.dismissed && keep.dismissReason !== "duplicate")) Object.assign(data, { dismissed: true, dismissReason: notFit.dismissReason, dismissedAt: notFit.dismissedAt ?? now });
    else if (!notFit && keep.dismissReason === "duplicate") Object.assign(data, { dismissed: false, dismissReason: null, dismissedAt: null });
    const from = [...new Set(dupes.flatMap((d) => d.sources.map((s) => s.provider)))].map((p) => (p === "GOOGLE_JOBS" ? "Google Jobs" : `${p[0]}${p.slice(1).toLowerCase()}`));
    await db.$transaction([
      db.jobSource.updateMany({ where: { jobId: { in: ids } }, data: { jobId: keep.id } }),
      db.jobEvent.updateMany({ where: { jobId: { in: ids } }, data: { jobId: keep.id } }),
      db.kit.updateMany({ where: { jobId: { in: ids } }, data: { jobId: keep.id } }),
      db.application.updateMany({ where: { jobId: { in: ids } }, data: { jobId: keep.id } }),
      ...(Object.keys(data).length ? [db.job.update({ where: { id: keep.id }, data })] : []),
      db.jobEvent.create({ data: { jobId: keep.id, kind: "merged", detail: `Merged ${ids.length} duplicate ${ids.length === 1 ? "copy" : "copies"}${from.length ? ` from ${from.join(", ")}` : ""}`, at: now } }),
      db.job.deleteMany({ where: { id: { in: ids } } }),
    ]);
    res.groups++; res.removed += ids.length; res.kept.push({ id: keep.id, title: keep.title, copies: all.length });
  }
  res.refingerprinted = await refreshFingerprints(db);
  return res;
}

/** Fingerprints saved under an older rule, or under a company that was merged away, are brought up to date so the
 *  next refresh finds the saved job instead of adding another. */
async function refreshFingerprints(db: PrismaClient) {
  const jobs = await db.job.findMany({ select: { id: true, companyId: true, title: true, location: true, fingerprint: true } });
  const taken = new Set(jobs.map((j) => j.fingerprint));
  let n = 0;
  for (const j of jobs) {
    const fp = jobFingerprint(j.companyId, j.title, j.location);
    if (fp === j.fingerprint || taken.has(fp)) continue; // another job holds it: a distinct req, or one kept apart
    const ok = await db.job.update({ where: { id: j.id }, data: { fingerprint: fp } }).then(() => true, () => false);
    if (ok) { taken.delete(j.fingerprint); taken.add(fp); n++; }
  }
  return n;
}
