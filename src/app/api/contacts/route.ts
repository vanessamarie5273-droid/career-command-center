import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ firstName: z.string().min(1).max(100), lastName: z.string().max(100).optional(), title: z.string().max(200).optional(), email: z.string().email().optional().or(z.literal("")), linkedinUrl: z.string().url().optional().or(z.literal("")), companyId: z.string().optional().or(z.literal("")), role: z.string().max(40).optional(), degree: z.string().max(10).optional() }).parse(await req.json());
  const c = await prisma.contact.create({ data: { ...b, email: b.email || null, linkedinUrl: b.linkedinUrl || null, companyId: b.companyId || null } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Contact", entityId: c.id, action: "create" } });
  return c;
});
