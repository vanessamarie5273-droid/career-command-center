import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const POST = route("EDITOR", async (req) => {
  const b = z.object({ contactId: z.string(), applicationId: z.string().optional().nullable(), channel: z.string().max(20), message: z.string().max(20000).optional().nullable(), followUpAt: z.string().nullable().optional(), sentAt: z.string().optional() }).parse(await req.json());
  const t = await prisma.outreachTouch.create({ data: { ...b, followUpAt: b.followUpAt ? new Date(b.followUpAt) : null, sentAt: b.sentAt ? new Date(b.sentAt) : new Date() } });
  if (t.followUpAt) {
    const c = await prisma.contact.findUnique({ where: { id: b.contactId } });
    await prisma.task.create({ data: { title: `Follow up with ${c?.firstName ?? "contact"} ${c?.lastName ?? ""}`.trim(), dueAt: t.followUpAt, contactId: b.contactId, applicationId: b.applicationId ?? null, source: "system" } });
  }
  return t;
});
