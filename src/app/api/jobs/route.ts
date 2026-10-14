// Manually add a specific job posting (e.g. one found on LinkedIn or a referral). Deduplicated by fingerprint.
import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { buildJobData, applyScore } from "@/lib/ingest/run";
import { isSpecificJobUrl } from "@/lib/links";

const Body = z.object({
  companyId: z.string(), title: z.string().min(2).max(300), url: z.string().url(), location: z.string().max(300).optional(),
  description: z.string().max(100000).optional(), source: z.enum(["MANUAL", "LINKEDIN", "REFERRAL"]).default("MANUAL"),
  remote: z.boolean().optional(), postedAt: z.string().optional(),
});

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = Body.parse(await req.json());
  if (!isSpecificJobUrl(b.url)) return Response.json({ error: "That link looks like a general careers page. Paste the URL of the specific job posting." }, { status: 400 });
  const company = await prisma.company.findUniqueOrThrow({ where: { id: b.companyId } });
  const data = buildJobData(company, { provider: "GREENHOUSE", externalId: b.url, title: b.title, location: b.location, isRemote: b.remote, descriptionText: b.description, applyUrl: b.url, postedAt: b.postedAt ? new Date(b.postedAt) : null });
  const existing = await prisma.job.findUnique({ where: { fingerprint: data.fingerprint } });
  if (existing) {
    await prisma.jobSource.upsert({ where: { provider_externalId: { provider: b.source, externalId: b.url } }, create: { jobId: existing.id, provider: b.source, externalId: b.url, url: b.url }, update: { lastSeenAt: new Date() } });
    return { id: existing.id, duplicate: true };
  }
  const job = await prisma.job.create({ data: { ...data, ...applyScore(data, company), companyId: company.id, manual: true, sources: { create: { provider: b.source, externalId: b.url, url: b.url } }, events: { create: { kind: "discovered", detail: `Added manually (${b.source.toLowerCase()})` } } } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Job", entityId: job.id, action: "create", changes: { source: b.source, url: b.url } } });
  return { id: job.id, duplicate: false };
});
