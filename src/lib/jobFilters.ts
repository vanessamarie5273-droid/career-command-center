import type { Prisma } from "@prisma/client";
import { tierWhere } from "./queries";

export type JobParams = { q?: string; tier?: string; category?: string; company?: string; remote?: string; minScore?: string; minComp?: string; family?: string; sort?: string; page?: string; industry?: string; fav?: string; status?: string; view?: string };

export const RANKINGS: Record<string, { label: string; where: Prisma.JobWhereInput; orderBy: Prisma.JobOrderByWithRelationInput[] }> = {
  best: { label: "Best immediately available jobs", where: { category: "MAIN" }, orderBy: [{ score: "desc" }] },
  cash: { label: "Highest expected cash compensation (published)", where: { category: { in: ["MAIN", "STRETCH"] }, OR: [{ oteMax: { not: null } }, { salaryMax: { not: null } }] }, orderBy: [{ oteMax: { sort: "desc", nulls: "last" } }, { salaryMax: { sort: "desc", nulls: "last" } }] },
  equity: { label: "Highest potential equity upside", where: { category: { in: ["MAIN", "STRETCH"] } }, orderBy: [{ company: { equityUpsideScore: "desc" } }, { score: "desc" }] },
  quals: { label: "Strongest qualifications match", where: { category: { in: ["MAIN", "STRETCH"] } }, orderBy: [{ score: "desc" }] },
  remote: { label: "Best remote opportunities", where: { category: "MAIN", isRemote: true }, orderBy: [{ score: "desc" }] },
  leadership: { label: "Best career leadership opportunities", where: { category: { in: ["MAIN", "STRETCH"] }, seniority: { in: ["MANAGER", "DIRECTOR", "HEAD", "VP", "EXEC"] } }, orderBy: [{ score: "desc" }] },
  ai: { label: "Most promising emerging AI companies' roles", where: { category: { in: ["MAIN", "STRETCH"] }, company: { category: { in: ["Enterprise AI & Agents", "AI Infrastructure & Data", "Healthcare & Clinical AI"] }, ownership: { contains: "Private" } } }, orderBy: [{ company: { marketPositionScore: "desc" } }, { score: "desc" }] },
};

export function jobWhere(p: JobParams): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [];
  if (p.status === "CLOSED") and.push({ status: "CLOSED" });
  else and.push({ status: "OPEN" });
  if (p.category && p.category !== "ALL") and.push({ category: p.category });
  else if (!p.category) and.push({ category: { in: ["MAIN", "STRETCH"] } });
  if (p.status !== "CLOSED" && p.category !== "DISMISSED") and.push({ dismissed: false });
  if (p.category === "DISMISSED") { and.pop(); and.push({ dismissed: true }); }
  if (p.tier && ["TIER1", "TIER2", "TIER3"].includes(p.tier)) and.push(tierWhere(p.tier as "TIER1"));
  if (p.company) and.push({ companyId: p.company });
  if (p.industry) and.push({ company: { category: p.industry } });
  if (p.remote === "1") and.push({ isRemote: true });
  if (p.fav === "1") and.push({ favorite: true });
  if (p.family) and.push({ roleFamily: p.family });
  if (p.minScore) and.push({ score: { gte: Number(p.minScore) || 0 } });
  if (p.minComp) {
    const n = Number(p.minComp) || 0;
    and.push({ OR: [{ oteMax: { gte: n } }, { salaryMax: { gte: n } }] });
  }
  if (p.q) and.push({ OR: [{ title: { contains: p.q, mode: "insensitive" } }, { company: { name: { contains: p.q, mode: "insensitive" } } }, { location: { contains: p.q, mode: "insensitive" } }, { descriptionText: { contains: p.q, mode: "insensitive" } }] });
  if (p.view && RANKINGS[p.view]) and.push(RANKINGS[p.view].where);
  return { AND: and };
}

export function jobOrder(p: JobParams): Prisma.JobOrderByWithRelationInput[] {
  if (p.view && RANKINGS[p.view]) return RANKINGS[p.view].orderBy;
  switch (p.sort) {
    case "new": return [{ firstSeenAt: "desc" }];
    case "posted": return [{ postedAt: { sort: "desc", nulls: "last" } }];
    case "comp": return [{ oteMax: { sort: "desc", nulls: "last" } }, { salaryMax: { sort: "desc", nulls: "last" } }];
    case "company": return [{ company: { name: "asc" } }, { score: "desc" }];
    case "location": return [{ location: "asc" }];
    default: return [{ overrideScore: { sort: "desc", nulls: "last" } }, { score: { sort: "desc", nulls: "last" } }];
  }
}
