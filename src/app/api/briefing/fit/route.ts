// Called by the daily cron job (which has no Anthropic key) so the web app writes the briefing's fit assessments.
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureFitBriefs } from "@/lib/briefingFit";
import { connectionCounts } from "@/lib/briefing";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !got || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { jobIds } = z.object({ jobIds: z.array(z.string()).max(10) }).parse(await req.json());
  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } }, include: { company: true } });
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const done = await ensureFitBriefs(prisma, jobs, { connections: await connectionCounts(prisma, jobs.map((j) => j.companyId)), minScore: user?.alertMinScore ?? 80 });
  return Response.json({ ok: true, written: done.size });
}
