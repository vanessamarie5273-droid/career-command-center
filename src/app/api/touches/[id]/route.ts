import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route<Ctx>("EDITOR", async (req, { params }) => {
  const b = z.object({ replied: z.boolean().optional(), followUpAt: z.string().nullable().optional() }).parse(await req.json());
  return prisma.outreachTouch.update({ where: { id: (await params).id }, data: { replied: b.replied, repliedAt: b.replied ? new Date() : undefined, followUpAt: b.followUpAt === undefined ? undefined : b.followUpAt ? new Date(b.followUpAt) : null } });
});
