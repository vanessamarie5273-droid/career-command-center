import { createHash } from "node:crypto";
import { z } from "zod";
import { aiError, aiNotConfigured, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assistantConfigured, MODEL } from "@/lib/assistant";
import { atsReport } from "@/lib/resume";
import { checkKit, generateKit, kitContext, type KitInput } from "@/lib/kit";

export const maxDuration = 300;

export const GET = route("VIEWER", async (req) => {
  const jobId = z.string().parse(new URL(req.url).searchParams.get("jobId"));
  return { items: await prisma.kit.findMany({ where: { jobId }, orderBy: { createdAt: "desc" }, take: 10 }) };
});

// Builds the kit for one job from a base resume (the chosen one, or the newest), saves the resume and letter to the library.
export const POST = route("EDITOR", async (req, _c, u) => {
  if (!assistantConfigured()) return aiNotConfigured("The Application Kit");
  const b = z.object({ jobId: z.string(), documentId: z.string().optional() }).parse(await req.json());
  const job = await prisma.job.findUniqueOrThrow({ where: { id: b.jobId }, include: { company: { include: { news: { orderBy: { createdAt: "desc" }, take: 5 } } }, applications: true } });
  const base = b.documentId
    ? await prisma.document.findUniqueOrThrow({ where: { id: b.documentId } })
    : await prisma.document.findFirst({ where: { kind: "resume", isTailored: false }, orderBy: { createdAt: "desc" } });
  if (!base?.text || base.text.trim().split(/\s+/).length < 100) return Response.json({ error: "Upload a text-based resume to the Resume Library first. The kit only uses facts from it." }, { status: 400 });

  const c = job.company;
  const input: KitInput = {
    resumeText: base.text,
    job: { title: job.title, location: job.location, descriptionText: job.descriptionText, requiredQuals: job.requiredQuals, preferredQuals: job.preferredQuals },
    company: { name: c.name, category: c.category, maturity: c.maturity, description: c.description, keyProducts: c.keyProducts, customers: c.customers, buyerPersonas: c.buyerPersonas, risks: c.risks, news: c.news.map((n) => n.headline) },
  };
  let parts;
  try { parts = await generateKit(input); }
  catch (e) { return aiError(e); }
  const checks = checkKit(parts, { resumeText: base.text, contextText: kitContext(input) });

  const app = job.applications[0];
  const label = `${c.name}: ${job.title}`.slice(0, 160);
  const save = async (kind: string, name: string, text: string) => {
    const buf = Buffer.from(text, "utf8");
    const n = await prisma.document.count({ where: { kind, name } });
    return prisma.document.create({
      data: {
        kind, name, version: `v${n + 1}`, parentId: kind === "resume" ? base.id : null, industry: c.category, roleType: job.roleFamily,
        fileName: `${name.replace(/[^\w.\- ]/g, "_")}.txt`, mimeType: "text/plain", size: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), data: buf, text,
        isTailored: true, atsReport: kind === "resume" ? atsReport(text, "resume.docx") : undefined,
        applications: app ? { connect: { id: app.id } } : undefined,
      },
      select: { id: true },
    });
  };
  const resumeDoc = await save("resume", `Resume – ${label}`, parts.resume);
  const letterDoc = await save("cover_letter", `Cover letter – ${label}`, parts.letter);
  const kit = await prisma.kit.create({ data: { jobId: job.id, baseResumeId: base.id, resumeDocId: resumeDoc.id, letterDocId: letterDoc.id, parts, checks, model: MODEL } });
  await prisma.auditLog.create({ data: { userId: u.sub, entity: "Kit", entityId: kit.id, action: "create", changes: { jobId: job.id, baseResumeId: base.id } } });
  return kit;
});
