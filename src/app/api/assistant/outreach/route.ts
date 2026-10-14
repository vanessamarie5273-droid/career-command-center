import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assistantConfigured, MODEL } from "@/lib/assistant";
import { PROFILE } from "@/lib/profile";

export const POST = route("VIEWER", async (req) => {
  if (!assistantConfigured()) return Response.json({ error: "AI personalization needs ANTHROPIC_API_KEY. The template draft works without it." }, { status: 503 });
  const { contactId } = z.object({ contactId: z.string() }).parse(await req.json());
  const c = await prisma.contact.findUniqueOrThrow({ where: { id: contactId }, include: { company: { include: { jobs: { where: { status: "OPEN", category: "MAIN" }, orderBy: { score: "desc" }, take: 3 }, news: { take: 3 } } } } });
  const res = await new Anthropic().messages.create({
    model: MODEL, max_tokens: 2000, output_config: { effort: "low" },
    system: "Write a short, warm, specific LinkedIn outreach note (under 120 words) from Vanessa. Use only the facts provided about her; never invent achievements, mutual connections or details about the recipient. No subject line. Sign as Vanessa.",
    messages: [{ role: "user", content: JSON.stringify({ vanessa_facts: PROFILE.facts, recipient: { first_name: c.firstName, title: c.title, company: c.company?.name ?? c.companyName, relationship: c.degree }, company_open_roles: c.company?.jobs.map((j) => j.title), company_recent_developments: c.company?.news.map((n) => n.headline) }) }],
  });
  return { text: res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n") };
});
