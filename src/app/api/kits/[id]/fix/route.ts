import { z } from "zod";
import { aiError, aiNotConfigured, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assistantConfigured } from "@/lib/assistant";
import { suggestFix } from "@/lib/kit";
import { kitSources } from "@/lib/kitEdit";
import { KIT_PARTS, type KitChecks, type KitParts } from "@/lib/kitParts";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
// Suggests the rewrite that clears one flagged issue. Nothing is saved until she applies it.
export const POST = route<Ctx>("EDITOR", async (req, { params }) => {
  if (!assistantConfigured()) return aiNotConfigured("Suggested fixes");
  const b = z.object({ part: z.enum(KIT_PARTS), index: z.number().int().min(0) }).parse(await req.json());
  const { kit, input } = await kitSources(prisma, (await params).id);
  const issue = (kit.checks as KitChecks)[b.part]?.[b.index];
  if (!issue) return Response.json({ error: "That check has already been cleared. Refresh the page." }, { status: 404 });
  try { return await suggestFix(input, b.part, (kit.parts as KitParts)[b.part], issue); }
  catch (e) { return aiError(e); }
});
