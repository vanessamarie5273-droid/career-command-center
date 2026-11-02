import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { activeRun, runIngestion } from "@/lib/ingest/run";

export const maxDuration = 300;

export const POST = route("EDITOR", async (req) => {
  const body = await req.json().catch(() => ({}));
  // One company is quick: wait for it and report the result.
  if (body.companyId) {
    const r = await runIngestion(prisma, { trigger: "manual:company", companyIds: [body.companyId] });
    return { status: r.status, created: r.created, updated: r.updated, closed: r.closed, errors: r.errors, companies: r.companies };
  }
  const running = await activeRun(prisma);
  if (running) return { started: false, running: true, startedAt: running.startedAt };
  // A full refresh reads every job board and takes several minutes, so it runs in the background instead of
  // holding the button (and the browser) until it ends. The page shows its progress in the banner.
  void runIngestion(prisma, { trigger: "manual" }).catch((e) => console.error("Refresh failed", e));
  return { started: true };
});
