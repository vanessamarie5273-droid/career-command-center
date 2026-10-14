// Scheduler entry point for hosts with HTTP cron (Vercel Cron, GitHub Actions, cron-job.org).
// Render uses the `npm run job:daily` cron service instead (see render.yaml).
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { runIngestion, rescoreAll } from "@/lib/ingest/run";
import { generateAndSendBriefing } from "@/lib/briefing";

export const maxDuration = 800;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !got || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

async function handle(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runIngestion(prisma, { trigger: "cron" });
  await rescoreAll(prisma);
  const b = await generateAndSendBriefing(prisma);
  return Response.json({ ingestion: { status: r.status, created: r.created, updated: r.updated, closed: r.closed, errors: r.errors }, briefing: { id: b.id, email: b.emailStatus } });
}
export const GET = handle;
export const POST = handle;
