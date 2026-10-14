import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route<Ctx>("EDITOR", async (req, { params }, u) => {
  const { id } = await params;
  const b = z.object({ name: z.string().max(200).optional(), version: z.string().max(40).nullable().optional(), industry: z.string().max(100).nullable().optional(), roleType: z.string().max(100).nullable().optional(), kind: z.string().max(40).optional() }).parse(await req.json());
  const d = await prisma.document.update({ where: { id }, data: b, select: { id: true } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Document", entityId: id, action: "update", changes: b } });
  return d;
});
export const DELETE = route<Ctx>("EDITOR", async (_r, { params }, u) => {
  const { id } = await params;
  await prisma.application.updateMany({ where: { resumeId: id }, data: { resumeId: null } });
  await prisma.application.updateMany({ where: { coverLetterId: id }, data: { coverLetterId: null } });
  await prisma.document.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Document", entityId: id, action: "delete" } });
  return { ok: true };
});
