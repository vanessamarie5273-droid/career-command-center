import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { runIngestion } from "@/lib/ingest/run";

export const maxDuration = 300;

export const POST = route("EDITOR", async (req) => {
  const body = await req.json().catch(() => ({}));
  const running = await prisma.ingestionRun.findFirst({ where: { status: "running", startedAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (running && !body.companyId) return { error: "A refresh is already running", ...running };
  const r = await runIngestion(prisma, { trigger: body.companyId ? "manual:company" : "manual", companyIds: body.companyId ? [body.companyId] : undefined });
  return { status: r.status, created: r.created, updated: r.updated, closed: r.closed, errors: r.errors, companies: r.companies };
});
