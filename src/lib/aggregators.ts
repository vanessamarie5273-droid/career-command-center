// Job boards and aggregators are not employers. Google Jobs sometimes names the site that reposted a role as its
// company (Jobgether, Ladders, ClearanceJobs, "Remote Quest Jobs"), or puts a job title in the company field
// ("Strategy & Operations Lead @ Sierra"). Those were being added as companies (Nov 18). They are skipped when
// Google Jobs finds them, and stored ones are removed on deploy unless she has an application with them.
import type { PrismaClient } from "@prisma/client";

const BOARDS = /\b(jobgether|ladders|clearance ?jobs|remote ?quest|jobright|lensa|jooble|adzuna|talent\.com|ziprecruiter|careerbuilder|simplyhired|getjobsmart|get ?job ?smart|trulyhired|truly ?hired|hiring ?cafe|remotive|flexjobs|virtual vocations|himalayas|wellfound|builtin|built in|dice\.com|monster\.com|indeed|glassdoor|linkedin|jobot|jobleads|jobs ?for ?humanity|we work remotely|remote ?ok|bebee|jobilize|learn4good|recruit\.net|salary\.com|snagajob|teal ?hq)\b/i;
/** A company field that is really a job title or a job site: "Lead @ Sierra", "Remote Quest Jobs", "Rithum LinkedIn Board". */
const NOT_A_NAME = /@|\bjobs?$|\bjob board\b|\bboard$|\bcareers? (site|network)$/i;

export function aggregatorReason(name: string | null | undefined): string | undefined {
  const n = (name ?? "").trim();
  if (!n) return undefined;
  if (BOARDS.test(n)) return "Job board or aggregator, not an employer";
  if (NOT_A_NAME.test(n)) return "Job title or job site in the company field, not an employer";
  return undefined;
}

/** Removes stored job boards and aggregators with their reposted jobs. One she has an application with is kept. */
export async function removeAggregatorCompanies(db: PrismaClient) {
  const all = await db.company.findMany({ where: { addedBy: { not: "user" } }, select: { id: true, name: true, addedBy: true, _count: { select: { applications: true } } } });
  const removed: string[] = [];
  const kept: string[] = [];
  for (const c of all) {
    if (c.addedBy.startsWith("seed") || !aggregatorReason(c.name)) continue;
    if (c._count.applications) { kept.push(c.name); continue; }
    await db.company.delete({ where: { id: c.id } });
    removed.push(c.name);
  }
  return { removed, kept };
}
