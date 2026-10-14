import { z } from "zod";
import type { Stage } from "@prisma/client";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { diff } from "@/lib/audit";
import { moveStage, STAGE_ORDER } from "@/lib/applications";

type Ctx = { params: Promise<{ id: string }> };
const dateish = z.union([z.string(), z.null()]).transform((v) => (v ? new Date(v) : null));
const int = z.union([z.number(), z.string(), z.null()]).transform((v) => (v === null || v === "" ? null : Math.round(Number(v)))).refine((v) => v === null || Number.isFinite(v));
const str = z.string().max(100000).nullable();

const Patch = z.object({
  stage: z.enum(STAGE_ORDER as [Stage, ...Stage[]]).optional(),
  applied: z.boolean().optional(), appliedAt: dateish.optional(), title: z.string().max(300).optional(),
  resumeId: z.string().nullable().optional(), coverLetterId: z.string().nullable().optional(), introText: str.optional(),
  recruiterName: str.optional(), hiringManagerName: str.optional(), linkedinActivity: str.optional(), interviewNotes: str.optional(),
  nextAction: str.optional(), nextActionDue: dateish.optional(), personalNotes: str.optional(), outcome: str.optional(), outcomeReason: str.optional(),
  baseSalary: int.optional(), ote: int.optional(), variableComp: int.optional(), commissionNotes: str.optional(), signingBonus: int.optional(),
  equityGrant: str.optional(), equityValueEst: int.optional(), vesting: str.optional(), equityType: str.optional(), quota: int.optional(),
  compSource: str.optional(), compFactType: z.enum(["CONFIRMED", "ESTIMATE", "AI_ASSESSMENT"]).nullable().optional(), interviewAt: dateish.optional(), priority: int.optional(),
});

export const GET = route<Ctx>("VIEWER", async (_r, { params }) => prisma.application.findUniqueOrThrow({ where: { id: (await params).id } }));

export const PATCH = route<Ctx>("EDITOR", async (req, { params }, u) => {
  const { id } = await params;
  const { stage, ...rest } = Patch.parse(await req.json());
  if (stage) {
    const r = await moveStage(prisma, id, stage, u.sub);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  }
  if (Object.keys(rest).length) {
    const before = await prisma.application.findUniqueOrThrow({ where: { id } });
    if (rest.applied === true && !before.appliedAt && rest.appliedAt === undefined) rest.appliedAt = new Date();
    await prisma.application.update({ where: { id }, data: rest });
    const changes = diff(before as unknown as Record<string, unknown>, rest);
    if (Object.keys(changes).length) await prisma.auditLog.create({ data: { userId: u.sub, entity: "Application", entityId: id, action: "update", changes: JSON.parse(JSON.stringify(changes)) } });
  }
  return prisma.application.findUniqueOrThrow({ where: { id } });
});

export const DELETE = route<Ctx>("ADMIN", async (_r, { params }, u) => {
  const { id } = await params;
  const before = await prisma.application.findUniqueOrThrow({ where: { id } });
  await prisma.application.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Application", entityId: id, action: "delete", changes: JSON.parse(JSON.stringify(before)) } });
  return { ok: true };
});
