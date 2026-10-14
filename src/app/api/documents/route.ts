import { createHash } from "node:crypto";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { atsReport, extractText } from "@/lib/resume";

const MAX = 10 * 1024 * 1024;
const OK_EXT = /\.(pdf|docx|txt|md)$/i;
const KINDS = ["resume", "cover_letter", "recommendation", "bio", "references", "other"];

export const GET = route("VIEWER", async () => ({ items: await prisma.document.findMany({ select: { id: true, name: true, kind: true, version: true, industry: true, roleType: true, fileName: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" } }) }));

export const POST = route("EDITOR", async (req, _c, u) => {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "File exceeds 10 MB" }, { status: 400 });
  if (!OK_EXT.test(file.name)) return Response.json({ error: "Upload PDF, DOCX, TXT or MD files" }, { status: 400 });
  const kind = KINDS.includes(String(fd.get("kind"))) ? String(fd.get("kind")) : "other";
  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const text = await extractText(buf, file.type, file.name).catch(() => "");
  const name = String(fd.get("name") || file.name.replace(/\.[^.]+$/, "")).slice(0, 200);
  const prior = await prisma.document.count({ where: { kind, name } });
  const doc = await prisma.document.create({
    data: {
      kind, name, version: String(fd.get("version") || "") || (prior ? `v${prior + 1}` : "v1"), parentId: (fd.get("parentId") as string) || null,
      industry: (fd.get("industry") as string) || null, roleType: (fd.get("roleType") as string) || null,
      fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, sha256, data: buf, text,
      atsReport: kind === "resume" ? atsReport(text, file.name) : undefined,
      applications: fd.get("applicationId") ? { connect: { id: String(fd.get("applicationId")) } } : undefined,
    },
    select: { id: true, name: true, version: true },
  });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Document", entityId: doc.id, action: "create", changes: { name, kind, size: file.size } } });
  return doc;
});
