import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ applicationId: z.string().optional().nullable(), companyId: z.string().optional().nullable(), kind: z.string().max(40).default("note"), body: z.string().min(1).max(50000) }).parse(await req.json());
  const a = await prisma.activity.create({ data: b });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Activity", entityId: a.id, action: "create", changes: { kind: b.kind } } });
  return a;
});
