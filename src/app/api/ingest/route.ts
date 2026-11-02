import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { runIngestion } from "@/lib/ingest/run";

export const maxDuration = 300;

// Refreshes one company's board. The full refresh of every board no longer runs here: inside the web server it
// competed with every page for memory, and while it ran, kits would not build and stages would not save.
// The ccc-hourly and ccc-daily jobs refresh every board on their own, outside the web server.
export const POST = route("EDITOR", async (req) => {
  const body = await req.json().catch(() => ({}));
  if (!body.companyId) return Response.json({ error: "Job feeds refresh on their own every hour. Refresh one company from its page." }, { status: 400 });
  const r = await runIngestion(prisma, { trigger: "manual:company", companyIds: [body.companyId] });
  return { status: r.status, created: r.created, updated: r.updated, closed: r.closed, errors: r.errors, companies: r.companies };
});
