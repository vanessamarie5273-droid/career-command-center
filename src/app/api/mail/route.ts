// Check Outlook now, or disconnect it.
import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { disconnect } from "@/lib/mail/outlook";
import { syncMailbox } from "@/lib/mail/sync";

export const maxDuration = 300;

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ action: z.enum(["sync", "disconnect"]) }).parse(await req.json());
  if (b.action === "disconnect") {
    await disconnect(prisma);
    await prisma.auditLog.create({ data: { userId: u.sub, entity: "MailAccount", entityId: "outlook", action: "disconnect" } });
    return { ok: true };
  }
  const r = await syncMailbox(prisma, { max: 200 });
  if (!r) return Response.json({ error: "Outlook is not connected." }, { status: 400 });
  return r;
});
