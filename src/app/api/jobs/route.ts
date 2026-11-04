// Add a company or a role by hand. The posting link is optional: many roles she hears about in a feed comment
// or a conversation aren't posted yet. A company can be added with no role at all. Roles dedupe by fingerprint.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { buildJobData, applyScore } from "@/lib/ingest/run";
import { isSpecificJobUrl } from "@/lib/links";
import { ingestCompany } from "@/lib/ingest/run";
import { relinkContacts } from "@/lib/network";
import { boardHintFromUrl, createCompany, findCompanyByName, websiteFromUrl } from "@/lib/companies";
import { addCompanyNote, foundViaLabel, FOUND_VIA_KEYS, saveContact } from "@/lib/manualEntry";
import { researchNewCompany } from "@/lib/research";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess(blank, t.optional());

const Body = z.object({
  companyId: opt(z.string()),
  // A company that isn't in her accounts yet, added in the same step.
  newCompany: z.object({ name: z.string().trim().min(1).max(200), website: opt(z.string().url()), category: z.string().min(1).max(100) }).optional(),
  companyOnly: z.boolean().default(false),
  title: opt(z.string().trim().min(2, "Give the role a title of at least 2 characters").max(300)),
  url: opt(z.string().url("The posting link must be a full URL starting with https://")),
  location: opt(z.string().max(300)),
  description: opt(z.string().max(100000)), source: z.enum(FOUND_VIA_KEYS).default("MANUAL"),
  remote: z.boolean().optional(), postedAt: opt(z.string()),
  // Where she heard about it
  foundUrl: opt(z.string().url("The post or comment link must be a full URL starting with https://")),
  notes: opt(z.string().max(5000)),
  contact: z.object({ name: z.string().trim().max(200), title: opt(z.string().max(200)), linkedinUrl: opt(z.string().url("The LinkedIn profile must be a full URL")) }).optional(),
}).refine((b) => b.companyId || b.newCompany, { message: "Choose a company or add a new one", path: ["companyId"] })
  .refine((b) => b.companyOnly || b.title, { message: "Give the role a title, or choose \"Just the company\"", path: ["title"] });

export const POST = route("EDITOR", async (req, _c, u) => {
  const b = Body.parse(await req.json());
  if (b.url && !b.companyOnly && !isSpecificJobUrl(b.url)) return Response.json({ error: "That link looks like a general careers page. Paste the URL of the specific job posting, or leave it blank if the role isn't posted." }, { status: 400 });
  const hintUrl = b.url ?? b.foundUrl;
  let companyId = b.companyId;
  let addedCompany = false;
  if (!companyId && b.newCompany) {
    const found = await findCompanyByName(prisma, b.newCompany.name);
    if (found) companyId = found.id; // already an account: use it rather than make a twin
    else {
      const c = await createCompany(prisma, { ...b.newCompany, website: b.newCompany.website ?? (b.url ? websiteFromUrl(b.url) : undefined), atsHint: b.url ? boardHintFromUrl(b.url) : undefined }, u.sub);
      await relinkContacts(prisma);
      // Pull the new company's board first, so this posting (if it is on that board) dedupes onto the feed copy.
      await ingestCompany(prisma, c).catch(() => null);
      // Fill its profile (overview, scores, leaders, news) from public sources while she carries on.
      await researchNewCompany(prisma, c.id);
      companyId = c.id; addedCompany = true;
    }
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const via = foundViaLabel(b.source);
  const who = b.contact?.name ? b.contact.name : null;

  if (b.companyOnly) {
    const parts = [`Added by you (${via}${who ? `, from ${who}` : ""}).`, b.notes, b.foundUrl].filter(Boolean);
    if (b.notes || who || b.foundUrl || b.source !== "MANUAL") await addCompanyNote(prisma, company.id, parts.join("\n"));
    if (who) await saveContact(prisma, b.contact!, company.id, `Mentioned ${company.name} (${via}).${b.notes ? ` ${b.notes}` : ""}`, b.source === "REFERRAL" ? "referral" : undefined);
    return { companyId: company.id, addedCompany };
  }

  const title = b.title!;
  const referrer = who ? await saveContact(prisma, b.contact!, company.id, `Told you about the ${title} role at ${company.name} (${via}).`, b.source === "REFERRAL" ? "referral" : undefined) : null;
  // An unposted role has no link of its own; it keeps a unique id so it can't collide with another.
  const externalId = b.url ?? `manual:${randomUUID()}`;
  const data = buildJobData(company, { provider: "GREENHOUSE", externalId, title, location: b.location, isRemote: b.remote, descriptionText: b.description, applyUrl: b.url ?? "", postedAt: b.postedAt ? new Date(b.postedAt) : null });
  const mine = { notes: b.notes ?? null, foundUrl: b.foundUrl ?? null, ...(referrer ? { referrerId: referrer.id } : {}) };
  const existing = await prisma.job.findUnique({ where: { fingerprint: data.fingerprint } });
  if (existing) {
    if (b.url) await prisma.jobSource.upsert({ where: { provider_externalId: { provider: b.source, externalId: b.url } }, create: { jobId: existing.id, provider: b.source, externalId: b.url, url: b.url }, update: { lastSeenAt: new Date() } });
    const notes = [existing.notes, b.notes].filter(Boolean).join("\n") || null;
    await prisma.job.update({ where: { id: existing.id }, data: { notes, foundUrl: existing.foundUrl ?? mine.foundUrl, referrerId: existing.referrerId ?? referrer?.id ?? null, ...(!existing.applyUrl && b.url ? { applyUrl: b.url } : {}) } });
    return { id: existing.id, duplicate: true, addedCompany };
  }
  const detail = `Added by you: ${via}${who ? ` from ${who}` : ""}${b.url ? "" : " (not posted)"}`;
  // She already knows about it, so no instant alert goes out for it.
  const job = await prisma.job.create({ data: { ...data, ...applyScore(data, company), ...mine, companyId: company.id, manual: true, alertedAt: new Date(), sources: { create: { provider: b.source, externalId, url: b.url ?? hintUrl ?? "" } }, events: { create: { kind: "discovered", detail } } } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Job", entityId: job.id, action: "create", changes: { source: b.source, url: b.url ?? null, posted: !!b.url } } });
  return { id: job.id, duplicate: false, addedCompany };
});
