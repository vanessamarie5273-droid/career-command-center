// Manually add a specific job posting (e.g. one found on LinkedIn or a referral). Deduplicated by fingerprint.
import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { buildJobData, applyScore } from "@/lib/ingest/run";
import { isSpecificJobUrl } from "@/lib/links";
import { ingestCompany } from "@/lib/ingest/run";
import { relinkContacts } from "@/lib/network";
import { boardHintFromUrl, createCompany, findCompanyByName, websiteFromUrl } from "@/lib/companies";

const Body = z.object({
  companyId: z.string().optional(),
  // A company that isn't in her accounts yet, added in the same step.
  newCompany: z.object({ name: z.string().trim().min(1).max(200), website: z.string().url().optional(), category: z.string().min(1).max(100) }).optional(),
  title: z.string().min(2).max(300), url: z.string().url(), location: z.string().max(300).optional(),
  description: z.string().max(100000).optional(), source: z.enum(["MANUAL", "LINKEDIN", "REFERRAL"]).default("MANUAL"),
  remote: z.boolean().optional(), postedAt: z.string().optional(),
}).refine((b) => b.companyId || b.newCompany, { message: "Choose a company or add a new one", path: ["companyId"] });

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = Body.parse(await req.json());
  if (!isSpecificJobUrl(b.url)) return Response.json({ error: "That link looks like a general careers page. Paste the URL of the specific job posting." }, { status: 400 });
  let companyId = b.companyId;
  let addedCompany = false;
  if (!companyId && b.newCompany) {
    const found = await findCompanyByName(prisma, b.newCompany.name);
    if (found) companyId = found.id; // already an account: use it rather than make a twin
    else {
      const c = await createCompany(prisma, { ...b.newCompany, website: b.newCompany.website ?? websiteFromUrl(b.url), atsHint: boardHintFromUrl(b.url) }, u.sub);
      await relinkContacts(prisma);
      // Pull the new company's board first, so this posting (if it is on that board) dedupes onto the feed copy.
      await ingestCompany(prisma, c).catch(() => null);
      companyId = c.id; addedCompany = true;
    }
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const data = buildJobData(company, { provider: "GREENHOUSE", externalId: b.url, title: b.title, location: b.location, isRemote: b.remote, descriptionText: b.description, applyUrl: b.url, postedAt: b.postedAt ? new Date(b.postedAt) : null });
  const existing = await prisma.job.findUnique({ where: { fingerprint: data.fingerprint } });
  if (existing) {
    await prisma.jobSource.upsert({ where: { provider_externalId: { provider: b.source, externalId: b.url } }, create: { jobId: existing.id, provider: b.source, externalId: b.url, url: b.url }, update: { lastSeenAt: new Date() } });
    return { id: existing.id, duplicate: true, addedCompany };
  }
  const job = await prisma.job.create({ data: { ...data, ...applyScore(data, company), companyId: company.id, manual: true, sources: { create: { provider: b.source, externalId: b.url, url: b.url } }, events: { create: { kind: "discovered", detail: `Added manually (${b.source.toLowerCase()})` } } } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Job", entityId: job.id, action: "create", changes: { source: b.source, url: b.url } } });
  return { id: job.id, duplicate: false, addedCompany };
});
