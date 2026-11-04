import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { completeTask } from "@/lib/todos";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = route<Ctx>("EDITOR", async (req, { params }) => {
  const { id } = await params;
  const b = z.object({ done: z.boolean().optional(), title: z.string().max(500).optional(), dueAt: z.string().nullable().optional() }).parse(await req.json());
  // Checking a task off also closes its twins (a copy, or the same next action on the application).
  if (b.done === true && b.title === undefined && b.dueAt === undefined) return completeTask(prisma, id);
  return prisma.task.update({ where: { id }, data: { ...b, dueAt: b.dueAt === undefined ? undefined : b.dueAt ? new Date(b.dueAt) : null, doneAt: b.done ? new Date() : b.done === false ? null : undefined } });
});
export const DELETE = route<Ctx>("EDITOR", async (_r, { params }) => { await prisma.task.delete({ where: { id: (await params).id } }); return { ok: true }; });
