import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
export const GET = route<Ctx>("VIEWER", async (_r, { params }) => {
  const d = await prisma.document.findUniqueOrThrow({ where: { id: (await params).id } });
  return new Response(new Uint8Array(d.data), { headers: { "Content-Type": d.mimeType, "Content-Disposition": `attachment; filename="${d.fileName.replace(/[^\w.\- ]/g, "_")}"`, "Cache-Control": "private, no-store" } });
});
