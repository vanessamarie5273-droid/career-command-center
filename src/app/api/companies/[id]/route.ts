import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { diff } from "@/lib/audit";
import { scoreJob } from "@/lib/scoring";

type Ctx = { params: Promise<{ id: string }> };
const s = z.string().max(20000).nullable();
const score = z.union([z.number(), z.null()]).refine((v) => v === null || (v >= 0 && v <= 100), "0-100");
const Patch = z.object({
  name: z.string().max(200).optional(), website: s.optional(), careersUrl: s.optional(), linkedinUrl: s.optional(), category: z.string().max(100).optional(),
  headquarters: s.optional(), footprint: s.optional(), ownership: s.optional(), ticker: s.optional(), maturity: s.optional(), description: s.optional(),
  keyProducts: s.optional(), customers: s.optional(), buyerPersonas: s.optional(), revenue: s.optional(), revenueGrowth: s.optional(), fundingSummary: s.optional(),
  valuation: s.optional(), investors: s.optional(), liquidityNotes: s.optional(), financialSourceUrl: s.optional(),
  marketPositionScore: score.optional(), equityUpsideScore: score.optional(), compCompetitiveness: score.optional(), assessmentRationale: s.optional(), risks: s.optional(),
  cultureNotes: s.optional(), engagementStrategy: s.optional(), myContribution: s.optional(), favorite: z.boolean().optional(), userPriority: z.union([z.number(), z.string(), z.null()]).transform((v) => (v === null || v === "" ? null : Number(v))).optional(), notes: s.optional(),
  atsProvider: z.enum(["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "WORKDAY", "NONE"]).optional(), atsToken: s.optional(),
  profileFactType: z.enum(["CONFIRMED", "ESTIMATE", "AI_ASSESSMENT"]).optional(), profileSource: s.optional(), profileVerifiedAt: z.string().optional(),
});

export const PATCH = route<Ctx>("EDITOR", async (req, { params }, u) => {
  const { id } = await params;
  const b = Patch.parse(await req.json());
  const before = await prisma.company.findUniqueOrThrow({ where: { id } });
  const data: Record<string, unknown> = { ...b, profileVerifiedAt: b.profileVerifiedAt ? new Date(b.profileVerifiedAt) : undefined };
  if (b.financialSourceUrl) data.financialVerifiedAt = new Date();
  if (b.atsProvider || b.atsToken !== undefined) { data.atsStatus = "pending"; data.atsError = null; }
  const c = await prisma.company.update({ where: { id }, data });
  const changes = diff(before as unknown as Record<string, unknown>, b);
  if (Object.keys(changes).length) await prisma.auditLog.create({ data: { userId: u.sub, entity: "Company", entityId: id, action: "update", changes: JSON.parse(JSON.stringify(changes)) } });
  if ("marketPositionScore" in b || "equityUpsideScore" in b || "compCompetitiveness" in b) {
    const jobs = await prisma.job.findMany({ where: { companyId: id } });
    for (const j of jobs) {
      const r = scoreJob({ ...j, company: c });
      await prisma.job.update({ where: { id: j.id }, data: { score: r.score, scoreBreakdown: r.breakdown, scoreReasons: r.reasons, confidence: r.confidence, tier: r.tier, category: r.category, excludedReason: r.excludedReason ?? null } });
    }
  }
  return { ok: true };
});
