import type { Prisma } from "@prisma/client";
import { tierWhere, NOT_A_FIT, DUPLICATE, FEED_CATEGORIES, IN_DISCOVER } from "./queries";

export type JobParams = { q?: string; tier?: string; category?: string; company?: string; remote?: string; minScore?: string; minComp?: string; family?: string; sort?: string; page?: string; industry?: string; fav?: string; near?: string; status?: string; view?: string; all?: string };

export const RANKINGS: Record<string, { label: string; where: Prisma.JobWhereInput; orderBy: Prisma.JobOrderByWithRelationInput[] }> = {
  best: { label: "Best immediately available jobs", where: {}, orderBy: [{ score: "desc" }] },
  cash: { label: "Highest expected cash compensation (published)", where: { OR: [{ oteMax: { not: null } }, { salaryMax: { not: null } }] }, orderBy: [{ oteMax: { sort: "desc", nulls: "last" } }, { salaryMax: { sort: "desc", nulls: "last" } }] },
  growth: { label: "Fastest-growing companies' roles", where: { company: { growthScore: { gte: 80 } } }, orderBy: [{ company: { growthScore: { sort: "desc", nulls: "last" } } }, { score: "desc" }] },
  equity: { label: "Highest potential equity upside", where: {}, orderBy: [{ company: { equityUpsideScore: "desc" } }, { score: "desc" }] },
  quals: { label: "Strongest qualifications match", where: {}, orderBy: [{ score: "desc" }] },
  remote: { label: "Best remote opportunities", where: { isRemote: true }, orderBy: [{ score: "desc" }] },
  leadership: { label: "Best career leadership opportunities", where: { seniority: { in: ["MANAGER", "DIRECTOR", "HEAD", "VP", "EXEC"] } }, orderBy: [{ score: "desc" }] },
  ai: { label: "Most promising emerging AI companies' roles", where: { company: { category: { in: ["Enterprise AI & Agents", "AI Infrastructure & Data", "Healthcare & Clinical AI"] }, ownership: { contains: "Private" } } }, orderBy: [{ company: { marketPositionScore: "desc" } }, { score: "desc" }] },
};

// Place names that only match the Phoenix metro (bare "Mesa" or "Glendale" would also match California).
const PHX_TERMS = ["Phoenix", "Scottsdale", "Tempe", "Chandler", "Gilbert", ", AZ", "Arizona"];

/** Whether the 3-per-company limit applies: the main feeds, not history, the screened-out lists, or a search or role-type filter (those show every match). */
export function capApplies(p: JobParams) {
  return p.all !== "1" && !p.q?.trim() && !p.family && p.status !== "CLOSED" && (!p.category || FEED_CATEGORIES.includes(p.category));
}

const STOP_WORDS = new Set(["of", "and", "the", "for", "in", "a", "an", "to"]);
/** Words of a search, so "Business Development Director" also finds "Director, Business Development". "Leader" also finds "Lead". */
export function searchWords(q: string) {
  return [...new Set(q.toLowerCase().split(/[^a-z0-9&+#]+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w)).map((w) => (w === "leader" ? "lead" : w)))];
}

export function jobWhere(p: JobParams): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [];
  if (p.category === "DISMISSED") {
    // Every role marked "Not a fit", open or since closed, so the list matches the dashboard count.
    and.push(NOT_A_FIT);
  } else if (p.category === "DUPLICATE") {
    and.push(DUPLICATE);
  } else {
    if (p.status === "CLOSED") and.push({ status: "CLOSED" });
    else and.push({ status: "OPEN" });
    if (p.category && p.category !== "ALL") and.push({ category: p.category });
    else if (!p.category) and.push({ category: { in: FEED_CATEGORIES } });
    if (p.status !== "CLOSED") and.push({ dismissed: false });
    if (p.status !== "CLOSED" && (!p.category || FEED_CATEGORIES.includes(p.category))) and.push(IN_DISCOVER);
  }
  if (p.tier && ["TIER1", "TIER2", "TIER3"].includes(p.tier)) and.push(tierWhere(p.tier as "TIER1"));
  if (p.company) and.push({ companyId: p.company });
  if (p.industry) and.push({ company: { category: p.industry } });
  if (p.remote === "1") and.push({ isRemote: true });
  // Phoenix area: roles based in the metro, plus remote U.S. roles she can take from home.
  if (p.near === "phx") and.push({ OR: [...PHX_TERMS.map((t) => ({ location: { contains: t, mode: "insensitive" as const } })), { isRemote: true }] });
  if (p.fav === "1") and.push({ favorite: true });
  if (p.family) and.push({ roleFamily: p.family });
  if (p.minScore) and.push({ score: { gte: Number(p.minScore) || 0 } });
  if (p.minComp) {
    const n = Number(p.minComp) || 0;
    and.push({ OR: [{ oteMax: { gte: n } }, { salaryMax: { gte: n } }] });
  }
  if (p.q?.trim()) {
    const q = p.q.trim();
    const words = searchWords(q);
    and.push({ OR: [
      { title: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }, { location: { contains: q, mode: "insensitive" } }, { descriptionText: { contains: q, mode: "insensitive" } },
      ...(words.length > 1 ? [{ AND: words.map((w) => ({ title: { contains: w, mode: "insensitive" as const } })) }] : []),
    ] });
  }
  if (p.view && RANKINGS[p.view]) and.push(RANKINGS[p.view].where);
  return { AND: and };
}

export function jobOrder(p: JobParams): Prisma.JobOrderByWithRelationInput[] {
  if (p.view && RANKINGS[p.view]) return RANKINGS[p.view].orderBy;
  switch (p.sort) {
    case "new": return [{ firstSeenAt: "desc" }];
    case "score": return [{ overrideScore: { sort: "desc", nulls: "last" } }, { score: { sort: "desc", nulls: "last" } }];
    case "comp": return [{ oteMax: { sort: "desc", nulls: "last" } }, { salaryMax: { sort: "desc", nulls: "last" } }];
    case "company": return [{ company: { name: "asc" } }, { score: "desc" }];
    case "location": return [{ location: "asc" }];
    // Most recent first: posting date, then when the app first found it (for boards that publish no date).
    default: return [{ postedAt: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }];
  }
}
