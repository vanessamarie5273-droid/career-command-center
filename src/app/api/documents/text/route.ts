import { createHash } from "node:crypto";
import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { atsReport } from "@/lib/resume";

// Save an edited/tailored version of a document as a new text-based version.
export const POST = route("EDITOR", async (req, _c, u) => {
  const b = z.object({ parentId: z.string(), name: z.string().min(1).max(200), version: z.string().max(40).optional(), text: z.string().min(20).max(200000), roleType: z.string().max(100).optional(), industry: z.string().max(100).optional() }).parse(await req.json());
  const parent = await prisma.document.findUniqueOrThrow({ where: { id: b.parentId } });
  const buf = Buffer.from(b.text, "utf8");
  const n = await prisma.document.count({ where: { kind: parent.kind, name: b.name } });
  const doc = await prisma.document.create({
    data: {
      kind: parent.kind, name: b.name, version: b.version || `v${n + 1}`, parentId: parent.id, industry: b.industry ?? parent.industry, roleType: b.roleType ?? parent.roleType,
      fileName: `${b.name.replace(/[^\w.\- ]/g, "_")}.txt`, mimeType: "text/plain", size: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), data: buf, text: b.text,
      isTailored: true, atsReport: parent.kind === "resume" ? atsReport(b.text, "resume.docx") : undefined,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Document", entityId: doc.id, action: "create", changes: { parentId: parent.id, tailored: true } } });
  return doc;
});
