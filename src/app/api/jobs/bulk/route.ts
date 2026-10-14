import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ensureApplication } from "@/lib/applications";

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ ids: z.array(z.string()).min(1).max(500), action: z.enum(["pipeline", "favorite", "unfavorite", "dismiss", "restore"]) }).parse(await req.json());
  if (b.action === "pipeline") {
    let created = 0;
    for (const id of b.ids) if ((await ensureApplication(prisma, id, u.sub)).created) created++;
    return { ok: true, created };
  }
  const data = b.action === "favorite" ? { favorite: true } : b.action === "unfavorite" ? { favorite: false } : b.action === "dismiss" ? { dismissed: true } : { dismissed: false };
  const r = await prisma.job.updateMany({ where: { id: { in: b.ids } }, data });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Job", entityId: b.ids.join(",").slice(0, 500), action: `bulk:${b.action}`, changes: { count: r.count } } });
  return { ok: true, count: r.count };
});
