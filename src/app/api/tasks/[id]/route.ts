import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route<Ctx>("EDITOR", async (req, { params }) => {
  const b = z.object({ done: z.boolean().optional(), title: z.string().max(500).optional(), dueAt: z.string().nullable().optional() }).parse(await req.json());
  return prisma.task.update({ where: { id: (await params).id }, data: { ...b, dueAt: b.dueAt === undefined ? undefined : b.dueAt ? new Date(b.dueAt) : null, doneAt: b.done ? new Date() : b.done === false ? null : undefined } });
});
export const DELETE = route<Ctx>("EDITOR", async (_r, { params }) => { await prisma.task.delete({ where: { id: (await params).id } }); return { ok: true }; });
