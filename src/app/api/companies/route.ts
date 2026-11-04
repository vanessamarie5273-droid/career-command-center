import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ingestCompany } from "@/lib/ingest/run";
import { relinkContacts } from "@/lib/network";
import { createCompany, findCompanyByName } from "@/lib/companies";
import { researchNewCompany } from "@/lib/research";

// Expand the universe: add a company, then immediately try to discover its public job board.
export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ name: z.string().trim().min(1).max(200), website: z.string().url(), category: z.string().max(100), headquarters: z.string().max(200).optional(), ownership: z.string().max(100).optional(), description: z.string().max(5000).optional(), atsHint: z.string().max(200).optional() }).parse(await req.json());
  if (await findCompanyByName(prisma, b.name)) return Response.json({ error: "That company is already in your database" }, { status: 409 });
  const c = await createCompany(prisma, b, u.sub);
  await relinkContacts(prisma); // her LinkedIn connections who already work there show up on the account and in My Network
  const outcome = await ingestCompany(prisma, c).catch((e: Error) => ({ status: "error", error: e.message }));
  const researching = await researchNewCompany(prisma, c.id); // fills the profile in the background
  return { id: c.id, feed: outcome, researching };
});
