import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const POST = route("EDITOR", async (req) => {
  const b = z.object({ applicationId: z.string().nullable().optional(), contactId: z.string().nullable().optional(), title: z.string().min(1).max(500), dueAt: z.string().nullable().optional(), source: z.string().max(20).optional() }).parse(await req.json());
  return prisma.task.create({ data: { ...b, dueAt: b.dueAt ? new Date(b.dueAt) : null } });
});
