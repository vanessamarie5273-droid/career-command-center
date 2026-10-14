import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
const s = z.string().max(5000).nullable();
export const PATCH = route<Ctx>("EDITOR", async (req, { params }, u) => {
  const { id } = await params;
  const b = z.object({ firstName: z.string().max(100).optional(), lastName: s.optional(), title: s.optional(), email: s.optional(), linkedinUrl: s.optional(), companyId: s.optional(), role: s.optional(), degree: s.optional(), notes: s.optional() }).parse(await req.json());
  await prisma.contact.update({ where: { id }, data: b });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Contact", entityId: id, action: "update", changes: b } });
  return { ok: true };
});
export const DELETE = route<Ctx>("EDITOR", async (_r, { params }, u) => {
  const { id } = await params;
  await prisma.contact.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Contact", entityId: id, action: "delete" } });
  return { ok: true };
});
