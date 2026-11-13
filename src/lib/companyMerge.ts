// One company, one account. The same employer was stored more than once when Google Jobs, a posting link or the seed
// spelled its name differently ("Gong" and "Gong.io", "Cisco" and "Cisco Systems, Inc", three TeamViewers, Nov 13).
// companyKey() is the spelling-proof name used to match companies everywhere; mergeDuplicateCompanies() folds stored
// duplicates into one record, keeping every job, application, contact and note.
import type { Company, PrismaClient } from "@prisma/client";

/** Legal forms, country tags and generic words that do not tell two employers apart. */
const NOISE = /\b(the|inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|holdings?|group|gmbh|ag|se|nv|sa|bv|ab|pte|pty|usa|us|germany|international|intl|systems?|services|technologies|technology|transport|solutions)\b/g;
/** Different names for the same employer. Keys are companyKey() values. */
const ALIASES: Record<string, string> = {
  williamsscotsman: "willscot",
  ultimatesoftware: "ukg",
  carismpi: "carislifesciences",
};

export function companyKey(name: string): string {
  const base = (name ?? "")
    .toLowerCase()
    .replace(/\.(io|ai|com|co|net)\b/g, "") // Gong.io, monday.com
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, "");
  const key = base || (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return ALIASES[key] ?? key;
}

type Row = Company & { _count: { applications: number; jobs: number } };

/** Which record survives: one from her seed list, then one she added, then one with a working board, then the oldest. */
function rank(c: Row) {
  return [c.addedBy.startsWith("seed") ? 0 : 1, c.addedBy === "user" ? 0 : 1, c.atsStatus === "ok" ? 0 : 1, -c._count.applications, c.createdAt.getTime()];
}
const byRank = (a: Row, b: Row) => {
  const x = rank(a), y = rank(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

const FILL: (keyof Company)[] = ["website", "careersUrl", "logoUrl", "linkedinUrl", "subCategory", "headquarters", "footprint", "ownership", "ticker", "maturity", "description", "keyProducts", "customers", "buyerPersonas", "revenue", "revenueGrowth", "fundingSummary", "valuation", "investors", "liquidityNotes", "financialSourceUrl", "marketPositionScore", "equityUpsideScore", "growthScore", "growthThesis", "compCompetitiveness", "assessmentRationale", "risks", "cultureNotes", "engagementStrategy", "myContribution", "userPriority"];

/** Groups of stored companies that are the same employer, best record first. */
export async function findDuplicateCompanies(db: PrismaClient) {
  const all = (await db.company.findMany({ include: { _count: { select: { applications: true, jobs: true } } } })) as Row[];
  const groups = new Map<string, Row[]>();
  for (const c of all) {
    const k = companyKey(c.name);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort(byRank));
}

export async function mergeDuplicateCompanies(db: PrismaClient) {
  const merged: { kept: string; removed: string[] }[] = [];
  for (const [keep, ...dupes] of await findDuplicateCompanies(db)) {
    // The job board that reads the employer's real openings: a working one over none, the bigger one over a smaller
    // look-alike (SmartRecruiters "gong" listed 7 roles of another company; Greenhouse "gongio" is Gong's 88).
    const boards = [keep, ...dupes].filter((c) => c.atsProvider !== "NONE" && c.atsStatus === "ok");
    const board = boards.sort((a, b) => (b.totalOpenings ?? 0) - (a.totalOpenings ?? 0))[0];
    const data: Record<string, unknown> = {};
    if (board && board.id !== keep.id && !(board.atsProvider === keep.atsProvider && board.atsToken === keep.atsToken)) {
      Object.assign(data, { atsProvider: board.atsProvider, atsToken: board.atsToken, atsStatus: board.atsStatus, atsError: board.atsError, atsCheckedAt: board.atsCheckedAt, totalOpenings: board.totalOpenings, lastIngestedAt: board.lastIngestedAt, atsHints: board.atsHints.filter((h) => h !== "none") });
    } else if (!board && keep.atsProvider === "NONE") {
      // No working board anywhere: a lookup hint from any copy is worth keeping, unless a copy is known to have none.
      const hints = [...new Set([keep, ...dupes].flatMap((c) => c.atsHints))];
      if (hints.length && JSON.stringify(hints) !== JSON.stringify(keep.atsHints)) data.atsHints = hints.includes("none") && hints.some((h) => h.includes(":")) ? hints.filter((h) => h !== "none") : hints;
    }
    for (const f of FILL) if (keep[f] == null) { const v = dupes.find((d) => d[f] != null)?.[f]; if (v != null) data[f] = v; }
    if (!keep.favorite && dupes.some((d) => d.favorite)) data.favorite = true;
    const notes = [keep.notes, ...dupes.map((d) => d.notes)].filter(Boolean);
    if (notes.length > (keep.notes ? 1 : 0)) data.notes = notes.join("\n\n");
    const ids = dupes.map((d) => d.id);
    await db.$transaction([
      db.job.updateMany({ where: { companyId: { in: ids } }, data: { companyId: keep.id } }),
      db.application.updateMany({ where: { companyId: { in: ids } }, data: { companyId: keep.id } }),
      db.contact.updateMany({ where: { companyId: { in: ids } }, data: { companyId: keep.id } }),
      db.leader.updateMany({ where: { companyId: { in: ids } }, data: { companyId: keep.id } }),
      db.companyNews.updateMany({ where: { companyId: { in: ids } }, data: { companyId: keep.id } }),
      db.activity.updateMany({ where: { companyId: { in: ids } }, data: { companyId: keep.id } }),
      db.emailEvent.updateMany({ where: { companyId: { in: ids } }, data: { companyId: keep.id } }),
      ...(Object.keys(data).length ? [db.company.update({ where: { id: keep.id }, data })] : []),
      db.company.deleteMany({ where: { id: { in: ids } } }),
    ]);
    merged.push({ kept: keep.name, removed: dupes.map((d) => d.name) });
  }
  return merged;
}
