import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { restoreAll, type Backup } from "@/lib/backup";

export const maxDuration = 300;
export const POST = route("ADMIN", async (req, _c, u) => {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  const mode = fd.get("mode") === "replace" ? "replace" : "merge";
  let data: Backup;
  try { data = JSON.parse(await file.text()); } catch { return Response.json({ error: "File is not valid JSON" }, { status: 400 }); }
  const counts = await restoreAll(prisma, data, mode);
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Backup", entityId: data.exportedAt ?? "unknown", action: `restore:${mode}`, changes: counts } });
  return { ok: true, mode, restored: counts };
});
