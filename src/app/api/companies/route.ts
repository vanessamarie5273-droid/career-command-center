import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ingestCompany } from "@/lib/ingest/run";

// Expand the universe: add a company, then immediately try to discover its public job board.
export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ name: z.string().min(1).max(200), website: z.string().url(), category: z.string().max(100), headquarters: z.string().max(200).optional(), ownership: z.string().max(100).optional(), description: z.string().max(5000).optional(), atsHint: z.string().max(200).optional() }).parse(await req.json());
  const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (await prisma.company.findUnique({ where: { slug } })) return Response.json({ error: "That company is already in your database" }, { status: 409 });
  const host = new URL(b.website).hostname.replace(/^www\./, "");
  const c = await prisma.company.create({ data: {
    slug, name: b.name, website: b.website, category: b.category, headquarters: b.headquarters, ownership: b.ownership, description: b.description,
    careersUrl: `${b.website.replace(/\/$/, "")}/careers`, logoUrl: `https://www.google.com/s2/favicons?domain=${host}&sz=128`, linkedinUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(b.name)}`,
    profileFactType: "CONFIRMED", profileSource: "Entered by you", profileVerifiedAt: new Date(), atsHints: b.atsHint ? [b.atsHint] : [], addedBy: "user",
  } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Company", entityId: c.id, action: "create", changes: b } });
  const outcome = await ingestCompany(prisma, c).catch((e: Error) => ({ status: "error", error: e.message }));
  return { id: c.id, feed: outcome };
});
