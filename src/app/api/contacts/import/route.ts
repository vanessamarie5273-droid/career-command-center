import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { matchCompany, parseConnections } from "@/lib/linkedin";

export const POST = route("EDITOR", async (req, _c, u) => {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return Response.json({ error: "File too large" }, { status: 400 });
  let rows;
  try { rows = parseConnections(await file.text()); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  let created = 0, updated = 0, matched = 0;
  for (const r of rows) {
    const co = matchCompany(r.company, companies);
    if (co) matched++;
    const data = { firstName: r.firstName, lastName: r.lastName, email: r.email, companyName: r.company, title: r.position, connectedOn: r.connectedOn, companyId: co?.id ?? null, degree: "1st", source: "linkedin_export" };
    if (r.url) {
      const ex = await prisma.contact.findUnique({ where: { linkedinUrl: r.url } });
      if (ex) { await prisma.contact.update({ where: { id: ex.id }, data }); updated++; } else { await prisma.contact.create({ data: { ...data, linkedinUrl: r.url } }); created++; }
    } else { await prisma.contact.create({ data }); created++; }
  }
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Contact", entityId: "linkedin_export", action: "import", changes: { rows: rows.length, created, updated, matched } } });
  await prisma.integrationStatus.upsert({ where: { id: "linkedin" }, create: { id: "linkedin", name: "LinkedIn (connections export)", status: "connected", detail: `Last import: ${rows.length} connections, ${matched} at target companies` }, update: { status: "connected", detail: `Last import: ${rows.length} connections, ${matched} at target companies`, checkedAt: new Date() } });
  return { rows: rows.length, created, updated, matched };
});
