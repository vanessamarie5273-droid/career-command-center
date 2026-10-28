import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toDocx, toPdf } from "@/lib/exportDoc";
import { KIT_LABEL, KIT_PARTS, type KitParts } from "@/lib/kit";

type Ctx = { params: Promise<{ id: string }> };
// Word or PDF of one kit part, e.g. the point of view to send to a hiring manager.
export const GET = route<Ctx>("VIEWER", async (req, { params }) => {
  const q = new URL(req.url).searchParams;
  const part = z.enum(KIT_PARTS).parse(q.get("part"));
  const kit = await prisma.kit.findUniqueOrThrow({ where: { id: (await params).id }, include: { job: { include: { company: true } } } });
  const text = (kit.parts as KitParts)[part] ?? "";
  const title = `${KIT_LABEL[part]} – ${kit.job.company.name}`;
  const fmt = q.get("format") === "pdf" ? "pdf" : "docx";
  const buf = fmt === "pdf" ? await toPdf(title, text) : await toDocx(title, text);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": fmt === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${title.replace(/[^\w.\- ]/g, "_")}.${fmt}"` } });
});
