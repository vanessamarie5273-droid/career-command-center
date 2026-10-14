import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = route("VIEWER", async (req, _c, u) => ({ items: await prisma.savedFilter.findMany({ where: { userId: u.sub, page: new URL(req.url).searchParams.get("page") ?? undefined }, orderBy: { createdAt: "asc" } }) }));
export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ page: z.string().max(40), name: z.string().min(1).max(80), query: z.string().max(2000) }).parse(await req.json());
  return prisma.savedFilter.create({ data: { ...b, userId: u.sub } });
});
export const DELETE = route("EDITOR", async (req, _c, u) => {
  await prisma.savedFilter.deleteMany({ where: { id: new URL(req.url).searchParams.get("id") ?? "", userId: u.sub } });
  return { ok: true };
});
