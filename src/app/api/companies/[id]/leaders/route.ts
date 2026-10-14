import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
export const POST = route<Ctx>("EDITOR", async (req, { params }) => {
  const b = z.object({ name: z.string().min(1).max(200), title: z.string().min(1).max(200), linkedinUrl: z.string().url().optional().or(z.literal("")), sourceUrl: z.string().url().optional().or(z.literal("")) }).parse(await req.json());
  return prisma.leader.create({ data: { companyId: (await params).id, name: b.name, title: b.title, linkedinUrl: b.linkedinUrl || null, sourceUrl: b.sourceUrl || null, factType: b.sourceUrl ? "CONFIRMED" : "ESTIMATE", verifiedAt: b.sourceUrl ? new Date() : null } });
});
