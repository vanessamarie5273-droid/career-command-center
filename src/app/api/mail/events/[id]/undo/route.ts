// Undo a stage move the app made from an email.
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { undoEmailEvent } from "@/lib/mail/sync";

export const POST = route<{ params: Promise<{ id: string }> }>("EDITOR", async (_req, { params }, u) => {
  const { id } = await params;
  const ev = await undoEmailEvent(prisma, id);
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "EmailEvent", entityId: id, action: "undo", changes: { stage: { from: ev.newStage, to: ev.prevStage } } } });
  return { ok: true };
});
