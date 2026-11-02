import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { generateAndSendBriefing } from "@/lib/briefing";
import { originFrom, rememberAppUrl } from "@/lib/appUrl";
export const maxDuration = 300;
export const POST = route("EDITOR", async (req) => {
  await rememberAppUrl(prisma, originFrom(req.headers.get("x-forwarded-host") || req.headers.get("host"), req.headers.get("x-forwarded-proto")));
  const b = await generateAndSendBriefing(prisma);
  return { id: b.id, email: b.emailStatus };
});
