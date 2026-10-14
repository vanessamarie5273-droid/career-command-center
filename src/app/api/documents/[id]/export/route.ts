import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toDocx, toPdf } from "@/lib/exportDoc";

type Ctx = { params: Promise<{ id: string }> };
// Word and PDF versions generated from the document's extracted text (useful for tailored versions).
export const GET = route<Ctx>("VIEWER", async (req, { params }) => {
  const d = await prisma.document.findUniqueOrThrow({ where: { id: (await params).id }, select: { name: true, version: true, text: true } });
  const fmt = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "docx";
  const base = `${d.name}${d.version ? ` ${d.version}` : ""}`.replace(/[^\w.\- ]/g, "_");
  const buf = fmt === "pdf" ? await toPdf(d.name, d.text || "") : await toDocx(d.name, d.text || "");
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": fmt === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${base}.${fmt}"` } });
});
