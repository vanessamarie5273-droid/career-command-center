import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { completeNextAction, completeTask } from "@/lib/todos";

/** Check off a to-do from the Command Center: a task by its id, or an application's next action by the application id. */
export const POST = route("EDITOR", async (req) => {
  const b = z.object({ kind: z.enum(["task", "followup"]), id: z.string().min(1) }).parse(await req.json());
  return b.kind === "task" ? completeTask(prisma, b.id) : completeNextAction(prisma, b.id);
});
