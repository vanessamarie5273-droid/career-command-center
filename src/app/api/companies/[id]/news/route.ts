import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
export const POST = route<Ctx>("EDITOR", async (req, { params }) => {
  const b = z.object({ kind: z.string().max(30), headline: z.string().min(1).max(500), url: z.string().url(), publishedAt: z.string().optional() }).parse(await req.json());
  return prisma.companyNews.create({ data: { companyId: (await params).id, kind: b.kind, headline: b.headline, url: b.url, publishedAt: b.publishedAt ? new Date(b.publishedAt) : null } });
});
