import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { diff } from "@/lib/audit";

const Patch = z.object({
  overrideTier: z.enum(["TIER1", "TIER2", "TIER3"]).nullable().optional(),
  overrideScore: z.number().int().min(0).max(100).nullable().optional(),
  overrideNote: z.string().max(2000).nullable().optional(),
  favorite: z.boolean().optional(),
  dismissed: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>("EDITOR", async (req, { params }, u) => {
  const { id } = await params;
  const b = Patch.parse(await req.json());
  const before = await prisma.job.findUniqueOrThrow({ where: { id } });
  const job = await prisma.job.update({ where: { id }, data: b });
  const changes = diff(before as unknown as Record<string, unknown>, b);
  if (Object.keys(changes).length) {
    await prisma.auditLog.create({ data: { userId: u.sub, entity: "Job", entityId: id, action: "update", changes: JSON.parse(JSON.stringify(changes)) } });
    if ("overrideTier" in b || "overrideScore" in b) await prisma.jobEvent.create({ data: { jobId: id, kind: "override", detail: `Manual override: tier ${b.overrideTier ?? "AI"}, score ${b.overrideScore ?? "AI"} (AI score ${before.score} kept)` } });
  }
  return job;
});
