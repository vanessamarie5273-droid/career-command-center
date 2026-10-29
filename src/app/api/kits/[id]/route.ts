import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { KIT_PARTS } from "@/lib/kitParts";
import { saveKitPart } from "@/lib/kitEdit";

type Ctx = { params: Promise<{ id: string }> };
// Saves her edit to one part of a kit; the saved resume or letter and the checks follow it.
export const PATCH = route<Ctx>("EDITOR", async (req, { params }, u) => {
  const b = z.object({ part: z.enum(KIT_PARTS), text: z.string().min(1).max(100000) }).parse(await req.json());
  const kit = await saveKitPart(prisma, (await params).id, b.part, b.text);
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Kit", entityId: kit.id, action: "update", changes: { part: b.part } } });
  return kit;
});
