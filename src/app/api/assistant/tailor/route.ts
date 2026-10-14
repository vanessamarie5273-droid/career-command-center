import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assistantConfigured, tailoringSuggestions } from "@/lib/assistant";

export const maxDuration = 120;
export const POST = route("VIEWER", async (req) => {
  if (!assistantConfigured()) return Response.json({ error: "AI tailoring needs ANTHROPIC_API_KEY. The keyword gap analysis above works without it." }, { status: 503 });
  const b = z.object({ jobId: z.string(), documentId: z.string() }).parse(await req.json());
  const [j, d] = await Promise.all([prisma.job.findUniqueOrThrow({ where: { id: b.jobId } }), prisma.document.findUniqueOrThrow({ where: { id: b.documentId }, select: { text: true } })]);
  return { text: await tailoringSuggestions(j.descriptionText || "", d.text || "") };
});
