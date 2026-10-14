import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { generateAndSendBriefing } from "@/lib/briefing";
export const POST = route("EDITOR", async () => { const b = await generateAndSendBriefing(prisma); return { id: b.id, email: b.emailStatus }; });
