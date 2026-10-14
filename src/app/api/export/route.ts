import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { exportAll, toCsv } from "@/lib/backup";

export const maxDuration = 300;
export const GET = route("VIEWER", async (req, _c, u) => {
  const url = new URL(req.url);
  const stamp = new Date().toISOString().slice(0, 10);
  if (url.searchParams.get("format") === "csv") {
    const what = url.searchParams.get("what") ?? "jobs";
    const rows: Record<string, unknown>[] =
      what === "applications" ? (await prisma.application.findMany({ include: { company: { select: { name: true } }, job: { select: { applyUrl: true } } } })).map(({ company, job, ...a }) => ({ company: company.name, applyUrl: job?.applyUrl, ...a }))
      : what === "companies" ? await prisma.company.findMany({ omit: { atsHints: true } })
      : what === "contacts" ? await prisma.contact.findMany()
      : (await prisma.job.findMany({ include: { company: { select: { name: true } } }, omit: { description: true, descriptionText: true, scoreReasons: true } })).map(({ company, ...j }) => ({ company: company.name, ...j }));
    return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ccc-${what}-${stamp}.csv"` } });
  }
  const data = await exportAll(prisma);
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Backup", entityId: stamp, action: "export", changes: data.counts } });
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="career-command-center-backup-${stamp}.json"`, "Cache-Control": "no-store" } });
});
