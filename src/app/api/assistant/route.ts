import { z } from "zod";
import { route } from "@/lib/api";
import { ask, assistantConfigured } from "@/lib/assistant";
import { prisma } from "@/lib/db";
import { AI_STATUS_ID, pauseReason } from "@/lib/ai";

export const maxDuration = 120;

export const POST = route("VIEWER", async (req) => {
  if (!assistantConfigured()) return Response.json({ error: "The assistant needs an Anthropic API key. Add ANTHROPIC_API_KEY in your hosting settings (see Settings & Integrations)." }, { status: 503 });
  const b = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20000) })).min(1).max(40) }).parse(await req.json());
  try { return await ask(b.messages); }
  catch (e) {
    // Credit and key refusals are recorded as "paused" by withAi; other failures show as an error on Settings.
    if (!pauseReason(e)) await prisma.integrationStatus.upsert({ where: { id: AI_STATUS_ID }, create: { id: AI_STATUS_ID, name: "Anthropic (AI)", status: "error", detail: (e as Error).message.slice(0, 300) }, update: { status: "error", detail: (e as Error).message.slice(0, 300), checkedAt: new Date() } });
    throw e;
  }
});
