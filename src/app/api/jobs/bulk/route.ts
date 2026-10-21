import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ensureApplication, moveStage } from "@/lib/applications";

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ ids: z.array(z.string()).min(1).max(500), action: z.enum(["pipeline", "applied", "favorite", "unfavorite", "dismiss", "duplicate", "restore"]) }).parse(await req.json());
  if (b.action === "applied") {
    // Creates the application if needed and moves it to Applied, which takes the role out of the feed.
    for (const id of b.ids) {
      const { app } = await ensureApplication(prisma, id, u.sub, "APPLIED");
      if (!app.applied) await moveStage(prisma, app.id, "APPLIED", u.sub);
    }
    return { ok: true, count: b.ids.length };
  }
  if (b.action === "pipeline") {
    let created = 0;
    for (const id of b.ids) if ((await ensureApplication(prisma, id, u.sub)).created) created++;
    return { ok: true, created };
  }
  const data = b.action === "favorite" ? { favorite: true } : b.action === "unfavorite" ? { favorite: false } : b.action === "dismiss" ? { dismissed: true, dismissedAt: new Date(), dismissReason: "not_fit" } : b.action === "duplicate" ? { dismissed: true, dismissedAt: new Date(), dismissReason: "duplicate" } : { dismissed: false, dismissedAt: null, dismissReason: null };
  const r = await prisma.job.updateMany({ where: { id: { in: b.ids } }, data });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Job", entityId: b.ids.join(",").slice(0, 500), action: `bulk:${b.action}`, changes: { count: r.count } } });
  return { ok: true, count: r.count };
});
