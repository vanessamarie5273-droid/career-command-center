// Saving her edits to one part of an Application Kit: the kit, its saved resume or letter, and the checks stay in step.
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { checkKit, kitContext, type KitInput } from "./kit";
import type { KitChecks, KitPart, KitParts } from "./kitParts";
import { atsReport } from "./resume";

type JobWithCompany = { title: string; location: string | null; descriptionText: string | null; requiredQuals: string | null; preferredQuals: string | null;
  company: { name: string; category: string; maturity: string | null; description: string | null; keyProducts: string | null; customers: string | null; buyerPersonas: string | null; risks: string | null; news: { headline: string }[] } };

export function kitInput(job: JobWithCompany, resumeText: string): KitInput {
  const c = job.company;
  return {
    resumeText,
    job: { title: job.title, location: job.location, descriptionText: job.descriptionText, requiredQuals: job.requiredQuals, preferredQuals: job.preferredQuals },
    company: { name: c.name, category: c.category, maturity: c.maturity, description: c.description, keyProducts: c.keyProducts, customers: c.customers, buyerPersonas: c.buyerPersonas, risks: c.risks, news: c.news.map((n) => n.headline) },
  };
}

/** A kit with the job and company it was written for, and the resume its facts come from. */
export async function kitSources(db: PrismaClient, kitId: string) {
  const kit = await db.kit.findUniqueOrThrow({ where: { id: kitId }, include: { job: { include: { company: { include: { news: { orderBy: { createdAt: "desc" }, take: 5 } } } } } } });
  const base = (kit.baseResumeId ? await db.document.findUnique({ where: { id: kit.baseResumeId }, select: { text: true } }) : null)
    ?? await db.document.findFirst({ where: { kind: "resume", isTailored: false }, orderBy: { createdAt: "desc" }, select: { text: true } });
  const resumeText = base?.text ?? "";
  return { kit, resumeText, input: kitInput(kit.job, resumeText) };
}

/** Replaces one part's text, re-runs that part's checks against the kit's base resume, and updates the saved resume or letter in place. */
export async function saveKitPart(db: PrismaClient, kitId: string, part: KitPart, text: string) {
  const { kit, resumeText, input } = await kitSources(db, kitId);
  const fresh = checkKit({ [part]: text }, { resumeText, contextText: kitContext(input) });
  const parts = { ...(kit.parts as KitParts), [part]: text };
  const checks = { ...(kit.checks as KitChecks), [part]: fresh[part] };
  const docId = part === "resume" ? kit.resumeDocId : part === "letter" ? kit.letterDocId : null;
  const buf = Buffer.from(text, "utf8");
  const [updated] = await db.$transaction([
    db.kit.update({ where: { id: kit.id }, data: { parts, checks } }),
    ...(docId ? [db.document.update({ where: { id: docId }, data: { text, data: buf, size: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), mimeType: "text/plain", ...(part === "resume" ? { atsReport: atsReport(text, "resume.docx") } : {}) } })] : []),
  ]);
  return updated;
}
