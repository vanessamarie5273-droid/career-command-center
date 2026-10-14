import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { keywordGap } from "@/lib/resume";

export const POST = route("VIEWER", async (req) => {
  const b = z.object({ jobId: z.string(), documentId: z.string().optional() }).parse(await req.json());
  const job = await prisma.job.findUniqueOrThrow({ where: { id: b.jobId } });
  const jd = { text: job.descriptionText || "", required: job.requiredQuals, preferred: job.preferredQuals };
  if (b.documentId) {
    const d = await prisma.document.findUniqueOrThrow({ where: { id: b.documentId }, select: { id: true, name: true, text: true } });
    return { document: { id: d.id, name: d.name }, resumeText: d.text, jdText: job.descriptionText, ...keywordGap(d.text || "", jd) };
  }
  // No document chosen: rank every resume against this job.
  const docs = await prisma.document.findMany({ where: { kind: "resume" }, select: { id: true, name: true, version: true, text: true } });
  const ranked = docs.map((d) => ({ id: d.id, name: d.name, version: d.version, ...keywordGap(d.text || "", jd) })).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  return { ranked: ranked.map(({ id, name, version, matchScore, missing }) => ({ id, name, version, matchScore, missingCount: missing.length })) };
});
