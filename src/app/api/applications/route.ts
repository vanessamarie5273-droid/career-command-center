import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ensureApplication } from "@/lib/applications";

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ jobId: z.string().optional(), companyId: z.string().optional(), title: z.string().max(300).optional(), stage: z.enum(["RESEARCHING", "PRIORITIZED"]).optional() }).parse(await req.json());
  if (b.jobId) return (await ensureApplication(prisma, b.jobId, u.sub, b.stage)).app;
  if (!b.companyId || !b.title) return Response.json({ error: "companyId and title are required without a job" }, { status: 400 });
  // Company-level pursuit (e.g. networking toward a role not yet posted): no job id, never duplicates the company.
  const app = await prisma.application.create({ data: { companyId: b.companyId, title: b.title, stage: b.stage ?? "RESEARCHING", stageHistory: { create: { to: b.stage ?? "RESEARCHING" } } } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Application", entityId: app.id, action: "create", changes: b } });
  return app;
});
